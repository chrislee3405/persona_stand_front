import { createContext, useContext } from 'react';
import type { Dispatch, SetStateAction } from 'react';

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
 * persisted (see ChatProvider), so a refresh brought a rejected message back
 * looking like an ordinary sent one -- the visitor was left believing a
 * message the persona never received had been delivered. Status has to
 * persist with the thing it describes.
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
  setMessages: Dispatch<SetStateAction<Message[]>>;
  code: string;
  setCode: Dispatch<SetStateAction<string>>;
  inputCode: string;
  setInputCode: Dispatch<SetStateAction<string>>;
  conversationId: string | null;
  setConversationId: Dispatch<SetStateAction<string | null>>;
}

/**
 * The chat state shared across the app. The provider, which also persists
 * it to sessionStorage, is in context/ChatContext.tsx. The context and hook
 * live here, in a file that exports no component, because Fast Refresh can
 * only hot-reload a file that exports components alone
 * (react-refresh/only-export-components) -- the same split as
 * useSiteContent.ts / SiteContentProvider.tsx.
 */
export const ChatContext = createContext<ChatContextType | null>(null);

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within ChatProvider');
  return ctx;
}
