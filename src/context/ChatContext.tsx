import { createContext, useContext, useState, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';

interface Message {
  id: number;
  text: string;
  sender: 'user' | 'backend';
}

interface ChatContextType {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  code: string;
  setCode: React.Dispatch<React.SetStateAction<string>>;
}

const ChatContext = createContext<ChatContextType | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = sessionStorage.getItem('chat_messages');
    return saved ? JSON.parse(saved) : [
      { id: 1, text: "System connected.", sender: 'backend' },
      { id: 2, text: "Hello!", sender: 'backend' }
    ];
  });
  const [code, setCode] = useState('');
  const messagesRef = useRef(messages);

  useEffect(() => {
    messagesRef.current = messages;
    sessionStorage.setItem('chat_messages', JSON.stringify(messages));
  }, [messages]);

  // Fires on real tab/window close, not on in-app route changes
  useEffect(() => {
    const savePayload = () => {
      const payload = JSON.stringify({ content: messagesRef.current, code });
      navigator.sendBeacon('/api/save-conversation', new Blob([payload], { type: 'application/json' }));
    };

  window.addEventListener('pagehide', savePayload);

  return () => {
    window.removeEventListener('pagehide', savePayload);
  };
}, [code]);

  return (
    <ChatContext.Provider value={{ messages, setMessages, code, setCode }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within ChatProvider');
  return ctx;
}