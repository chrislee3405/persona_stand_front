import { useCallback, useEffect, useRef, useState } from 'react';
import Prose from '../components/Prose';
import BottomSheet from '../components/BottomSheet';
import { safeHref } from '../lib/safeHref';

/** One feature-demo clip, already resolved to CDN URLs by Home. */
export interface ProjectVideo {
  srcUrl: string;
  posterUrl?: string;
  caption?: string;
}

/** Everything <ProjectSheet> needs, pre-resolved (no S3 keys, no lookups). */
export interface ProjectSheetData {
  label: string;
  /** The pop-up's overview -- the fuller PARAGRAPH write-up, from the
   *  site_project detail row. Distinct from the thumbnail card's own
   *  short point-form summary (Project.overview, from site_content). */
  overview?: string;
  features: string[];
  technologies: string[];
  githubUrl?: string;
  demoUrl?: string;
  videos: ProjectVideo[];
}

/**
 * Bottom "sheet" pop-up for one project. The shell is <BottomSheet>, shared
 * with JourneySheet -- portal, backdrop, slide-up, Esc / ✕ close, body-scroll
 * lock, focus trap and scroll-reset-on-open all live there. This component
 * supplies the content: two columns inside a single scroll area -- a STICKY
 * left column with the write-up (overview / features / tech / links) and a
 * scrolling right column of feature-demo videos.
 *
 * VIDEO PLAYBACK. Each clip plays ONCE, automatically, the first time it
 * scrolls into view, and then stops on its last frame with a centred
 * play button offering a replay. Only one plays at a time: an
 * IntersectionObserver scoped to the sheet's scroll area starts whichever
 * clip is most in view and pauses the rest. Skipped entirely under
 * `prefers-reduced-motion` -- every clip stays on its poster with the
 * button available.
 *
 * It used to `loop` forever with `pointer-events: none` on the element,
 * explicitly so it could not be paused. That is a WCAG 2.2.2 (Pause, Stop,
 * Hide) failure, and 2.2.2 is Level A: auto-playing motion running past
 * five seconds needs a mechanism to stop it, and honouring
 * prefers-reduced-motion does not substitute for one -- most people have
 * never set it. Playing once and stopping means the motion is finite even
 * if the button is never touched, and the button is a real pause control
 * while a clip is running.
 *
 * `data` is kept mounted by the caller through the close animation so the
 * panel doesn't blank as it slides away.
 */
export default function ProjectSheet({
  open,
  data,
  onClose,
}: {
  open: boolean;
  data?: ProjectSheetData;
  onClose: () => void;
}) {
  // Owned here, not by BottomSheet, because this sheet uses its scroll area
  // as the IntersectionObserver root below. BottomSheet attaches it and
  // handles the reset-to-top on open.
  const scrollRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  // Which clip is running right now, by index. Drives the overlay button's
  // icon and label; `null` means nothing is playing.
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  // Clips that have already had their one automatic play. A ref, not state:
  // it must not trigger a render, and it must survive the observer
  // re-firing as the visitor scrolls the column back and forth.
  const autoPlayed = useRef<Set<number>>(new Set());

  // Reset the "already played" record whenever a different project opens,
  // so each sheet gets its own first-view autoplay.
  //
  // Adjusted DURING RENDER rather than in an effect. This is React's
  // documented pattern for state that has to follow a prop
  // (react.dev/reference/react/useState -- "storing information from
  // previous renders"): setting state in an effect body schedules a second
  // render pass with a stale value painted in between, and is what
  // react-hooks/set-state-in-effect exists to catch.
  const [renderedFor, setRenderedFor] = useState(data);
  if (data !== renderedFor) {
    setRenderedFor(data);
    setPlayingIndex(null);
  }

  // The ref half of the same reset. Refs must not be written during render
  // (react-hooks: "Cannot access refs during render") -- render has to stay
  // pure so React can re-run or discard it. Declared BEFORE the observer
  // effect below so it runs first when `data` changes, clearing the record
  // before anything consults it.
  useEffect(() => {
    autoPlayed.current = new Set();
  }, [data]);

  const toggle = useCallback((i: number) => {
    const video = videoRefs.current[i];
    if (!video) return;
    if (video.paused || video.ended) {
      // Replaying a finished clip starts it over rather than resuming from
      // its final frame, which is what the button appears to promise.
      if (video.ended) video.currentTime = 0;
      // Pause every other clip first -- one at a time is the whole point.
      videoRefs.current.forEach((other, j) => {
        if (other && j !== i) other.pause();
      });
      void video.play().catch(() => {});
      setPlayingIndex(i);
    } else {
      video.pause();
      setPlayingIndex(null);
    }
  }, []);

  // One clip auto-plays at a time, on first view only.
  useEffect(() => {
    if (!open) return;
    const root = scrollRef.current;
    if (!root) return;
    const vids = videoRefs.current.filter((v): v is HTMLVideoElement => !!v);
    if (vids.length === 0) return;

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return; // leave every clip on its poster; the button still works
    }

    const ratio = new Map<Element, number>();
    const sync = () => {
      let active: HTMLVideoElement | null = null;
      let activeIndex = -1;
      let best = 0;
      videoRefs.current.forEach((v, i) => {
        if (!v) return;
        const r = ratio.get(v) ?? 0;
        if (r > best) { best = r; active = v; activeIndex = i; }
      });
      videoRefs.current.forEach((v, i) => {
        if (!v) return;
        if (v === active && best >= 0.5) {
          // Only the FIRST time this clip comes into view. After that the
          // visitor decides, via the button.
          if (!autoPlayed.current.has(i)) {
            autoPlayed.current.add(i);
            void v.play().then(() => setPlayingIndex(i)).catch(() => {});
          }
        } else if (!v.paused) {
          v.pause(); // freeze -- do not reset currentTime
          setPlayingIndex(cur => (cur === i ? null : cur));
        }
      });
      void activeIndex;
    };

    const io = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          ratio.set(e.target, e.isIntersecting ? e.intersectionRatio : 0);
        }
        sync();
      },
      { root, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    vids.forEach(v => io.observe(v));
    return () => {
      io.disconnect();
      vids.forEach(v => v.pause());
    };
  }, [open, data]);

  const githubUrl = safeHref(data?.githubUrl);
  const demoUrl = safeHref(data?.demoUrl);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      labelledBy="psheet-title"
      scrollRef={scrollRef}
      rootClassName="jsheet psheet"
      panelClassName="psheet__panel"
      barClassName="psheet__bar"
      scrollClassName="psheet__grid"
    >
      <div className="psheet__aside">
        <div className="psheet__head">
          <h2 id="psheet-title" className="h4">{data?.label}</h2>
          {(githubUrl || demoUrl) && (
            <div className="psheet__links">
              {githubUrl && (
                <a className="btn btn-outline-primary btn-sm" href={githubUrl}
                   target="_blank" rel="noreferrer">GitHub</a>
              )}
              {demoUrl && (
                <a className="btn btn-primary btn-sm" href={demoUrl}
                   target="_blank" rel="noreferrer">Live demo</a>
              )}
            </div>
          )}
        </div>

        {data?.overview && (
          <>
            <h3 className="psheet__h">Overview</h3>
            <Prose text={data.overview} />
          </>
        )}

        {data && data.features.length > 0 && (
          <>
            <h3 className="psheet__h">Main features</h3>
            <ul className="psheet__list">
              {data.features.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          </>
        )}

        {data && data.technologies.length > 0 && (
          // No heading -- the chips read as a tech list on their own.
          <ul className="psheet__tech">
            {data.technologies.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        )}
      </div>

      <div className="psheet__media">
        {data && data.videos.length > 0 ? (
          data.videos.map((v, i) => {
            const isPlaying = playingIndex === i;
            const name = v.caption || `Demo clip ${i + 1}`;
            return (
              <figure key={i} className="psheet__video">
                {/* Left-aligned header above the clip. It IS the figure's
                    caption, just placed first -- so the frame below holds
                    only the video + overlay button, which keeps the
                    button's `top: 0` on the video and not on this text. */}
                {v.caption && (
                  <figcaption className="psheet__video-head">{v.caption}</figcaption>
                )}
                <div className="psheet__video-frame">
                  {/* preload="metadata": first frame + duration on mount so
                      there's no black box; the full clip is usually already
                      cache-warmed by useMediaPrefetch, else it streams here.
                      No `loop` -- see the component docstring. */}
                  <video
                    ref={el => { videoRefs.current[i] = el; }}
                    src={v.srcUrl}
                    poster={v.posterUrl}
                    muted
                    playsInline
                    preload="metadata"
                    tabIndex={-1}
                    aria-hidden="true"
                    onEnded={() => setPlayingIndex(cur => (cur === i ? null : cur))}
                  />
                  {/* The pause/replay control. A real <button>, layered over
                      the clip rather than enabling the video's own controls,
                      so the "inline media" look survives while the behaviour
                      stops being unstoppable. */}
                  <button
                    type="button"
                    className={`psheet__video-btn${isPlaying ? ' is-playing' : ''}`}
                    aria-label={isPlaying ? `Pause ${name}` : `Play ${name}`}
                    onClick={() => toggle(i)}
                  >
                    <span className="psheet__video-icon" aria-hidden="true" />
                  </button>
                </div>
              </figure>
            );
          })
        ) : (
          <p className="text-muted">No demo clips yet.</p>
        )}
      </div>
    </BottomSheet>
  );
}
