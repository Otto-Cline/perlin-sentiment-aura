/**
 * Tuned constants for the highlighter renderer.
 *
 * Adjust from /tune.html and copy the result back here, rather than nudging
 * these by hand.
 */

export const HIGHLIGHTER = {
  // ---- paper ----
  /** Multiplier on the shared GRAIN_SCALE. */
  grainScale: 0.3,
  /**
   * An unworn sheet still has tooth. Wear scales the remaining depth on top of
   * this, so a calm session stays smooth without looking like a blank render.
   */
  baselineCrinkle: 0.2,

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
   * A budget, not a taste knob. The nib deposits `speed * thickness` px² per
   * frame, so persistence and coverage are the same dial viewed twice.
   *
   * Measured on the demo script, marked page area over time:
   *   0.0012 — 27% at 10s, 61% at 40s, 88% at 100s: saturates to solid pink.
   *   0.0030 — ~10% and stable from 40s out past 220s.
   *
   * This is the slowest fade that still reaches an equilibrium instead of
   * filling the page. Going lower, or adding back a second nib, trades toward
   * solid pink; sustained maximum arousal pushes that way regardless.
   */
  fadeRate: 0.003,

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
