import { act, renderHook } from '@testing-library/react';
import type { BaseSyntheticEvent, ChangeEvent } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatProvider } from '../context/ChatContext';
import { useChat } from '../hooks/useChat';
import { MAX_MESSAGE_LENGTH, useChatDispatch } from '../hooks/useChatDispatch';
import { INITIAL_HOLD_MS, TYPING_IDLE_MS } from '../lib/knobs';
import { deferred, jsonResponse } from './fixtures';

function renderDispatch(consented: boolean | null = true) {
  const onConsentRequired = vi.fn();
  const hook = renderHook(() => {
    const chat = useChat();
    const dispatch = useChatDispatch({ consented, isVerified: chat.verified, onConsentRequired });
    return { ...dispatch, chat };
  }, { wrapper: ChatProvider });
  return { ...hook, onConsentRequired };
}

type DispatchResult = ReturnType<typeof renderDispatch>['result'];

function typeMessage(result: DispatchResult, text: string) {
  act(() => result.current.handleInputChange({ target: { value: text } } as ChangeEvent<HTMLTextAreaElement>));
}

function submit(result: DispatchResult, text: string) {
  typeMessage(result, text);
  act(() => result.current.handleSend({ preventDefault: vi.fn() } as unknown as BaseSyntheticEvent));
}

async function advance(ms = INITIAL_HOLD_MS) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

function reply(text = 'Test response', conversationId = 'test-conversation') {
  return jsonResponse({ turns: [text], conversationId });
}

function requestBody(index = 0) {
  const options = vi.mocked(fetch).mock.calls[index][1];
  return JSON.parse(String(options?.body));
}

describe('chat dispatch', () => {
  beforeEach(() => vi.useFakeTimers());

  it('keeps unconsented text in the composer and requests consent without sending', async () => {
    const { result, onConsentRequired } = renderDispatch(false);
    submit(result, 'Tell me about your projects');
    await advance();
    expect(onConsentRequired).toHaveBeenCalledTimes(1);
    expect(result.current.inputMessage).toBe('Tell me about your projects');
    expect(result.current.chat.messages.filter(message => message.sender === 'user')).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects oversized input without losing the text', async () => {
    const { result } = renderDispatch();
    submit(result, 'x'.repeat(MAX_MESSAGE_LENGTH + 1));
    await advance();
    expect(result.current.warningMessage).toMatch(/message is too long/i);
    expect(result.current.inputMessage).toHaveLength(MAX_MESSAGE_LENGTH + 1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('groups rapid fragments into one request while showing every user bubble', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(reply());
    const { result } = renderDispatch();
    submit(result, 'Tell me');
    await advance(INITIAL_HOLD_MS - 1);
    submit(result, 'about');
    submit(result, 'your projects');
    expect(fetch).not.toHaveBeenCalled();
    expect(result.current.chat.messages.filter(message => message.sender === 'user').map(message => message.text))
      .toEqual(['Tell me', 'about', 'your projects']);
    await advance();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/api/guestchat', expect.objectContaining({
      method: 'POST', credentials: 'include', signal: expect.any(AbortSignal),
    }));
    expect(requestBody()).toEqual({ text: 'Tell me about your projects' });
    expect(result.current.chat.messages.at(-1)).toMatchObject({ sender: 'backend', text: 'Test response' });
    expect(result.current.chat.conversationId).toBe('test-conversation');
  });

  it('extends the hold while a follow-up is being typed without sending its unsubmitted text', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(reply());
    const { result } = renderDispatch();
    submit(result, 'First thought');
    await advance(1000);
    typeMessage(result, 'Still composing');
    await advance(TYPING_IDLE_MS - 1);
    expect(fetch).not.toHaveBeenCalled();
    await advance(1);
    expect(requestBody()).toEqual({ text: 'First thought' });
    expect(result.current.inputMessage).toBe('Still composing');
  });

  it('waits for the first response and reuses its conversation ID for the queued request', async () => {
    const first = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(first.promise).mockResolvedValueOnce(reply('Second response'));
    const { result } = renderDispatch();
    submit(result, 'First question');
    await advance();
    submit(result, 'Second question');
    await advance();
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => first.resolve(reply('First response', 'server-assigned-id')));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(requestBody(1)).toEqual({ text: 'Second question', conversationId: 'server-assigned-id' });
  });

  it('releases queued sends and pending capacity after a network failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const first = deferred<Response>();
    vi.mocked(fetch)
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(reply('Second response'))
      .mockResolvedValueOnce(reply('Third response'));
    const { result } = renderDispatch();
    submit(result, 'First question');
    await advance();
    submit(result, 'Second question');
    await advance();
    submit(result, 'Third question');
    expect(result.current.warningMessage).toMatch(/too many messages/i);
    expect(result.current.inputMessage).toBe('Third question');
    await act(async () => first.reject(new TypeError('Network disconnected')));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(requestBody(1)).toEqual({ text: 'Second question' });
    expect(result.current.chat.messages.find(message => message.text === 'First question')?.status).toBe('blocked');
    submit(result, 'Third question');
    await advance();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(requestBody(2)).toEqual({ text: 'Third question', conversationId: 'test-conversation' });
    expect(result.current.isOffline).toBe(false);
  });

  it('uses invite verification obtained while a submitted message is held', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(reply());
    const { result } = renderDispatch();
    submit(result, 'An invited question');
    act(() => result.current.chat.setVerified(true));
    await advance();
    expect(fetch).toHaveBeenCalledWith('/api/invitechat', expect.any(Object));
  });

  it('retries a revoked invite as a guest and clears cached invite access', async () => {
    sessionStorage.setItem('chat_code', 'REVOKED-TEST-CODE');
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ detail: 'Invite expired' }, 401))
      .mockResolvedValueOnce(reply());
    const { result } = renderDispatch();
    submit(result, 'A question');
    await advance();
    expect(vi.mocked(fetch).mock.calls.map(call => call[0])).toEqual(['/api/invitechat', '/api/guestchat']);
    expect(requestBody(0)).toEqual(requestBody(1));
    expect(result.current.chat.verified).toBe(false);
    expect(result.current.chat.code).toBe('');
    expect(result.current.chat.inputCode).toBe('');
    expect(sessionStorage.getItem('chat_verified')).toBe('0');
  });

  it.each([400, 413, 429])('marks all fragments refused with HTTP %i as blocked and retains the reason', async (status) => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ detail: 'Test rejection reason' }, status));
    const { result } = renderDispatch();
    submit(result, 'First fragment');
    submit(result, 'Second fragment');
    await advance();
    const users = result.current.chat.messages.filter(message => message.sender === 'user');
    expect(users).toHaveLength(2);
    expect(users.every(message => message.status === 'blocked')).toBe(true);
    expect(result.current.warningMessage).toBe('Test rejection reason');
    expect(result.current.isOffline).toBe(false);
    expect(result.current.isAwaitingReply).toBe(false);
  });

  it('reopens consent when the backend refuses a turn with 403', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ detail: 'Consent required' }, 403));
    const { result, onConsentRequired } = renderDispatch();
    submit(result, 'A question');
    await advance();
    expect(onConsentRequired).toHaveBeenCalledTimes(1);
    expect(result.current.chat.messages.at(-1)).toMatchObject({ sender: 'user', status: 'blocked' });
    expect(result.current.isAwaitingReply).toBe(false);
  });

  it('distinguishes a withheld turn from a message that was never sent', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      conversationId: 'test-conversation', turns: ['Unable to answer this test turn.'],
      sender: 'system', userMessageKept: false,
    }));
    const { result } = renderDispatch();
    submit(result, 'A question');
    await advance();
    expect(result.current.chat.messages.find(message => message.text === 'A question')?.status).toBe('withheld');
    expect(result.current.chat.messages.at(-1)).toMatchObject({ sender: 'system', text: 'Unable to answer this test turn.' });
    expect(JSON.parse(sessionStorage.getItem('chat_messages')!)).toEqual(result.current.chat.messages);
  });

  it('reports malformed successful replies without claiming the accepted message was not sent', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ conversationId: 'test-conversation', turns: [] }));
    const { result } = renderDispatch();
    submit(result, 'A question');
    await advance();
    expect(result.current.chat.messages.find(message => message.text === 'A question')?.status).toBeUndefined();
    expect(result.current.chat.messages.at(-1)?.text).toMatch(/Your message was sent/);
    expect(result.current.isAwaitingReply).toBe(false);
  });
});
