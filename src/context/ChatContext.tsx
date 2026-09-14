import { useState, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { ChatContext, type Message } from '../hooks/useChat';

const WELCOME_MESSAGES: Message[] = [
  { id: 'welcome-1', text: 'This is an AI version of me, built from real background. Interview me the way you\'d text a candidate on a messaging app.', sender: 'system' },
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
 *  - setItem, when the quota is exceeded. Less likely now that only the
 *    most recent MAX_STORED_MESSAGES are written, but still possible.
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

function removeStored(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* unavailable -- nothing was stored to begin with */
  }
}

/** How much scrollback survives a reload. The in-memory transcript is not
 *  trimmed; only the stored copy is. `messages` is rewritten in full on every
 *  change, so without a cap a long chat made every revealed fragment
 *  re-serialise the whole history, and once it outgrew the quota the write
 *  failed silently and the tab simply stopped remembering anything. */
const MAX_STORED_MESSAGES = 200;

/** Holds the chat state and persists it to sessionStorage. Read it with
 *  useChat (hooks/useChat.ts), which also defines Message / MessageStatus. */
export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Message[]>(readStoredMessages);

  // Whether this session has verified an invite code. It used to be DERIVED
  // from `code` below -- i.e. from this tab's sessionStorage -- while the
  // server's notion of verification lives in the session COOKIE, which every
  // tab shares. So a second tab of a verified session had no code, reported
  // "not verified", and sent every message as a guest: guest pacing, guest
  // quota, half the regeneration budget. Now it is its own state, seeded by
  // the server on each chatroom load (useChatroomInitialize) and cached here
  // only so the first render before that answer is not a guess.
  //
  // The `chat_code` fallback carries over tabs that verified before this
  // flag existed.
  const [verified, setVerified] = useState(
    () => readStoredString('chat_verified') === '1' || Boolean(readStoredString('chat_code')),
  );

  // `code` is kept only so the UI can show "Access granted via X" in the tab
  // that did the verifying. It is NOT used as an auth credential -- the actual
  // authorization lives in the httpOnly session cookie, which this JS (and
  // sessionStorage, and any XSS payload) cannot read or forge -- and the
  // server never sends it back, so any other tab simply shows "Access granted".
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
    writeStored('chat_messages', JSON.stringify(messages.slice(-MAX_STORED_MESSAGES)));
  }, [messages]);

  useEffect(() => {
    writeStored('chat_verified', verified ? '1' : '0');
  }, [verified]);

  useEffect(() => {
    writeStored('chat_code', code);
  }, [code]);

  useEffect(() => {
    writeStored('chat_inputCode', inputCode);
  }, [inputCode]);

  // Cleared as well as set: a reset to null must not leave the old id in
  // storage to be picked back up on the next reload.
  useEffect(() => {
    if (conversationId) {
      writeStored('chat_conversationId', conversationId);
    } else {
      removeStored('chat_conversationId');
    }
  }, [conversationId]);

  // Memoised, as SiteContentProvider's value already is. This is the
  // OUTERMOST provider in the tree and `messages` changes once per revealed
  // reply fragment, so an object literal here hands every consumer a new
  // value identity on every render whether or not anything it reads changed.
  // react-compiler would likely memoise it anyway; stating it keeps the
  // providers consistent rather than leaving the rule to a compiler detail.
  // The setters are stable useState dispatchers and never change identity.
  const value = useMemo(
    () => ({
      messages, setMessages,
      verified, setVerified,
      code, setCode,
      inputCode, setInputCode,
      conversationId, setConversationId,
    }),
    [messages, verified, code, inputCode, conversationId],
  );

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
}
