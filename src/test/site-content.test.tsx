import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SectionState from '../components/SectionState';
import { SiteContentProvider } from '../context/SiteContentProvider';
import { useSiteContent } from '../hooks/useSiteContent';
import { jsonResponse } from './fixtures';

function ProjectsSection() {
  const { content, loading } = useSiteContent();
  return <SectionState loading={loading} empty={!content.projects} noun="projects" />;
}

async function settle() {
  await act(async () => { await Promise.resolve(); });
}

describe('shared site content', () => {
  beforeEach(() => vi.useFakeTimers());

  it('accepts legacy asset payloads during deployment, preferring the new media key', async () => {
    const legacy = { projects: [{ description: 'demo', path: 'test/legacy.mp4' }] };
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ images: legacy }));
    const first = renderHook(() => useSiteContent(), { wrapper: SiteContentProvider });
    await settle();
    expect(first.result.current.media).toEqual(legacy);
    first.unmount();
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ media: {}, images: legacy }));
    const second = renderHook(() => useSiteContent(), { wrapper: SiteContentProvider });
    await settle();
    expect(second.result.current.media).toEqual({});
  });

  it('loads content and project details once for consumers sharing the provider', async () => {
    const payload = {
      content: { chatroom: { name: 'Test Persona' } },
      media: { projects: [{ description: 'test', path: 'test/project.png' }] },
      journeyDetails: { journey: { title: 'Test journey' } },
      projectDetails: { project: { title: 'Test project' } },
    };
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(payload));
    const { result, rerender } = renderHook(() => useSiteContent(), { wrapper: SiteContentProvider });
    expect(result.current.loading).toBe(true);
    await settle();
    expect(result.current).toMatchObject({ ...payload, loading: false, error: false });
    rerender();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/api/site-content', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('shows an empty section only after a successful empty response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}));
    render(<SiteContentProvider><ProjectsSection /></SiteContentProvider>);
    expect(screen.queryByText('No projects content yet.')).not.toBeInTheDocument();
    await settle();
    expect(screen.getByText('No projects content yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('automatically retries one temporary failure and recovers', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ detail: 'Unavailable' }, 503))
      .mockResolvedValueOnce(jsonResponse({ content: { projects: [{ id: 'test-project' }] } }));
    const { result } = renderHook(() => useSiteContent(), { wrapper: SiteContentProvider });
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(1200); });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(false);
    expect(result.current.content.projects).toEqual([{ id: 'test-project' }]);
  });

  it('distinguishes an outage from empty content and lets the visitor retry', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ detail: 'Unavailable' }, 503))
      .mockResolvedValueOnce(new Response('<html>Proxy unavailable</html>', { status: 502 }))
      .mockResolvedValueOnce(jsonResponse({}));
    render(<SiteContentProvider><ProjectsSection /></SiteContentProvider>);
    await settle();
    await act(async () => { await vi.advanceTimersByTimeAsync(1200); });
    expect(screen.getByRole('status')).toHaveTextContent("Couldn't load this section.");
    expect(screen.queryByText('No projects content yet.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await settle();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(screen.getByText('No projects content yet.')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('does not perform a pending retry after the provider has unmounted', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Disconnected'));
    const { unmount } = renderHook(() => useSiteContent(), { wrapper: SiteContentProvider });
    await settle();
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(1200); });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
