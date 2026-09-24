import { useState, useRef, useEffect, useCallback } from 'react';
import type { BaseSyntheticEvent, ChangeEvent } from 'react';
import { useChat, type Message, type MessageStatus } from './useChat';
import { postJson, errorDetail } from '../lib/api';
import {
  TYPING_MS_PER_CHAR,
  TYPING_MIN_MS,
  TYPING_MAX_MS,
  TYPING_JITTER_RATIO,
  INITIAL_HOLD_MS,
  TYPING_IDLE_MS,
  FIRST_REPLY_TYPING_DELAY_MS,
  FRAGMENT_TYPING_DELAY_MS,
  WAIT_CONTINUE_IDLE_MS,
  NO_REPLY_NOTICE_IDLE_MS,
} from '../lib/knobs';

function generateMessageId(): string {
  return (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// The typing-feel knobs (TYPING_*, INITIAL_HOLD_MS, TYPING_IDLE_MS) live in
// src/lib/knobs.ts. The two constants below are NOT knobs -- they mirror
// backend enforcement and must track it, so they stay next to the code that
// uses them.

// Mirrors the backend's _MAX_PENDING_PER_SESSION (rate_control_service.py),
// which is per-tier: an invite session gets a higher cap than an anonymous
// guest. This used to be a single `3`, which matched NEITHER tier -- it
// blocked invite users 2 messages early and let guests fire a 3rd that the
// server then rejected with 429. Keep both numbers equal to the backend's;
// it is the real enforcement and this is UX only (trivially bypassable by
// calling the API directly).
const MAX_PENDING_MESSAGES: Record<'guest' | 'invite', number> = {
  guest: 2,
  invite: 5,
};

// Mirrors the backend's MAX_MESSAGE_LENGTH (chat_service.py) -- used both
// as an <input maxLength> (stops typing/pasting past the limit) and as a
// belt-and-suspenders check in handleSend. The backend is the real
// enforcement (see MessageTooLongError -> HTTP 413); this just gives
// instant feedback instead of a round trip. Exported so the input in
// Chatroom can set its maxLength from the same source.
export const MAX_MESSAGE_LENGTH = 750;

// Hard ceiling on one chat request, milliseconds.
//
// `fetch` has no timeout. A socket that stalls without closing -- a phone
// leaving wifi, an intermediary dropping the connection without an RST --
// leaves the promise pending forever, so dispatchTurn's `finally` never runs.
// That left `pendingCount` permanently elevated (after two stalls a guest is
// stuck at the cap and every further send shows the pending-limit warning),
// the "typing" bubble up forever, and -- worst -- `conversationIdReadyRef`
// unresolved, which makes EVERY later message in the tab block forever at
// `await waitForPreviousSend`. The chatroom died silently for the rest of the
// tab's life.
//
// Set ABOVE nginx's proxy_read_timeout (120s in persona_stand_front/nginx.conf)
// so the server's own 504 normally wins and the visitor gets its message
// rather than a generic connection error; this only fires when no response is
// coming at all. That timeout is in turn above the backend's
// TURN_DEADLINE_SECONDS (100s), so the three are ordered
// backend < proxy < client and each layer gets to report its own failure.
const CHAT_REQUEST_TIMEOUT_MS = 150_000;

const PENDING_LIMIT_WARNING = "Too many messages waiting for a reply — please wait a moment before sending another.";
const MESSAGE_TOO_LONG_WARNING = `Message is too long (max ${MAX_MESSAGE_LENGTH} characters).`;
const PRIVACY_WARNING = "Your message looks like it contains personal or private information, so it wasn't sent.";

// The backend rejects a user message with one of these statuses and sends a
// human-readable `detail` explaining why. We surface that detail (falling
// back to the text here) and paint the offending bubble(s) red.
const REJECT_FALLBACKS: Record<number, string> = {
  400: PRIVACY_WARNING,
  413: MESSAGE_TOO_LONG_WARNING,
  429: PENDING_LIMIT_WARNING,
};

// Shown once the visitor has sat quietly after a `no_reply` turn (see
// NO_REPLY_NOTICE_IDLE_MS): the message arrived, and silence was the answer.
function noReplyNotice(personaName: string): string {
  return personaName
    ? `Seen. ${personaName} didn't think that one needed a reply. Ask another question anytime.`
    : "Seen. That one didn't need a reply. Ask another question anytime.";
}

// What an idle visitor sets off, per the status of the turn that went quiet.
//   'continue' -- after `wait`: answer the held message as it stands.
//   'notice'   -- after `no_reply`: explain the silence.
type IdleAction = 'continue' | 'notice';

const IDLE_ACTION_DELAY_MS: Record<IdleAction, number> = {
  continue: WAIT_CONTINUE_IDLE_MS,
  notice: NO_REPLY_NOTICE_IDLE_MS,
};

// A message turn sends new text; a continue turn sends none and asks the
// server to answer what it is already holding (ChatService.handle_continue_turn).
type TurnKind = 'message' | 'continue';

// --- Rapid-fire fragment batching -------------------------------------------
// A submitted message isn't dispatched to the backend immediately. It's held
// briefly first (INITIAL_HOLD_MS / TYPING_IDLE_MS -- see src/lib/knobs.ts), in
// case the user is breaking one thought into several quick WhatsApp-style
// bubbles ("Tell me about yourself" then "and your background"). Pieces
// submitted during the hold window are concatenated (single space) and sent
// as ONE backend turn, through the unchanged chat flow (privacy gate ->
// consent -> rate control -> model_orchestration).

function typingDelayFor(text: string): number {
  const base = text.length * TYPING_MS_PER_CHAR;
  const jitterRange = base * TYPING_JITTER_RATIO;
  const jittered = base + (Math.random() * 2 - 1) * jitterRange;
  return Math.min(Math.max(jittered, TYPING_MIN_MS), TYPING_MAX_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createMessage(text: string, sender: Message['sender']): Message {
  return { id: generateMessageId(), text, sender };
}

interface UseChatDispatchArgs {
  // Current consent state (from useConsent) -- a cheap early return before
  // building a request the backend would reject anyway.
  consented: boolean | null;
  // Whether this session holds a verified invite code (from useInviteCode)
  // -- picks the invite vs guest endpoint.
  isVerified: boolean;
  // Called whenever a send is attempted without consent -- either the user
  // dismissed the terms popup and then hit send, or the backend rejected a
  // turn with HTTP 403. Re-opens the (dismissible) terms popup.
  onConsentRequired: () => void;
  // The persona's display name, for the no-reply notice. Empty while the
  // site content is loading; the notice then reads without a name.
  personaName?: string;
}

/**
 * Owns everything about turning what the user types into backend turns: the
 * input field value, the rapid-fire fragment batching (hold buffer + flush
 * timer), the pending-message cap, the per-turn network request, and the
 * warning / blocked-bubble UI state. Returns only what the JSX needs.
 * Bubbles that are not part of the conversation are marked in place on the
 * message objects themselves (Message.status), so the mark survives a
 * refresh alongside the text it describes -- see markMessages below.
 */
export function useChatDispatch({ consented, isVerified, onConsentRequired, personaName = '' }: UseChatDispatchArgs) {
  const {
    setMessages,
    conversationId, setConversationId,
    setVerified, setCode, setInputCode
  } = useChat();

  // Mirrors conversationId, but read synchronously via .current instead of
  // through React state -- fixes a real bug: two messages sent close
  // together (before the first response's setConversationId has actually
  // committed a re-render) both read the OLD conversationId value from
  // their handleSend closure, so the second message's request omits
  // conversationId entirely. The backend then can't tell that was meant
  // to continue the same conversation and silently starts a brand new one
  // (see ChatService.handle_chat_turn's stale-conversation-id fallback) --
  // no error, just quietly lost context. A ref sidesteps this because
  // ref.current updates immediately when assigned, independent of
  // React's render/commit timing, so even a handleSend call fired a
  // moment later reads the fresh value.
  const conversationIdRef = useRef(conversationId);

  // Verification as of the latest commit, for code that runs LATER than the
  // render it was created in. The hold timer is armed with this render's
  // flushHeldMessage, and a turn awaits the previous send before choosing an
  // endpoint -- so verifying an invite code during either wait still sent
  // that turn to /api/guestchat on the closure's stale `isVerified`. The
  // endpoint choice reads this instead.
  const isVerifiedRef = useRef(isVerified);
  useEffect(() => {
    isVerifiedRef.current = isVerified;
  }, [isVerified]);

  // Chains sends so a message fired before an EARLIER one's response has
  // even come back still waits to learn conversationId, instead of
  // silently going out with none. conversationIdRef alone only fixes the
  // gap between "response received" and "React re-rendered" -- it can't
  // help if there's no response yet at all, since nothing (not React
  // state, not the ref) knows the id until the server says so. Each send
  // awaits whatever was previously chained here (resolving immediately if
  // nothing's pending) before building its request body, then chains its
  // own completion for whatever comes after it. Only request-building
  // waits on this -- the optimistic bubble/input-clear below still happens
  // immediately, so sending still feels instant.
  const conversationIdReadyRef = useRef<Promise<void>>(Promise.resolve());

  // --- Rapid-fire fragment batching state (see the *_HOLD_MS / *_IDLE_MS
  // constants above and handleSend below) ---
  // Text of the piece(s) submitted but not yet dispatched, joined with a
  // single space as they arrive.
  const heldTextRef = useRef('');
  // Message ids of the user bubbles that make up the currently-held group
  // -- threaded into dispatchTurn so a backend rejection (413/429) can
  // paint exactly those bubbles red.
  const heldMessageIdsRef = useRef<string[]>([]);
  // The pending flush timer (INITIAL_HOLD_MS or TYPING_IDLE_MS). null when
  // nothing is held.
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Whether a hold cycle is currently active. Also gates the
  // one-increment-per-group pendingCount bump: extra pieces merged into an
  // already-held group must not count again, since the whole group becomes
  // exactly one backend turn / one reply.
  const isHoldingRef = useRef(false);

  // Bubbles the backend is HOLDING: a turn that came back `status: 'wait'`
  // is a message the persona judged mid-thought and is waiting to answer
  // together with whatever comes next.
  //
  // Not to be confused with heldMessageIdsRef above, which is the local
  // batching buffer -- that one is text not yet sent at all. These have been
  // sent, stored, and deliberately not answered yet.
  //
  // Tracked because their fate depends on the NEXT message. If it is
  // rejected, it was the continuation they were waiting for, and both are
  // dead (the backend releases them at the same moment -- see
  // ChatService._discard_pending_group). A `no_reply` turn is not held and
  // never goes in here: the persona decided that message needed no answer,
  // so a later rejection has nothing to do with it.
  const heldTurnIdsRef = useRef<string[]>([]);

  const [inputMessage, setInputMessage] = useState('');
  // The composer's text as of the latest keystroke, for the idle timer below,
  // which fires long after the render that armed it.
  const inputMessageRef = useRef('');
  // Count of this session's messages currently in flight (sent, reply not
  // yet fully revealed) -- not a boolean, since up to MAX_PENDING_MESSAGES
  // can be in flight at once (send button stays clickable throughout, per
  // design: the chatroom mimics a real text thread, not a form that locks
  // while "submitting"). A held-but-not-yet-dispatched fragment group
  // counts as one unit here (bumped when the group starts, released when
  // its single combined request finishes).
  const [pendingCount, setPendingCount] = useState(0);
  // Drives the "persona is typing" three-dot bubble in Chatroom
  // (isAwaitingReply). Never shown while the user is still typing or during
  // the batching hold. Shown, after a short delay each time (see
  // FIRST_REPLY_TYPING_DELAY_MS / FRAGMENT_TYPING_DELAY_MS), while waiting
  // on the first reply fragment and in the gap before each follow-up
  // fragment. A counter, not a boolean, so overlapping waits from
  // rapid-fire sends don't cancel each other out.
  const [typingCount, setTypingCount] = useState(0);
  // Backend reachability, as of the last send: null = nothing sent yet,
  // false = the backend answered (even to reject), true = the request
  // failed at the transport level or came back 5xx. Chatroom shows this as
  // the "online" / "offline" header status.
  const [isOffline, setIsOffline] = useState<boolean | null>(null);
  // Shared banner text for both the pending-message cap and the
  // message-too-long check below -- null hides the banner.
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  // Marks the user bubbles of one turn as not part of the conversation.
  //
  // One status covers every route there: refused by a gate before it was
  // stored (400/403/413/429 or a transport failure), stored and then dropped
  // (the response gate withheld a reply, generation failed, or a held
  // message was released when the message completing it was rejected).
  // Whichever it was, the persona never saw the text and never will -- see
  // MessageStatus for why the server's finer distinction stays off screen.
  //
  // This writes ONTO the message objects rather than into two id lists held
  // here. The lists were component state while `messages` is persisted to
  // sessionStorage, so a refresh restored the text without the status and a
  // rejected message came back looking delivered -- leaving the visitor
  // believing the persona had received something it never did.
  const markMessages = useCallback((ids: string[], status: MessageStatus | undefined) => {
    if (ids.length === 0) return;
    setMessages(prev =>
      prev.map(m => (ids.includes(m.id) ? { ...m, status } : m)),
    );
  }, [setMessages]);

  // Mark one turn's bubbles as refused, and take any held bubbles down with
  // them -- a rejected message is the continuation the held ones were
  // waiting for, and the backend releases them at the same moment (see
  // ChatService._discard_pending_group).
  const markRejected = useCallback((groupIds: string[]) => {
    const held = heldTurnIdsRef.current;
    heldTurnIdsRef.current = [];
    markMessages([...groupIds, ...held], 'not_sent');
  }, [markMessages]);

  // What the visitor's silence sets off after a reply-less turn, and when.
  // See armIdleAction below. One timer and one pending action at a time.
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleActionRef = useRef<IdleAction | null>(null);
  // Bumped for every turn sent. A turn's status may arm an idle action only
  // if no newer turn has been sent since -- otherwise an old `wait` landing
  // late would re-arm a timer the newer message already cancelled.
  const turnSeqRef = useRef(0);

  // A buffered bubble is explicitly queued. Leaving chat cancels its timer
  // and keeps the text as an unsent, recoverable bubble in the shared provider.
  // Refresh recovers the persisted queued status as unsent too.
  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      const unsent = heldMessageIdsRef.current;
      heldMessageIdsRef.current = [];
      heldTextRef.current = '';
      isHoldingRef.current = false;
      markMessages(unsent, 'not_sent');
    };
  }, [markMessages]);

  // Fire the actual backend request for one turn's worth of text. The text
  // (and the ids of the bubbles it came from) are passed in rather than
  // read from the input, and the 413/429 branches paint those bubbles red.
  // The conversationIdReadyRef promise-chain below is load-bearing --
  // batching cuts how often concurrent sends happen but sequential bursts
  // (one group fully sent, a new one started before its reply returns)
  // still need the chain.
  //
  // `kind` 'continue' sends no text: it asks the server to answer the
  // message(s) it is holding after a `wait` (see runIdleAction). Those are
  // already stored, so no failure of the continue itself crosses them out --
  // the server keeps holding them and answers them with the next message.
  // Only a 2xx saying they were withheld (userMessageKept: false) does.
  //
  // `onStatus` hears the server's status for a 2xx turn, before any reply
  // is revealed.
  const dispatchTurn = async (
    textToSend: string,
    groupIds: string[],
    kind: TurnKind = 'message',
    onStatus?: (status: string) => void,
  ) => {
    // Register this send in the chain before awaiting anything -- a THIRD
    // message sent while both the first and second are still pending must
    // wait behind the second (which is itself waiting behind the first),
    // not race it. resolveReady is always called in `finally` below, on
    // every exit path, so a failed/short-circuited turn never leaves
    // whatever's chained behind it waiting forever.
    let resolveReady!: () => void;
    const thisReady = new Promise<void>(resolve => { resolveReady = resolve; });
    const waitForPreviousSend = conversationIdReadyRef.current;
    conversationIdReadyRef.current = thisReady;

    // Delayed "persona is typing" bubble for the wait before the FIRST
    // reply fragment. A timer arms it FIRST_REPLY_TYPING_DELAY_MS after the
    // request goes out; a reply that lands sooner cancels the timer, so a
    // quick reply never flashes it. Cleared right before the first fragment
    // reveals, and again in `finally` as a backstop for the failure paths.
    // Whether the backend returned a 2xx for this turn. Past that point the
    // user's message HAS been persisted, so a later failure (a malformed body)
    // must not mark the bubble as not-sent. Before it, nothing was stored.
    let serverAccepted = false;

    let waitTypingTimer: ReturnType<typeof setTimeout> | null = null;
    let waitTypingOn = false;
    const armWaitTyping = () => {
      waitTypingTimer = setTimeout(() => {
        waitTypingTimer = null;
        waitTypingOn = true;
        setTypingCount(n => n + 1);
      }, FIRST_REPLY_TYPING_DELAY_MS);
    };
    const clearWaitTyping = () => {
      if (waitTypingTimer) { clearTimeout(waitTypingTimer); waitTypingTimer = null; }
      if (waitTypingOn) { waitTypingOn = false; setTypingCount(n => Math.max(0, n - 1)); }
    };

    try {
      await waitForPreviousSend;

      // Auth no longer travels in the body. The server identifies the
      // caller (guest or invite-code) from the httpOnly session cookie
      // set during /api/code or on first contact, and independently
      // checks that conversationId is actually owned by that session
      // before reading/writing anything. conversationId is sent only
      // so the server knows which conversation to continue — it is not
      // trusted as proof of ownership. (A stale/invalid conversationId
      // is handled entirely server-side too — it transparently starts a
      // new conversation and returns its id, rather than erroring.)
      const isContinue = kind === 'continue';
      // A continue belongs to a conversation by definition; without one there
      // is nothing held to answer.
      if (isContinue && !conversationIdRef.current) return;
      const requestBody = isContinue
        ? { conversationId: conversationIdRef.current }
        : {
            text: textToSend,
            ...(conversationIdRef.current ? { conversationId: conversationIdRef.current } : {})
          };
      const endpointFor = (invite: boolean) =>
        `${invite ? '/api/invitechat' : '/api/guestchat'}${isContinue ? '/continue' : ''}`;

      // postJson supplies the method, JSON header and the httpOnly session
      // cookie (see lib/api.ts). A fresh signal per attempt, so the 401
      // guest-retry below gets its own full budget rather than inheriting
      // whatever is left of the first one's.
      const postChat = (endpoint: string) =>
        postJson(endpoint, requestBody, AbortSignal.timeout(CHAT_REQUEST_TIMEOUT_MS));

      markMessages(groupIds, undefined);
      armWaitTyping();
      const sentAsInvite = isVerifiedRef.current;
      let response = await postChat(endpointFor(sentAsInvite));

      if (response.status === 401 && sentAsInvite) {
        // This tab believes the session is verified, but the server says it
        // isn't -- the session cookie expired or was cleared, or the invite
        // code was deleted (which is how an invite is revoked). Drop the
        // verification and the display code so the UI reverts to "not
        // verified" and the visitor can re-verify, and send this message as
        // a guest turn so it isn't lost.
        // The ref too, at once: a turn already queued behind this one must
        // not try the invite endpoint again before the re-render lands.
        isVerifiedRef.current = false;
        setVerified(false);
        setCode('');
        setInputCode('');
        response = await postChat(endpointFor(false));
      }

      // We got an HTTP response back. A 5xx means the backend is down or
      // erroring behind the proxy; any other status means it's up and
      // answering (even a 4xx rejection). The `catch` below covers a
      // request that never got a response at all.
      setIsOffline(response.status >= 500);

      if (isContinue && !response.ok) {
        // Refused before anything ran (consent, ownership, the in-flight
        // cap) or failed behind the proxy. Either way the server still holds
        // the messages and answers them with the next one, so nothing is
        // crossed out. Only consent and a server fault are worth a word.
        if (response.status === 403) {
          onConsentRequired();
        } else if (response.status >= 500) {
          const text = await errorDetail(response, "The server ran into a problem answering that. Please try again.");
          setMessages(prev => [...prev, createMessage(text, 'system')]);
        }
        return;
      }

      if (response.status === 403) {
        // Consent was missing, so ChatService rejected the turn before
        // append_message ever ran -- the message is NOT in the conversation.
        // Paint it red for the same reason 400/413/429 are painted red, then
        // re-show the popup (e.g. the session's consent record was cleared
        // between useConsent's mount check and now).
        markRejected(groupIds);
        onConsentRequired();
        return;
      }

      if (response.status in REJECT_FALLBACKS) {
        // The backend refused this user message and said why:
        //   400 -> privacy (message contains personal/sensitive info)
        //   413 -> too long once the held fragments were combined
        //   429 -> sending faster than replies come back
        // The optimistic user bubbles were already added and the input
        // cleared by now, so surface the backend's reason as a warning and
        // paint exactly those bubbles red so the user sees which pieces
        // didn't go through.
        setWarningMessage(await errorDetail(response, REJECT_FALLBACKS[response.status]));
        markRejected(groupIds);
        return;
      }

      if (!response.ok) {
        // Some other non-2xx -- a 5xx, or a status we don't special-case.
        // Whatever the cause, the turn was not persisted: every gate that
        // rejects one runs before append_message, and a failure inside
        // model_orchestration comes back as a 200 carrying a system turn.
        // So the bubble is not part of the conversation and is marked as
        // such, alongside a system notice explaining what happened.
        markRejected(groupIds);
        const text = await errorDetail(
          response,
          response.status >= 500
            ? "The server ran into a problem answering that. Please try again."
            : "That message couldn't be sent. Please try again."
        );
        setMessages(prev => [...prev, createMessage(text, 'system')]);
        return;
      }

      // 2xx: ChatService ran past every gate and persisted the message.
      serverAccepted = true;

      const data = await response.json();
      // A turn no longer always carries a reply. The backend's readiness gate
      // (ChatService.handle_chat_turn) answers with a `status`:
      //   'respond'    -- turns hold the reply, as before
      //   'wait'       -- the message reads as mid-thought; the server is
      //                   holding it and will answer it together with the
      //                   next one
      //   'no_reply'   -- nothing that calls for an answer ("ok, thanks")
      //   'superseded' -- a newer message overtook this turn's reply
      // The last three come back with `turns: []` ON PURPOSE, so an empty
      // array is only malformed when the server claims to have replied.
      // Crucially none of them is a reason to resend: the text is stored and
      // the server is tracking it, so resending would duplicate the message.
      // An older backend omits `status` entirely and always sends turns,
      // which still reads as 'respond'.
      const status: string = typeof data?.status === 'string' ? data.status : 'respond';
      const repliesExpected = status === 'respond';

      if (
        !data ||
        !Array.isArray(data.turns) ||
        (repliesExpected && data.turns.length === 0) ||
        !data.turns.every((turn: unknown) => typeof turn === 'string' && turn.trim()) ||
        typeof data.conversationId !== 'string'
      ) {
        throw new Error(`Malformed response: ${JSON.stringify(data)}`);
      }

      // Remember or release the held set, per the rules above.
      //   'wait'       -- these bubbles are now held, waiting on the next
      //                   message. A rejection of that message kills them.
      //   'superseded' -- also still pending: a newer message overtook this
      //                   turn, and whichever turn finally answers covers
      //                   these too, so they stay held until it does.
      //   'no_reply'   -- the persona has dealt with them by deciding they
      //                   need no answer. Nothing is waiting on anything, so
      //                   a later rejection must leave them alone. This is
      //                   the case that must NOT accumulate.
      //   'respond'    -- answered, along with anything held before them.
      const withheldHeld = heldTurnIdsRef.current;
      if (status === 'wait' || status === 'superseded') {
        heldTurnIdsRef.current = [...heldTurnIdsRef.current, ...groupIds];
      } else {
        heldTurnIdsRef.current = [];
      }
      onStatus?.(status);
      // Capture the backend-assigned id — no-op after the first message,
      // since it stays the same for the rest of the session. Set the ref
      // immediately (synchronously) alongside the state -- a message sent
      // right after this one must see the new id even if React hasn't
      // re-rendered yet (see conversationIdRef above).
      // The backend answered but withheld the reply (the response gate's
      // fallback), which also removes this user message from the stored
      // conversation -- see ChatService.handle_chat_turn. Mark the bubble now,
      // before the reveal loop below awaits, so it turns red immediately
      // rather than after the notice has finished appearing. Strict === false
      // so an older backend that omits the field is treated as "kept".
      if (data.userMessageKept === false) {
        // The whole held group goes, not just this turn's bubbles: the reply
        // that was withheld was answering all of them, and the backend
        // retags all of them out of the conversation (see ChatService step
        // 3b). Held ids were cleared just above by the 'respond' branch, so
        // they are read from `withheldHeld` captured before that.
        markMessages([...groupIds, ...withheldHeld], 'not_sent');
      }

      if (data.conversationId !== conversationIdRef.current) {
        setConversationId(data.conversationId);
        conversationIdRef.current = data.conversationId;
      }

      // conversationId is now settled for this turn -- release anything
      // chained behind us right away, rather than making it wait through
      // the (potentially several-second) bubble reveal below too. Safe to
      // call again in `finally` -- resolving a promise more than once is a
      // no-op after the first.
      resolveReady();

      // Reveal each turn as its own bubble with a typing-speed delay between
      // them, instead of dumping the whole reply in one message — mimics a
      // person sending several texts in a row. Unlike before, the input
      // stays enabled during this reveal (see pendingCount) — a message
      // typed and sent mid-reveal lands in the message list wherever it
      // falls in real time, interleaved with the remaining bubbles below,
      // same as a real text thread. The first turn skips the delay -- the
      // backend's own processing time (topic matching, generation, gate
      // verification) already covers the "thinking" pause, so delaying it
      // again would just feel sluggish.
      // The reply is in hand -- the first fragment is about to show, so the
      // "waiting for first reply" bubble comes down now.
      clearWaitTyping();

      // The backend tags the whole reply's sender: 'system' for a generated
      // notice (e.g. the response-gate fallback "having trouble forming a
      // suitable response"), otherwise a normal persona turn. Anything that
      // isn't explicitly 'system' is treated as 'backend'.
      const turns = data.turns as string[];
      if (!repliesExpected) {
        // Nothing to reveal, and nothing to resend. The user's bubble stays
        // exactly as it is -- it was received and stored, so marking it
        // 'not_sent' would be a lie. A 'wait' message is answered when the
        // next one arrives (the reply to that turn covers both), or by a
        // continue if the visitor goes quiet instead -- see runIdleAction.
        return;
      }
      const turnSender: Message['sender'] = data.sender === 'system' ? 'system' : 'backend';
      for (let i = 0; i < turns.length; i++) {
        if (i > 0) {
          // Gap before this follow-up fragment: a plain pause first, THEN
          // the three-dot "typing" bubble for the remainder -- so the
          // bubble doesn't snap on the instant the previous fragment lands.
          // A gap shorter than the knob shows no bubble at all. sleep()
          // never rejects and the decrement sits right after it, so the
          // counter always balances.
          const gap = typingDelayFor(turns[i]);
          if (gap > FRAGMENT_TYPING_DELAY_MS) {
            await sleep(FRAGMENT_TYPING_DELAY_MS);
            setTypingCount(n => n + 1);
            await sleep(gap - FRAGMENT_TYPING_DELAY_MS);
            setTypingCount(n => Math.max(0, n - 1));
          } else {
            await sleep(gap);
          }
        }
        const turnMessage = createMessage(turns[i], turnSender);
        setMessages(prev => [...prev, turnMessage]);
      }


    } catch (error) {
      // Reached only by a rejected fetch (no network / server unreachable)
      // or a malformed 200 response -- every handled HTTP status returns
      // above with its own specific message.
      console.error("Chat request failed:", error);
      setIsOffline(true);
      // Three failures land here now. A rejected fetch means the request never
      // reached the backend, so the message was never stored -- mark it. A
      // malformed 200 means the backend DID store it and only the reply is
      // unusable, so the bubble stays normal and the reply is what's reported
      // missing. A timeout is the honest third case: we genuinely do not know
      // whether it arrived, so it is reported as such rather than claimed
      // either way.
      const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
      // A continue carries no bubbles of its own, and the ones it was for are
      // still held by the server whether or not this request arrived.
      if (!serverAccepted && kind === 'message') {
        markRejected(groupIds);
      }
      const errorMessage = createMessage(
        serverAccepted
          ? "That reply didn't come through properly. Your message was sent."
          : timedOut
            ? "That took too long and the connection gave up. Please try sending it again."
            : "Couldn't reach the server. Check your connection and try again.",
        'system'
      );
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setPendingCount(prev => Math.max(0, prev - 1));
      // Backstop: drop the "waiting for first reply" bubble (and its
      // pending timer) on the 403/429/413 early returns and the catch.
      // No-op on the success path -- already cleared before the reveal.
      clearWaitTyping();
      // Catch-all for every exit path that isn't the success path above
      // (403/429/413 early returns, thrown/network errors) -- guarantees
      // whatever's chained behind this send is never left waiting forever
      // just because this turn failed or got cut short.
      resolveReady();
    }
  };

  // --- When the visitor goes quiet after a reply-less turn ----------------
  // `wait` is the readiness gate's guess that more is coming, and a visitor
  // who then types nothing proves it wrong: after WAIT_CONTINUE_IDLE_MS of an
  // empty, untouched input, the held message is answered as it stands.
  // `no_reply` is not a guess -- nothing needed an answer -- but the visitor
  // may still be waiting for one, so after NO_REPLY_NOTICE_IDLE_MS a notice
  // says the message was seen.

  const clearIdleAction = () => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = null;
    idleActionRef.current = null;
  };

  const runIdleAction = () => {
    const action = idleActionRef.current;
    idleTimerRef.current = null;
    idleActionRef.current = null;
    // Text in the box, or a group in the batching hold, means the visitor is
    // not quiet after all -- that send will carry the thought on.
    if (!action || inputMessageRef.current.trim() || isHoldingRef.current) return;

    if (action === 'notice') {
      setMessages(prev => [...prev, createMessage(noReplyNotice(personaName), 'system')]);
      return;
    }
    if (heldTurnIdsRef.current.length === 0) return;
    turnSeqRef.current += 1;
    // One pending unit, like a message group -- released in dispatchTurn's
    // `finally`. Its result arms nothing further: a continue always answers.
    setPendingCount(prev => prev + 1);
    void dispatchTurn('', [], 'continue');
  };

  const armIdleAction = (action: IdleAction) => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleActionRef.current = action;
    idleTimerRef.current = setTimeout(runIdleAction, IDLE_ACTION_DELAY_MS[action]);
  };

  // Send whatever's currently held as one combined turn. Called by the hold
  // timer (INITIAL_HOLD_MS with an empty input, or TYPING_IDLE_MS after the
  // user stops typing a follow-up); on unmount it's simply cancelled -- see
  // the cleanup effect above.
  const flushHeldMessage = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (!isHoldingRef.current || !heldTextRef.current) return;
    const textToSend = heldTextRef.current;
    const groupIds = heldMessageIdsRef.current;
    heldTextRef.current = '';
    heldMessageIdsRef.current = [];
    isHoldingRef.current = false;
    const seq = ++turnSeqRef.current;
    void dispatchTurn(textToSend, groupIds, 'message', status => {
      // A newer turn went out while this one was in flight; its status is
      // the one that describes the conversation now.
      if (seq !== turnSeqRef.current) return;
      if (status === 'wait') armIdleAction('continue');
      else if (status === 'no_reply') armIdleAction('notice');
      else clearIdleAction();
    });
  };

  // (Re)arm the flush timer. Any previously-pending timer is cleared, so a
  // fresh keystroke or a fresh submit always extends the wait rather than
  // stacking timers.
  const scheduleHoldFlush = (ms: number) => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(flushHeldMessage, ms);
  };

  const handleSend = (e: BaseSyntheticEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    // The server counts Unicode code points, as Python len(str) does.
    if (Array.from(inputMessage).length > MAX_MESSAGE_LENGTH) {
      setWarningMessage(MESSAGE_TOO_LONG_WARNING);
      return;
    }

    // The terms popup is dismissible now (an "I Don't Agree" button lets the
    // visitor browse the chatroom), so a send can genuinely arrive without
    // consent -- re-open the popup and hold the message back. The backend is
    // still the real gate (see ChatService.handle_chat_turn's consent check).
    if (!consented) {
      onConsentRequired();
      return;
    }

    // Real-world text threads let you stack a few outgoing messages before
    // a reply lands, but not unboundedly -- past the cap, block the send
    // and keep the typed text in the box rather than losing it. Only
    // checked when STARTING a new held group: extra pieces merged into an
    // already-held group don't count again, since the whole group becomes
    // exactly one backend turn. UX nicety only (see MAX_PENDING_MESSAGES)
    // -- the backend enforces the real cap regardless.
    const pendingCap = MAX_PENDING_MESSAGES[isVerified ? 'invite' : 'guest'];
    const combined = heldTextRef.current
      ? `${heldTextRef.current} ${inputMessage.trim()}` : inputMessage.trim();
    const startsNewBatch = !isHoldingRef.current || Array.from(combined).length > MAX_MESSAGE_LENGTH;
    if (startsNewBatch && pendingCount >= pendingCap) {
      setWarningMessage(PENDING_LIMIT_WARNING);
      return; // Preserve the draft and the existing valid batch.
    }
    if (isHoldingRef.current && startsNewBatch) flushHeldMessage();
    setWarningMessage(null);
    // The visitor has spoken: a held message now travels with this one, and
    // a no_reply needs no explaining.
    clearIdleAction();

    // Every piece gets its own bubble immediately, exactly as before --
    // "A" then "B" shows as two bubbles, even though the backend request
    // will carry the single joined string "A B".
    const newMessage = { ...createMessage(inputMessage, 'user'), status: 'queued' as const };
    setMessages(prev => [...prev, newMessage]);

    // Accumulate into the held buffer (plain join, single space).
    heldTextRef.current = heldTextRef.current
      ? `${heldTextRef.current} ${inputMessage.trim()}`
      : inputMessage.trim();
    heldMessageIdsRef.current = [...heldMessageIdsRef.current, newMessage.id];

    if (!isHoldingRef.current) {
      isHoldingRef.current = true;
      // One pending unit per held group -- bumped now, released in
      // dispatchTurn's `finally`.
      setPendingCount(prev => prev + 1);
    }

    setInputMessage('');
    inputMessageRef.current = '';

    // Input is empty again -- arm the short grace window. A keystroke in
    // handleInputChange extends this to TYPING_IDLE_MS.
    scheduleHoldFlush(INITIAL_HOLD_MS);
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setInputMessage(e.target.value);
    inputMessageRef.current = e.target.value;
    // A keystroke while a group is held means the user is composing a
    // follow-up -- extend the wait to the longer typing-idle window
    // (reset on every keystroke).
    if (isHoldingRef.current) scheduleHoldFlush(TYPING_IDLE_MS);
    // The visitor is not idle -- restart the quiet period from now.
    if (idleActionRef.current) armIdleAction(idleActionRef.current);
  };

  const restoreDraft = (text: string) => {
    setInputMessage(text);
    inputMessageRef.current = text;
  };

  return { inputMessage, restoreDraft, handleInputChange, handleSend, warningMessage, isAwaitingReply: typingCount > 0, isOffline };
}
