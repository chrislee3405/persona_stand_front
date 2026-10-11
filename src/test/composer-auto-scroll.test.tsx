import { useRef } from 'react';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useComposerAutoScroll } from '../hooks/useComposerAutoScroll';

function Chat() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  useComposerAutoScroll(scrollRef, composerRef);
  return <><div ref={scrollRef} role="log" /><textarea ref={composerRef} aria-label="Message" /></>;
}

function setup(mobile = true) {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: mobile })));
  const viewport = new EventTarget();
  vi.stubGlobal('visualViewport', viewport);
  let resized: ResizeObserverCallback = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { resized = callback; }
    observe = vi.fn();
    disconnect = disconnect;
  });
  const view = render(<Chat />);
  const log = screen.getByRole('log');
  const input = screen.getByRole('textbox');
  Object.defineProperty(log, 'scrollHeight', { value: 1200, configurable: true });
  const resizeLog = (height: number) => {
    Object.defineProperty(log, 'clientHeight', { value: height, configurable: true });
    resized([], {} as ResizeObserver);
  };
  return { ...view, log, input, viewport, resizeLog, disconnect };
}

describe('mobile composer auto-scroll', () => {
  it('shows the newest turn on focus and after the keyboard reduces the log height', () => {
    const { log, input, viewport, resizeLog } = setup();
    act(() => { input.focus(); vi.advanceTimersByTime(20); });
    expect(log.scrollTop).toBe(1200);
    log.scrollTop = 400;
    act(() => {
      viewport.dispatchEvent(new Event('resize'));
      vi.advanceTimersByTime(20);
    });
    expect(log.scrollTop).toBe(1200);
    // The shell layout may finish after the initial viewport resize callback.
    log.scrollTop = 500;
    act(() => { resizeLog(300); vi.advanceTimersByTime(20); });
    expect(log.scrollTop).toBe(1200);
    // A multiline draft shrinks the message area further while typing.
    log.scrollTop = 600;
    act(() => { resizeLog(260); vi.advanceTimersByTime(20); });
    expect(log.scrollTop).toBe(1200);
  });

  it('preserves reading position when the composer is unfocused or on desktop', () => {
    const { log, resizeLog, unmount } = setup();
    log.scrollTop = 250;
    act(() => { resizeLog(300); vi.advanceTimersByTime(20); });
    expect(log.scrollTop).toBe(250);
    unmount();
    const desktop = setup(false);
    desktop.log.scrollTop = 250;
    act(() => { desktop.input.focus(); desktop.resizeLog(300); vi.advanceTimersByTime(20); });
    expect(desktop.log.scrollTop).toBe(250);
  });

  it('cancels pending scrolling and removes listeners on exit', () => {
    const { log, input, viewport, unmount, disconnect } = setup();
    act(() => input.focus());
    unmount();
    act(() => { viewport.dispatchEvent(new Event('resize')); vi.advanceTimersByTime(20); });
    expect(log.scrollTop).toBe(0);
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
