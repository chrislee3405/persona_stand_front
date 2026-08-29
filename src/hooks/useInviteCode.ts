import { useState } from 'react';
import type { BaseSyntheticEvent } from 'react';
import { useChat } from '../context/ChatContext';

/**
 * Invite-code verification flow. `code` / `inputCode` themselves live in
 * ChatContext (they must survive a page refresh); this hook adds the
 * in-flight flag and the submit handler. `isVerified` is derived here and
 * also consumed by useChatDispatch to pick the invite vs guest endpoint.
 */
export function useInviteCode() {
  const { code, setCode, inputCode, setInputCode, conversationId } = useChat();
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);

  const isVerified = Boolean(code);

  const verifyCode = async (e: BaseSyntheticEvent) => {
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

  return { code, inputCode, setInputCode, isVerified, isVerifyingCode, verifyCode };
}
