/**
 * Sentiment to highlighter.
 *
 * One translucent pink marker over a page of words. Every channel here is an
 * intensity or a gesture, so valence — the only categorical signal — rides a
 * narrow hue shift inside the pink family rather than a full colour ramp.
 */

import type { Analysis, ConnectionState } from "../types";
import { HIGHLIGHTER } from "./preset";

export interface HighlighterTargets {
  /** Degrees, may exceed 360; the renderer wraps it. */
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
  const warmth = clamp01((eased + 1) / 2);

  const arousal = clamp01(a.arousal);
  const certainty = clamp01(a.speaker_certainty);
  const confidence = clamp01(a.model_confidence);

  return {
    // Cool violet-magenta through to warm coral. Still one pink marker.
    hue: lerp(HIGHLIGHTER.hueCool, HIGHLIGHTER.hueWarm, warmth),
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

    // Conviction is a steady hand: a decisive speaker sweeps, a hedging one
    // wanders and jerks. Inverted, so high certainty means low sharpness.
    turnSharpness: 1 - certainty,

    // An unsure read barely marks the page.
    alpha: lerp(HIGHLIGHTER.alphaMin, HIGHLIGHTER.alphaMax, confidence),

    crinkle:
      HIGHLIGHTER.baselineCrinkle +
      (1 - HIGHLIGHTER.baselineCrinkle) * clamp01(wearCrinkle),
    temperature: 0.35 + warmth * 0.4,
  };
}
