import type { CSSProperties } from 'react';

/**
 * ═══ Frontend adjustment knobs ═════════════════════════════════════
 * The single place for tunable presentation numbers. Nothing here is
 * logic -- just values a maintainer might nudge for feel/fit. Sections:
 *   1. Hero / banner framing   (Home.tsx)
 *   2. Home page layout        (Home.tsx)
 *   3. Chatroom typing feel    (hooks/useChatDispatch.ts)
 * (Purely-CSS knobs stay as custom properties in the .css files:
 *  --jtl-* (journey timeline) and --psheet-* (project pop-up size) in
 *  Home.css, etc.)
 * ═════════════════════════════════════════════════════════════════════
 */

/* ───────────────────────── 1. Hero / banner framing ─────────────────
 * Every tunable number for the full-bleed image bands (About hero, and
 * the Qualifications / Certifications banners) so Home.tsx can stay
 * about layout, not framing math.
 *
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
 * deployment from the personal_statement row's `hero` / `qualHero` /
 * `certHero` key (HeroOverrides) -- framing can change from the
 * database, no redeploy.
 */

/** Optional hero-framing overrides, all numbers. Any subset may be set on
 *  the personal_statement row's `hero` key to re-frame the photo from the
 *  database without a frontend redeploy; unset fields use HERO_DEFAULTS. */
export interface HeroOverrides {
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

/** About-section hero defaults. Merge a HeroOverrides subset over this. */
export const HERO_DEFAULTS = {
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

export type HeroConfig = typeof HERO_DEFAULTS;

/** Qualifications banner: a MIRROR of the hero -- image solid on the RIGHT,
 *  fading left; text on the left. The subject sits far right, so anchor the
 *  photo to the right edge and let the scrim cover more of its left/centre.
 *  (The mirror itself is `flip` on <HeroBand>; these are just the numbers.) */
export const QUAL_HERO_DEFAULTS: HeroConfig = {
  ...HERO_DEFAULTS,
  focusX: 100,     // photo anchored to the right edge (subject is far right)
  textWidth: 56,   // wide text column -- ok for the scrim to cover more of
  scrimStart: 26,  // the photo's left/centre since the subject sits far right
  scrimEnd: 46,
};

/** Certifications banner: same orientation as the hero (image left, text
 *  right) for an alternating rhythm with the flipped Qualifications band --
 *  so it just uses HERO_DEFAULTS. Exported as its own name so a future
 *  tweak has an obvious home. */
export const CERT_HERO_DEFAULTS: HeroConfig = { ...HERO_DEFAULTS };

/** Resolved hero config -> inline CSS custom properties for the <section>. */
export function heroVars(c: HeroConfig): CSSProperties {
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

/* ───────────────────────── 2. Home page layout ─────────────────────
 * Scroll positioning for the single-page Home. */

/** Applied as `scroll-margin-top` on every anchored section so its heading
 *  clears the sticky navbar when scrolled to via `/#id`. Roughly navbar
 *  height + a little breathing room. */
export const ANCHOR_OFFSET = { scrollMarginTop: '5.5rem' } as const;

/** Scroll-spy "you are here" line, px from the top of the viewport: a
 *  section lights up in the navbar once its top crosses this. Keep it a bit
 *  below the sticky navbar (~72px) so the switch happens as a heading
 *  tucks under it, not before it reaches it. */
export const SCROLLSPY_LINE = 110;

/* ───────────────────────── 3. Chatroom typing feel ────────────────
 * The persona's reply is revealed turn-by-turn on a delay, so it reads
 * like someone typing rather than a wall of text appearing at once.
 * Frontend-only -- no backend impact. (The backend-contract mirrors
 * MAX_MESSAGE_LENGTH / MAX_PENDING_MESSAGES stay in useChatDispatch.ts:
 * those must track the server, they are not free to tune.) */

/** Per-turn reveal delay = textLength * this, then clamped to
 *  [TYPING_MIN_MS, TYPING_MAX_MS]. UP -> slower "typing". */
export const TYPING_MS_PER_CHAR = 40;
export const TYPING_MIN_MS = 400;
export const TYPING_MAX_MS = 3000;

/** +/- this fraction of the base delay, randomized per turn -- a perfectly
 *  deterministic length-proportional delay feels robotic; real typing
 *  speed varies turn to turn. */
export const TYPING_JITTER_RATIO = 0.25;

/** Rapid-fire fragment batching. A submitted message is held briefly
 *  before dispatch in case the user is breaking one thought into several
 *  quick bubbles; pieces sent during the window are concatenated into one
 *  backend turn.
 *  INITIAL_HOLD_MS: grace window right after a submit, input still empty.
 *  TYPING_IDLE_MS:  once a follow-up is being typed, how long typing must
 *                   be idle before the held pieces flush. Reset per keystroke. */
export const INITIAL_HOLD_MS = 1500;
export const TYPING_IDLE_MS = 5000;
