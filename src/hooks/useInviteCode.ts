import { useState } from 'react';
import type { BaseSyntheticEvent } from 'react';
import { useChat } from './useChat';
import { postJson, errorDetail } from '../lib/api';

/**
 * Invite-code verification flow. `verified`, `code` and `inputCode` live in
 * ChatContext (they must survive a page refresh); this hook adds the
 * in-flight flag and the submit handler.
 *
 * `isVerified` comes from ChatContext's `verified`, NOT from whether this tab
 * holds a `code`. The two used to be the same thing, which is why a second tab
 * of a verified session -- no code in its sessionStorage -- was treated as a
 * guest. `verified` is seeded from the server on every chatroom load
 * (useChatroomInitialize), set here on a successful verification, and cleared
 * by useChatDispatch on a 401. It is also what useChatDispatch uses to pick
 * the invite vs guest endpoint.
 *
 * Failures surface through `error` for the caller to render in the
 * invite-code strip -- the same in-page pattern the rest of the chatroom
 * uses. This used to call window.alert(), which blocked the page, could not
 * be styled, and was the only flow in the app reporting a failure that way.
 */
export function useInviteCode() {
  const { verified, setVerified, code, setCode, inputCode, setInputCode, conversationId } = useChat();
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  // Null when there's nothing to report. Cleared on every new attempt.
  const [error, setError] = useState<string | null>(null);

  const isVerified = verified;

  const verifyCode = async (e: BaseSyntheticEvent) => {
    e.preventDefault();
    if (!inputCode.trim() || isVerified || isVerifyingCode) return;
    setIsVerifyingCode(true);
    setError(null);

    const codeToSend = inputCode.trim();

    try {
      // postJson sends the cookie, which the server needs in order to set
      // this session's verified flag on the response.
      const response = await postJson('/api/code', {
        inputCode: codeToSend,
        conversationId  // may be null if no message sent yet — that's fine
      });

      if (!response.ok) {
        setError(await errorDetail(response, "That code wasn't recognised. Check it and try again."));
      } else {
        // The server upgraded this session via the Set-Cookie on this
        // response, and deliberately does not echo the code back. `code` is
        // display-only ("Access granted via X") and is what this visitor just
        // typed -- it is never sent back to the server as proof of anything.
        setVerified(true);
        setCode(codeToSend);
        setInputCode(codeToSend);
      }
    } catch (err) {
      console.error("Server validation error:", err);
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setIsVerifyingCode(false);
    }
  };

  return { code, inputCode, setInputCode, isVerified, isVerifyingCode, verifyCode, error };
}
