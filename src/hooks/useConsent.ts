import { useState, useEffect } from 'react';

/**
 * Compulsory-consent gate. Checks the backend on mount, exposes the current
 * policy text for the popup, and records agreement. `revokeConsent` is for
 * callers that need to re-open the popup without touching the setter --
 * currently the chat dispatch's HTTP 403 path (see useChatDispatch).
 */
export function useConsent() {
  // null = still checking with the backend, so the popup doesn't flash on
  // screen for a returning, already-consented session before the check
  // resolves.
  const [consented, setConsented] = useState<boolean | null>(null);
  const [isSubmittingConsent, setIsSubmittingConsent] = useState(false);
  // Pulled from the backend (consent_policy table) rather than hardcoded,
  // so the wording can change without a frontend redeploy.
  const [consentText, setConsentText] = useState<string | null>(null);

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

  const agreeConsent = async () => {
    // Button is disabled while consentText is null, but guard here too --
    // the backend requires the exact current text in the body (see
    // ConsentService.record_consent), so there's nothing valid to send yet.
    if (!consentText) return;
    setIsSubmittingConsent(true);
    try {
      const response = await fetch('/api/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ conditionText: consentText })
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

  // Re-open the consent popup -- used when the backend rejects a chat turn
  // with HTTP 403 (the session's consent record vanished between our mount
  // check and now).
  const revokeConsent = () => setConsented(false);

  return { consented, consentText, isSubmittingConsent, agreeConsent, revokeConsent };
}
