import { useState } from 'react';
import { postJson, errorDetail } from '../lib/api';
import type { ChatroomInit, ConsentTerms } from './useChatroomInitialize';

export type { ConsentTerms } from './useChatroomInitialize';

/** What the visitor is told when the terms cannot be produced -- whether that
 *  is because none are configured or because the backend could not be
 *  reached. The backend sends the same sentence as its 503 `detail`; this is
 *  the fallback for the cases where no usable body arrives at all. */
const TERMS_UNAVAILABLE = 'Consent terms are currently unavailable. Please try again later.';

const WITHDRAW_FAILED = 'Your consent could not be withdrawn right now. Please try again in a moment.';

/** The consent fields that follow from an initialisation result. `loading`
 *  maps to "not known yet", so the card does not flash on screen for an
 *  already-consented session before the answer arrives. */
function fromInit(init: ChatroomInit) {
  if (init.status === 'ready') {
    return {
      consented: init.consent.consented,
      terms: init.consent.terms,
      checkFailed: !init.reachable,
      error: init.consent.terms ? null : TERMS_UNAVAILABLE,
    };
  }
  if (init.status === 'failed') {
    // Fail closed -- if the check itself is broken, still show the card rather
    // than silently letting messages through unconsented. With no terms to
    // show, it renders as the inert unavailable card.
    return { consented: false, terms: null, checkFailed: true, error: init.error };
  }
  return { consented: null, terms: null, checkFailed: false, error: null };
}

/**
 * Compulsory-consent gate. Takes the chatroom's initialisation result (see
 * useChatroomInitialize -- this hook no longer fetches anything on mount),
 * exposes the current policy terms for the card, and records agreement and
 * withdrawal.
 *
 * `revokeConsent` re-opens the card locally without telling the server --
 * for the chat dispatch's HTTP 403 path, where the server has already said
 * consent is missing. `withdrawConsent` is the visitor's own choice and DOES
 * tell the server: from then on nothing they send is processed or stored
 * until they agree again.
 *
 * FAILS CLOSED, ALWAYS. Every path that cannot establish usable terms leaves
 * `consented` false and `consentTerms` null, which Chatroom renders as the
 * inert "terms unavailable" card -- no agree, no decline, just a close
 * button. There is no state in which this hook reports consent it did not
 * observe, and none in which it offers "I Agree" for terms nobody could read.
 */
export function useConsent(init: ChatroomInit) {
  const initial = fromInit(init);
  // null = still initialising, so the card doesn't flash on screen for a
  // returning, already-consented session before the answer resolves.
  const [consented, setConsented] = useState<boolean | null>(initial.consented);
  const [isSubmittingConsent, setIsSubmittingConsent] = useState(false);
  const [isWithdrawingConsent, setIsWithdrawingConsent] = useState(false);
  // Pulled from the backend (consent_policy table) rather than hardcoded, so
  // the wording can change without a frontend redeploy.
  const [consentTerms, setConsentTerms] = useState<ConsentTerms | null>(initial.terms);
  // true when initialisation could not reach a working backend. Used by
  // Chatroom to show "disconnected" before any message has been sent.
  const [checkFailed, setCheckFailed] = useState(initial.checkFailed);
  // Why the last agree attempt failed, for the card to render. Without this a
  // failed "I Agree" was completely silent: the spinner stopped, the button
  // re-enabled, and the visitor clicked it again.
  const [error, setError] = useState<string | null>(initial.error);
  // Why the last withdrawal failed, shown beside the withdraw action rather
  // than inside the card -- the card is not on screen when withdrawal is
  // offered.
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  // Adopt the initialisation result when it arrives. Done DURING RENDER, the
  // React pattern for state that follows a prop (react.dev "storing
  // information from previous renders"), not in an effect -- an effect would
  // paint one frame of the stale state first, and is what
  // react-hooks/set-state-in-effect exists to catch. Same pattern as
  // ProjectSheet and TechChips.
  const [appliedInit, setAppliedInit] = useState<ChatroomInit>(init);
  if (init !== appliedInit) {
    setAppliedInit(init);
    const next = fromInit(init);
    setConsented(next.consented);
    setConsentTerms(next.terms);
    setCheckFailed(next.checkFailed);
    setError(next.error);
  }

  const agreeConsent = async () => {
    // The button is disabled while consentTerms is null, but guard here too --
    // the backend requires the exact current condition in the body (see
    // ConsentService.record_consent), so there is nothing valid to send yet.
    if (!consentTerms) {
      setError(TERMS_UNAVAILABLE);
      return;
    }
    setIsSubmittingConsent(true);
    setError(null);
    try {
      // Only `condition` is echoed -- the header labels the box, it is not
      // the thing being agreed to.
      const response = await postJson('/api/consent', { conditionText: consentTerms.condition });
      if (response.ok) {
        setConsented(true);
        setCheckFailed(false);
        setWithdrawError(null);
        return;
      }

      // Every non-2xx is surfaced. A 400 means the policy changed between
      // initialisation and this POST; a 503 means nothing usable is configured
      // or the database is gone.
      setError(await errorDetail(response, TERMS_UNAVAILABLE));
      if (response.status === 503) {
        // The terms we are holding are no longer usable -- drop them so the
        // card falls back to its inert state rather than continuing to offer
        // an agreement the server will keep refusing.
        setConsentTerms(null);
      }
      if (response.status >= 500) setCheckFailed(true);
    } catch (err) {
      console.error('Failed to submit consent:', err);
      setCheckFailed(true);
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setIsSubmittingConsent(false);
    }
  };

  /**
   * Withdraws this session's consent on the server.
   *
   * Returns true once the server has confirmed, so the caller can bring the
   * consent card back. Local state flips to "not consented" ONLY on that
   * confirmation: showing the visitor that collection has stopped when the
   * request actually failed would be the one misleading outcome here, so a
   * failure leaves them consented and says why.
   */
  const withdrawConsent = async (): Promise<boolean> => {
    setIsWithdrawingConsent(true);
    setWithdrawError(null);
    try {
      const response = await postJson('/api/consent/withdraw', {});
      if (!response.ok) {
        setWithdrawError(await errorDetail(response, WITHDRAW_FAILED));
        return false;
      }
      setConsented(false);
      // A stale agree-error from earlier must not greet them on the card.
      setError(consentTerms ? null : TERMS_UNAVAILABLE);
      return true;
    } catch (err) {
      console.error('Failed to withdraw consent:', err);
      setWithdrawError(WITHDRAW_FAILED);
      return false;
    } finally {
      setIsWithdrawingConsent(false);
    }
  };

  // Re-open the consent card -- used when the backend rejects a chat turn with
  // HTTP 403 (the session's consent is no longer in force server-side).
  const revokeConsent = () => setConsented(false);

  return {
    consented,
    consentTerms,
    isSubmittingConsent,
    agreeConsent,
    revokeConsent,
    withdrawConsent,
    isWithdrawingConsent,
    withdrawError,
    checkFailed,
    error,
  };
}
