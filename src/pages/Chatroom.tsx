// import { useRef, useState } from 'react';
import { useState } from 'react';
import type { BaseSyntheticEvent } from 'react';
import { useChat, type Message } from '../context/ChatContext';

// const PAIRS_BEFORE_SUMMARIZE = 5;

function generateMessageId(): string {
  return (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function Chatroom() {
  const {
    messages, setMessages,
    code, setCode,
    inputCode, setInputCode,
    conversationId, setConversationId
  } = useChat();

  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);

  const isVerified = Boolean(code);

  // const pendingPairsRef = useRef<{ user: Message; backend: Message }[]>([]);

  const createMessage = (text: string, sender: Message['sender']): Message => ({
    id: generateMessageId(),
    text,
    sender
  });

  // const flushForSummarization = (pairs: { user: Message; backend: Message }[]) => {
  //   if (!conversationId) return; // shouldn't happen post-first-message, but guard anyway
  //   fetch('/api/summarize', {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     credentials: 'include', // server must verify this session actually owns conversation_id
  //     body: JSON.stringify({
  //       conversation_id: conversationId,
  //       pairs: pairs.map(p => ({ user: p.user.text, backend: p.backend.text }))
  //     })
  //   }).catch(error => {
  //     console.error('Summarization request failed:', error);
  //   });
  // };


  
  const handleSend = async (e: BaseSyntheticEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isSending) return;
    setIsSending(true);

    const newMessage = createMessage(inputMessage, 'user');

    setMessages(prev => [...prev, newMessage]);
    const textToSend = inputMessage;
    setInputMessage('');

    try {
      const endpoint = isVerified ? '/api/invitechat' : '/api/guestchat';

      // Auth no longer travels in the body. The server identifies the
      // caller (guest or invite-code) from the httpOnly session cookie
      // set during /api/code or on first contact, and independently
      // checks that conversationId is actually owned by that session
      // before reading/writing anything. conversationId is sent only
      // so the server knows which conversation to continue — it is not
      // trusted as proof of ownership.
      const requestBody = {
        text: textToSend,
        sender: 'user',
        ...(conversationId ? { conversationId } : {})
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // send the httpOnly session cookie
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`Server responded with status code: ${response.status}`);
      }

      const data = await response.json();
      if (!data || typeof data.text !== 'string' || typeof data.conversationId !== 'string') {
        throw new Error(`Malformed response: ${JSON.stringify(data)}`);
      }

      // Capture the backend-assigned id — no-op after the first message,
      // since it stays the same for the rest of the session.
      if (data.conversationId !== conversationId) {
        setConversationId(data.conversationId);
      }

      const backendMessage = createMessage(data.text, 'backend');
      setMessages(prev => [...prev, backendMessage]);

      // pendingPairsRef.current.push({ user: newMessage, backend: backendMessage });
      // if (pendingPairsRef.current.length >= PAIRS_BEFORE_SUMMARIZE) {
      //   const pairsToFlush = pendingPairsRef.current;
      //   pendingPairsRef.current = [];
      //   flushForSummarization(pairsToFlush);
      // }

    } catch (error) {
      console.error("Server connection dropped:", error);
      const errorMessage = createMessage(
        "Connection error: Failed to receive response from the negotiation terminal server.",
        'backend'
      );
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsSending(false);
    }
  };

  const handleCode = async (e: BaseSyntheticEvent) => {
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

  return (
    <div>
      {/* Invite code Controls */}
      <form onSubmit={handleCode}>
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
          <div key={msg.id}>
            <strong>{msg.sender === 'user' ? 'You: ' : 'System: '}</strong>
            {msg.text}
          </div>
        ))}
      </div>

      {/* Chat Form Controls */}
      <form onSubmit={handleSend}>
        <input
          type="text"
          placeholder={isSending ? "Waiting for system reply..." : "Type your message here..."}
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          disabled={isSending}
        />
        <button type="submit" disabled={isSending}>
          {isSending ? 'Sending...' : 'Send'}
        </button>
      </form>
    </div>
  );
}
