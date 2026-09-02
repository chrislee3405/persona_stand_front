import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Prose from '../components/Prose';

/** One feature-demo clip, already resolved to CDN URLs by Home. */
export interface ProjectVideo {
  srcUrl: string;
  posterUrl?: string;
  caption?: string;
}

/** Everything <ProjectSheet> needs, pre-resolved (no S3 keys, no lookups). */
export interface ProjectSheetData {
  label: string;
  overview?: string;
  features: string[];
  technologies: string[];
  githubUrl?: string;
  demoUrl?: string;
  videos: ProjectVideo[];
}

/**
 * Bottom "sheet" pop-up for one project -- same mechanics as JourneySheet
 * (portalled to <body>, slides up from the bottom, Esc / backdrop / ✕ close,
 * body-scroll lock). Two columns inside a single scroll area: a STICKY left
 * column with the write-up (overview / features / tech / links) and a
 * scrolling right column of feature-demo videos.
 *
 * The videos use the "inline media" pattern -- muted, `loop`, no `controls`,
 * `pointer-events: none` so they can't be paused or scrubbed. Only ONE plays
 * at a time: an IntersectionObserver scoped to the sheet's scroll area plays
 * whichever clip is most in view and pauses (freezes) the rest. Skipped
 * entirely under `prefers-reduced-motion` (every clip stays on its poster).
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
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Esc to close + lock body scroll + move focus into the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  // One clip plays at a time. Watch every <video> in the scroll area; the
  // most-visible one plays (loop), the rest pause on their current frame.
  useEffect(() => {
    if (!open) return;
    const root = scrollRef.current;
    if (!root) return;
    const vids = Array.from(root.querySelectorAll('video')) as HTMLVideoElement[];
    if (vids.length === 0) return;

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return; // leave every clip on its poster
    }

    const ratio = new Map<Element, number>();
    const sync = () => {
      let active: HTMLVideoElement | null = null;
      let best = 0;
      for (const v of vids) {
        const r = ratio.get(v) ?? 0;
        if (r > best) { best = r; active = v; }
      }
      for (const v of vids) {
        if (v === active && best >= 0.5) {
          v.play().catch(() => {}); // a browser may still refuse; harmless
        } else {
          v.pause(); // freeze -- do not reset currentTime
        }
      }
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

  return createPortal(
    <div className={`jsheet psheet${open ? ' jsheet--open' : ''}`} aria-hidden={!open}>
      <div className="jsheet__backdrop" onClick={onClose} />
      <div
        className="psheet__panel"
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="psheet-title"
      >
        <button
          type="button"
          className="sheet-close"
          aria-label="Close"
          onClick={onClose}
        />
        <div className="psheet__bar">
          <span className="jsheet__grip" aria-hidden="true" />
        </div>

        <div className="psheet__grid" ref={scrollRef}>
          <div className="psheet__aside">
            <h2 id="psheet-title" className="h4 mb-3">{data?.label}</h2>

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
              <>
                <h3 className="psheet__h">Technologies used</h3>
                <ul className="psheet__tech">
                  {data.technologies.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </>
            )}

            {(data?.githubUrl || data?.demoUrl) && (
              <div className="psheet__links">
                {data?.githubUrl && (
                  <a className="btn btn-outline-primary btn-sm" href={data.githubUrl}
                     target="_blank" rel="noreferrer">GitHub</a>
                )}
                {data?.demoUrl && (
                  <a className="btn btn-primary btn-sm" href={data.demoUrl}
                     target="_blank" rel="noreferrer">Live demo</a>
                )}
              </div>
            )}
          </div>

          <div className="psheet__media">
            {data && data.videos.length > 0 ? (
              data.videos.map((v, i) => (
                <figure key={i} className="psheet__video">
                  {/* preload="metadata": first frame + duration on mount so
                      there's no black box; the full clip is usually already
                      cache-warmed by useMediaPrefetch, else it streams here. */}
                  <video
                    src={v.srcUrl}
                    poster={v.posterUrl}
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    tabIndex={-1}
                    role={v.caption ? 'img' : undefined}
                    aria-label={v.caption || undefined}
                    aria-hidden={v.caption ? undefined : true}
                  />
                  {v.caption && <figcaption>{v.caption}</figcaption>}
                </figure>
              ))
            ) : (
              <p className="text-muted">No demo clips yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
