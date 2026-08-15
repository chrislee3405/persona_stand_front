import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'backend';
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
      { id: 'welcome-1', text: "System connected.", sender: 'backend' },
      { id: 'welcome-2', text: "Hello!", sender: 'backend' }
    ];
  });

  const [code, setCode] = useState(() => sessionStorage.getItem('chat_code') || '');
  const [inputCode, setInputCode] = useState(
    () => sessionStorage.getItem('chat_inputCode') || sessionStorage.getItem('chat_code') || ''
  );

  // No longer generated client-side. null until the backend assigns one
  // on the first message of this session; persisted afterward so a page
  // refresh continues the same conversation instead of starting a new one.
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
