import { useState } from 'react';
import type { BaseSyntheticEvent } from 'react';
import { useChat } from '../context/ChatContext';

interface Message {
  id: number;
  text: string;
  sender: 'user' | 'backend';
}

export default function Chatroom() {
  const { messages, setMessages, code, setCode, inputCode, setInputCode } = useChat();

  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);

  const isVerified = Boolean(code);

  const handleSend = async (e: BaseSyntheticEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isSending) return;
    setIsSending(true);

    const newMessage: Message = {
      id: Date.now(),
      text: inputMessage,
      sender: 'user'
    };

    setMessages(prev => [...prev, newMessage]);
    const textToSend = inputMessage;
    setInputMessage('');

    try {
      const endpoint = isVerified ? '/api/invitechat' : '/api/guestchat';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToSend, sender: 'user' })
      });

      if (!response.ok) {
        throw new Error(`Server responded with status code: ${response.status}`);
      }

      const backendMessage: Message = await response.json();
      setMessages(prev => [...prev, backendMessage]);

    } catch (error) {
      console.error("Server connection dropped:", error);
      const errorMessage: Message = {
        id: Date.now() + 1,
        text: "Connection error: Failed to receive response from the negotiation terminal server.",
        sender: 'backend'
      };
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
        body: JSON.stringify({ input_code: codeToSend })
      });

      if (!response.ok) {
        alert("Incorrect code! Please check and try again.");
      } else {
        setCode(codeToSend);
        setInputCode(codeToSend);
      }
    } catch (error) {
      console.error("Server validation error:", error);
      alert("Incorrect code or system connection error. Please try again.");
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