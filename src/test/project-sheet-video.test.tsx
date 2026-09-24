import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectSheet, { type ProjectSheetData } from '../pages/ProjectSheet';

/**
 * The scroll-driven playback rule: whatever is most in view plays, resumed
 * from where it stopped.
 *
 * jsdom has neither an IntersectionObserver nor a media pipeline, so both are
 * faked here. That is the whole point of testing this in jsdom rather than a
 * real browser: the rule is about which clip is told to play and when, and a
 * fake makes the visibility changes exact instead of dependent on scroll
 * physics and codec support.
 */

type IoCallback = (entries: { target: Element; isIntersecting: boolean; intersectionRatio: number }[]) => void;

let observed: Element[] = [];
let fire: IoCallback = () => {};

class FakeIntersectionObserver {
  constructor(callback: IoCallback) {
    fire = callback;
  }

  observe(target: Element) {
    observed.push(target);
  }

  disconnect() {
    observed = [];
  }

  unobserve() {}
}

/** Sets the visible fraction of each clip, in order, and lets the sheet react. */
function show(...ratios: number[]) {
  act(() => {
    fire(observed.map((target, i) => ({
      target,
      isIntersecting: (ratios[i] ?? 0) > 0,
      intersectionRatio: ratios[i] ?? 0,
    })));
  });
}

function videos() {
  return Array.from(document.querySelectorAll('video')) as HTMLVideoElement[];
}

const DATA: ProjectSheetData = {
  label: 'A project',
  features: [],
  technologies: [],
  videos: [
    { srcUrl: 'https://cdn.test/one.mp4', caption: 'First' },
    { srcUrl: 'https://cdn.test/two.mp4', caption: 'Second' },
  ],
};

beforeEach(() => {
  observed = [];
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false, media: query, addEventListener() {}, removeEventListener() {},
  }));

  // A minimal media element: paused/currentTime/ended behave, play() and
  // pause() only flip the flag -- and fire the play / pause events a real
  // element does on a change. Crucially pause() leaves currentTime alone,
  // which is what makes "resume" observable.
  Object.defineProperty(HTMLMediaElement.prototype, 'paused', {
    configurable: true,
    get() { return this._paused !== false; },
  });
  HTMLMediaElement.prototype.play = vi.fn(function (this: HTMLMediaElement) {
    const wasPaused = this.paused;
    (this as unknown as { _paused: boolean })._paused = false;
    if (wasPaused) this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  });
  HTMLMediaElement.prototype.pause = vi.fn(function (this: HTMLMediaElement) {
    const wasPaused = this.paused;
    (this as unknown as { _paused: boolean })._paused = true;
    if (!wasPaused) this.dispatchEvent(new Event('pause'));
  });
});

describe('project sheet video playback', () => {
  it('resumes a half-watched clip when it comes back into view', async () => {
    render(<ProjectSheet open data={DATA} onClose={() => {}} />);
    const [first, second] = videos();

    show(1, 0);
    expect(first.paused).toBe(false);

    // Watched a few seconds, then scrolled down to the next clip.
    first.currentTime = 5;
    show(0.2, 1);
    expect(first.paused).toBe(true);
    expect(second.paused).toBe(false);
    // Frozen, not rewound -- this is what makes resuming possible at all.
    expect(first.currentTime).toBe(5);

    // Back up to the first clip: it plays ON, rather than staying frozen
    // (the old behaviour) or starting over.
    show(1, 0.2);
    expect(first.paused).toBe(false);
    expect(first.currentTime).toBe(5);
    expect(second.paused).toBe(true);
  });

  it('never runs two clips at once', () => {
    render(<ProjectSheet open data={DATA} onClose={() => {}} />);
    const [first, second] = videos();

    show(1, 0.6);
    expect([first.paused, second.paused]).toEqual([false, true]);

    show(0.6, 1);
    expect([first.paused, second.paused]).toEqual([true, false]);
  });

  it('leaves a clip the visitor paused alone when it scrolls back', async () => {
    render(<ProjectSheet open data={DATA} onClose={() => {}} />);
    const [first] = videos();

    show(1, 0);
    expect(first.paused).toBe(false);

    // The overlay button, which is what "pause" means to a visitor.
    await act(async () => {
      screen.getAllByRole('button', { name: /pause|play/i })[0].click();
    });
    expect(first.paused).toBe(true);

    show(0, 1);
    show(1, 0);
    // Still paused: scrolling away and back is not a request to play.
    expect(first.paused).toBe(true);
  });

  it('does not restart a clip that has run to the end', () => {
    render(<ProjectSheet open data={DATA} onClose={() => {}} />);
    const [first] = videos();

    show(1, 0);
    Object.defineProperty(first, 'ended', { configurable: true, get: () => true });
    act(() => { first.pause(); });

    show(0, 1);
    show(1, 0);
    // Replaying a finished clip is the button's job, not the observer's.
    expect(first.paused).toBe(true);
  });

  it('plays nothing while no clip is at least half in view', () => {
    render(<ProjectSheet open data={DATA} onClose={() => {}} />);
    const [first, second] = videos();

    show(0.3, 0.2);
    expect([first.paused, second.paused]).toEqual([true, true]);
  });
});

describe('project sheet playback bar', () => {
  const WITH_BAR: ProjectSheetData = {
    ...DATA,
    videos: [
      { srcUrl: 'https://cdn.test/one.mp4', caption: 'First', playbackBar: true },
      { srcUrl: 'https://cdn.test/two.mp4', caption: 'Second' },
    ],
  };

  it('shows native controls only on clips that opt in', () => {
    render(<ProjectSheet open data={WITH_BAR} onClose={() => {}} />);
    const [first, second] = videos();

    expect(first.controls).toBe(true);
    expect(first.hasAttribute('aria-hidden')).toBe(false);
    expect(first.closest('.psheet__video-frame')!.classList.contains('has-playback-bar')).toBe(true);

    // Default: no field means no bar, and the clip stays out of the a11y tree.
    expect(second.controls).toBe(false);
    expect(second.getAttribute('aria-hidden')).toBe('true');
  });

  it("treats a pause from the playback bar as the visitor's decision", () => {
    render(<ProjectSheet open data={WITH_BAR} onClose={() => {}} />);
    const [first] = videos();

    show(1, 0);
    expect(first.paused).toBe(false);

    // The native bar pauses the element directly, bypassing the overlay button.
    act(() => { first.pause(); });
    expect(screen.getAllByRole('button', { name: /play first/i })).toHaveLength(1);

    show(0, 1);
    show(1, 0);
    expect(first.paused).toBe(true);
  });

  it('still resumes a clip that was only paused by scrolling away', () => {
    render(<ProjectSheet open data={WITH_BAR} onClose={() => {}} />);
    const [first] = videos();

    show(1, 0);
    show(0, 1);
    expect(first.paused).toBe(true);
    show(1, 0);
    expect(first.paused).toBe(false);
  });

  it('pauses the other clip when one is started from its playback bar', () => {
    render(<ProjectSheet open data={WITH_BAR} onClose={() => {}} />);
    const [first, second] = videos();

    show(0.3, 1);
    expect(second.paused).toBe(false);

    act(() => { void first.play(); });
    expect([first.paused, second.paused]).toEqual([false, true]);
  });
});
