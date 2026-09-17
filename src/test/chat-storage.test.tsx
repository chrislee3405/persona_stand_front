import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatProvider } from '../context/ChatContext';
import { useChat, type Message } from '../hooks/useChat';

describe('chat persistence', () => {
  it('restores blocked and withheld message status and the conversation after a reload', () => {
    const messages: Message[] = [
      { id: 'blocked', sender: 'user', text: 'Rejected test message', status: 'blocked' },
      { id: 'withheld', sender: 'user', text: 'Unanswered test message', status: 'withheld' },
    ];
    const first = renderHook(() => useChat(), { wrapper: ChatProvider });
    act(() => {
      first.result.current.setMessages(messages);
      first.result.current.setConversationId('test-conversation');
    });
    first.unmount();
    const reloaded = renderHook(() => useChat(), { wrapper: ChatProvider });
    expect(reloaded.result.current.messages).toEqual(messages);
    expect(reloaded.result.current.conversationId).toBe('test-conversation');
    act(() => reloaded.result.current.setConversationId(null));
    expect(sessionStorage.getItem('chat_conversationId')).toBeNull();
  });

  it.each(['{broken json', 'null', '[{"sender":"unknown"}]'])(
    'recovers a usable chat from invalid stored data: %s', (saved) => {
      sessionStorage.setItem('chat_messages', saved);
      const { result } = renderHook(() => useChat(), { wrapper: ChatProvider });
      expect(result.current.messages.some(message => message.text === 'Hello!')).toBe(true);
    },
  );

  it('keeps the current chat usable when browser storage is blocked or full', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new DOMException('Blocked'); });
    const { result } = renderHook(() => useChat(), { wrapper: ChatProvider });
    act(() => result.current.setMessages([{ id: 'new', sender: 'user', text: 'Still works' }]));
    expect(result.current.messages).toEqual([{ id: 'new', sender: 'user', text: 'Still works' }]);
  });

  it('limits persisted scrollback without trimming the active conversation', () => {
    const messages: Message[] = Array.from({ length: 205 }, (_, index) => ({
      id: String(index), text: `Test message ${index}`, sender: 'user',
    }));
    const { result } = renderHook(() => useChat(), { wrapper: ChatProvider });
    act(() => result.current.setMessages(messages));
    expect(result.current.messages).toHaveLength(205);
    expect(JSON.parse(sessionStorage.getItem('chat_messages')!)).toEqual(messages.slice(-200));
  });
});
