/**
 * Tuned constants for the ink renderer, dialled in by hand on /tune.html.
 *
 * These are settled values, not guesses — change them from the tuning page and
 * copy the result back, rather than nudging them here.
 */

export const INK_PRESET = {
  // ---- paper ----
  /** Multiplier on the shared GRAIN_SCALE. */
  grainScale: 0.3,

  /**
   * Paper is never perfectly flat: an unworn sheet still has tooth. Wear scales
   * the remaining depth on top of this, so a calm session stays smooth without
   * looking like a blank render.
   */
  baselineCrinkle: 0.12,

  // ---- ink ----
  /** Multiplier on the shared GESTURE_SCALE. */
  gestureScale: 0.75,
  strokeCount: 3,
  lifetime: 770,
  opacity: 0.85,

  /**
   * Blue ink, not black. At 12 every hue collapsed into RGB 60-80 and the
   * valence channel was unreadable; at 30 the cold end reads as a real blue
   * pen and the warm end as sienna.
   */
  lightness: 30,

  /**
   * Small but non-zero. Zero made the canvas show hue *history* rather than the
   * present — old amber strokes never left, so the average sat mid-ramp no
   * matter what was being said. This still reads as an accumulating drawing
   * over minutes while letting old hues recede.
   */
  fadeRate: 0.0004,

  /** Pen never lifts at the tuned setting. */
  penLift: 0,

  followContours: true,

  // ---- hue ramp ----
  /**
   * Cold anchor is true blue rather than the teal the tuning pass landed on, so
   * negative valence reads blue and not green.
   */
  hueCold: 222,
  hueWarm: 38,
} as const;
