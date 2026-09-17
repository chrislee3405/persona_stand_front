import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useConsent } from '../hooks/useConsent';
import type { ChatroomInit } from '../hooks/useChatroomInitialize';
import { consentTerms, initializedChat, jsonResponse } from './fixtures';

function renderConsent(init: ChatroomInit = initializedChat()) {
  return renderHook(() => useConsent(init));
}

describe('consent gate', () => {
  it('waits for initialization before showing an already-consented visitor a gate', () => {
    const { result, rerender } = renderHook(({ init }) => useConsent(init), {
      initialProps: { init: { status: 'loading' } as ChatroomInit },
    });
    expect(result.current.consented).toBeNull();
    rerender({ init: initializedChat(true) });
    expect(result.current.consented).toBe(true);
    expect(result.current.consentTerms).toEqual(consentTerms);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses agreement when no readable terms are available', async () => {
    const { result } = renderConsent({ status: 'failed', error: 'Unavailable' });
    await act(async () => result.current.agreeConsent());
    expect(result.current.consented).toBe(false);
    expect(result.current.consentTerms).toBeNull();
    expect(result.current.error).toMatch(/terms are currently unavailable/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends the exact displayed terms and session cookie before granting consent', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ consented: true }));
    const { result } = renderConsent();
    await act(async () => result.current.agreeConsent());
    expect(fetch).toHaveBeenCalledWith('/api/consent', expect.objectContaining({
      method: 'POST', credentials: 'include',
      body: JSON.stringify({ conditionText: consentTerms.condition }),
    }));
    expect(result.current.consented).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.isSubmittingConsent).toBe(false);
  });

  it('reports a changed policy instead of granting consent', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ detail: 'Policy changed; reload the page.' }, 400));
    const { result } = renderConsent();
    await act(async () => result.current.agreeConsent());
    expect(result.current.consented).toBe(false);
    expect(result.current.error).toBe('Policy changed; reload the page.');
  });

  it('disables agreement when the server says terms are unavailable', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ detail: 'Terms unavailable.' }, 503));
    const { result } = renderConsent();
    await act(async () => result.current.agreeConsent());
    expect(result.current.consented).toBe(false);
    expect(result.current.consentTerms).toBeNull();
    expect(result.current.checkFailed).toBe(true);
    await act(async () => result.current.agreeConsent());
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('only reports consent withdrawn after server confirmation', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ detail: 'Please retry withdrawal.' }, 503))
      .mockResolvedValueOnce(jsonResponse({ consented: false }));
    const { result } = renderConsent(initializedChat(true));
    await act(async () => { expect(await result.current.withdrawConsent()).toBe(false); });
    expect(result.current.consented).toBe(true);
    expect(result.current.withdrawError).toBe('Please retry withdrawal.');
    await act(async () => { expect(await result.current.withdrawConsent()).toBe(true); });
    expect(result.current.consented).toBe(false);
    expect(result.current.withdrawError).toBeNull();
    expect(fetch).toHaveBeenLastCalledWith('/api/consent/withdraw', expect.objectContaining({
      credentials: 'include', method: 'POST', body: '{}',
    }));
  });
});
