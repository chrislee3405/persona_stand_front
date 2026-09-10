import { useState, useRef, useEffect, useCallback } from 'react';
import type { BaseSyntheticEvent, ChangeEvent } from 'react';
import { useChat, type Message, type MessageStatus } from '../context/ChatContext';
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
export function useChatDispatch({ consented, isVerified, onConsentRequired }: UseChatDispatchArgs) {
  const {
    setMessages,
    conversationId, setConversationId,
    setCode, setInputCode
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

  const [inputMessage, setInputMessage] = useState('');
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
  // 'blocked'  -- the backend refused the message before storing it: the
  //               privacy gate (400), combined text over MAX_MESSAGE_LENGTH
  //               (413), the pending cap or the daily allowance (429),
  //               missing consent (403), or a transport failure.
  // 'withheld' -- the backend DID store it, then dropped it from the
  //               conversation: the response gate withheld a reply, or
  //               generation failed and the row was retagged. The persona
  //               will never see it.
  //
  // The distinction is the reason these are two values and not one flag --
  // "not sent" and "not answered" are different things to tell someone.
  //
  // This writes ONTO the message objects rather than into two id lists held
  // here. The lists were component state while `messages` is persisted to
  // sessionStorage, so a refresh restored the text without the status and a
  // rejected message came back looking delivered -- leaving the visitor
  // believing the persona had received something it never did.
  const markMessages = useCallback((ids: string[], status: MessageStatus) => {
    if (ids.length === 0) return;
    setMessages(prev =>
      prev.map(m => (ids.includes(m.id) ? { ...m, status } : m)),
    );
  }, [setMessages]);

  // Cancel any pending fragment-batch flush timer on unmount so it can't
  // fire a dispatchTurn after the component is gone. Held-but-unflushed
  // text is dropped -- acceptable for now (polish later).
  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    };
  }, []);

  // Fire the actual backend request for one turn's worth of text. The text
  // (and the ids of the bubbles it came from) are passed in rather than
  // read from the input, and the 413/429 branches paint those bubbles red.
  // The conversationIdReadyRef promise-chain below is load-bearing --
  // batching cuts how often concurrent sends happen but sequential bursts
  // (one group fully sent, a new one started before its reply returns)
  // still need the chain.
  const dispatchTurn = async (textToSend: string, groupIds: string[]) => {
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
      const requestBody = {
        text: textToSend,
        ...(conversationIdRef.current ? { conversationId: conversationIdRef.current } : {})
      };

      // postJson supplies the method, JSON header and the httpOnly session
      // cookie (see lib/api.ts).
      const postChat = (endpoint: string) => postJson(endpoint, requestBody);

      armWaitTyping();
      let response = await postChat(isVerified ? '/api/invitechat' : '/api/guestchat');

      if (response.status === 401 && isVerified) {
        // This tab still has an invite code cached, but the server says
        // this session's verification isn't valid (e.g. the session
        // cookie expired or was cleared). Drop the stale code so the UI
        // reverts to "not verified" and let the user re-verify later,
        // and treat this message as guest so it isn't lost.
        setCode('');
        setInputCode('');
        response = await postChat('/api/guestchat');
      }

      // We got an HTTP response back. A 5xx means the backend is down or
      // erroring behind the proxy; any other status means it's up and
      // answering (even a 4xx rejection). The `catch` below covers a
      // request that never got a response at all.
      setIsOffline(response.status >= 500);

      if (response.status === 403) {
        // Consent was missing, so ChatService rejected the turn before
        // append_message ever ran -- the message is NOT in the conversation.
        // Paint it red for the same reason 400/413/429 are painted red, then
        // re-show the popup (e.g. the session's consent record was cleared
        // between useConsent's mount check and now).
        markMessages(groupIds, 'blocked');
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
        markMessages(groupIds, 'blocked');
        return;
      }

      if (!response.ok) {
        // Some other non-2xx -- a 5xx, or a status we don't special-case.
        // Whatever the cause, the turn was not persisted: every gate that
        // rejects one runs before append_message, and a failure inside
        // model_orchestration comes back as a 200 carrying a system turn.
        // So the bubble is not part of the conversation and is marked as
        // such, alongside a system notice explaining what happened.
        markMessages(groupIds, 'blocked');
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
      if (
        !data ||
        !Array.isArray(data.turns) ||
        data.turns.length === 0 ||
        !data.turns.every((turn: unknown) => typeof turn === 'string' && turn.trim()) ||
        typeof data.conversationId !== 'string'
      ) {
        throw new Error(`Malformed response: ${JSON.stringify(data)}`);
      }

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
        markMessages(groupIds, 'withheld');
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
      // Two very different failures land here. A rejected fetch means the
      // request never reached the backend, so the message was never stored --
      // mark it. A malformed 200 means the backend DID store it and only the
      // reply is unusable, so the bubble stays normal and the reply is what's
      // reported missing.
      if (!serverAccepted) {
        markMessages(groupIds, 'blocked');
      }
      const errorMessage = createMessage(
        serverAccepted
          ? "That reply didn't come through properly. Your message was sent."
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
    void dispatchTurn(textToSend, groupIds);
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

    // maxLength on the input should already prevent this, but keep the
    // same belt-and-suspenders check as the other gates -- the backend's
    // MAX_MESSAGE_LENGTH is the real enforcement. (This guards one
    // over-long piece; a group that only exceeds the limit once combined
    // is caught by the backend -> 413 branch in dispatchTurn.)
    if (inputMessage.length > MAX_MESSAGE_LENGTH) {
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
    if (!isHoldingRef.current && pendingCount >= pendingCap) {
      setWarningMessage(PENDING_LIMIT_WARNING);
      return;
    }
    setWarningMessage(null);

    // Every piece gets its own bubble immediately, exactly as before --
    // "A" then "B" shows as two bubbles, even though the backend request
    // will carry the single joined string "A B".
    const newMessage = createMessage(inputMessage, 'user');
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

    // Input is empty again -- arm the short grace window. A keystroke in
    // handleInputChange extends this to TYPING_IDLE_MS.
    scheduleHoldFlush(INITIAL_HOLD_MS);
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setInputMessage(e.target.value);
    // A keystroke while a group is held means the user is composing a
    // follow-up -- extend the wait to the longer typing-idle window
    // (reset on every keystroke).
    if (isHoldingRef.current) scheduleHoldFlush(TYPING_IDLE_MS);
  };

  return { inputMessage, handleInputChange, handleSend, warningMessage, isAwaitingReply: typingCount > 0, isOffline };
}
