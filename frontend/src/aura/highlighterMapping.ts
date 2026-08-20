/**
 * Sentiment to highlighter.
 *
 * One translucent pink marker over a page of words. The pen never changes
 * colour: hue and saturation are fixed, and the only thing sentiment does to
 * the ink itself is set how heavily it marks the page.
 *
 * `speaker_certainty` is deliberately unmapped. Valence carries the gesture
 * instead, which keeps three strong channels rather than four weak ones.
 */

import type { Analysis, ConnectionState } from "../types";
import { HIGHLIGHTER } from "./preset";

export interface HighlighterTargets {
  /** Degrees. Fixed by the preset — sentiment never changes the pen's colour. */
  hue: number;
  saturation: number;
  lightness: number;
  /** Per-stroke alpha. Low — this is a translucent marker. */
  alpha: number;
  /** Nib width in pixels. */
  thickness: number;
  /** Pixels travelled per frame. */
  speed: number;
  /** [0, 1]. 0 = long smooth sweeps, 1 = abrupt erratic turns. */
  turnSharpness: number;
  /** Paper crinkle depth, from cumulative wear. */
  crinkle: number;
  /** Paper warmth. */
  temperature: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const clampSigned = (v: number) => Math.min(1, Math.max(-1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Eased so the midband stays narrow, as in the previous renderers. */
const VALENCE_EASE = 0.55;

/** A degraded connection reads as a weaker, slower marker. */
const CONNECTION_DAMPING: Record<
  ConnectionState,
  { saturation: number; speed: number }
> = {
  idle: { saturation: 0.55, speed: 0.5 },
  connecting: { saturation: 0.5, speed: 0.45 },
  live: { saturation: 1, speed: 1 },
  reconnecting: { saturation: 0.3, speed: 0.35 },
  error: { saturation: 0.15, speed: 0.25 },
};

export function mapHighlighter(
  a: Analysis,
  connection: ConnectionState,
  wearCrinkle: number,
): HighlighterTargets {
  const damping = CONNECTION_DAMPING[connection];

  const valence = clampSigned(a.valence);
  const eased = Math.sign(valence) * Math.abs(valence) ** VALENCE_EASE;
  const pleasantness = clamp01((eased + 1) / 2);

  const arousal = clamp01(a.arousal);
  const confidence = clamp01(a.model_confidence);

  return {
    // Fixed. Only the connection state may drain the colour, and that is an
    // error signal rather than sentiment.
    hue: HIGHLIGHTER.hue,
    saturation: HIGHLIGHTER.saturation * damping.saturation,
    lightness: HIGHLIGHTER.lightness,

    // Energy is a fast, broad mark.
    speed: lerp(HIGHLIGHTER.speedMin, HIGHLIGHTER.speedMax, arousal) *
      damping.speed,
    thickness: lerp(
      HIGHLIGHTER.thicknessMin,
      HIGHLIGHTER.thicknessMax,
      arousal,
    ),

    // Valence is the gesture. Something pleasant sweeps in long calm arcs;
    // something unpleasant turns sharply and jerks. Eased, so a moderately
    // negative reading already looks agitated rather than merely tilted.
    turnSharpness: 1 - pleasantness,

    // The only thing confidence touches. An unsure read barely marks the page.
    alpha: lerp(HIGHLIGHTER.alphaMin, HIGHLIGHTER.alphaMax, confidence),

    crinkle:
      HIGHLIGHTER.baselineCrinkle +
      (1 - HIGHLIGHTER.baselineCrinkle) * clamp01(wearCrinkle),
    // Paper warmth still leans with valence; it is paper, not ink.
    temperature: 0.35 + pleasantness * 0.4,
  };
}
