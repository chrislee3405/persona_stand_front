import { act, render, renderHook } from '@testing-library/react';
import type { BaseSyntheticEvent, ChangeEvent } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatProvider } from '../context/ChatContext';
import { useChat } from '../hooks/useChat';
import { MAX_MESSAGE_LENGTH, useChatDispatch } from '../hooks/useChatDispatch';
import {
  FIRST_REPLY_TYPING_DELAY_MS,
  INITIAL_HOLD_MS,
  NO_REPLY_NOTICE_IDLE_MS,
  TYPING_IDLE_MS,
  WAIT_CONTINUE_IDLE_MS,
} from '../lib/knobs';
import { deferred, jsonResponse } from './fixtures';

function renderDispatch(consented: boolean | null = true, personaName = '') {
  const onConsentRequired = vi.fn();
  const hook = renderHook(() => {
    const chat = useChat();
    const dispatch = useChatDispatch({ consented, isVerified: chat.verified, onConsentRequired, personaName });
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

  it('shows a missing-facts notice separately without marking the question unsent', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({
      turns: ["I don't have that information for now."], sender: 'backend', status: 'respond',
      conversationId: 'test-conversation', userMessageKept: true,
      systemNotice: 'No supporting information was found about career plans. Please contact Chris.',
    }));
    const { result } = renderDispatch();
    submit(result, 'What are your five-year plans?');
    await advance();
    const exchange = result.current.chat.messages.slice(-3);
    expect(exchange.map(m => m.sender)).toEqual(['user', 'backend', 'system']);
    expect(exchange[0].status).toBeUndefined();
    expect(exchange[2].text).toContain('contact Chris');
  });

  it('flushes a full batch before accepting another valid fragment', async () => {
    vi.mocked(fetch).mockResolvedValue(reply());
    const { result } = renderDispatch();
    submit(result, 'a'.repeat(400));
    submit(result, 'b'.repeat(400));
    await advance();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(requestBody(0).text).toBe('a'.repeat(400));
    expect(requestBody(1).text).toBe('b'.repeat(400));
    expect(result.current.chat.messages.filter(m => m.sender === 'user').every(m => !m.status)).toBe(true);
  });

  it('allows exactly 750 characters including the batch separator', async () => {
    vi.mocked(fetch).mockResolvedValue(reply());
    const { result } = renderDispatch();
    submit(result, 'a'.repeat(374));
    submit(result, 'b'.repeat(375));
    await advance();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(requestBody().text).toHaveLength(750);
  });

  it('preserves an overflow draft when starting another batch would exceed pending capacity', async () => {
    const first = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(first.promise).mockResolvedValue(reply());
    const { result } = renderDispatch();
    submit(result, 'first question');
    await advance();
    submit(result, 'a'.repeat(400));
    submit(result, 'b'.repeat(400));
    expect(result.current.inputMessage).toBe('b'.repeat(400));
    expect(result.current.warningMessage).toMatch(/too many messages/i);
    await act(async () => first.resolve(reply()));
    await advance(TYPING_IDLE_MS);
    expect(requestBody(1).text).toBe('a'.repeat(400));
  });

  it('marks buffered text unsent across navigation and lets the visitor restore its draft', async () => {
    let latest: DispatchResult['current'];
    function DispatchProbe() {
      const chat = useChat();
      const dispatch = useChatDispatch({ consented: true, isVerified: false, onConsentRequired: vi.fn() });
      latest = { ...dispatch, chat };
      return null;
    }
    const screen = render(<ChatProvider><DispatchProbe /></ChatProvider>);
    const result = { get current() { return latest; } } as DispatchResult;
    submit(result, 'Keep this question');
    expect(result.current.chat.messages.at(-1)?.status).toBe('queued');
    screen.rerender(<ChatProvider><span>Portfolio</span></ChatProvider>);
    screen.rerender(<ChatProvider><DispatchProbe /></ChatProvider>);
    expect(result.current.chat.messages.at(-1)).toMatchObject({ text: 'Keep this question', status: 'not_sent' });
    act(() => result.current.restoreDraft('Keep this question'));
    expect(result.current.inputMessage).toBe('Keep this question');
    await advance();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('recovers a buffered message as unsent after a full page reload', async () => {
    const first = renderDispatch();
    submit(first.result, 'Reload before sending');
    first.unmount();
    const second = renderDispatch();
    expect(second.result.current.chat.messages.at(-1)).toMatchObject({ text: 'Reload before sending', status: 'not_sent' });
    await advance();
    expect(fetch).not.toHaveBeenCalled();
  });

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
    expect(result.current.chat.messages.find(message => message.text === 'First question')?.status).toBe('not_sent');
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
    expect(users.every(message => message.status === 'not_sent')).toBe(true);
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
    expect(result.current.chat.messages.at(-1)).toMatchObject({ sender: 'user', status: 'not_sent' });
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
    expect(result.current.chat.messages.find(message => message.text === 'A question')?.status).toBe('not_sent');
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
  it.each(['wait', 'no_reply', 'superseded'])(
    'shows nothing and resends nothing when the server answers %s',
    async status => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
        turns: [], status, conversationId: 'test-conversation', userMessageKept: true,
      }));
      const { result } = renderDispatch();
      const before = result.current.chat.messages.length;
      submit(result, 'two questions, first');
      await advance();
      // The message was received and stored, so the bubble stays as it is --
      // not crossed out, and not sent a second time.
      const bubble = result.current.chat.messages.find(m => m.text === 'two questions, first');
      expect(bubble?.status).toBeUndefined();
      // The user's own bubble is the only thing added: no reply, no notice.
      expect(result.current.chat.messages.length).toBe(before + 1);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(result.current.isAwaitingReply).toBe(false);
    },
  );

  it('sends only the new message after a held one, never the pending text again', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      turns: [], status: 'wait', conversationId: 'test-conversation', userMessageKept: true,
    }));
    vi.mocked(fetch).mockResolvedValueOnce(reply('Both answered at once'));
    const { result } = renderDispatch();
    submit(result, 'two questions, first');
    await advance();
    submit(result, 'what did you study');
    await advance();
    expect(fetch).toHaveBeenCalledTimes(2);
    // The server is tracking the held message; resending it would duplicate it.
    expect(requestBody(1).text).toBe('what did you study');
    expect(result.current.chat.messages.at(-1)).toMatchObject({
      sender: 'backend', text: 'Both answered at once',
    });
  });

  it('still reports a genuinely malformed reply when the server claims it responded', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      turns: [], status: 'respond', conversationId: 'test-conversation',
    }));
    const { result } = renderDispatch();
    submit(result, 'A question');
    await advance();
    expect(result.current.chat.messages.at(-1)?.text).toMatch(/Your message was sent/);
  });
  it('holds the typing bubble back long enough that a held turn never shows it', async () => {
    // A turn the readiness gate holds makes one model call and comes back
    // fast; a replying turn makes several and takes seconds. The delay is set
    // between the two, so the bubble appears only on turns that were always
    // going to be slow -- see FIRST_REPLY_TYPING_DELAY_MS in lib/knobs.ts.
    const held = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(held.promise);
    const { result } = renderDispatch();
    submit(result, 'two questions, first');
    await advance();

    // Still inside the delay: nothing is showing yet.
    await act(async () => { await vi.advanceTimersByTimeAsync(FIRST_REPLY_TYPING_DELAY_MS - 100); });
    expect(result.current.isAwaitingReply).toBe(false);

    // The gate answers before the delay elapses, so the bubble is skipped.
    await act(async () => {
      held.resolve(jsonResponse({
        turns: [], status: 'wait', conversationId: 'test-conversation', userMessageKept: true,
      }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.isAwaitingReply).toBe(false);
    await advance(FIRST_REPLY_TYPING_DELAY_MS);
    expect(result.current.isAwaitingReply).toBe(false);
  });

  it('still shows the typing bubble while a real reply is being generated', async () => {
    const slow = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(slow.promise);
    const { result } = renderDispatch();
    submit(result, 'what did you study');
    await advance();

    await act(async () => { await vi.advanceTimersByTimeAsync(FIRST_REPLY_TYPING_DELAY_MS + 100); });
    expect(result.current.isAwaitingReply).toBe(true);

    await act(async () => {
      slow.resolve(reply('I studied IT.'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.isAwaitingReply).toBe(false);
    expect(result.current.chat.messages.at(-1)).toMatchObject({ sender: 'backend', text: 'I studied IT.' });
  });
  // --- A rejected message and the turn before it ----------------------------
  // "wait" means the persona is holding that message until the visitor
  // finishes the thought. If the message that would have finished it is
  // rejected, the two are linked and both are out of the conversation.
  // "no_reply" means the persona dealt with it by not answering; a later
  // rejection has nothing to do with it.

  function held(conversationId = 'test-conversation') {
    return jsonResponse({ turns: [], status: 'wait', conversationId, userMessageKept: true });
  }

  function ignored(conversationId = 'test-conversation') {
    return jsonResponse({ turns: [], status: 'no_reply', conversationId, userMessageKept: true });
  }

  it('marks a held message as not sent when the next message is rejected', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(held());
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ detail: 'Too long' }, 413));
    const { result } = renderDispatch();
    submit(result, 'two questions, first');
    await advance();
    expect(result.current.chat.messages.find(m => m.text === 'two questions, first')?.status).toBeUndefined();

    submit(result, 'the rest of it');
    await advance();

    // One mark for both: the server released the held message at the same
    // moment it refused this one, so neither reached the persona.
    expect(result.current.chat.messages.find(m => m.text === 'the rest of it')?.status).toBe('not_sent');
    expect(result.current.chat.messages.find(m => m.text === 'two questions, first')?.status).toBe('not_sent');
  });

  it('leaves a no_reply message alone when the next message is rejected', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ignored());
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ detail: 'Too long' }, 413));
    const { result } = renderDispatch();
    submit(result, 'ok thanks');
    await advance();
    submit(result, 'x'.repeat(10));
    await advance();

    expect(result.current.chat.messages.find(m => m.text === 'ok thanks')?.status).toBeUndefined();
    expect(result.current.chat.messages.find(m => m.text === 'x'.repeat(10))?.status).toBe('not_sent');
  });

  it('leaves a held message alone once it has been answered', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(held());
    vi.mocked(fetch).mockResolvedValueOnce(reply('Both answered.'));
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ detail: 'Too long' }, 413));
    const { result } = renderDispatch();
    submit(result, 'two questions, first');
    await advance();
    submit(result, 'what did you study');
    await advance();
    submit(result, 'a later message');
    await advance();

    // The held pair was answered by the second turn, so the third turn's
    // rejection must not reach back and cross them out.
    expect(result.current.chat.messages.find(m => m.text === 'two questions, first')?.status).toBeUndefined();
    expect(result.current.chat.messages.find(m => m.text === 'what did you study')?.status).toBeUndefined();
    expect(result.current.chat.messages.find(m => m.text === 'a later message')?.status).toBe('not_sent');
  });

  it('takes every accumulated held message down together', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(held());
    vi.mocked(fetch).mockResolvedValueOnce(held());
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ detail: 'Privacy' }, 400));
    const { result } = renderDispatch();
    submit(result, 'first part');
    await advance();
    submit(result, 'second part');
    await advance();
    submit(result, 'my email is in here');
    await advance();

    expect(result.current.chat.messages.find(m => m.text === 'first part')?.status).toBe('not_sent');
    expect(result.current.chat.messages.find(m => m.text === 'second part')?.status).toBe('not_sent');
    expect(result.current.chat.messages.find(m => m.text === 'my email is in here')?.status).toBe('not_sent');
  });

  it('takes a held message down when the next message never reaches the server', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(fetch).mockResolvedValueOnce(held());
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { result } = renderDispatch();
    submit(result, 'two questions, first');
    await advance();
    submit(result, 'the rest of it');
    await advance();

    expect(result.current.chat.messages.find(m => m.text === 'the rest of it')?.status).toBe('not_sent');
    expect(result.current.chat.messages.find(m => m.text === 'two questions, first')?.status).toBe('not_sent');
  });
  it('crosses out the whole held group when the reply to it is withheld', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(held());
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      turns: ['Unable to answer this test turn.'], sender: 'system', status: 'respond',
      conversationId: 'test-conversation', userMessageKept: false,
    }));
    const { result } = renderDispatch();
    submit(result, 'two questions, first');
    await advance();
    submit(result, 'what did you study');
    await advance();

    // The withheld reply was answering both, and the backend retags both out
    // of the conversation -- so both bubbles have to say so.
    expect(result.current.chat.messages.find(m => m.text === 'two questions, first')?.status).toBe('not_sent');
    expect(result.current.chat.messages.find(m => m.text === 'what did you study')?.status).toBe('not_sent');
  });

  // --- The visitor goes quiet after a reply-less turn ------------------------
  // After `wait`, silence proves the gate's guess wrong, so the held message is
  // answered as it stands (a continue). After `no_reply`, a notice explains the
  // silence. "Quiet" means an empty, untouched input.

  function calledUrls() {
    return vi.mocked(fetch).mock.calls.map(call => call[0]);
  }

  it('answers a held message once the visitor stays quiet', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(held()).mockResolvedValueOnce(reply('Answered after the pause'));
    const { result } = renderDispatch();
    submit(result, 'two questions, first');
    await advance();

    await advance(WAIT_CONTINUE_IDLE_MS - 1);
    expect(fetch).toHaveBeenCalledTimes(1);
    await advance(1);

    expect(calledUrls()).toEqual(['/api/guestchat', '/api/guestchat/continue']);
    // No text: the server answers what it is already holding.
    expect(requestBody(1)).toEqual({ conversationId: 'test-conversation' });
    expect(result.current.chat.messages.at(-1)).toMatchObject({ sender: 'backend', text: 'Answered after the pause' });
    expect(result.current.chat.messages.find(m => m.text === 'two questions, first')?.status).toBeUndefined();
  });

  it('restarts the quiet period on every keystroke', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(held()).mockResolvedValueOnce(reply());
    const { result } = renderDispatch();
    submit(result, 'two questions, first');
    await advance();

    await advance(WAIT_CONTINUE_IDLE_MS - 1000);
    typeMessage(result, 'a');
    typeMessage(result, '');
    await advance(WAIT_CONTINUE_IDLE_MS - 1);
    expect(fetch).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(calledUrls().at(-1)).toBe('/api/guestchat/continue');
  });

  it('does not continue while text is waiting in the box', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(held());
    const { result } = renderDispatch();
    submit(result, 'two questions, first');
    await advance();
    typeMessage(result, 'and the second one is');

    await advance(WAIT_CONTINUE_IDLE_MS * 2);

    // The visitor is composing the rest; that send will carry the held part.
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('sends the rest instead of a continue when the visitor finishes the thought', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(held()).mockResolvedValueOnce(reply('Both answered.'));
    const { result } = renderDispatch();
    submit(result, 'two questions, first');
    await advance();
    submit(result, 'what did you study');
    await advance();

    await advance(WAIT_CONTINUE_IDLE_MS * 2);

    expect(calledUrls()).toEqual(['/api/guestchat', '/api/guestchat']);
  });

  it('never continues after leaving the chat', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(held());
    const { result, unmount } = renderDispatch();
    submit(result, 'two questions, first');
    await advance();
    unmount();

    await advance(WAIT_CONTINUE_IDLE_MS * 2);

    // The server keeps holding it and answers it with the next message.
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('ignores a held status that lands after a newer message went out', async () => {
    const first = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(first.promise).mockResolvedValueOnce(reply('Both answered.'));
    const { result } = renderDispatch();
    submit(result, 'two questions, first');
    await advance();
    submit(result, 'what did you study');
    await advance();
    await act(async () => first.resolve(held()));

    await advance(WAIT_CONTINUE_IDLE_MS * 2);

    expect(calledUrls()).toEqual(['/api/guestchat', '/api/guestchat']);
  });

  it('leaves the held bubble alone when the continue itself is refused', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(held())
      .mockResolvedValueOnce(jsonResponse({ detail: 'Too many' }, 429));
    const { result } = renderDispatch();
    submit(result, 'two questions, first');
    await advance();
    await advance(WAIT_CONTINUE_IDLE_MS);

    // The server still holds it and will answer it with the next message.
    expect(calledUrls().at(-1)).toBe('/api/guestchat/continue');
    expect(result.current.chat.messages.find(m => m.text === 'two questions, first')?.status).toBeUndefined();
    expect(result.current.warningMessage).toBeNull();
  });

  it('crosses out the held message when the continue says it was withheld', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(held()).mockResolvedValueOnce(jsonResponse({
      turns: ['Sorry, something went wrong while generating a response. Please try again.'],
      sender: 'system', status: 'respond', conversationId: 'test-conversation', userMessageKept: false,
    }));
    const { result } = renderDispatch();
    submit(result, 'two questions, first');
    await advance();
    await advance(WAIT_CONTINUE_IDLE_MS);

    expect(result.current.chat.messages.find(m => m.text === 'two questions, first')?.status).toBe('not_sent');
  });

  it('says a no_reply message was seen once the visitor stays quiet', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ignored());
    const { result } = renderDispatch(true, 'Chris');
    submit(result, 'ok thanks');
    await advance();

    await advance(NO_REPLY_NOTICE_IDLE_MS - 1);
    expect(result.current.chat.messages.at(-1)).toMatchObject({ sender: 'user', text: 'ok thanks' });
    await advance(1);

    expect(result.current.chat.messages.at(-1)).toMatchObject({
      sender: 'system',
      text: "Seen. Chris didn't think that one needed a reply. Ask another question anytime.",
    });
    // A notice only: nothing is sent.
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('skips the seen notice when the visitor moves on', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ignored()).mockResolvedValueOnce(reply('Next answer'));
    const { result } = renderDispatch(true, 'Chris');
    submit(result, 'ok thanks');
    await advance();
    submit(result, 'one more question');
    await advance();

    await advance(NO_REPLY_NOTICE_IDLE_MS * 2);

    expect(result.current.chat.messages.some(m => m.text.startsWith('Seen.'))).toBe(false);
  });
});
