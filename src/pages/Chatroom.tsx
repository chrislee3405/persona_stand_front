// import { useRef, useState } from 'react';
import { useState, useEffect } from 'react';
import type { BaseSyntheticEvent } from 'react';
import { useChat, type Message } from '../context/ChatContext';

// Shown only if the GET /api/consent response has no conditionText at all
// (e.g. consent_policy is somehow empty) -- should be rare in practice
// since app/main.py seeds an initial policy row on startup.
const CONSENT_TEXT_UNAVAILABLE = "Consent terms are currently unavailable. Please try again later.";

// const PAIRS_BEFORE_SUMMARIZE = 5;

function generateMessageId(): string {
  return (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Tunable, mirrors the backend's _MIN_CHARS_PER_TURN hyperparameter in spirit:
// each turn is revealed after a delay proportional to its length, simulating
// a person typing it out, rather than all turns appearing at once.
const TYPING_MS_PER_CHAR = 40;
const TYPING_MIN_MS = 400;
const TYPING_MAX_MS = 3000;
// +/- this fraction of the base delay, randomized per turn -- a perfectly
// deterministic length-proportional delay feels robotic; real typing speed
// varies turn to turn.
const TYPING_JITTER_RATIO = 0.25;

// Mirrors the backend's _MAX_PENDING_PER_SESSION (rate_control_service.py)
// so the UI can warn instantly instead of waiting on a round trip -- but
// the backend's cap is the real enforcement, this one is UX only and can
// be bypassed by calling the API directly, so it must match, not replace, it.
const MAX_PENDING_MESSAGES = 3;

// Mirrors the backend's MAX_MESSAGE_LENGTH (chat_service.py) -- used both
// as an <input maxLength> (stops typing/pasting past the limit) and as a
// belt-and-suspenders check in handleSend. The backend is the real
// enforcement (see MessageTooLongError -> HTTP 413); this just gives
// instant feedback instead of a round trip.
const MAX_MESSAGE_LENGTH = 2000;

const PENDING_LIMIT_WARNING = "Too many messages waiting for a reply — please wait a moment before sending another.";
const MESSAGE_TOO_LONG_WARNING = `Message is too long (max ${MAX_MESSAGE_LENGTH} characters).`;

function typingDelayFor(text: string): number {
  const base = text.length * TYPING_MS_PER_CHAR;
  const jitterRange = base * TYPING_JITTER_RATIO;
  const jittered = base + (Math.random() * 2 - 1) * jitterRange;
  return Math.min(Math.max(jittered, TYPING_MIN_MS), TYPING_MAX_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default function Chatroom() {
  const {
    messages, setMessages,
    code, setCode,
    inputCode, setInputCode,
    conversationId, setConversationId
  } = useChat();

  const [inputMessage, setInputMessage] = useState('');
  // Count of this session's messages currently in flight (sent, reply not
  // yet fully revealed) -- not a boolean, since up to MAX_PENDING_MESSAGES
  // can be in flight at once (send button stays clickable throughout, per
  // design: the chatroom mimics a real text thread, not a form that locks
  // while "submitting").
  const [pendingCount, setPendingCount] = useState(0);
  // Shared banner text for both the pending-message cap and the
  // message-too-long check below -- null hides the banner.
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);

  // null = still checking with the backend, so the popup doesn't flash
  // on screen for a returning, already-consented session before the
  // check resolves.
  const [consented, setConsented] = useState<boolean | null>(null);
  const [isSubmittingConsent, setIsSubmittingConsent] = useState(false);
  // Pulled from the backend (consent_policy table) rather than hardcoded,
  // so the wording can change without a frontend redeploy.
  const [consentText, setConsentText] = useState<string | null>(null);

  const isVerified = Boolean(code);

  useEffect(() => {
    fetch('/api/consent', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        setConsented(Boolean(data?.consented));
        setConsentText(typeof data?.conditionText === 'string' ? data.conditionText : null);
      })
      .catch(error => {
        console.error("Failed to check consent status:", error);
        // Fail closed -- if the check itself is broken, still show the
        // popup rather than silently letting messages through unconsented.
        setConsented(false);
      });
  }, []);

  const handleAgreeConsent = async () => {
    setIsSubmittingConsent(true);
    try {
      const response = await fetch('/api/consent', {
        method: 'POST',
        credentials: 'include'
      });
      if (response.ok) {
        setConsented(true);
      }
    } catch (error) {
      console.error("Failed to submit consent:", error);
    } finally {
      setIsSubmittingConsent(false);
    }
  };

  const createMessage = (text: string, sender: Message['sender']): Message => ({
    id: generateMessageId(),
    text,
    sender
  });


  
  const handleSend = async (e: BaseSyntheticEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    // maxLength on the input below should already prevent this, but keep
    // the same belt-and-suspenders check as the other gates -- the
    // backend's MAX_MESSAGE_LENGTH is the real enforcement.
    if (inputMessage.length > MAX_MESSAGE_LENGTH) {
      setWarningMessage(MESSAGE_TOO_LONG_WARNING);
      return;
    }

    // The overlay below should already prevent this, but the backend is
    // the real gate (see ChatService.handle_chat_turn's consent check) --
    // this is just a cheap early return, not the enforcement.
    if (!consented) return;

    // Real-world text threads let you stack a few outgoing messages before
    // a reply lands, but not unboundedly -- past the cap, block the send
    // and keep the typed text in the box rather than losing it. This is a
    // UX nicety only (see MAX_PENDING_MESSAGES) -- the backend enforces
    // the real cap regardless of what this check does.
    if (pendingCount >= MAX_PENDING_MESSAGES) {
      setWarningMessage(PENDING_LIMIT_WARNING);
      return;
    }
    setWarningMessage(null);
    setPendingCount(prev => prev + 1);

    const newMessage = createMessage(inputMessage, 'user');

    setMessages(prev => [...prev, newMessage]);
    const textToSend = inputMessage;
    setInputMessage('');

    try {
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
        ...(conversationId ? { conversationId } : {})
      };

      const postChat = (endpoint: string) => fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // send the httpOnly session cookie
        body: JSON.stringify(requestBody)
      });

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

      if (response.status === 403) {
        // Rare fallback (e.g. the GET /api/consent check above raced with
        // something clearing the session's consent record) -- re-show the
        // popup rather than erroring out.
        setConsented(false);
        return;
      }

      if (response.status === 429) {
        // Belt-and-suspenders: the client-side cap above should normally
        // catch this first, but a second tab (or a direct API call) can
        // still hit the backend's real cap. The optimistic user bubble
        // above was already added and the input already cleared by this
        // point, so this rare path doesn't retract/restore either --
        // just surface the warning; full recovery UX is later work.
        setWarningMessage(PENDING_LIMIT_WARNING);
        return;
      }

      if (response.status === 413) {
        // Same rare-path reasoning as 429 above -- maxLength/the
        // client-side check should normally catch this first.
        setWarningMessage(MESSAGE_TOO_LONG_WARNING);
        return;
      }

      if (!response.ok) {
        throw new Error(`Server responded with status code: ${response.status}`);
      }

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
      // since it stays the same for the rest of the session.
      if (data.conversationId !== conversationId) {
        setConversationId(data.conversationId);
      }

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
      const turns = data.turns as string[];
      for (let i = 0; i < turns.length; i++) {
        if (i > 0) {
          await sleep(typingDelayFor(turns[i]));
        }
        const backendMessage = createMessage(turns[i], 'backend');
        setMessages(prev => [...prev, backendMessage]);
      }


    } catch (error) {
      console.error("Server connection dropped:", error);
      const errorMessage = createMessage(
        "Connection error: Failed to receive response from the negotiation terminal server.",
        'backend'
      );
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setPendingCount(prev => Math.max(0, prev - 1));
    }
  };

  const handleCode = async (e: BaseSyntheticEvent) => {
    e.preventDefault();
    if (!inputCode.trim() || isVerified || isVerifyingCode) return;
    setIsVerifyingCode(true);

    const codeToSend = inputCode.trim();

    try {
      const response = await fetch('/api/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // required: server sets the verified session cookie in the response
        body: JSON.stringify({
          input_code: codeToSend,
          conversation_id: conversationId  // may be null if no message sent yet — that's fine
        })
      });

      if (!response.ok) {
        alert("Incorrect code! Please check and try again.");
      } else {
        const data = await response.json();
        // `code` is now display-only ("Access Granted via X") — it is never
        // sent back to the server as proof of anything. The server already
        // upgraded this session to verified via the Set-Cookie on this response.
        const verifiedCode = data.returned_result ?? codeToSend;
        setCode(verifiedCode);
        setInputCode(verifiedCode);
      }
    } catch (error) {
      console.error("Server validation error:", error);
      alert("system connection error. Please try again.");
    } finally {
      setIsVerifyingCode(false);
    }
  };

  return (
    <div>
      {/* Compulsory consent popup -- blocks the whole page until agreed.
          Minimal inline styling to actually cover/block interaction; the
          rest of the visual design is later work. */}
      {consented === false && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0, 0, 0, 0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{ background: 'white', color: 'black', padding: '24px', maxWidth: '480px' }}>
            <p>{consentText ?? CONSENT_TEXT_UNAVAILABLE}</p>
            <button onClick={handleAgreeConsent} disabled={isSubmittingConsent || !consentText}>
              {isSubmittingConsent ? 'Submitting...' : 'I Agree'}
            </button>
          </div>
        </div>
      )}

      {/* Invite code Controls */}
      <form onSubmit={handleCode}>
        <input
          type="text"
          placeholder={
            isVerified
              ? `Access Granted via ${code}`
              : isVerifyingCode
                ? "Verifying code..."
                : "Type your invite code here (if any)"
          }
          value={inputCode}
          onChange={(e) => setInputCode(e.target.value)}
          disabled={isVerifyingCode || isVerified}
        />
        <button type="submit" disabled={isVerifyingCode || isVerified}>
          {isVerifyingCode ? 'Checking...' : isVerified ? 'Verified' : 'Verify CODE'}
        </button>
      </form>




      {/* Raw Message List */}
      <div>
        {messages.map((msg) => (
          <div key={msg.id}>
            <strong>{msg.sender === 'user' ? 'You: ' : 'System: '}</strong>
            {msg.text}
          </div>
        ))}
      </div>

      {/* Simple placeholder -- polished styling/dismissal is later work */}
      {warningMessage && (
        <div>{warningMessage}</div>
      )}

      {/* Chat Form Controls */}
      <form onSubmit={handleSend}>
        <input
          type="text"
          placeholder="Type your message here..."
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          maxLength={MAX_MESSAGE_LENGTH}
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
