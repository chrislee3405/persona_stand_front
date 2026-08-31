import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import Nav from 'react-bootstrap/Nav';
import { useSiteContent, pickImage } from '../hooks/useSiteContent';
import { useActiveSection } from '../context/ActiveSectionContext';
import { assetUrl } from '../lib/assetUrl';
import './Home.css';

const SECTION_IDS = ['about', 'qualifications', 'certifications', 'journey'] as const;

/** Optional hero-framing overrides, all numbers. Any subset may be set on
 *  the personal_statement row's `hero` key to re-frame the photo from the
 *  database without a frontend redeploy; unset fields use HERO_DEFAULTS. */
interface HeroOverrides {
  fit?: 'cover' | 'fitHeight'; // how the photo sizes into the band (see below)
  heightMin?: number;  // px  - hard floor on the hero band height
  height?: number;     // vw  - preferred band height, as % of viewport WIDTH
  heightMax?: number;  // px  - hard ceiling
  focusX?: number;     // %   - object-position X (0 left .. 100 right)
  focusY?: number;     // %   - object-position Y (0 top .. 100 bottom)
  zoom?: number;       // >=1 - push into the focus point
  scrimStart?: number; // %   - hero width where the page-bg scrim starts
  scrimEnd?: number;   // %   - hero width where it's fully page-bg
  textWidth?: number;  // %   - text column width on the right
  mobileFocusX?: number; // % - backdrop horizontal slice at <= 900px
  tinyFocusX?: number;   // % - backdrop horizontal slice at <= 480px
}

interface PersonalStatement {
  heading?: string;
  body?: string;
  cta?: { label: string; href: string };
  hero?: HeroOverrides;      // About-section hero-band framing (see above)
  qualHero?: HeroOverrides;  // Qualifications-section banner framing (mirror: image right)
  certHero?: HeroOverrides;  // Certifications-section banner framing (image left, like About)
  heroImage?: string;       // LEGACY: S3 key inline in the section JSON.
                            // Images now live in the site_image table --
                            // read via `images` / pickImage(). Kept only as
                            // a fallback for rows written before that table.
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
 * ─── About-section hero controls ────────────────────────────────────
 * The hero is a fixed, height-CLAMPED band sitting flush under the
 * sticky navbar (no layout shift -- the band's height is explicit and
 * image-independent). `fit` chooses how the photo sizes into it:
 * 'cover' fills the band and crops; 'fitHeight' shows the whole photo at
 * full height on the left and leaves the right as page background.
 * `focusX/focusY` frame the photo; `zoom` pushes in. A page-background
 * scrim on the right (`scrimStart`..`scrimEnd`, auto-capped to the text
 * column) GUARANTEES the text sits on a clean background no matter the
 * photo or the other values.
 *
 * Every knob is a plain number and every one is overridable per
 * deployment from the personal_statement row's `hero` key
 * (HeroOverrides) -- framing can change from the database, no redeploy.
 */
const HERO_DEFAULTS = {
  /** How the photo sizes into the band:
   *  'cover'     - fill the whole band; crop top/bottom (or sides) to do it.
   *                Uses focusX/focusY to choose which part survives.
   *  'fitHeight' - show the photo's FULL height, uncropped; its width is
   *                whatever the aspect gives, so it only covers the LEFT
   *                part of the band and the rest is page background (fine --
   *                the text lives there). focusY then does nothing; focusX
   *                slides the whole photo left<->right in the band. */
  fit: 'fitHeight' as 'cover' | 'fitHeight',

  /** Band height, as `clamp(heightMin, height, heightMax)`.
   *  `height` is a percent of the viewport WIDTH (vw), not height -- so the
   *  band keeps a constant shape across screens of the same aspect ratio
   *  regardless of resolution, and in 'fitHeight' mode the photo stays a
   *  stable fraction of the screen width relative to the text.
   *  `heightMin` / `heightMax` are px bounds that cap the extremes.
   *  In 'fitHeight' mode the band height also sets the photo WIDTH
   *  (width = height x photo-aspect), so keep heightMax modest or the photo
   *  grows wide enough to reach the text on big screens.
   *  height    UP -> taller band / wider photo.
   *  heightMax UP -> allows a bigger band before the px ceiling bites. */
  height: 40,
  heightMin: 420,
  heightMax: 900,

  /** Which point of the photo stays framed as the band crops it, in %
   *  (CSS background-position: it aligns THIS point of the photo with the
   *  same point of the band). 50/50 = photo centre pinned to band centre,
   *  so whatever a given screen's aspect ratio crops, it comes off both
   *  sides evenly and a centred subject stays put on every screen. Move
   *  away from 50 only if the subject genuinely sits off-centre.
   *  focusX  DOWN -> keep more of the LEFT;  UP -> more of the right.
   *          In 'fitHeight' mode the photo is narrower than the band, so
   *          focusX just positions it: 0 = flush LEFT (leaves the right for
   *          text), 50 = centred, 100 = flush right.
   *  focusY  DOWN -> keep more HEADROOM (top); UP -> more torso (bottom).
   *          ('fitHeight' shows the whole height, so focusY does nothing.) */
  focusX: 0,
  focusY: 15,

  /** Zoom toward the focus point. 1 = widest (cover, no extra crop);
   *  >1 pushes in -- hides the photo's outer edges, subject bigger. Values
   *  below 1 are clamped to 1 (they would expose empty gaps).
   *  Only applies in 'cover' mode. In 'fitHeight' it is IGNORED (forced to
   *  1), because scaling there also widens the photo -- pushing the right
   *  side back under the text; size the fitHeight photo with `height`.
   *  NOTE: on a wide band, `cover` already shows the photo's full width at
   *  zoom 1, so `focusX` only bites once zoom > 1 creates horizontal slack.
   *  UP -> tighter on the subject.  DOWN -> more of the scene. */
  zoom: 1.0,

  /** Right-side page-background scrim, as % of the hero's own width. The
   *  photo shows untouched up to `scrimStart`, then the page background
   *  paints over it, fully opaque by `scrimEnd`. `scrimEnd` is auto-capped
   *  to the text column's left edge (100 - textWidth), so the text is
   *  ALWAYS on a clean background whatever you set here.
   *  scrimStart DOWN -> background reaches further left (photo quieter).
   *  scrimEnd   DOWN -> sharper hand-off;  UP -> softer, longer blend. */
  scrimStart: 44,
  scrimEnd: 58,

  /** Text column width on the right, % of the page container. Also the
   *  hard right limit the scrim can reach.
   *  UP -> wider text block, starts further left.  DOWN -> narrower. */
  textWidth: 40,

  /** NARROW screens only. Below 900px the layout stacks: the photo becomes
   *  a faint full-height backdrop that's wider than the viewport, so this
   *  picks which horizontal slice shows (background-position X, %).
   *  mobileFocusX -> <= 900px.   tinyFocusX -> <= 480px (phones).
   *  DOWN -> shift the visible slice LEFT (you sit centre-left of the
   *  photo, so ~20-30 keeps your face in view).  UP -> shift right. */
  mobileFocusX: 30,
  tinyFocusX: 20,
};

type HeroConfig = typeof HERO_DEFAULTS;

/** Resolved hero config -> inline CSS custom properties for the <section>. */
function heroVars(c: HeroConfig): CSSProperties {
  // The scrim may never finish to the right of where the text begins.
  const scrimEnd = Math.min(c.scrimEnd, 100 - c.textWidth);
  const scrimStart = Math.min(c.scrimStart, scrimEnd - 1);
  return {
    '--hero-bg-size': c.fit === 'fitHeight' ? 'auto 100%' : 'cover',
    '--hero-h': `${c.height}vw`,
    '--hero-h-min': `${c.heightMin}px`,
    '--hero-h-max': `${c.heightMax}px`,
    '--hero-focus-x': `${c.focusX}%`,
    '--hero-focus-y': `${c.focusY}%`,
    // zoom only makes sense for 'cover'; in 'fitHeight' it would re-widen
    // the photo back under the text, so force it to 1 there.
    '--hero-zoom': c.fit === 'fitHeight' ? '1' : String(Math.max(1, c.zoom)),
    '--hero-scrim-start': `${scrimStart}%`,
    '--hero-scrim-end': `${scrimEnd}%`,
    '--hero-text-width': `${c.textWidth}%`,
    '--hero-mobile-focus-x': `${c.mobileFocusX}%`,
    '--hero-tiny-focus-x': `${c.tinyFocusX}%`,
  } as CSSProperties;
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
 * Renders body text stored as a single string, splitting on blank lines so
 * "\n\n" in the content becomes real paragraphs instead of collapsed
 * whitespace.
 */
function Prose({ text }: { text?: string }) {
  const paragraphs = (text ?? '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) return null;
  return (
    <>
      {paragraphs.map((para, i) => (
        <p key={i} className="lead text-secondary lh-base">{para}</p>
      ))}
    </>
  );
}

/**
 * Single scrolling landing page. About / Qualifications & Awards /
 * Certifications / Journey are <section>s with anchor ids ("about",
 * "qualifications", "certifications", "journey"); the navbar links scroll to
 * them instead of routing to separate pages.
 */
export default function Home() {
  const { content, images, loading } = useSiteContent();
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

  // Scroll-spy: highlight the section whose top has passed a line just
  // below the sticky navbar. Scroll-position based (not IntersectionObserver
  // on a thin band) so it (a) always resolves to exactly one section in
  // BOTH scroll directions, and (b) re-queries the DOM every tick, so it
  // survives sections swapping nodes when content loads (plain <section>
  // -> <HeroBand>). Re-runs on `loading` to set the right initial pill.
  useEffect(() => {
    // "You are here" line: navbar height (~72px) + a little breathing room.
    const LINE = 110;
    const update = () => {
      let current: string = SECTION_IDS[0];
      for (const id of SECTION_IDS) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top - LINE <= 0) current = id;
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
  // Hero image comes from the site_image table (slot "hero"); fall back to
  // the legacy heroImage key for personal_statement rows written before it.
  const heroSrc = assetUrl(pickImage(images, 'personal_statement', 'hero') ?? statement.heroImage);
  // Code defaults, overridable per deployment from personal_statement.hero.
  const aboutCfg: HeroConfig = { ...HERO_DEFAULTS, ...statement.hero };

  // Qualifications banner: mirror of the hero -- image solid on the RIGHT,
  // fading left; text on the left. Reads the site_image ('qualifications',
  // 'banner') slot; falls back to the plain section when unset.
  const qualImg = assetUrl(pickImage(images, 'qualifications', 'banner'));
  const qualCfg: HeroConfig = {
    ...HERO_DEFAULTS,
    focusX: 100,      // photo anchored to the right edge (subject is far right)
    textWidth: 56,    // wide text column -- ok for the scrim to cover more of
    scrimStart: 26,   // the photo's left/centre since the subject sits far right
    scrimEnd: 46,
    ...statement.qualHero,
  };

  const qRaw = content.qualifications;
  const qualifications = (Array.isArray(qRaw) ? qRaw : []) as Qualification[];
  const qBody = !Array.isArray(qRaw) && qRaw && typeof qRaw === 'object'
    ? (qRaw as { body?: string }).body
    : undefined;

  const certifications = (Array.isArray(content.certifications) ? content.certifications : []) as Certification[];

  // Certifications banner: same orientation as the hero (image left, text
  // right) for an alternating rhythm with the flipped Qualifications band.
  // Reads the site_image ('certifications', 'banner') slot.
  const certImg = assetUrl(pickImage(images, 'certifications', 'banner'));
  const certCfg: HeroConfig = { ...HERO_DEFAULTS, ...statement.certHero };

  const journey = (Array.isArray(content.journey) ? content.journey : []) as JourneyBlock[];

  const aboutText = (
    <>
      {statement.heading && <h2 className="mb-3">{statement.heading}</h2>}
      <Prose text={statement.body} />
      <div className="mt-4">
        <button className="btn btn-primary btn-lg px-4 shadow-sm">
          <Nav.Link as={NavLink} to={ctaHref}>{ctaLabel}</Nav.Link>
        </button>
      </div>
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

  return (
    <div>

      {/* ===== About ===== */}
      {heroSrc ? (
        <HeroBand
          id="about"
          imageSrc={heroSrc}
          cfg={aboutCfg}
          anchorStyle={anchorOffset}
          ariaLabel={statement.heading ?? 'Portrait'}
        >
          {aboutText}
        </HeroBand>
      ) : (
        <section id="about" style={anchorOffset} className="my-5">
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
          anchorStyle={anchorOffset}
          ariaLabel="Qualifications & Awards"
        >
          {qualContent}
        </HeroBand>
      ) : (
        <section id="qualifications" style={anchorOffset} className="my-5 pt-4 border-top">
          {qualContent}
        </section>
      )}

      {/* ===== Certifications ===== */}
      {certImg ? (
        <HeroBand
          id="certifications"
          imageSrc={certImg}
          cfg={certCfg}
          anchorStyle={anchorOffset}
          ariaLabel="Certifications"
        >
          {certContent}
        </HeroBand>
      ) : (
        <section id="certifications" style={anchorOffset} className="my-5 pt-4 border-top">
          {certContent}
        </section>
      )}

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
            <Prose text={block.body} />
          </div>
        ))}
      </section>

    </div>
  );
}
