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
  baselineCrinkle: 0.12,

  // ---- marker ----
  /** Multiplier on the shared GESTURE_SCALE. */
  gestureScale: 0.75,
  /** One or two markers, no more. This is a page someone marked up. */
  strokeCount: 2,

  thicknessMin: 13,
  thicknessMax: 34,
  speedMin: 1.2,
  speedMax: 5.5,

  /** Translucent: the words must stay readable underneath. */
  alphaMin: 0.04,
  alphaMax: 0.24,

  /**
   * Pink family only. Cool violet-magenta at negative valence through to warm
   * coral at positive — real highlighters span this range, so it still reads as
   * one marker rather than two different pens. Exceeds 360 on purpose; the
   * renderer wraps it, which keeps the eased ramp continuous.
   */
  hueCool: 310,
  /**
   * Rose, not coral. 370 (=10) turned the warm end orange, which stopped
   * reading as a pink highlighter; 352 keeps the whole ramp inside pink.
   */
  hueWarm: 352,
  saturation: 92,
  lightness: 62,

  /**
   * Marks fade slowly. Not a preference — arithmetic: two 24px nibs travelling
   * ~3px per frame lay down ~144 px² per frame, which covers a 1280x800 page in
   * about two and a half minutes. Without a fade the page goes solid pink.
   * This holds marks for roughly a minute.
   */
  fadeRate: 0.006,

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
