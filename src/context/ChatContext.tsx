import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

/**
 * Why a message is not part of the conversation, when it isn't.
 *
 * `undefined` is the normal case and means "delivered". The other two are
 * both rendered red, with different notes, because they are different
 * facts about what happened:
 *  - 'blocked'  the server refused it before it was ever stored (privacy
 *               gate, length, rate limit, consent) -> "Not sent"
 *  - 'withheld' the server DID store it, then dropped it from the
 *               conversation -- the response gate withheld a reply, or
 *               generation failed -> "Not answered"
 *
 * This lives ON THE MESSAGE rather than in two id lists beside it. The
 * lists were component state in useChatDispatch while `messages` is
 * persisted below, so a refresh brought a rejected message back looking
 * like an ordinary sent one -- the visitor was left believing a message
 * the persona never received had been delivered. Status has to persist
 * with the thing it describes.
 */
export type MessageStatus = 'blocked' | 'withheld';

export interface Message {
  id: string;
  text: string;
  // 'user'    -- the visitor's own message (right-side bubble)
  // 'backend' -- an AI reply turn (left-side bubble with a tail)
  // 'system'  -- status / error notices (centred yellow bubble, no tail)
  sender: 'user' | 'backend' | 'system';
  status?: MessageStatus;
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

const WELCOME_MESSAGES: Message[] = [
  { id: 'welcome-1', text: 'System connected.', sender: 'system' },
  { id: 'welcome-2', text: 'Hello!', sender: 'backend' },
];

/**
 * EVERY sessionStorage access in this file is wrapped, and this is not
 * defensiveness for its own sake.
 *
 * This provider is the OUTERMOST one in the tree (see App.tsx) -- it wraps
 * SiteContentProvider and RouterProvider both. A throw in a useState
 * initialiser here happens before React Router's error boundary exists, so
 * it does not produce an error page: it produces a blank white document,
 * on EVERY route including the home page, permanently for that tab, with
 * no recovery a visitor could find short of clearing site data.
 *
 * Three things throw here in practice:
 *  - reading storage at all, in a context where site data is blocked (a
 *    private window with the setting on, some embedded webviews). See the
 *    same reasoning, already applied, in lib/chatVisited.ts.
 *  - JSON.parse, on a value that was truncated by a failed write.
 *  - setItem, when the quota is exceeded -- `messages` grows without bound
 *    and is rewritten in full on every change.
 *
 * The fallback is always "behave as though nothing was stored", which is
 * the correct degradation: the visitor loses their scrollback, not the
 * site.
 */
function readStoredMessages(): Message[] {
  try {
    const saved = sessionStorage.getItem('chat_messages');
    if (!saved) return WELCOME_MESSAGES;
    const parsed: unknown = JSON.parse(saved);
    // Shape-check rather than trust: `"null"` parses to null, and an array
    // of the wrong thing would throw later, during render, where it is far
    // harder to attribute.
    if (!Array.isArray(parsed)) return WELCOME_MESSAGES;
    const messages = parsed.filter(
      (m): m is Message =>
        !!m &&
        typeof m === 'object' &&
        typeof (m as Message).id === 'string' &&
        typeof (m as Message).text === 'string' &&
        ((m as Message).sender === 'user' ||
          (m as Message).sender === 'backend' ||
          (m as Message).sender === 'system'),
    );
    return messages.length > 0 ? messages : WELCOME_MESSAGES;
  } catch {
    return WELCOME_MESSAGES;
  }
}

function readStoredString(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* storage full or unavailable -- the tab keeps working, it just won't
       remember this across a reload */
  }
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Message[]>(readStoredMessages);

  // `code` is kept only so the UI can show "Access Granted via X" after a
  // refresh. It is NOT used as an auth credential anymore — the actual
  // authorization lives in an httpOnly session cookie the backend sets on
  // verification, which this JS (and sessionStorage, and any XSS payload)
  // cannot read or forge. Never resend `code` to the backend as proof of
  // anything; the server already knows this session is verified.
  const [code, setCode] = useState(() => readStoredString('chat_code') || '');
  const [inputCode, setInputCode] = useState(
    () => readStoredString('chat_inputCode') || readStoredString('chat_code') || '',
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
    () => readStoredString('chat_conversationId'),
  );

  useEffect(() => {
    writeStored('chat_messages', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    writeStored('chat_code', code);
  }, [code]);

  useEffect(() => {
    writeStored('chat_inputCode', inputCode);
  }, [inputCode]);

  useEffect(() => {
    if (conversationId) {
      writeStored('chat_conversationId', conversationId);
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
