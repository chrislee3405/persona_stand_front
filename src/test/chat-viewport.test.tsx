import { useRef } from 'react';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useChatViewport } from '../hooks/useChatViewport';

function Shell({ active = true }: { active?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useChatViewport(ref, active);
  return <div ref={ref} data-testid="shell" />;
}

describe('chat visible viewport', () => {
  it('follows browser controls, keyboard resizing and viewport panning; releases the page on exit', () => {
    const viewport = Object.assign(new EventTarget(), { height: 700, offsetTop: 0 });
    vi.stubGlobal('visualViewport', viewport);
    vi.useFakeTimers();
    const { rerender, unmount } = render(<Shell />);
    const shell = screen.getByTestId('shell');
    expect(shell.style.getPropertyValue('--chat-viewport-height')).toBe('700px');
    expect(document.documentElement).toHaveClass('chat-route-open');

    act(() => {
      viewport.height = 350;
      viewport.offsetTop = 48;
      viewport.dispatchEvent(new Event('resize'));
      viewport.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(20);
    });
    expect(shell.style.getPropertyValue('--chat-viewport-height')).toBe('350px');
    expect(shell.style.getPropertyValue('--chat-viewport-top')).toBe('48px');

    act(() => {
      viewport.height = 700;
      viewport.offsetTop = 0;
      viewport.dispatchEvent(new Event('resize'));
      vi.advanceTimersByTime(20);
    });
    expect(shell.style.getPropertyValue('--chat-viewport-height')).toBe('700px');
    rerender(<Shell active={false} />);
    expect(document.documentElement).not.toHaveClass('chat-route-open');
    expect(shell.style.getPropertyValue('--chat-viewport-height')).toBe('');
    act(() => {
      viewport.dispatchEvent(new Event('resize'));
      vi.advanceTimersByTime(20);
    });
    expect(shell.style.getPropertyValue('--chat-viewport-height')).toBe('');
    unmount();
  });

  it('uses window height when VisualViewport is unavailable and cleans up queued updates', () => {
    vi.stubGlobal('visualViewport', undefined);
    vi.stubGlobal('innerHeight', 640);
    vi.useFakeTimers();
    const { unmount } = render(<Shell />);
    const shell = screen.getByTestId('shell');
    expect(shell.style.getPropertyValue('--chat-viewport-height')).toBe('640px');
    act(() => window.dispatchEvent(new Event('resize')));
    unmount();
    act(() => vi.advanceTimersByTime(20));
    expect(shell.style.getPropertyValue('--chat-viewport-height')).toBe('');
    expect(document.documentElement).not.toHaveClass('chat-route-open');
  });
});
