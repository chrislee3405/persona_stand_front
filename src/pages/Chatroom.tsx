import { useChat } from '../context/ChatContext';
import { useConsent } from '../hooks/useConsent';
import { useInviteCode } from '../hooks/useInviteCode';
import { useChatDispatch, MAX_MESSAGE_LENGTH } from '../hooks/useChatDispatch';

// Shown only if the GET /api/consent response has no conditionText at all
// (e.g. consent_policy is somehow empty) -- should be rare in practice
// since app/main.py seeds an initial policy row on startup.
const CONSENT_TEXT_UNAVAILABLE = "Consent terms are currently unavailable. Please try again later.";

export default function Chatroom() {
  // The running message list (persisted in ChatContext across refreshes) --
  // rendered below; every other piece of chat state lives in the hooks.
  const { messages } = useChat();

  // Invite-code verification: the code/input values, the in-flight flag, the
  // submit handler for the code form, and isVerified (also handed to
  // useChatDispatch so it can pick the invite vs guest endpoint).
  const { code, inputCode, setInputCode, isVerified, isVerifyingCode, verifyCode } = useInviteCode();

  // Compulsory-consent gate: whether the user has consented, the policy text
  // for the popup, the submitting flag, and agree/revoke actions.
  const { consented, consentText, isSubmittingConsent, agreeConsent, revokeConsent } = useConsent();

  // Everything about turning typed text into backend turns: the input value +
  // change handler, the send handler (rapid-fire fragment batching lives in
  // here), the warning-banner text, and the ids of bubbles the backend
  // refused (rendered red). Needs consent + verified state as inputs, and
  // re-opens the consent popup if the backend rejects a turn with HTTP 403.
  const { inputMessage, handleInputChange, handleSend, warningMessage, blockedIds } = useChatDispatch({
    consented,
    isVerified,
    onConsentRevoked: revokeConsent,
  });

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
            <button onClick={agreeConsent} disabled={isSubmittingConsent || !consentText}>
              {isSubmittingConsent ? 'Submitting...' : 'I Agree'}
            </button>
          </div>
        </div>
      )}

      {/* Invite code Controls */}
      <form onSubmit={verifyCode}>
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
          <div
            key={msg.id}
            style={
              msg.sender === 'user' && blockedIds.includes(msg.id)
                ? { color: 'red' }
                : undefined
            }
          >
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
          onChange={handleInputChange}
          maxLength={MAX_MESSAGE_LENGTH}
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
