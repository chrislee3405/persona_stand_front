import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { BaseSyntheticEvent, KeyboardEvent } from 'react';
import { useChat } from '../context/ChatContext';
import { useConsent } from '../hooks/useConsent';
import { useInviteCode } from '../hooks/useInviteCode';
import { useChatDispatch, MAX_MESSAGE_LENGTH } from '../hooks/useChatDispatch';
import { assetUrl } from '../lib/assetUrl';
import wallpaper from '../assets/icons/chatroom_wallpaper.png';
import './Chatroom.css';

// Header avatar -- a fixed object in the CDN bucket (not a site_image row).
const AVATAR_URL = assetUrl('about_me/icon.png');

// Shown only if the GET /api/consent response has no conditionText at all
// (e.g. consent_policy is somehow empty) -- should be rare in practice
// since app/main.py seeds an initial policy row on startup.
const CONSENT_TEXT_UNAVAILABLE = "Consent terms are currently unavailable. Please try again later.";

export default function Chatroom() {
  // The running message list (persisted in ChatContext across refreshes).
  const { messages } = useChat();

  // Invite-code verification: the code/input values, the in-flight flag, the
  // submit handler for the code form, and isVerified (also handed to
  // useChatDispatch so it can pick the invite vs guest endpoint).
  const { code, inputCode, setInputCode, isVerified, isVerifyingCode, verifyCode, error: codeError } = useInviteCode();

  // Consent gate: whether the user has agreed, the policy text for the popup,
  // the submitting flag, agree/revoke actions, and whether the mount-time
  // consent check couldn't reach the backend.
  const { consented, consentText, isSubmittingConsent, agreeConsent, revokeConsent, checkFailed } = useConsent();

  // The terms popup is now dismissible: "I Don't Agree" sets this, which hides
  // the overlay and lets the visitor read the chatroom. It stays hidden until
  // a send is attempted (see requireConsent / onSubmit) -- then the terms come
  // back, and keep coming back, until "I Agree" is clicked.
  const [consentDismissed, setConsentDismissed] = useState(false);
  const showConsent = consented === false && !consentDismissed;

  // Force the terms popup back on screen: clear the dismissal and make sure
  // the consent flag is false. Wired to useChatDispatch (fires on a send with
  // no consent, and on an HTTP 403) and used directly by onSubmit.
  const requireConsent = () => {
    setConsentDismissed(false);
    revokeConsent();
  };

  // Everything about turning typed text into backend turns: the input value +
  // change handler, the send handler (rapid-fire fragment batching lives in
  // here), the warning-banner text, and the ids of bubbles the backend
  // refused (rendered as red dialog boxes below).
  const { inputMessage, handleInputChange, handleSend, warningMessage, blockedIds, withheldIds, isAwaitingReply, isOffline } = useChatDispatch({
    consented,
    isVerified,
    onConsentRequired: requireConsent,
  });

  // Header status. Once a send has resolved, its outcome (isOffline) is the
  // source of truth; before any send, fall back to whether the consent
  // check reached the backend.
  const offline = isOffline === true || (isOffline === null && checkFailed);

  // Falls back to a monogram if the CDN avatar is missing / not public.
  const [avatarBroken, setAvatarBroken] = useState(false);

  // Auto-stick to the bottom as new bubbles (and the notice) arrive.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, warningMessage, isAwaitingReply]);

  // Grow the composer to fit its wrapped text: reset to auto, then to the
  // content height. CSS `max-height` caps it at ~4 lines and turns on the
  // internal scrollbar past that. Runs on every value change (including the
  // reset to '' after a send, which snaps it back to one line).
  const composerRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [inputMessage]);

  // Send-button dispatch animation (see Chatroom.css `.send-btn.is-sending`).
  // Normally cleared on the `sendDispatchMove` animationend; the timeout is a
  // fallback for prefers-reduced-motion, where the animation -- and so the
  // event -- never runs and the class would otherwise stick.
  const [isSending, setIsSending] = useState(false);
  useEffect(() => {
    if (!isSending) return;
    const t = setTimeout(() => setIsSending(false), 1200);
    return () => clearTimeout(t);
  }, [isSending]);

  const onSubmit = (e: BaseSyntheticEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;
    // No consent yet (dismissed, or still loading) -- bounce the terms popup
    // back up instead of sending or playing the dispatch animation.
    if (!consented) {
      requireConsent();
      return;
    }
    // The remaining guards (too long / pending cap) live in handleSend, which
    // no-ops on those.
    setIsSending(true);
    handleSend(e);
  };

  // Enter sends; Shift+Enter inserts a newline.
  const onComposerKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit(e);
    }
  };

  return (
    <div className="chatroom">
      {/* Consent popup. Dismissible via "I Don't Agree" (the visitor can then
          browse the chatroom), but any send attempt brings it back until
          "I Agree" is clicked. */}
      {showConsent && (
        <div className="chatroom-consent">
          <div className="chatroom-consent__card">
            <p className="chatroom-consent__text">{consentText ?? CONSENT_TEXT_UNAVAILABLE}</p>
            <div className="chatroom-consent__actions">
              <button
                type="button"
                className="chatroom-consent__agree"
                onClick={agreeConsent}
                disabled={isSubmittingConsent || !consentText}
              >
                {isSubmittingConsent ? 'Submitting…' : 'I Agree'}
              </button>
              <button
                type="button"
                className="chatroom-consent__decline"
                onClick={() => setConsentDismissed(true)}
                disabled={isSubmittingConsent}
              >
                I Don't Agree
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="chatroom__header">
        {AVATAR_URL && !avatarBroken ? (
          <img
            className="chatroom__avatar"
            src={AVATAR_URL}
            alt=""
            aria-hidden="true"
            onError={() => setAvatarBroken(true)}
          />
        ) : (
          <span className="chatroom__avatar" aria-hidden="true">P</span>
        )}
        <div>
          <div className="chatroom__title">Virtual Persona</div>
          <div
            className={`chatroom__status${offline && !isAwaitingReply ? ' chatroom__status--offline' : ''}`}
          >
            {isAwaitingReply ? 'Typing…' : offline ? 'offline' : 'online'}
          </div>
        </div>
      </header>

      {/* Invite-code strip */}
      <form
        className={`chatroom__code${isVerified ? ' chatroom__code--ok' : ''}`}
        onSubmit={verifyCode}
      >
        <input
          type="text"
          placeholder={
            isVerified
              ? `Access granted via ${code}`
              : isVerifyingCode
                ? 'Verifying code…'
                : 'Invite code (optional)'
          }
          value={inputCode}
          onChange={(e) => setInputCode(e.target.value)}
          disabled={isVerifyingCode || isVerified}
        />
        <button type="submit" disabled={isVerifyingCode || isVerified}>
          {isVerifyingCode ? 'Checking…' : isVerified ? 'Verified' : 'Verify'}
        </button>
        {codeError && (
          <p className="chatroom__code-error" role="alert">{codeError}</p>
        )}
      </form>

      {/* Message area over the steady wallpaper */}
      <div className="chatroom__body" style={{ backgroundImage: `url(${wallpaper})` }}>
        <div className="chatroom__scroll" ref={scrollRef}>
          {messages.map((msg) => {
            // System / error notice -- centred yellow bubble, no tail.
            if (msg.sender === 'system') {
              return (
                <div key={msg.id} className="msg msg--sys">
                  <div className="msg__bubble msg__bubble--sys">
                    <span className="visually-hidden">System: </span>
                    {msg.text}
                  </div>
                </div>
              );
            }
            // User message (right) or AI reply (left, with tail).
            const isUser = msg.sender === 'user';
            // Two ways a user bubble stops being part of the conversation, with
            // the same red styling but different notes -- "Not sent" would be a
            // false statement for a withheld turn, which the server did receive
            // and store before dropping it from the history.
            const blocked = isUser && blockedIds.includes(msg.id);
            const withheld = isUser && !blocked && withheldIds.includes(msg.id);
            const note = blocked ? '✕ Not sent' : withheld ? '✕ Not answered' : null;
            return (
              <div
                key={msg.id}
                className={`msg ${isUser ? 'msg--out' : 'msg--in'}${note ? ' msg--blocked' : ''}`}
              >
                <div className="msg__bubble">
                  <span className="visually-hidden">{isUser ? 'You: ' : 'Persona: '}</span>
                  {msg.text}
                  {note && <span className="msg__blocked-note">{note}</span>}
                </div>
              </div>
            );
          })}

          {warningMessage && (
            <div className="chatroom__notice" role="status">{warningMessage}</div>
          )}

          {/* "Persona is typing" -- shown while a reply is in flight
              (useChatDispatch.isAwaitingReply). */}
          {isAwaitingReply && (
            <div className="msg msg--in msg--typing">
              <div className="msg__bubble msg__bubble--typing" role="status" aria-label="Persona is typing">
                <span className="msg__dot" />
                <span className="msg__dot" />
                <span className="msg__dot" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <form className="chatroom__composer" onSubmit={onSubmit}>
        <textarea
          ref={composerRef}
          rows={1}
          placeholder="Type a message"
          value={inputMessage}
          onChange={handleInputChange}
          onKeyDown={onComposerKeyDown}
          maxLength={MAX_MESSAGE_LENGTH}
          aria-label="Message"
        />
        <button
          className={`send-btn${isSending ? ' is-sending' : ''}`}
          type="submit"
          aria-label="Send message"
          onAnimationEnd={(e) => {
            if (e.animationName === 'sendDispatchMove') setIsSending(false);
          }}
        >
          <svg viewBox="0 0 200 200" aria-hidden="true">
            <g className="dispatch-icon">
              <g className="wing-top">
                <polygon
                  points="145,100 55,54 55,100"
                  fill="#fff"
                  stroke="#fff"
                  strokeWidth="7"
                  strokeLinejoin="round"
                />
              </g>
              <g className="wing-bottom">
                <polygon
                  points="145,100 55,146 55,100"
                  fill="#fff"
                  stroke="#fff"
                  strokeWidth="7"
                  strokeLinejoin="round"
                />
              </g>
            </g>
          </svg>
        </button>
      </form>
    </div>
  );
}
