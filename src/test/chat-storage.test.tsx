import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatProvider } from '../context/ChatContext';
import { useChat, type Message } from '../hooks/useChat';

describe('chat persistence', () => {
  it('restores a not-sent message status and the conversation after a reload', () => {
    const messages: Message[] = [
      { id: 'refused', sender: 'user', text: 'Rejected test message', status: 'not_sent' },
      { id: 'delivered', sender: 'user', text: 'Ordinary test message' },
    ];
    const first = renderHook(() => useChat(), { wrapper: ChatProvider });
    act(() => {
      first.result.current.setMessages(messages);
      first.result.current.setConversationId('test-conversation');
    });
    first.unmount();
    const reloaded = renderHook(() => useChat(), { wrapper: ChatProvider });
    expect(reloaded.result.current.messages.slice(0, messages.length)).toEqual(messages);
    expect(reloaded.result.current.messages.filter(message => message.id === 'conversation-reference:test-conversation'))
      .toEqual([{
        id: 'conversation-reference:test-conversation', sender: 'system',
        text: 'Conversation reference (quote it to request deletion): test-conversation',
      }]);
    expect(reloaded.result.current.conversationId).toBe('test-conversation');
    act(() => reloaded.result.current.setConversationId(null));
    expect(sessionStorage.getItem('chat_conversationId')).toBeNull();
  });

  it('adds the reference once when assigned and leaves it in its place as the chat continues', () => {
    const { result } = renderHook(() => useChat(), { wrapper: ChatProvider });
    expect(result.current.messages.some(message => message.id.startsWith('conversation-reference:'))).toBe(false);
    act(() => result.current.setConversationId('assigned-reference'));
    const referenceIndex = result.current.messages.findIndex(message => message.id === 'conversation-reference:assigned-reference');
    expect(referenceIndex).toBeGreaterThanOrEqual(0);
    act(() => {
      result.current.setMessages(previous => [...previous, { id: 'next', sender: 'backend', text: 'Next reply' }]);
      result.current.setConversationId('assigned-reference');
    });
    expect(result.current.messages[referenceIndex]).toMatchObject({
      sender: 'system', text: 'Conversation reference (quote it to request deletion): assigned-reference',
    });
    expect(result.current.messages.filter(message => message.id.startsWith('conversation-reference:'))).toHaveLength(1);
    expect(result.current.messages.at(-1)?.id).toBe('next');
  });

  it('places the reference before a first reply batched with its assigned ID', () => {
    const { result } = renderHook(() => useChat(), { wrapper: ChatProvider });
    act(() => {
      result.current.setMessages(previous => [...previous,
        { id: 'question', sender: 'user', text: 'Tell me about yourself.' },
        { id: 'reply', sender: 'backend', text: 'My first reply.' },
      ]);
      result.current.setConversationId('batched-reference');
    });
    expect(result.current.messages.map(message => message.id)).toEqual([
      'welcome-1', 'welcome-2', 'question', 'conversation-reference:batched-reference', 'reply',
    ]);
  });

  it('moves an older persisted reference ahead of the first reply without duplicating it', () => {
    sessionStorage.setItem('chat_conversationId', 'saved-reference');
    sessionStorage.setItem('chat_messages', JSON.stringify([
      { id: 'question', sender: 'user', text: 'Tell me about yourself.' },
      { id: 'reply', sender: 'backend', text: 'My first reply.' },
      { id: 'conversation-reference:saved-reference', sender: 'system',
        text: 'Conversation reference (quote it to request deletion): saved-reference' },
    ]));
    const { result } = renderHook(() => useChat(), { wrapper: ChatProvider });
    expect(result.current.messages.map(message => message.id)).toEqual([
      'question', 'conversation-reference:saved-reference', 'reply',
    ]);
    expect(JSON.parse(sessionStorage.getItem('chat_messages')!).map((message: Message) => message.id))
      .toEqual(['question', 'conversation-reference:saved-reference', 'reply']);
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
