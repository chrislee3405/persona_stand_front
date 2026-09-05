/**
 * The two things every call to this backend needs, in one place.
 *
 * `credentials: 'include'` is load-bearing on every authenticated route --
 * the session cookie is httpOnly, and a call that omits it is treated as a
 * brand-new session with no consent record and no invite verification.
 * Spelling that out at each call site made it easy to forget on a new one.
 */
export function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
}

/**
 * GET counterpart. Same cookie rule; used for the routes that read
 * per-session state (consent status). Public, session-independent reads
 * (site content) can just call fetch directly.
 */
export function getJson(url: string): Promise<Response> {
  return fetch(url, { credentials: 'include' });
}

/**
 * Pull FastAPI's `{ "detail": "..." }` off an error response so the message
 * the backend actually chose is what the user sees, falling back to
 * `fallback` when the body isn't JSON or carries no usable detail.
 */
export async function errorDetail(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json();
    return typeof data?.detail === 'string' && data.detail.trim() ? data.detail : fallback;
  } catch {
    return fallback;
  }
}
