import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation } from 'react-router-dom';
import Nav from 'react-bootstrap/Nav';
import { useSiteContent, pickImage } from '../hooks/useSiteContent';
import { useMediaPrefetch } from '../hooks/useMediaPrefetch';
import { useDragScroll } from '../hooks/useDragScroll';
import { useActiveSection } from '../context/ActiveSectionContext';
import { assetUrl } from '../lib/assetUrl';
import Prose from '../components/Prose';
import ProjectDots from '../components/ProjectDots';
import ProjectSheet, { type ProjectSheetData } from './ProjectSheet';
import githubIcon from '../assets/icons/github.png';
import linkedinIcon from '../assets/icons/linkin.png';
import {
  type HeroOverrides,
  type HeroConfig,
  HERO_DEFAULTS,
  QUAL_HERO_DEFAULTS,
  CERT_HERO_DEFAULTS,
  heroVars,
  ANCHOR_OFFSET,
  HERO_ANCHOR_OFFSET,
  SCROLLSPY_LINE,
} from '../lib/knobs';
import './Home.css';

// Home-page scroll sections, top-to-bottom. Order MUST match the navbar's
// SECTIONS list and the JSX below so the scroll-spy highlight stays in sync.
const SECTION_IDS = [
  'about',
  'qualifications',
  'certifications',
  'projects',
  'journey',
  'contact',
] as const;

interface PersonalStatement {
  heading?: string;
  body?: string;
  cta?: { label: string; href: string };
  hero?: HeroOverrides;      // About-section hero-band framing (see above)
  qualHero?: HeroOverrides;  // Qualifications-section banner framing (mirror: image right)
  certHero?: HeroOverrides;  // Certifications-section banner framing (image left, like About)
  // NOTE: no image key here. EVERY image on the site is fetched from the
  // site_image table (via `images` / pickImage()) -- the hero included. An
  // old `heroImage` key on a personal_statement row is ignored; migrate it
  // to a site_image ("personal_statement", "hero") row.
}

interface Qualification {
  id: string;
  title: string;
  institution?: string;
  year?: string;
  detail?: string | null;
}

interface Certification {
  id: string;
  title: string;
  issuer?: string;
  year?: string;
  detail?: string | null;
}

/** One project shown as a thumbnail in the horizontally scrollable Projects
 *  banner. `content.projects` is an array of these (site_content section
 *  "projects"). Clicking a thumbnail opens the ProjectSheet pop-up for that
 *  `id` (there are no per-project pages). The picture is NOT a path in this
 *  row -- `image_tag` names a site_image row (section "projects",
 *  description == image_tag, defaulting to `id`) and the URL is built from
 *  that row's `image_path`. Every image path comes from site_image. */
interface Project {
  id: string;          // stable key; also the site_project.project_id
  label: string;       // caption + <img alt> + sheet heading
  image_tag?: string;  // site_image description for the thumbnail (defaults to `id`)
}

/** Raw detail for one project (site_project table, keyed by project id).
 *  `videos[].src_tag` / `poster_tag` name site_image rows whose image_path
 *  is the .mp4 / .jpg S3 key; Home resolves them to URLs before handing the
 *  data to <ProjectSheet>. */
interface ProjectDetail {
  overview?: string;
  features?: string[];
  technologies?: string[];
  githubUrl?: string;
  demoUrl?: string;
  videos?: { src_tag: string; poster_tag?: string; caption?: string }[];
}

interface JourneyBlock {
  id: string;
  year: string;
  title: string;
  institution?: string;  // optional: the school / company / organisation --
                         // shown in italics under the title.
  body: string;
  image_tag?: string;   // optional: names a site_image row -- section
                        // "journey", description == this value. Its
                        // image_path is shown opposite the card. A
                        // "<placeholder>"-style value counts as unset.
}

/** Expanded copy for one journey block, shown in the bottom sheet when its
 *  card is clicked. Comes from the site_journey table (journeyDetails map,
 *  keyed by the block's id). A block with no entry has a non-clickable card. */
interface JourneyDetail {
  heading?: string;    // sheet title; falls back to the block's `title`
  subtitle?: string;   // one italic line under the title (place / role)
  body?: string;       // main text; blank lines -> paragraphs
  highlights?: string[];                       // bullet list under the body
  links?: { label: string; href: string }[];  // related links as buttons
}

/** Contact section copy (site_content section "contact"). */
interface ContactInfo {
  intro?: string | null;
  email?: string;
  location?: string;
  links?: { label: string; href: string }[];
}

/**
 * Full-bleed image band with a page-background scrim over the text side.
 * Default: photo weighted left, text right. `flip` mirrors it (photo
 * right, text left) -- used by the Qualifications section.
 */
function HeroBand({
  id,
  imageSrc,
  cfg,
  ariaLabel,
  children,
  flip = false,
  anchorStyle,
}: {
  id: string;
  imageSrc: string;
  cfg: HeroConfig;
  ariaLabel: string;
  children: ReactNode;
  flip?: boolean;
  anchorStyle?: CSSProperties;
}) {
  return (
    <section
      id={id}
      style={{ ...anchorStyle, ...heroVars(cfg) }}
      className={`hero-band${flip ? ' hero-band--flip' : ''}`}
    >
      <div
        className="hero-band__img"
        role="img"
        aria-label={ariaLabel}
        style={{ backgroundImage: `url("${imageSrc}")` }}
      />
      <div className="hero-band__scrim" aria-hidden="true" />
      <div className="container hero-band__inner">
        <div className="hero-band__text">{children}</div>
      </div>
    </section>
  );
}

/**
 * Bottom "sheet" pop-up with the expanded story for one Journey block.
 * `detail` is the site_journey content; `block` supplies the year label and
 * the fallback title. Always mounted, portalled to <body>; `open` toggles a
 * class that slides the panel up from the bottom edge. Esc / the backdrop /
 * the close button dismiss it, and body scroll is locked while it is up.
 * The last block/detail stay rendered after close so the panel doesn't
 * blank as it slides away.
 */
function JourneySheet({
  open,
  block,
  detail,
  onClose,
}: {
  open: boolean;
  block?: JourneyBlock;
  detail?: JourneyDetail;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // The panel stays mounted between blocks, so .jsheet__scroll keeps the
  // previous block's scroll position -- snap it back to the top on open.
  useLayoutEffect(() => {
    if (open && scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [open]);

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

  const title = detail?.heading ?? block?.title ?? '';
  const highlights = (detail?.highlights ?? []).filter(Boolean);
  const links = (detail?.links ?? []).filter(l => l && l.href);

  return createPortal(
    <div className={`jsheet${open ? ' jsheet--open' : ''}`} aria-hidden={!open}>
      <div className="jsheet__backdrop" onClick={onClose} />
      <div
        className="jsheet__panel"
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="jsheet-title"
      >
        <button
          type="button"
          className="sheet-close"
          aria-label="Close"
          onClick={onClose}
        />
        <div className="jsheet__bar">
          <span className="jsheet__grip" aria-hidden="true" />
        </div>
        <div className="jsheet__scroll" ref={scrollRef}>
          <div className="jsheet__head">
            {block?.year && <span className="jsheet__year">{block.year}</span>}
            <h2 id="jsheet-title" className="h4 mb-0">{title}</h2>
          </div>
          <div className="jsheet__body">
            {detail?.subtitle && (
              <p className="text-secondary fst-italic mb-3">{detail.subtitle}</p>
            )}
            <Prose text={detail?.body} />
            {highlights.length > 0 && (
              <ul className="mt-3">
                {highlights.map((h, i) => (
                  <li key={i} className="mb-2">{h}</li>
                ))}
              </ul>
            )}
            {links.length > 0 && (
              <div className="d-flex flex-wrap gap-2 mt-4">
                {links.map((l, i) =>
                  /^https?:\/\//i.test(l.href) ? (
                    <a
                      key={i}
                      className="btn btn-outline-primary btn-sm"
                      href={l.href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {l.label}
                    </a>
                  ) : (
                    <NavLink key={i} className="btn btn-outline-primary btn-sm" to={l.href}>
                      {l.label}
                    </NavLink>
                  ),
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Single scrolling landing page. About / Qualifications & Awards /
 * Certifications / Projects / Journey / Contact are <section>s with anchor
 * ids (see SECTION_IDS); the navbar links scroll to them instead of routing
 * to separate pages, and the scroll-spy highlights the one in view.
 */
export default function Home() {
  const { content, images, journeyDetails, projectDetails, loading } = useSiteContent();
  const { hash } = useLocation();
  const { setActiveSection } = useActiveSection();

  // Journey click-through sheet. `sheet` holds the block + its detail;
  // `sheetOpen` drives the slide animation. `sheet` is left in place after
  // close (overwritten on the next open) so the panel keeps its content as
  // it slides away instead of blanking.
  const [sheet, setSheet] = useState<{ block: JourneyBlock; detail: JourneyDetail } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Project click-through sheet -- same "keep last content through the
  // close animation" trick. `projectSheet` holds the already-resolved data
  // (video S3 keys turned into URLs); `projectSheetOpen` drives the slide.
  const [projectSheet, setProjectSheet] = useState<ProjectSheetData | null>(null);
  const [projectSheetOpen, setProjectSheetOpen] = useState(false);

  // Trailing-spacer sizing. Contact is the last section and usually short,
  // so on its own the page can't scroll far enough to bring "Contact Me" up
  // to the anchor line. Rather than a flat 100vh spacer (which left a
  // screenful of dead scroll once Contact reached the top), size the spacer
  // to exactly the shortfall: pad the content below Contact's top up to --
  // but not past -- one viewport minus the anchor offset, so Contact can
  // just reach the top with no leftover scroll. Recomputed on resize and
  // whenever the layout changes (ResizeObserver on <body>); the >1px guard
  // stops the observer's own feedback loop.
  const tailRef = useRef<HTMLDivElement>(null);

  // The horizontal projects scroller -- read by <ProjectDots> to work out
  // which project thumbnails are on screen, and made click-drag pannable so
  // its scrollbar can be hidden.
  const projScrollerRef = useRef<HTMLUListElement>(null);

  useLayoutEffect(() => {
    const el = tailRef.current;
    if (!el) return;
    const fit = () => {
      const contact = document.getElementById('contact');
      if (!contact) return;
      const anchor = parseFloat(getComputedStyle(contact).scrollMarginTop) || 0;
      const contactTop = contact.getBoundingClientRect().top + window.scrollY;
      const spacerNow = el.offsetHeight;
      const contentBelow = document.documentElement.scrollHeight - contactTop - spacerNow;
      const needed = Math.max(0, window.innerHeight - anchor - contentBelow);
      if (Math.abs(needed - spacerNow) > 1) el.style.height = `${needed}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    const ro = new ResizeObserver(fit);
    ro.observe(document.body);
    return () => {
      window.removeEventListener('resize', fit);
      ro.disconnect();
    };
  }, [loading, content]);

  // Scroll to the section named in the URL hash (e.g. /#journey) on first
  // load and whenever the hash changes. Re-run once content finishes
  // loading, because the sections change height and shift position.
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(hash.slice(1));
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash, loading]);

  // Scroll-spy: highlight the section whose top has passed a line just
  // below the sticky navbar. Scroll-position based (not IntersectionObserver
  // on a thin band) so it (a) always resolves to exactly one section in
  // BOTH scroll directions, and (b) re-queries the DOM every tick, so it
  // survives sections swapping nodes when content loads (plain <section>
  // -> <HeroBand>). Re-runs on `loading` to set the right initial pill.
  useEffect(() => {
    const update = () => {
      let current: string = SECTION_IDS[0];
      for (const id of SECTION_IDS) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top - SCROLLSPY_LINE <= 0) current = id;
      }
      // At the very bottom of the page, light the last section even if it's
      // too short to have crossed the line.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
        current = SECTION_IDS[SECTION_IDS.length - 1];
      }
      setActiveSection(current);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      setActiveSection(null);
    };
  }, [setActiveSection, loading]);

  const statement = (content.personal_statement ?? {}) as PersonalStatement;
  const ctaLabel = statement.cta?.label ?? 'Chat with my virtual persona';
  const ctaHref = statement.cta?.href ?? '/chatroom';
  // Hero image -- like every image on the site -- comes only from the
  // site_image table (section "personal_statement", slot "hero").
  const heroSrc = assetUrl(pickImage(images, 'personal_statement', 'hero'));
  // Code defaults, overridable per deployment from personal_statement.hero.
  const aboutCfg: HeroConfig = { ...HERO_DEFAULTS, ...statement.hero };

  // Qualifications banner: mirror of the hero -- image solid on the RIGHT,
  // fading left; text on the left. Reads the site_image ('qualifications',
  // 'banner') slot; falls back to the plain section when unset. Framing
  // numbers live in lib/knobs.ts (QUAL_HERO_DEFAULTS).
  const qualImg = assetUrl(pickImage(images, 'qualifications', 'banner'));
  const qualCfg: HeroConfig = { ...QUAL_HERO_DEFAULTS, ...statement.qualHero };

  const qRaw = content.qualifications;
  const qualifications = (Array.isArray(qRaw) ? qRaw : []) as Qualification[];
  const qBody = !Array.isArray(qRaw) && qRaw && typeof qRaw === 'object'
    ? (qRaw as { body?: string }).body
    : undefined;

  const certifications = (Array.isArray(content.certifications) ? content.certifications : []) as Certification[];

  // Certifications banner: same orientation as the hero (image left, text
  // right) for an alternating rhythm with the flipped Qualifications band.
  // Reads the site_image ('certifications', 'banner') slot. Framing numbers
  // live in lib/knobs.ts (CERT_HERO_DEFAULTS).
  const certImg = assetUrl(pickImage(images, 'certifications', 'banner'));
  const certCfg: HeroConfig = { ...CERT_HERO_DEFAULTS, ...statement.certHero };

  const projectItems = (Array.isArray(content.projects) ? content.projects : []) as Project[];
  // Click-drag panning for the projects scroller (mouse only) -- pass the
  // count so the hook re-attaches once the scroller has actually rendered.
  useDragScroll(projScrollerRef, projectItems.length);
  // Expanded copy per project, keyed by project id (site_project table). A
  // thumbnail with an entry here is clickable and opens the bottom sheet.
  const projectDetailMap = projectDetails as Record<string, ProjectDetail | undefined>;

  // The FIRST demo clip (+ its poster) of each project, resolved from
  // site_image. Warmed into the browser cache in the background (after the
  // first interaction) so a project sheet opens with its lead video -- the
  // one that auto-plays -- already there. The rest stream on demand as the
  // viewer scrolls down to them. See useMediaPrefetch.
  const projectMediaUrls = useMemo(() => {
    const projects = Array.isArray(content.projects) ? (content.projects as Project[]) : [];
    const details = projectDetails as Record<string, ProjectDetail | undefined>;
    const out: string[] = [];
    for (const p of projects) {
      const first = details[p.id]?.videos?.[0];
      if (!first) continue;
      const src = first.src_tag ? assetUrl(pickImage(images, 'projects', first.src_tag)) : undefined;
      const poster = first.poster_tag ? assetUrl(pickImage(images, 'projects', first.poster_tag)) : undefined;
      if (src) out.push(src);
      if (poster) out.push(poster);
    }
    return out;
  }, [content, images, projectDetails]);
  useMediaPrefetch(projectMediaUrls);
  const openProjectSheet = (project: Project, detail: ProjectDetail) => {
    // Resolve video / poster tags to CDN URLs here so <ProjectSheet> stays
    // presentational. Drop any clip whose .mp4 tag doesn't resolve. Only
    // look a tag up when it's actually set -- pickImage() with no
    // description falls back to the section's first image.
    const videos = (detail.videos ?? []).flatMap(v => {
      const srcUrl = v.src_tag ? assetUrl(pickImage(images, 'projects', v.src_tag)) : undefined;
      if (!srcUrl) return [];
      return [{
        srcUrl,
        posterUrl: v.poster_tag ? assetUrl(pickImage(images, 'projects', v.poster_tag)) : undefined,
        caption: v.caption,
      }];
    });
    setProjectSheet({
      label: project.label,
      overview: detail.overview,
      features: (detail.features ?? []).filter(Boolean),
      technologies: (detail.technologies ?? []).filter(Boolean),
      githubUrl: detail.githubUrl,
      demoUrl: detail.demoUrl,
      videos,
    });
    setProjectSheetOpen(true);
  };

  const journey = (Array.isArray(content.journey) ? content.journey : []) as JourneyBlock[];
  // Expanded copy per block, keyed by block id (site_journey table). A block
  // with an entry here gets a clickable card that opens the bottom sheet.
  const journeyDetailMap = journeyDetails as Record<string, JourneyDetail | undefined>;
  const openJourneySheet = (block: JourneyBlock, detail: JourneyDetail) => {
    setSheet({ block, detail });
    setSheetOpen(true);
  };

  const contact = (content.contact ?? {}) as ContactInfo;
  const contactLinks = Array.isArray(contact.links) ? contact.links : [];

  const aboutText = (
    <>
      {statement.heading && <h2 className="mb-3">{statement.heading}</h2>}
      <Prose text={statement.body} />
      {/* CTA: centred on phones (< sm), left-aligned from sm up. The .btn is
          inline-block, so text-align on this wrapper positions it. */}
      <div className="mt-4 text-center text-sm-start">
        <button className="btn btn-primary btn-lg px-4 shadow-sm">
          <Nav.Link as={NavLink} to={ctaHref}>{ctaLabel}</Nav.Link>
        </button>
      </div>
    </>
  );

  const qualContent = (
    <>
      <h2 className="mb-4">Qualifications &amp; Awards</h2>
      {loading && <p className="text-muted">Loading…</p>}
      {!loading && qualifications.length === 0 && !qBody && (
        <p className="text-muted">No qualifications content yet.</p>
      )}
      {qBody && <Prose text={qBody} />}
      {qualifications.length > 0 && (
        <ul className="mb-0">
          {qualifications.map(item => (
            <li key={item.id} className="mb-3">
              <span className="fw-medium">{item.title}</span>
              {(item.institution || item.year) && (
                <div className="text-secondary">
                  {item.institution && <em>{item.institution}</em>}
                  {item.institution && item.year && ' · '}
                  {item.year}
                </div>
              )}
              {item.detail && <div className="text-secondary">{item.detail}</div>}
            </li>
          ))}
        </ul>
      )}
    </>
  );

  const certContent = (
    <>
      <h2 className="mb-4">Certifications</h2>
      {loading && <p className="text-muted">Loading…</p>}
      {!loading && certifications.length === 0 && (
        <p className="text-muted">No certifications content yet.</p>
      )}
      {certifications.length > 0 && (
        <ul className="mb-0">
          {certifications.map(item => (
            <li key={item.id} className="mb-3">
              <span className="fw-medium">{item.title}</span>
              {(item.issuer || item.year) && (
                <div className="text-secondary">
                  {item.issuer && <em>{item.issuer}</em>}
                  {item.issuer && item.year && ' · '}
                  {item.year}
                </div>
              )}
              {item.detail && <div className="text-secondary">{item.detail}</div>}
            </li>
          ))}
        </ul>
      )}
    </>
  );

  return (
    <div>

      {/* ===== About ===== */}
      {heroSrc ? (
        <HeroBand
          id="about"
          imageSrc={heroSrc}
          cfg={aboutCfg}
          anchorStyle={HERO_ANCHOR_OFFSET}
          ariaLabel={statement.heading ?? 'Portrait'}
        >
          {aboutText}
        </HeroBand>
      ) : (
        <section id="about" style={ANCHOR_OFFSET} className="my-5">
          <div className="row align-items-center g-5">
            <div className="col-12 col-md-6">
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
            </div>
            <div className="col-12 col-md-6">{aboutText}</div>
          </div>
        </section>
      )}

      {/* ===== Qualifications & Awards ===== */}
      {qualImg ? (
        <HeroBand
          id="qualifications"
          imageSrc={qualImg}
          cfg={qualCfg}
          flip
          anchorStyle={HERO_ANCHOR_OFFSET}
          ariaLabel="Qualifications & Awards"
        >
          {qualContent}
        </HeroBand>
      ) : (
        <section id="qualifications" style={ANCHOR_OFFSET} className="my-5 pt-4 border-top">
          {qualContent}
        </section>
      )}

      {/* ===== Certifications ===== */}
      {certImg ? (
        <HeroBand
          id="certifications"
          imageSrc={certImg}
          cfg={certCfg}
          anchorStyle={HERO_ANCHOR_OFFSET}
          ariaLabel="Certifications"
        >
          {certContent}
        </HeroBand>
      ) : (
        <section id="certifications" style={ANCHOR_OFFSET} className="my-5 pt-4 border-top">
          {certContent}
        </section>
      )}

      {/* ===== Projects ===== */}
      <section id="projects" style={ANCHOR_OFFSET} className="my-5 pt-4 border-top">
        <h2 className="mb-4">Projects</h2>

        {loading && <p className="text-muted">Loading…</p>}
        {!loading && projectItems.length === 0 && (
          <p className="text-muted">No projects content yet.</p>
        )}

        {projectItems.length > 0 && (
          <ul className="proj-scroller" role="list" ref={projScrollerRef}>
            {projectItems.map(p => {
              // Thumbnail URL is always resolved from the site_image table
              // (section "projects", description == image_tag or id).
              const thumb = assetUrl(pickImage(images, 'projects', p.image_tag ?? p.id));
              // Clickable only when there's a site_project row to show.
              const detail = projectDetailMap[p.id];
              const hasDetail = !!detail && typeof detail === 'object';
              const inner = (
                <>
                  {thumb ? (
                    <img className="proj-card__img" src={thumb} alt={p.label} loading="lazy" />
                  ) : (
                    <span className="proj-card__img proj-card__img--empty" aria-hidden="true" />
                  )}
                  <span className="proj-card__label">{p.label}</span>
                </>
              );
              return (
                <li key={p.id} className="proj-scroller__item">
                  {hasDetail ? (
                    <button
                      type="button"
                      className="proj-card proj-card--btn"
                      aria-haspopup="dialog"
                      onClick={() => openProjectSheet(p, detail as ProjectDetail)}
                    >
                      {inner}
                    </button>
                  ) : (
                    <div className="proj-card">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {projectItems.length > 1 && (
          <ProjectDots count={projectItems.length} scrollerRef={projScrollerRef} />
        )}
      </section>

      {/* ===== Journey ===== */}
      <section id="journey" style={ANCHOR_OFFSET} className="my-5 pt-4 border-top">
        <h2 className="mb-4">My Journey</h2>

        {loading && <p className="text-muted">Loading…</p>}
        {!loading && journey.length === 0 && (
          <p className="text-muted">No journey content yet.</p>
        )}

        {journey.length > 0 && (
          <ol className="jtl" role="list">
            {journey.map((block, i) => {
              const isNow = i === journey.length - 1;
              // Optional per-block image: `image_tag` names a site_image slot
              // (section "journey", description == image_tag). Its image_path
              // shows on the OPPOSITE side of the card. A "<placeholder>"-style
              // value, or no matching row, means no image.
              const tag = block.image_tag?.trim();
              const blockImg =
                tag && !/^<.*>$/.test(tag)
                  ? assetUrl(pickImage(images, 'journey', tag))
                  : undefined;
              // A block with a site_journey entry gets a clickable card that
              // opens the bottom sheet; otherwise the card is a plain <div>.
              const detail = journeyDetailMap[block.id];
              const hasDetail = !!detail && typeof detail === 'object';
              const cardInner = (
                <div className="jtl__card-inner">
                  {isNow && <span className="jtl__badge">Now</span>}
                  <p className="jtl__year">{block.year}</p>
                  <h3 className="jtl__title h5">{block.title}</h3>
                  {block.institution && <p className="jtl__org">{block.institution}</p>}
                  <Prose text={block.body} />
                  {hasDetail && (
                    <span className="jtl__more" aria-hidden="true">Read more →</span>
                  )}
                </div>
              );
              return (
                <li
                  key={block.id}
                  id={block.id}
                  style={ANCHOR_OFFSET}
                  className={
                    `jtl__item${isNow ? ' jtl__item--now' : ''}` +
                    `${blockImg ? ' jtl__item--has-img' : ''}`
                  }
                >
                  <span className="jtl__dot" aria-hidden="true" />
                  {hasDetail ? (
                    <button
                      type="button"
                      className="jtl__card jtl__card--btn"
                      aria-haspopup="dialog"
                      onClick={() => openJourneySheet(block, detail as JourneyDetail)}
                    >
                      {cardInner}
                    </button>
                  ) : (
                    <div className="jtl__card">{cardInner}</div>
                  )}
                  {blockImg && (
                    <div className="jtl__media">
                      <img src={blockImg} alt="" loading="lazy" />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* ===== Contact ===== */}
      <section id="contact" style={ANCHOR_OFFSET} className="my-5 pt-4 border-top">
        <h2 className="mb-4">Contact Me</h2>

        {loading && <p className="text-muted">Loading…</p>}
        {contact.intro && <p className="lead text-secondary lh-base">{contact.intro}</p>}

        {(contact.email || contact.location) && (
          <dl className="row">
            {contact.email && (
              <>
                <dt className="col-sm-3 col-lg-2">Email</dt>
                <dd className="col-sm-9">
                  <a href={`mailto:${contact.email}`}>{contact.email}</a>
                </dd>
              </>
            )}
            {contact.location && (
              <>
                <dt className="col-sm-3 col-lg-2">Location</dt>
                <dd className="col-sm-9">{contact.location}</dd>
              </>
            )}
          </dl>
        )}

        {contactLinks.length > 0 && (
          <div className="d-flex flex-wrap align-items-center gap-3 mt-3">
            {contactLinks.map(link => {
              const label = link.label?.toLowerCase() ?? '';
              const icon = /linked?in/.test(label)
                ? linkedinIcon
                : /github/.test(label)
                  ? githubIcon
                  : null;
              return icon ? (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-body-secondary d-inline-flex"
                  aria-label={link.label}
                >
                  <img src={icon} alt={link.label} width={28} height={28} />
                </a>
              ) : (
                <a key={link.href} href={link.href} target="_blank" rel="noreferrer">
                  {link.label}
                </a>
              );
            })}
          </div>
        )}

        {!loading && !contact.intro && !contact.email && !contact.location && contactLinks.length === 0 && (
          <p className="text-muted">No contact content yet.</p>
        )}
      </section>

      {/* Trailing spacer -- height is set by the useLayoutEffect above so
          "Contact Me" can scroll exactly to the anchor line with no extra
          dead scroll after it. */}
      <div className="section-tail" aria-hidden="true" ref={tailRef} />

      <JourneySheet
        open={sheetOpen}
        block={sheet?.block}
        detail={sheet?.detail}
        onClose={() => setSheetOpen(false)}
      />

      <ProjectSheet
        open={projectSheetOpen}
        data={projectSheet ?? undefined}
        onClose={() => setProjectSheetOpen(false)}
      />

    </div>
  );
}
