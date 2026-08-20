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
  lightness: 12,

  /**
   * Zero: strokes accumulate permanently, so the canvas reads as a drawing
   * rather than a live simulation. With only 3 pens this builds slowly, but a
   * long enough session will eventually silt up — raise to ~0.0005 if it does.
   */
  fadeRate: 0,

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
