import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useSiteContent, pickImage } from '../hooks/useSiteContent';
import { useMediaPrefetch } from '../hooks/useMediaPrefetch';
import { useDragScroll } from '../hooks/useDragScroll';
import { useRevealOnScroll } from '../hooks/useRevealOnScroll';
import { useActiveSection } from '../context/ActiveSectionContext';
import { assetUrl } from '../lib/assetUrl';
import { safeHref } from '../lib/safeHref';
import { rafThrottle } from '../lib/rafThrottle';
import Prose from '../components/Prose';
import ProjectDots from '../components/ProjectDots';
import TechChips from '../components/TechChips';
import SectionState from '../components/SectionState';
import CredentialList from '../components/CredentialList';
import ChatCta from '../components/ChatCta';
import BottomSheet from '../components/BottomSheet';
import ProjectSheet, { type ProjectSheetData } from './ProjectSheet';
import githubIcon from '../assets/icons/github.png';
import linkedinIcon from '../assets/icons/linkin.png';
import {
  type HeroOverrides,
  type HeroConfig,
  HERO_DEFAULTS,
  QUAL_HERO_DEFAULTS,
  heroVars,
  ANCHOR_OFFSET,
  HERO_ANCHOR_OFFSET,
  SCROLLSPY_LINE,
  SECTION_IDS,
} from '../lib/knobs';
import './Home.css';

interface SkillGroup {
  /** Shown as the row label, e.g. "Frontend". Carries the grouping —
   *  it is announced to assistive tech but not drawn, so the block stays
   *  a single compact row. */
  group: string;
  /**
   * @deprecated Ignored. The pills used to take one of five named
   * colours per group, which put up to five hues in a row three lines
   * from the top of the page; against the orange chat button, the
   * heading and the hero it was the loudest thing in the section and the
   * grouping it encoded was never reliable anyway (colours repeat once
   * there are more groups than hues). They now alternate between the two
   * brand colours. Kept on the type so existing site_content rows still
   * parse -- there is no need to rewrite them.
   */
  colour?: string;
  items: string[];
}

interface PersonalStatement {
  /** The site owner's name. Rendered as the page's one <h1>, above the
   *  title -- so the About section opens "who", then "what", then the bio. */
  owner?: string;
  /** Professional title / role, e.g. "Full-stack Engineer". Shown under
   *  the name. Superseded `heading`, which is still read as a fallback so
   *  a database row written before the rename keeps rendering. */
  title?: string;
  /** @deprecated Use `title`. Only read when `title` is absent. */
  heading?: string;
  body?: string;
  cta?: { label: string; href: string };
  /** Secondary action beside the chat CTA -- the CV. `href` is an S3 object
   *  key (resolved through assetUrl), not a URL, so the file lives with
   *  every other asset. Omit the key and no button renders. */
  resume?: { label?: string; key?: string };
  /** Skill pills under the role line, grouped. `colour` picks one of a
   *  fixed named set (see .skills__pill--* in Home.css); anything else
   *  falls back to slate, so a typo degrades instead of breaking. */
  skills?: SkillGroup[];
  hero?: HeroOverrides;      // About-section hero-band framing (see above)
  qualHero?: HeroOverrides;  // legacy: the Qualifications band no longer exists
  certHero?: HeroOverrides;  // Certification & Award banner framing
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
  /** Short summary shown on the card's hover reveal, meant as POINT FORM
   *  ("- one\n- two"). It lives here, on the site_content row, not in the
   *  site_project detail: the card wants a scannable list, the pop-up
   *  wants the fuller PARAGRAPH overview (ProjectSheetData.overview, from
   *  site_project). A project without this key falls back to that
   *  paragraph overview on the card, so an un-migrated row still shows
   *  something. */
  overview?: string;
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
  /** Caption for that photo, printed centred beneath it and read out in
   *  its place by a screen reader -- what it shows, not what it is called
   *  ("Graduating from QUT with my supervisor", not "qut_img"). Omit and
   *  the image is captionless and treated as decorative. */
  image_description?: string;
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
 * Aspect used until the real file has been measured, and if it never can
 * be (a broken URL). 1.4 because that is roughly what a landscape crop
 * framed for this band comes out at -- close enough that the first paint
 * is not visibly wrong.
 */
const HERO_ASPECT_FALLBACK = 1.4;

/**
 * Stands in for the aspect in 'cover' mode, where the photo fills the
 * whole band and its own proportions say nothing about how far right it
 * reaches. Any number large enough for the `min(..., 100%)` in
 * .hero-band to pin the reach to the full band.
 */
const HERO_ASPECT_COVER = 100;

/**
 * Authoring guidance for a band whose site_image row is missing, shown in
 * the empty image area. Deliberately NOT rendered while the fetch is in
 * flight: "no hero row configured" is a claim about the database, and
 * making it about a site that may well have one is the mistake
 * <SectionState> was fixed for.
 */
const HERO_IMAGE_PLACEHOLDER = (
  <div className="hero-band__empty">
    <i className="bi bi-image fs-1 d-block mb-2"></i>
    <p className="fw-medium mb-0">[ Hero Image Area ]</p>
    <small>Recommended: Portrait or Square layout</small>
  </div>
);

/**
 * Full-bleed image band with a page-background scrim over the text side.
 * Default: photo weighted left, text right. `flip` mirrors it (photo
 * right, text left) -- used by the Qualifications section.
 *
 * `imageSrc` is OPTIONAL, and the band is rendered whether or not there
 * is one yet. That is the whole point: the band's height comes from
 * `min-height: clamp(...)` and its own text, never from the photo, so an
 * image-less band occupies exactly the space the finished one will. Home
 * used to render a different element while the content fetch was in
 * flight and swap this in afterwards, which moved everything on the page
 * -- including the chat icon, which landed mid-screen and then jumped.
 * Now the photo simply arrives into a band that was already there.
 *
 * `placeholder` is authoring guidance for the settled "no image
 * configured" case. It renders INSIDE the image layer rather than in
 * place of the band, so even that state does not remount the section.
 */
function HeroBand({
  id,
  imageSrc,
  imageSrcSm,
  cfg,
  ariaLabel,
  children,
  flip = false,
  anchorStyle,
  placeholder,
}: {
  id: string;
  /** Undefined until the site content lands, or if no row supplies one. */
  imageSrc?: string;
  /** Narrow-screen variant. The band crops very differently once it
   *  stacks, so a separately-framed file can be supplied for it; falls
   *  back to `imageSrc` when there is only one. */
  imageSrcSm?: string;
  cfg: HeroConfig;
  ariaLabel: string;
  children: ReactNode;
  flip?: boolean;
  anchorStyle?: CSSProperties;
  /** Shown in the empty image area. Omit while still loading. */
  placeholder?: ReactNode;
}) {
  // The photo's real aspect ratio, measured from the file itself.
  //
  // In 'fitHeight' the photo is band-height tall and aspect-wide, so this
  // is the only thing that says where its right edge falls -- and the
  // scrim has to finish exactly there or the edge goes hard (see
  // `scrimFade` in knobs.ts). It is measured rather than configured
  // because a configured number goes stale silently: re-crop the file,
  // upload it over the same S3 key, and the framing breaks with nothing
  // in the codebase having changed.
  //
  // Costs no extra download -- same URL the CSS background uses, so this
  // is a cache hit -- and nothing waits on it: the fallback renders a
  // correct band until it resolves.
  const [aspect, setAspect] = useState<number | null>(null);
  useEffect(() => {
    if (!imageSrc) return;
    let cancelled = false;
    const probe = new Image();
    probe.onload = () => {
      if (!cancelled && probe.naturalHeight > 0) {
        setAspect(probe.naturalWidth / probe.naturalHeight);
      }
    };
    probe.src = imageSrc;
    return () => { cancelled = true; };
  }, [imageSrc]);

  const heroAspect = cfg.fit === 'cover'
    ? HERO_ASPECT_COVER
    : aspect ?? HERO_ASPECT_FALLBACK;

  return (
    <section
      id={id}
      style={{ ...anchorStyle, ...heroVars(cfg), '--hero-aspect': String(heroAspect) } as CSSProperties}
      className={`hero-band${flip ? ' hero-band--flip' : ''}`}
    >
      {/* Both URLs are handed to CSS as custom properties and a media query
          picks one (see .hero-band__img). It has to be done this way rather
          than with <img srcset>: the photo is a background, because the
          scrim and the feathered mask paint over it. Browsers download only
          the variant the matched rule actually uses.

          With no photo yet the properties are left unset -- `var()` with no
          fallback makes `background-image` compute to `none`, so nothing is
          requested -- and the layer paints a flat tint instead. It is also
          not called an image to assistive tech until it is one: announcing
          "portrait" over an empty box would be a lie, and the modifier
          class is what .hero-band__img--empty keys off. */}
      <div
        className={`hero-band__img${imageSrc ? '' : ' hero-band__img--empty'}`}
        role={imageSrc ? 'img' : undefined}
        aria-label={imageSrc ? ariaLabel : undefined}
        aria-hidden={imageSrc ? undefined : true}
        style={
          imageSrc
            ? ({
                '--hero-img': `url("${imageSrc}")`,
                '--hero-img-sm': `url("${imageSrcSm ?? imageSrc}")`,
              } as CSSProperties)
            : undefined
        }
      >
        {/* Only ever in the EMPTY layer. Guarded here rather than at the
            call site so a caller cannot print authoring guidance over a
            real photo by passing both. */}
        {imageSrc ? null : placeholder}
      </div>
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
 * the fallback title. The shell -- portal, backdrop, slide-up, Esc / close
 * button, body-scroll lock and scroll-reset-on-open -- lives in
 * <BottomSheet>; this component is only the content. The last block/detail
 * stay rendered after close so the panel doesn't blank as it slides away.
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
  // Owned here (rather than inside BottomSheet) only so a future feature
  // could measure this sheet's scroll area; BottomSheet attaches it and
  // handles the reset-to-top on open.
  const scrollRef = useRef<HTMLDivElement>(null);

  const title = detail?.heading ?? block?.title ?? '';
  const highlights = (detail?.highlights ?? []).filter(Boolean);
  const links = (detail?.links ?? []).filter(l => l && l.href);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      labelledBy="jsheet-title"
      scrollRef={scrollRef}
      panelClassName="jsheet__panel"
      barClassName="jsheet__bar"
      scrollClassName="jsheet__scroll"
    >
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
            {links.map((l, i) => {
              const href = safeHref(l.href);
              if (!href) return null;
              return /^https?:\/\//i.test(href) ? (
                <a
                  key={i}
                  className="btn btn-outline-primary btn-sm"
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                >
                  {l.label}
                </a>
              ) : (
                <NavLink key={i} className="btn btn-outline-primary btn-sm" to={href}>
                  {l.label}
                </NavLink>
              );
            })}
          </div>
        )}
      </div>
    </BottomSheet>
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
    // fit() both reads layout (scrollHeight, getBoundingClientRect) and
    // writes it (el.style.height) -- and it is driven by a ResizeObserver
    // on <body>, which its own write can re-trigger. The >1px guard stops
    // that becoming infinite; the frame latch stops it running more than
    // once per paint on the way there.
    const onResize = rafThrottle(fit);
    fit();
    window.addEventListener('resize', onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(document.body);
    return () => {
      onResize.cancel();
      window.removeEventListener('resize', onResize);
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
    // Five getElementById + five getBoundingClientRect + a scrollHeight
    // read, per event, plus a context write that re-renders the navbar --
    // batched to once per frame rather than once per scroll event.
    const onScroll = rafThrottle(update);
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      onScroll.cancel();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      setActiveSection(null);
    };
  }, [setActiveSection, loading]);

  // Fade each section in from transparent as it's scrolled to. Keyed on
  // `loading` for the same reason the scroll-spy is: content arriving
  // swaps some sections' nodes (plain <section> -> <HeroBand>), so the
  // observer has to be rebuilt against the new elements.
  useRevealOnScroll(SECTION_IDS, loading);

  const statement = (content.personal_statement ?? {}) as PersonalStatement;
  const ctaLabel = statement.cta?.label ?? 'Chat with my virtual persona';
  // Scheme-checked like every other content-supplied href, then defaulted.
  // This one feeds a <NavLink>, so a rejected value must fall back to the
  // real route rather than to nothing -- the chat entry point is the
  // section's whole purpose and must not be silently removable from the DB.
  const ctaHref = safeHref(statement.cta?.href) ?? '/chatroom';
  // Hero image -- like every image on the site -- comes only from the
  // site_image table (section "personal_statement").
  //
  // Two slots, because the band crops very differently once it stacks:
  // "hero_desk" is framed for the side-by-side layout, "hero_mob" for the
  // stacked one. Either may be absent and the other stands in -- a missing
  // hero_mob means phones get the desktop crop, which is degraded rather
  // than broken. (There was a third fallback here to the original single
  // "hero" slot; that slot no longer exists in the database, so it was
  // unreachable and has been removed.)
  const heroDesk = assetUrl(pickImage(images, 'personal_statement', 'hero_desk'));
  const heroMob = assetUrl(pickImage(images, 'personal_statement', 'hero_mob'));
  const heroSrc = heroDesk ?? heroMob;
  const heroSrcSm = heroMob ?? heroDesk;
  // Code defaults, overridable per deployment from personal_statement.hero.
  const aboutCfg: HeroConfig = { ...HERO_DEFAULTS, ...statement.hero };

  // Qualifications banner: mirror of the hero -- image solid on the RIGHT,
  // fading left; text on the left. Reads the site_image ('qualifications',
  // 'banner') slot; falls back to the plain section when unset. Framing
  // numbers live in lib/knobs.ts (QUAL_HERO_DEFAULTS).
  // The Certification & Award band is mirrored (image right), so it takes
  // the framing numbers the old Qualifications banner used -- those were
  // tuned for a right-anchored photo. Its image is the certifications one.
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
  // Mirrored band: start from the right-anchored numbers (qualCfg), then let
  // an explicit certHero row override. CERT_HERO_DEFAULTS is the image-left
  // framing this band no longer uses.
  const certCfg: HeroConfig = { ...qualCfg, ...statement.certHero };

  // Memoized: projectMediaUrls depends on this, and a fresh array each
  // render would make that memo recompute every time.
  const projectItems = useMemo(
    () => (Array.isArray(content.projects) ? content.projects : []) as Project[],
    [content.projects],
  );
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
    const out: string[] = [];
    for (const p of projectItems) {
      const first = projectDetailMap[p.id]?.videos?.[0];
      if (!first) continue;
      const src = first.src_tag ? assetUrl(pickImage(images, 'projects', first.src_tag)) : undefined;
      const poster = first.poster_tag ? assetUrl(pickImage(images, 'projects', first.poster_tag)) : undefined;
      if (src) out.push(src);
      if (poster) out.push(poster);
    }
    return out;
  }, [projectItems, projectDetailMap, images]);
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

  // Memoised so the empty fallback isn't a fresh [] on every render --
  // that identity feeds journeyIds below, and through it the reveal
  // observer's rebuild.
  const journey = useMemo(
    () => (Array.isArray(content.journey) ? content.journey : []) as JourneyBlock[],
    [content.journey],
  );
  // The timeline rows used to fade in individually as well, INSIDE the
  // whole-section fade above. Two reveals on one region read as repetitive
  // and delayed reading for no gain -- the rail already gives the rows a
  // strong order. The section fade alone now covers the timeline.
  // Expanded copy per block, keyed by block id (site_journey table). A block
  // with an entry here gets a clickable card that opens the bottom sheet.
  const journeyDetailMap = journeyDetails as Record<string, JourneyDetail | undefined>;
  const openJourneySheet = (block: JourneyBlock, detail: JourneyDetail) => {
    setSheet({ block, detail });
    setSheetOpen(true);
  };

  const contact = (content.contact ?? {}) as ContactInfo;
  const contactLinks = Array.isArray(contact.links) ? contact.links : [];

  // `title` replaced `heading`; fall back so a row written before the
  // rename still renders while the new one is being inserted.
  const aboutTitle = statement.title ?? statement.heading;
  const skillGroups = (statement.skills ?? []).filter(g => g?.group && g.items?.length);
  // The CV is an S3 key like every other asset, not a URL.
  const resumeUrl = assetUrl(statement.resume?.key);
  // The `qualifications` section now holds degrees only; they render inside
  // About. Awards and certificates share the `certifications` section.
  const education = qualifications;

  const aboutText = (
    <>
      {/* The owner's name is the page's only <h1> -- every section heading
          is an <h2>, so the document outline had no top level before this.
          The chat entry point sits beside it as the persona's own icon; it
          used to be a full-width button below the bio. */}
      <div className="about__namerow">
        {/* ALWAYS rendered. This is the page's only <h1>, and it used to be
            conditional on `owner` -- so a personal_statement row without
            that field (or a failed fetch) produced a document whose outline
            started at <h2>, with no top level at all. The fallback is the
            site's own name rather than a person's: inventing one would be
            worse than being generic, the same call PERSONA_NAME_FALLBACK
            makes in the chatroom. */}
        <h1 className="about__name">{statement.owner || 'Portfolio'}</h1>
        <ChatCta href={ctaHref} label={ctaLabel} />
      </div>
      {aboutTitle && <p className="about__title">{aboutTitle}</p>}

      {skillGroups.length > 0 && (
        <div className="skills">
          {skillGroups.map((g, gi) => (
            <Fragment key={g.group}>
              {/* The group name is announced but not drawn, so a screen
                  reader hears "Frontend: React, TypeScript" rather than an
                  undifferentiated list, while the row stays one compact
                  block instead of a small table. */}
              <span className="visually-hidden">{g.group}: </span>
              {/* One colour per GROUP, alternating between the two: the
                  whole group changes together, so the run of colour is
                  what shows you where one group ends and the next begins.
                  It reinforces the grouping without ever being the only
                  thing carrying it -- with two colours and more than two
                  groups they necessarily repeat, so a reader can see the
                  boundaries but not decode which group is which. That is
                  the label's job, and the label is always announced. */}
              {g.items.map(item => (
                <span
                  key={item}
                  className={`skills__pill skills__pill--${gi % 2 ? 'ink' : 'accent'}`}
                >
                  {item}
                </span>
              ))}
            </Fragment>
          ))}
        </div>
      )}

      <Prose text={statement.body} />

      {/* Education moved up from its own section: a degree belongs beside
          who you are, not in a separate band. The remaining awards and
          certificates live in "Certification & Award" below. */}
      {education.length > 0 && (
        <div className="about__education">
          <h2 className="about__eduhead">Education Qualification</h2>
          <CredentialList
            variant="list"
            items={education.map(q => ({
              id: q.id, title: q.title, org: q.institution, year: q.year, detail: q.detail,
            }))}
          />
        </div>
      )}

      {/* The chat action moved up beside the name (see <ChatCta>), so this
          row now carries the CV alone. Centred on phones, left from sm up. */}
      <div className="about__actions mt-4">
        {resumeUrl && (
          <a
            className="btn btn-outline-primary btn-lg px-4"
            href={resumeUrl}
            target="_blank"
            rel="noreferrer"
          >
            {statement.resume?.label ?? 'Download CV'}
          </a>
        )}
      </div>
    </>
  );

  // "Certification & Award" -- one section where there were two bands.
  // Reads the `certifications` section ONLY. (An earlier version also
  // appended non-degree entries left behind in `qualifications`; that was
  // removed, but the comment describing it was not, so this read as though
  // a mid-migration database were handled here. It is not: everything in
  // `qualifications` renders under Education in About, via `education`
  // below. Move awards to `certifications` to have them appear here.)
  const awards = certifications.map(c => ({
    id: c.id, title: c.title, org: c.issuer, year: c.year, detail: c.detail,
  }));

  const certContent = (
    <>
      <h2 className="mb-4">Certification &amp; Award</h2>
      <SectionState loading={loading} empty={awards.length === 0 && !qBody} noun="certification" />
      {qBody && <Prose text={qBody} />}
      <CredentialList items={awards} />
    </>
  );

  return (
    <div>

      {/* ===== About =====
           ALWAYS a <HeroBand>, photo or no photo. Rendering something
           else while the fetch is in flight and swapping this in
           afterwards moved the entire page at the moment the content
           landed, and destroyed the <ChatCta> node that <ChatLauncher>
           watches -- which is why that component needed a MutationObserver
           to keep working. Keep this unconditional: anything that makes
           the About section mount a different element mid-load brings
           both problems back. */}
      <HeroBand
        id="about"
        imageSrc={heroSrc}
        imageSrcSm={heroSrcSm}
        cfg={aboutCfg}
        anchorStyle={HERO_ANCHOR_OFFSET}
        ariaLabel={statement.owner ? `${statement.owner} — portrait` : 'Portrait'}
        placeholder={loading ? undefined : HERO_IMAGE_PLACEHOLDER}
      >
        {aboutText}
      </HeroBand>

      {/* ===== Certification & Award =====
           One band where there were two. It keeps the Certifications
           image and the mirrored (image-right) layout the Qualifications
           band used, so the page still alternates sides against About
           instead of repeating the same composition twice in a row. */}
      <HeroBand
        id="certifications"
        imageSrc={certImg}
        cfg={certCfg}
        flip
        anchorStyle={HERO_ANCHOR_OFFSET}
        ariaLabel="Certification & Award"
        placeholder={loading ? undefined : HERO_IMAGE_PLACEHOLDER}
      >
        {certContent}
      </HeroBand>

      {/* ===== Projects ===== */}
      <section id="projects" style={ANCHOR_OFFSET} className="my-5 pt-4 border-top">
        <h2 className="mb-4">Projects</h2>

        <SectionState loading={loading} empty={projectItems.length === 0} noun="projects" />

        {projectItems.length > 0 && (
          <ul className="proj-scroller" role="list" ref={projScrollerRef}>
            {projectItems.map(p => {
              // Thumbnail URL is always resolved from the site_image table
              // (section "projects", description == image_tag or id).
              const thumb = assetUrl(pickImage(images, 'projects', p.image_tag ?? p.id));
              // Clickable only when there's a site_project row to show.
              const detail = projectDetailMap[p.id];
              const hasDetail = !!detail && typeof detail === 'object';
              // The tech chips are surfaced from the already-fetched
              // site_project detail row. The card's overview is its OWN
              // site_content field (a short bullet list); it only falls
              // back to the detail row's paragraph overview for a project
              // that has not been given a card summary yet.
              const tech = (detail as ProjectDetail | undefined)?.technologies ?? [];
              const cardOverview = p.overview ?? (detail as ProjectDetail | undefined)?.overview;
              const inner = (
                <>
                  <span className="proj-card__frame">
                    {thumb ? (
                      <img className="proj-card__img" src={thumb} alt={p.label} loading="lazy" />
                    ) : (
                      <span className="proj-card__img proj-card__img--empty" aria-hidden="true" />
                    )}
                    {/* Overview on hover/focus. aria-hidden: the pop-up this
                        card opens covers the same ground in more detail, so
                        announcing this too adds nothing. Rendered through
                        <Prose>, so the point-form summary shows as bullets
                        rather than literal "- " lines. */}
                    {cardOverview && (
                      <span className="proj-card__reveal" aria-hidden="true">
                        <span className="proj-card__overview">
                          <Prose text={cardOverview} />
                        </span>
                      </span>
                    )}
                  </span>
                  <span className="proj-card__label">{p.label}</span>
                  {tech.length > 0 && <TechChips items={tech} />}
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

        <SectionState loading={loading} empty={journey.length === 0} noun="journey" />

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
                    // <figure>, because the description is now printed
                    // under the photo rather than only handed to a screen
                    // reader -- a caption is what that element is for.
                    <figure className="jtl__media">
                      {/* alt="" and NOT the description: the <figcaption>
                          below is already in the accessibility tree, so
                          repeating it here would announce the same
                          sentence twice in a row. With no description
                          set, the photo stays decorative rather than
                          announcing a meaningless filename. */}
                      <img src={blockImg} alt="" loading="lazy" />
                      {block.image_description && (
                        <figcaption className="jtl__caption">
                          {block.image_description}
                        </figcaption>
                      )}
                    </figure>
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

        <SectionState
          loading={loading}
          empty={!contact.intro && !contact.email && !contact.location && contactLinks.length === 0}
          noun="contact"
        />
        {contact.intro && <p className="lead">{contact.intro}</p>}

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
            {contactLinks.map((link, i) => {
              const label = link.label?.toLowerCase() ?? '';
              const icon = /linked?in/.test(label)
                ? linkedinIcon
                : /github/.test(label)
                  ? githubIcon
                  : null;
              // Scheme-checked before it reaches the DOM (see lib/safeHref).
              // An unusable href renders as plain text rather than a link.
              const href = safeHref(link.href);
              if (!href) {
                return <span key={i} className="text-muted">{link.label}</span>;
              }
              // Index key, not link.href: the href comes from content and is
              // not guaranteed unique (or present). A duplicate key is silent
              // in a production build -- React strips that warning -- so it
              // would have surfaced as a reconciliation bug, not a message.
              return icon ? (
                <a
                  key={i}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="social"
                  aria-label={link.label}
                >
                  {/* alt="" -- the <a> already carries the name via
                      aria-label, so a described image would say it twice.
                      The marks are the official ones but have different
                      silhouettes (GitHub a circle, LinkedIn a rounded
                      square); the .social frame gives them a shared one. */}
                  <img src={icon} alt="" aria-hidden="true" />
                </a>
              ) : (
                <a key={i} href={href} target="_blank" rel="noreferrer">
                  {link.label}
                </a>
              );
            })}
          </div>
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
