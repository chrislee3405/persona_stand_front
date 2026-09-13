import { useState, useEffect } from 'react';
import { getJson, postJson, errorDetail } from '../lib/api';

/** The policy terms the popup renders: a one-line purpose statement above the
 *  box, and the detailed wording inside it. `header` may be empty, and the
 *  dialog then names itself by the terms instead. `condition` is the thing
 *  actually being agreed to, and the only part echoed back on submission. */
export interface ConsentTerms {
  header: string;
  condition: string;
}

/** What the visitor is told when the terms cannot be produced -- whether that
 *  is because none are configured or because the backend could not be
 *  reached. The backend sends the same sentence as its 503 `detail`; this is
 *  the fallback for the cases where no usable body arrives at all (a network
 *  failure, or the SPA's own index.html coming back from the proxy while the
 *  backend is down). */
const TERMS_UNAVAILABLE = 'Consent terms are currently unavailable. Please try again later.';

/**
 * Narrows the `conditionTerms` object off an untyped JSON response.
 *
 * Returns null for anything that is not a usable {header, condition} -- which
 * is also exactly what the backend sends when it has nothing to show, so the
 * "no terms" path and the "malformed terms" path land in the same place
 * rather than one of them throwing mid-render.
 */
function readTerms(raw: unknown): ConsentTerms | null {
  if (!raw || typeof raw !== 'object') return null;
  const { header, condition } = raw as { header?: unknown; condition?: unknown };
  if (typeof condition !== 'string' || !condition.trim()) return null;
  return {
    header: typeof header === 'string' ? header : '',
    condition,
  };
}

/**
 * Compulsory-consent gate. Checks the backend on mount, exposes the current
 * policy terms for the popup, and records agreement. `revokeConsent` is for
 * callers that need to re-open the popup without touching the setter --
 * currently the chat dispatch's HTTP 403 path (see useChatDispatch).
 *
 * FAILS CLOSED, ALWAYS. Every path that cannot establish usable terms leaves
 * `consented` false and `consentTerms` null, which is what Chatroom renders
 * as the inert "terms unavailable" card -- no agree, no decline, just a close
 * button. There is no state in which this hook reports consent it did not
 * observe, and none in which it offers an "I Agree" for terms nobody could
 * read.
 *
 * The backend never invents terms either: the placeholder app/main.py used to
 * seed at import time is gone, so "no policy configured" is a state that
 * genuinely reaches here, and it is handled rather than papered over.
 */
export function useConsent() {
  // null = still checking with the backend, so the popup doesn't flash on
  // screen for a returning, already-consented session before the check
  // resolves.
  const [consented, setConsented] = useState<boolean | null>(null);
  const [isSubmittingConsent, setIsSubmittingConsent] = useState(false);
  // Pulled from the backend (consent_policy table) rather than hardcoded, so
  // the wording can change without a frontend redeploy. Stays null when there
  // are no usable terms, or when the backend could not be reached -- Chatroom
  // keys its inert "unavailable" card off exactly that.
  const [consentTerms, setConsentTerms] = useState<ConsentTerms | null>(null);
  // true if the mount-time /api/consent check couldn't reach a working
  // backend (network error, a 5xx, or a non-JSON response like the SPA
  // index.html coming back from the proxy while the backend is down). Used by
  // Chatroom to show "disconnected" before any message has been sent.
  const [checkFailed, setCheckFailed] = useState(false);
  // Why the last action failed, for the card to render. Null when there is
  // nothing to report. Without this a failed "I Agree" was completely silent:
  // the spinner stopped, the button re-enabled, the card stayed exactly as it
  // was, and the visitor clicked it again.
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getJson('/api/consent')
      .then(async res => {
        // res.ok is checked FIRST. Without it, a 5xx whose body happens to be
        // valid JSON -- which is exactly what FastAPI's error responses and
        // this endpoint's own 503 are -- parsed cleanly, yielded no terms,
        // and produced the correct card for the wrong reason: `checkFailed`
        // stayed false, so the header cheerfully said "online" while the
        // backend was down.
        if (!res.ok) {
          throw new Error(await errorDetail(res, TERMS_UNAVAILABLE));
        }
        const data = await res.json();
        if (cancelled) return;
        setCheckFailed(false);
        setConsented(Boolean(data?.consented));
        // A 200 with null conditionTerms is the other unavailable state: the
        // database answered and there is nothing usable configured. Same
        // inert card, but no "disconnected" -- nothing is broken.
        const terms = readTerms(data?.conditionTerms);
        setConsentTerms(terms);
        setError(terms ? null : TERMS_UNAVAILABLE);
      })
      .catch(err => {
        if (cancelled) return;
        console.error('Failed to check consent status:', err);
        setCheckFailed(true);
        // Fail closed -- if the check itself is broken, still show the popup
        // rather than silently letting messages through unconsented. With no
        // terms to show, it renders as the inert unavailable card.
        setConsented(false);
        setConsentTerms(null);
        setError(err instanceof Error && err.message ? err.message : TERMS_UNAVAILABLE);
      });

    return () => { cancelled = true; };
  }, []);

  const agreeConsent = async () => {
    // The button is disabled while consentTerms is null, but guard here too --
    // the backend requires the exact current condition in the body (see
    // ConsentService.record_consent), so there is nothing valid to send yet,
    // and submitting an agreement to terms nobody could read would not be
    // consent in any sense worth recording.
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
        return;
      }

      // Every non-2xx is surfaced now. It used to be `if (response.ok)` with
      // no else at all, so a 400 (the policy changed between our GET and this
      // POST) or a 503 (nothing configured, or the database gone) left the
      // card untouched and the visitor pressing a button that did nothing.
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

  // Re-open the consent popup -- used when the backend rejects a chat turn
  // with HTTP 403 (the session's consent record vanished between our mount
  // check and now).
  const revokeConsent = () => setConsented(false);

  return { consented, consentTerms, isSubmittingConsent, agreeConsent, revokeConsent, checkFailed, error };
}
