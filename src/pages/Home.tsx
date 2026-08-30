import { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import Nav from 'react-bootstrap/Nav';
import { useSiteContent } from '../hooks/useSiteContent';
import { useActiveSection } from '../context/ActiveSectionContext';
import { assetUrl } from '../lib/assetUrl';

const SECTION_IDS = ['about', 'qualifications', 'journey'] as const;

interface PersonalStatement {
  heading?: string;
  body?: string;
  cta?: { label: string; href: string };
  heroImage?: string;       // object key in S3, e.g. "about/hero.jpg"
}

interface Qualification {
  id: string;
  title: string;
  institution?: string;
  year?: string;
  detail?: string | null;
}

interface JourneyBlock {
  id: string;
  year: string;
  title: string;
  body: string;
}

// Keeps a section's heading clear of the sticky navbar when scrolled to via
// its anchor. Roughly navbar height + a little breathing room.
const anchorOffset = { scrollMarginTop: '5.5rem' } as const;

/**
 * Single scrolling landing page. About / Qualifications / Journey are three
 * <section>s with anchor ids ("about", "qualifications", "journey"); the
 * navbar links scroll to them instead of routing to separate pages.
 */
export default function Home() {
  const { content, loading } = useSiteContent();
  const { hash } = useLocation();
  const { setActiveSection } = useActiveSection();

  // Scroll to the section named in the URL hash (e.g. /#journey) on first
  // load and whenever the hash changes. Re-run once content finishes
  // loading, because the sections change height and shift position.
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(hash.slice(1));
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash, loading]);

  // Scroll-spy: report the section currently under a trigger line just below
  // the sticky navbar, so the navbar can highlight it while the user scrolls.
  useEffect(() => {
    const els = SECTION_IDS
      .map(id => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;

    const observer = new IntersectionObserver(
      entries => {
        const topMostVisible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (topMostVisible) setActiveSection(topMostVisible.target.id);
      },
      // Detection band: from ~80px below the viewport top (clear of the
      // navbar) down to 30% of the viewport height. A section is "active"
      // once its top passes into this band and until the next one does.
      { rootMargin: '-80px 0px -70% 0px', threshold: 0 },
    );

    els.forEach(el => observer.observe(el));
    return () => {
      observer.disconnect();
      setActiveSection(null);
    };
  }, [setActiveSection]);

  const statement = (content.personal_statement ?? {}) as PersonalStatement;
  const ctaLabel = statement.cta?.label ?? 'Chat with my virtual persona';
  const ctaHref = statement.cta?.href ?? '/chatroom';
  const heroSrc = assetUrl(statement.heroImage);

  const qRaw = content.qualifications;
  const qualifications = (Array.isArray(qRaw) ? qRaw : []) as Qualification[];
  const qBody = !Array.isArray(qRaw) && qRaw && typeof qRaw === 'object'
    ? (qRaw as { body?: string }).body
    : undefined;

  const journey = (Array.isArray(content.journey) ? content.journey : []) as JourneyBlock[];

  return (
    <div>

      {/* ===== About ===== */}
      <section id="about" style={anchorOffset} className="my-5">
        <div className="row align-items-center g-5">

          <div className="col-12 col-md-6">
            {heroSrc ? (
              <img
                src={heroSrc}
                alt={statement.heading ?? 'Portrait'}
                className="img-fluid rounded shadow-sm w-100"
                style={{ maxHeight: '480px', objectFit: 'cover' }}
                loading="eager"
              />
            ) : (
              <div
                className="d-flex align-items-center justify-content-center border rounded bg-light shadow-sm"
                style={{ minHeight: '400px' }}
              >
                <div className="text-center text-muted">
                  <i className="bi bi-image fs-1 d-block mb-2"></i>
                  <p className="fw-medium mb-0">[ Hero Image Area ]</p>
                  <small className="text-secondary">Recommended: Portrait or Square layout</small>
                </div>
              </div>
            )}
          </div>

          <div className="col-12 col-md-6">
            <div className="mb-4">
              <button className="btn btn-primary btn-lg px-4 shadow-sm">
                <Nav.Link as={NavLink} to={ctaHref}>{ctaLabel}</Nav.Link>
              </button>
            </div>
            <div>
              {statement.heading && <h2 className="mb-3">{statement.heading}</h2>}
              <p className="lead text-secondary lh-base">{statement.body ?? ''}</p>
            </div>
          </div>

        </div>
      </section>

      {/* ===== Qualifications ===== */}
      <section id="qualifications" style={anchorOffset} className="my-5 pt-4 border-top">
        <h2 className="mb-4">My Qualifications</h2>

        {loading && <p className="text-muted">Loading…</p>}
        {!loading && qualifications.length === 0 && !qBody && (
          <p className="text-muted">No qualifications content yet.</p>
        )}
        {qBody && <p className="lead text-secondary lh-base">{qBody}</p>}

        {qualifications.map(item => (
          <div key={item.id} className="mb-4">
            <h3 className="h5 mb-1">{item.title}</h3>
            <div className="text-secondary">
              {[item.institution, item.year].filter(Boolean).join(' · ')}
            </div>
            {item.detail && <p className="mb-0">{item.detail}</p>}
          </div>
        ))}
      </section>

      {/* ===== Journey ===== */}
      <section id="journey" style={anchorOffset} className="my-5 pt-4 border-top">
        <h2 className="mb-4">My Journey</h2>

        {loading && <p className="text-muted">Loading…</p>}
        {!loading && journey.length === 0 && (
          <p className="text-muted">No journey content yet.</p>
        )}

        {journey.map(block => (
          <div key={block.id} id={block.id} style={anchorOffset} className="my-5">
            <div className="text-secondary fw-bold">{block.year}</div>
            <h3>{block.title}</h3>
            <p className="lead text-secondary lh-base">{block.body}</p>
          </div>
        ))}
      </section>

    </div>
  );
}
