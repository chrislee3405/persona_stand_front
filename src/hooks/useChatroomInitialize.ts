import { useEffect, useState } from 'react';
import { getJson } from '../lib/api';
import { useChat } from './useChat';

/** The policy terms the consent card renders: a one-line purpose statement
 *  above the box, and the detailed wording inside it. `header` may be empty,
 *  and the dialog then names itself by the terms instead. `condition` is the
 *  thing actually being agreed to, and the only part echoed back on
 *  submission. */
export interface ConsentTerms {
  header: string;
  condition: string;
}

/** The consent half of what the server reports on chatroom load. */
export interface InitialConsent {
  consented: boolean;
  policyVersion: string | null;
  /** null when there are no usable terms -- none configured, a malformed
   *  policy row, or the database unreachable. */
  terms: ConsentTerms | null;
}

/**
 * The chatroom's initialisation result.
 *
 * `ready` carries a response the server actually produced. `reachable` is
 * false when that response was the 503 the backend sends when its database is
 * down: the consent block is then the unavailable one, but the rest of the
 * body -- verification, which comes from the signed cookie -- is still true.
 *
 * `failed` means no usable response arrived at all: a network error, or the
 * SPA's own index.html coming back from the proxy while the backend is down.
 */
export type ChatroomInit =
  | { status: 'loading' }
  | { status: 'ready'; reachable: boolean; consent: InitialConsent }
  | { status: 'failed'; error: string };

const UNAVAILABLE = 'Consent terms are currently unavailable. Please try again later.';

/**
 * Narrows `consent.conditionTerms` off an untyped JSON response.
 *
 * Returns null for anything that is not a usable {header, condition} -- which
 * is also exactly what the backend sends when it has nothing to show, so the
 * "no terms" and "malformed terms" paths land in the same place rather than
 * one of them throwing mid-render.
 */
function readTerms(raw: unknown): ConsentTerms | null {
  if (!raw || typeof raw !== 'object') return null;
  const { header, condition } = raw as { header?: unknown; condition?: unknown };
  if (typeof condition !== 'string' || !condition.trim()) return null;
  return { header: typeof header === 'string' ? header : '', condition };
}

function readConsent(raw: unknown): InitialConsent {
  const block = raw && typeof raw === 'object'
    ? raw as { consented?: unknown; policyVersion?: unknown; conditionTerms?: unknown }
    : {};
  return {
    // Only an explicit `true` counts. Anything else -- missing, null, a
    // string -- fails closed as "not consented".
    consented: block.consented === true,
    policyVersion: typeof block.policyVersion === 'string' ? block.policyVersion : null,
    terms: readTerms(block.conditionTerms),
  };
}

/**
 * Loads everything the chatroom needs to know about this session, once, when
 * it mounts: GET /api/chatroom_initialize.
 *
 * Two facts come back, and they go to two different places on purpose:
 *
 *  - CONSENT is returned to the caller, which hands it to useConsent. This
 *    hook does not interpret it beyond narrowing its shape.
 *
 *  - VERIFICATION is written straight into ChatContext. That is the actual
 *    fix this hook exists for: invite verification lives in the session
 *    cookie, which every tab shares, but the chatroom used to learn it only
 *    from the tab that did the verifying (sessionStorage). A second tab of a
 *    verified session therefore sent every message as a guest. Now each
 *    chatroom load asks the server, and the answer wins over whatever this tab
 *    had cached -- in both directions: a new tab is upgraded, and a tab still
 *    showing "verified" after the cookie was cleared is corrected before its
 *    first message rather than after a 401.
 *
 * Nothing here re-validates an invite code. The server reports whether the
 * session CARRIES a verification; checking a code remains POST /api/code's
 * job, and the code itself never appears in the response.
 *
 * When no usable response arrives (`failed`), verification is left exactly as
 * cached. Guessing "not verified" would silently downgrade a verified tab
 * during a transient blip, and the send path's own 401 handling corrects a
 * genuinely stale value anyway.
 */
export function useChatroomInitialize(): ChatroomInit {
  const { setVerified, setCode } = useChat();
  const [init, setInit] = useState<ChatroomInit>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    getJson('/api/chatroom_initialize')
      .then(async (res) => {
        // 200 is a normal answer; 503 is the backend reporting its database
        // down, WITH a full body. Anything else -- or a body that is not the
        // expected JSON -- is treated as no answer at all.
        if (res.status !== 200 && res.status !== 503) {
          throw new Error(`chatroom_initialize responded ${res.status}`);
        }
        let body: unknown;
        try {
          body = await res.json();
        } catch {
          throw new Error('chatroom_initialize returned a non-JSON body');
        }
        if (!body || typeof body !== 'object') {
          throw new Error('chatroom_initialize returned an unexpected body');
        }
        if (cancelled) return;

        const { consent, verified } = body as { consent?: unknown; verified?: unknown };
        const isVerified = verified === true;
        setVerified(isVerified);
        // The display code only means anything while verified. Clear it when
        // the server says otherwise, so "Access granted via X" cannot linger
        // over a session that no longer has access.
        if (!isVerified) setCode('');

        setInit({ status: 'ready', reachable: res.status === 200, consent: readConsent(consent) });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Chatroom initialisation failed:', err);
        setInit({ status: 'failed', error: UNAVAILABLE });
      });

    return () => { cancelled = true; };
  }, [setVerified, setCode]);

  return init;
}
