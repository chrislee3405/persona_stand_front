import { useState } from 'react';
import type { BaseSyntheticEvent } from 'react';
import { useChat } from '../context/ChatContext';
import { postJson, errorDetail } from '../lib/api';

/**
 * Invite-code verification flow. `code` / `inputCode` themselves live in
 * ChatContext (they must survive a page refresh); this hook adds the
 * in-flight flag and the submit handler. `isVerified` is derived here and
 * also consumed by useChatDispatch to pick the invite vs guest endpoint.
 *
 * Failures surface through `error` for the caller to render in the
 * invite-code strip -- the same in-page pattern the rest of the chatroom
 * uses. This used to call window.alert(), which blocked the page, could not
 * be styled, and was the only flow in the app reporting a failure that way.
 */
export function useInviteCode() {
  const { code, setCode, inputCode, setInputCode, conversationId } = useChat();
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  // Null when there's nothing to report. Cleared on every new attempt.
  const [error, setError] = useState<string | null>(null);

  const isVerified = Boolean(code);

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
        const data = await response.json();
        // `code` is now display-only ("Access Granted via X") — it is never
        // sent back to the server as proof of anything. The server already
        // upgraded this session to verified via the Set-Cookie on this response.
        const verifiedCode = data.verifiedCode ?? codeToSend;
        setCode(verifiedCode);
        setInputCode(verifiedCode);
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
