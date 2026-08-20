/**
 * Tuned constants for the highlighter renderer.
 *
 * Adjust from /tune.html and copy the result back here, rather than nudging
 * these by hand.
 */

export const HIGHLIGHTER = {
  // ---- paper ----
  /**
   * Multiplier on the shared GRAIN_SCALE. Raised for a finer tooth that reads
   * as paper fibre rather than soft blotches.
   *
   * There is a ceiling: the paper renders to a quarter-resolution buffer and is
   * upscaled, so grain features finer than roughly 8 screen pixels are smoothed
   * away. At this value features land near 18px and survive the upscale.
   */
  grainScale: 0.55,
  /**
   * An unworn sheet still has tooth, and enough of it to be obvious. Wear
   * scales the remaining depth on top of this, so a calm session still looks
   * like paper rather than a blank render.
   */
  baselineCrinkle: 0.32,

  // ---- marker ----
  /** Multiplier on the shared GESTURE_SCALE. */
  gestureScale: 0.75,
  /**
   * One. Two nibs at this thickness and persistence drove the page to ~75%
   * coverage — nearly solid pink. Halving the deposit rate keeps the marks
   * long-lived without burying the paper, and a single stroke makes its own
   * gesture easier to read.
   */
  strokeCount: 1,

  /** Wide on purpose: nib width is one of the two most visible channels. */
  thicknessMin: 20,
  thicknessMax: 56,
  speedMin: 0.6,
  speedMax: 11,

  /**
   * Translucent at every setting — the words must stay readable underneath, and
   * an opaque marker would hide the thing it is marking. The range is wide so
   * confidence is obvious, but the ceiling stays well short of solid.
   */
  alphaMin: 0.03,
  alphaMax: 0.38,

  /**
   * One fixed pink. Valence drives the *gesture* now, not the colour, so the
   * marker never changes pen mid-page.
   */
  hue: 332,
  saturation: 92,
  lightness: 62,

  /**
   * Very slow, by request: marks are meant to stay on the page.
   *
   * Equilibrium coverage is roughly deposit divided by fade, and the nib
   * deposits `speed * thickness` px² per frame — so a thick nib and a slow fade
   * cannot both hold the page mostly clear. Measured on the demo script,
   * stepping frames in real time so arousal actually varies (marked page area):
   *
   *   0.0030 — ~10%, stable from 40s out past 220s.
   *   0.0010 — 51% at 22s, 72% at 44s; still climbing.
   *   0.0003 — 63% at 20s; keeps climbing.
   *
   * At this value the page becomes largely marked over a few minutes, which is
   * the intent: a document that gets progressively highlighted. Set 0.003 if a
   * mostly-clear page that holds indefinitely is wanted instead.
   */
  fadeRate: 0.0005,

  /** Frames drawn before first display, so the page is never blank. */
  seedSteps: 140,

  // ---- keywords on the page ----
  /** Most words held at once; the oldest is dropped past this. */
  maxKeywords: 26,
  fontSizeMin: 15,
  fontSizeMax: 44,
  /** Candidate positions tried per word, picking the least crowded. */
  placementTries: 12,
} as const;
