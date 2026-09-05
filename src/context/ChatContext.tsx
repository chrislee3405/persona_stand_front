import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

export interface Message {
  id: string;
  text: string;
  // 'user'    -- the visitor's own message (right-side bubble)
  // 'backend' -- an AI reply turn (left-side bubble with a tail)
  // 'system'  -- status / error notices (centred yellow bubble, no tail)
  sender: 'user' | 'backend' | 'system';
}

interface ChatContextType {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  code: string;
  setCode: React.Dispatch<React.SetStateAction<string>>;
  inputCode: string;
  setInputCode: React.Dispatch<React.SetStateAction<string>>;
  conversationId: string | null;
  setConversationId: React.Dispatch<React.SetStateAction<string | null>>;
}

const ChatContext = createContext<ChatContextType | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = sessionStorage.getItem('chat_messages');
    return saved ? JSON.parse(saved) : [
      { id: 'welcome-1', text: "System connected.", sender: 'system' },
      { id: 'welcome-2', text: "Hello!", sender: 'backend' }
    ];
  });

  // `code` is kept only so the UI can show "Access Granted via X" after a
  // refresh. It is NOT used as an auth credential anymore — the actual
  // authorization lives in an httpOnly session cookie the backend sets on
  // verification, which this JS (and sessionStorage, and any XSS payload)
  // cannot read or forge. Never resend `code` to the backend as proof of
  // anything; the server already knows this session is verified.
  const [code, setCode] = useState(() => sessionStorage.getItem('chat_code') || '');
  const [inputCode, setInputCode] = useState(
    () => sessionStorage.getItem('chat_inputCode') || sessionStorage.getItem('chat_code') || ''
  );

  // No longer generated client-side. null until the backend assigns one
  // on the first message of this session; persisted afterward so a page
  // refresh continues the same conversation instead of starting a new one.
  // This value is a convenience for the UI/routing only — it is NOT proof
  // of ownership. The backend must independently confirm (via the session
  // cookie) that the caller actually owns this conversationId before
  // reading or writing to it, since a user can freely edit this in
  // sessionStorage or devtools.
  const [conversationId, setConversationId] = useState<string | null>(
    () => sessionStorage.getItem('chat_conversationId')
  );

  useEffect(() => {
    sessionStorage.setItem('chat_messages', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    sessionStorage.setItem('chat_code', code);
  }, [code]);

  useEffect(() => {
    sessionStorage.setItem('chat_inputCode', inputCode);
  }, [inputCode]);

  useEffect(() => {
    if (conversationId) {
      sessionStorage.setItem('chat_conversationId', conversationId);
    }
  }, [conversationId]);

  return (
    <ChatContext.Provider
      value={{
        messages, setMessages,
        code, setCode,
        inputCode, setInputCode,
        conversationId, setConversationId
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within ChatProvider');
  return ctx;
}
