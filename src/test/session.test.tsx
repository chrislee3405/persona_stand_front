import { act, renderHook, waitFor } from '@testing-library/react';
import type { BaseSyntheticEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ChatProvider } from '../context/ChatContext';
import { useChat } from '../hooks/useChat';
import { useChatroomInitialize } from '../hooks/useChatroomInitialize';
import { useInviteCode } from '../hooks/useInviteCode';
import { consentTerms, jsonResponse } from './fixtures';

function renderInitialization() {
  return renderHook(() => ({ init: useChatroomInitialize(), chat: useChat() }), { wrapper: ChatProvider });
}

const submitEvent = () => ({ preventDefault: vi.fn() }) as unknown as BaseSyntheticEvent;

describe('chatroom initialization', () => {
  it('restores verified access from the server in a tab with no locally stored code', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      verified: true,
      consent: { consented: true, policyVersion: 'test-v1', conditionTerms: consentTerms },
    }));
    const { result } = renderInitialization();
    await waitFor(() => expect(result.current.init.status).toBe('ready'));
    expect(result.current.chat.verified).toBe(true);
    expect(result.current.chat.code).toBe('');
    expect(result.current.init).toMatchObject({
      reachable: true, consent: { consented: true, terms: consentTerms },
    });
    expect(fetch).toHaveBeenCalledWith('/api/chatroom_initialize', { credentials: 'include' });
  });

  it('clears stale cached invite access when the server no longer verifies it', async () => {
    sessionStorage.setItem('chat_code', 'EXPIRED-TEST-CODE');
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ verified: false, consent: { consented: false } }));
    const { result } = renderInitialization();
    await waitFor(() => expect(result.current.init.status).toBe('ready'));
    expect(result.current.chat.verified).toBe(false);
    expect(result.current.chat.code).toBe('');
    expect(sessionStorage.getItem('chat_verified')).toBe('0');
  });

  it('keeps server verification but fails consent closed during a database outage', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      verified: true, consent: { consented: false, conditionTerms: null },
    }, 503));
    const { result } = renderInitialization();
    await waitFor(() => expect(result.current.init.status).toBe('ready'));
    expect(result.current.init).toMatchObject({
      reachable: false, consent: { consented: false, terms: null },
    });
    expect(result.current.chat.verified).toBe(true);
  });

  it('rejects HTML from an unavailable proxy without silently downgrading cached verification', async () => {
    sessionStorage.setItem('chat_verified', '1');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(fetch).mockResolvedValueOnce(new Response('<html>Unavailable</html>'));
    const { result } = renderInitialization();
    await waitFor(() => expect(result.current.init.status).toBe('failed'));
    expect(result.current.chat.verified).toBe(true);
  });
});

describe('invite verification', () => {
  it('sends a trimmed code and existing conversation ID, then remembers confirmed access', async () => {
    sessionStorage.setItem('chat_conversationId', 'conversation-test');
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ verified: true }));
    const { result } = renderHook(() => useInviteCode(), { wrapper: ChatProvider });
    act(() => result.current.setInputCode('  TEST-INVITE  '));
    await act(async () => result.current.verifyCode(submitEvent()));
    expect(fetch).toHaveBeenCalledWith('/api/code', expect.objectContaining({
      credentials: 'include',
      body: JSON.stringify({ inputCode: 'TEST-INVITE', conversationId: 'conversation-test' }),
    }));
    expect(result.current.isVerified).toBe(true);
    expect(result.current.code).toBe('TEST-INVITE');
    expect(sessionStorage.getItem('chat_verified')).toBe('1');
    await act(async () => result.current.verifyCode(submitEvent()));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('surfaces the rejection while retaining the typed code for correction', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ detail: 'Invite not found.' }, 400));
    const { result } = renderHook(() => useInviteCode(), { wrapper: ChatProvider });
    act(() => result.current.setInputCode('WRONG-TEST-CODE'));
    await act(async () => result.current.verifyCode(submitEvent()));
    expect(result.current.isVerified).toBe(false);
    expect(result.current.inputCode).toBe('WRONG-TEST-CODE');
    expect(result.current.error).toBe('Invite not found.');
    expect(result.current.isVerifyingCode).toBe(false);
  });
});
