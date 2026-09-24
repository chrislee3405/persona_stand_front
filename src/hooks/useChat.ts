import { createContext, useContext } from 'react';
import type { Dispatch, SetStateAction } from 'react';

/**
 * Persist delivery state with each bubble. `queued` means no request has been
 * dispatched yet; navigation/reload makes abandoned queued text recoverably
 * `not_sent`. Existing rejected/withheld outcomes also use `not_sent`.
 * An absent status is the normal display state, not a storage/deletion claim.
 */
export type MessageStatus = 'not_sent' | 'queued';

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
  /** Whether this browser session has verified an invite code, as last
   *  reported by the server. Picks the invite vs guest endpoint. Seeded on
   *  every chatroom load from GET /api/chatroom_initialize, so a new tab of a
   *  verified session is not mistaken for a guest. */
  verified: boolean;
  setVerified: Dispatch<SetStateAction<boolean>>;
  /** DISPLAY ONLY -- the code as typed in this tab, for "Access granted via X".
   *  Empty in any tab that did not do the verifying: the server never sends
   *  the code back. Never proof of anything. */
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
