import { useCallback, useEffect, useRef, useState } from 'react';
import Prose from '../components/Prose';
import BottomSheet from '../components/BottomSheet';
import TechStack from '../components/TechStack';
import { safeHref } from '../lib/safeHref';
import { usePhoneViewport } from '../hooks/usePhoneViewport';

/** One feature-demo clip, already resolved to CDN URLs by Home. */
export interface ProjectVideo {
  srcUrl: string;
  posterUrl?: string;
  mobileSrcUrl?: string;
  mobilePosterUrl?: string;
  caption?: string;
  /** Show the browser's own playback bar (seek, time, volume). Off by default. */
  playbackBar?: boolean;
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
  engineeringDetailsUrl?: string;
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
 * VIDEO PLAYBACK. Whichever clip is most in view plays, and only that one:
 * an IntersectionObserver scoped to the sheet's scroll area starts it and
 * pauses the rest. Scrolling away FREEZES a clip rather than resetting it,
 * and scrolling back plays it on from that frame, so a half-watched demo is
 * never restarted or stranded mid-way. A clip that reaches its end stops on
 * its last frame with a centred play button offering a replay, and is not
 * auto-started again. Nor is one the visitor paused by hand: that is a
 * decision and it sticks until they press play. Skipped entirely under
 * `prefers-reduced-motion` -- every clip stays on its poster with the
 * button available.
 *
 * It used to `loop` forever with `pointer-events: none` on the element,
 * explicitly so it could not be paused. That is a WCAG 2.2.2 (Pause, Stop,
 * Hide) failure, and 2.2.2 is Level A: auto-playing motion running past
 * five seconds needs a mechanism to stop it, and honouring
 * prefers-reduced-motion does not substitute for one -- most people have
 * never set it. Resuming rather than looping keeps that: no clip is
 * `loop`ed, each one finishes and stays finished, and the button is a real
 * pause control that the observer then respects.
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
  const isPhone = usePhoneViewport();
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  // Which clip is running right now, by index. Drives the overlay button's
  // icon and label; `null` means nothing is playing.
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  // Clips the VISITOR paused by pressing the overlay button. A ref, not
  // state: it must not trigger a render, and it must survive the observer
  // re-firing as the column is scrolled back and forth.
  //
  // This is the only thing that stops a clip resuming when it scrolls back
  // into view. It used to be a record of clips that had already had their
  // one automatic play, which meant scrolling away from a half-watched clip
  // and back left it frozen mid-frame -- the position was kept but nothing
  // ever started it again. Autoplay is now continuous: whatever is on
  // screen plays on from where it stopped. Pressing pause is a decision, so
  // it is remembered; running out of view is not.
  const userPaused = useRef<Set<number>>(new Set());
  // Clips about to be paused by THIS code (the observer, or the one-at-a-time
  // rule), so onPause can tell them apart from the visitor pausing through a
  // clip's playback bar -- only the latter is a decision that must stick.
  const autoPausing = useRef<Set<number>>(new Set());
  const autoPause = useCallback((i: number) => {
    const video = videoRefs.current[i];
    if (!video || video.paused) return;
    autoPausing.current.add(i);
    video.pause();
  }, []);

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
  const [renderedPhone, setRenderedPhone] = useState(isPhone);
  if (data !== renderedFor || isPhone !== renderedPhone) {
    setRenderedFor(data);
    setRenderedPhone(isPhone);
    setPlayingIndex(null);
  }

  // The ref half of the same reset. Refs must not be written during render
  // (react-hooks: "Cannot access refs during render") -- render has to stay
  // pure so React can re-run or discard it. Declared BEFORE the observer
  // effect below so it runs first when `data` changes, clearing the record
  // before anything consults it.
  useEffect(() => {
    userPaused.current = new Set();
    autoPausing.current = new Set();
  }, [data, isPhone]);

  const toggle = useCallback((i: number) => {
    const video = videoRefs.current[i];
    if (!video) return;
    if (video.paused || video.ended) {
      // Replaying a finished clip starts it over rather than resuming from
      // its final frame, which is what the button appears to promise.
      if (video.ended) video.currentTime = 0;
      // Pause every other clip first -- one at a time is the whole point.
      videoRefs.current.forEach((_, j) => {
        if (j !== i) autoPause(j);
      });
      userPaused.current.delete(i);
      void video.play().catch(() => {});
      setPlayingIndex(i);
    } else {
      // Deliberate: this clip stays paused even when it is the one on
      // screen, until the visitor presses play again.
      userPaused.current.add(i);
      video.pause();
      setPlayingIndex(null);
    }
  }, [autoPause]);

  // Keep the overlay button honest when a clip is started or stopped some
  // other way -- in practice, through its playback bar.
  const onVideoPlay = useCallback((i: number) => {
    videoRefs.current.forEach((_, j) => {
      if (j !== i) autoPause(j);
    });
    userPaused.current.delete(i);
    setPlayingIndex(i);
  }, [autoPause]);
  const onVideoPause = useCallback((i: number) => {
    if (autoPausing.current.delete(i)) return; // paused by us, not the visitor
    userPaused.current.add(i);
    setPlayingIndex(cur => (cur === i ? null : cur));
  }, []);

  // One clip plays at a time: whichever is most on screen, resumed from
  // where it last stopped.
  useEffect(() => {
    if (!open) return;
    const root = scrollRef.current;
    if (!root) return;
    const vids = videoRefs.current.filter((v): v is HTMLVideoElement => !!v);
    if (vids.length === 0) return;
    const indexOf = new Map(vids.map(v => [v, videoRefs.current.indexOf(v)]));
    const pausing = autoPausing.current;

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return; // leave every clip on its poster; the button still works
    }

    const ratio = new Map<Element, number>();
    const sync = () => {
      let active: HTMLVideoElement | null = null;
      let best = 0;
      videoRefs.current.forEach(v => {
        if (!v) return;
        const r = ratio.get(v) ?? 0;
        if (r > best) { best = r; active = v; }
      });
      videoRefs.current.forEach((v, i) => {
        if (!v) return;
        if (v === active && best >= 0.5) {
          // Play on from wherever it stopped -- v.pause() below never
          // rewinds, so this resumes rather than restarts. Two things are
          // left alone: a clip the visitor paused on purpose, and one that
          // has run to the end (replaying that is what the button is for).
          if (v.paused && !v.ended && !userPaused.current.has(i)) {
            void v.play().then(() => setPlayingIndex(i)).catch(() => {});
          }
        } else if (!v.paused) {
          autoPause(i); // freeze -- do not reset currentTime
          setPlayingIndex(cur => (cur === i ? null : cur));
        }
      });
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
      vids.forEach(v => {
        if (v.paused) return;
        pausing.add(indexOf.get(v)!);
        v.pause();
      });
    };
  }, [open, data, autoPause, isPhone]);

  const githubUrl = safeHref(data?.githubUrl);
  const demoUrl = safeHref(data?.demoUrl);
  const engineeringDetailsUrl = safeHref(data?.engineeringDetailsUrl);

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

        {data && (data.overview || data.technologies.length > 0) && (
          <>
            <div className="psheet__overview-row">
              <h3 className="psheet__h">Overview</h3>
              {open && data.technologies.length > 0 && (
                <TechStack key={data.label} technologies={data.technologies} />
              )}
            </div>
            <Prose text={data.overview} />
          </>
        )}

        {data && data.features.length > 0 && (
          <>
            <h3 className="psheet__h">Engineering highlights</h3>
            <ul className="psheet__list">
              {data.features.map((f, i) => {
                const separator = f.indexOf(': ');
                return (
                  <li key={i}>
                    {separator > 0 ? (
                      <>
                        <strong className="psheet__highlight-title">{f.slice(0, separator)}</strong>
                        {f.slice(separator + 2)}
                      </>
                    ) : f}
                  </li>
                );
              })}
            </ul>
            {engineeringDetailsUrl && (
              <a className="btn btn-outline-primary btn-sm psheet__details-link"
                href={engineeringDetailsUrl} target="_blank" rel="noopener noreferrer"
                aria-label="Engineering decision details (PDF, opens in a new tab)">
                Engineering decision details (PDF)
                <span aria-hidden="true"> ↗</span>
              </a>
            )}
          </>
        )}

      </div>

      <div className="psheet__media">
        {data && data.videos.length > 0 ? (
          data.videos.map((v, i) => {
            const mobile = isPhone && !!v.mobileSrcUrl;
            const srcUrl = mobile ? v.mobileSrcUrl! : v.srcUrl;
            const posterUrl = mobile ? v.mobilePosterUrl : v.posterUrl;
            const isPlaying = playingIndex === i;
            const name = v.caption || `Demo clip ${i + 1}`;
            return (
              <figure key={`${i}:${srcUrl}`} className={`psheet__video${mobile ? ' psheet__video--mobile' : ''}`}>
                {/* Left-aligned header above the clip. It IS the figure's
                    caption, just placed first -- so the frame below holds
                    only the video + overlay button, which keeps the
                    button's `top: 0` on the video and not on this text. */}
                {v.caption && (
                  <figcaption className="psheet__video-head">{v.caption}</figcaption>
                )}
                <div className={`psheet__video-frame${v.playbackBar ? ' has-playback-bar' : ''}`}>
                  {/* preload="metadata": first frame + duration on mount so
                      there's no black box; the full clip is usually already
                      cache-warmed by useMediaPrefetch, else it streams here.
                      No `loop` -- see the component docstring.
                      With `playbackBar` the native controls are shown and
                      reachable by keyboard / screen reader; the overlay
                      button then stops short of them (see Home.css). */}
                  <video
                    ref={el => { videoRefs.current[i] = el; }}
                    src={srcUrl}
                    poster={posterUrl}
                    muted
                    playsInline
                    preload="metadata"
                    controls={v.playbackBar}
                    tabIndex={v.playbackBar ? undefined : -1}
                    aria-hidden={v.playbackBar ? undefined : 'true'}
                    onPlay={() => onVideoPlay(i)}
                    onPause={() => onVideoPause(i)}
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
