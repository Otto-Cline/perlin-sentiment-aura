/**
 * Sentiment to ink and paper, for the ink renderer.
 *
 * Pure: takes an analysis, a connection state and cumulative wear, returns the
 * targets the renderer eases toward. Same role mapping.ts plays for the streams
 * renderer, but a different mapping — certainty drives stroke commitment here
 * rather than field coherence.
 */

import type { Analysis, ConnectionState } from "../types";
import { INK_PRESET } from "./preset";

export interface InkTargets {
  hue: number;
  saturation: number;
  lightness: number;
  opacity: number;
  speed: number;
  jitter: number;
  commitment: number;
  penLift: number;
  crinkle: number;
  temperature: number;
}

/** Eased before crossing the hue ramp, so green stays a narrow midband. */
const VALENCE_EASE = 0.55;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const clampSigned = (v: number) => Math.min(1, Math.max(-1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A degraded connection reads as weaker, slower ink — not as a toast. */
const CONNECTION_DAMPING: Record<
  ConnectionState,
  { saturation: number; speed: number }
> = {
  idle: { saturation: 0.6, speed: 0.5 },
  connecting: { saturation: 0.55, speed: 0.45 },
  live: { saturation: 1, speed: 1 },
  reconnecting: { saturation: 0.25, speed: 0.35 },
  error: { saturation: 0.15, speed: 0.25 },
};

export function mapInk(
  a: Analysis,
  connection: ConnectionState,
  wearCrinkle: number,
): InkTargets {
  const damping = CONNECTION_DAMPING[connection];

  const valence = clampSigned(a.valence);
  const eased = Math.sign(valence) * Math.abs(valence) ** VALENCE_EASE;
  const warmth = clamp01((eased + 1) / 2);

  const arousal = clamp01(a.arousal);
  const certainty = clamp01(a.speaker_certainty);
  const confidence = clamp01(a.model_confidence);

  // Every range below is deliberately wide. Narrower ranges were technically
  // correct but read as one continuous texture in motion — the mapping has to
  // be obvious at a glance while the transcript is also moving.
  return {
    hue: lerp(INK_PRESET.hueCold, INK_PRESET.hueWarm, warmth),
    saturation: lerp(14, 95, confidence) * damping.saturation,
    lightness: INK_PRESET.lightness,

    // Confidence thins the ink and lifts the pen far more often — an unsure
    // read leaves a broken, pale line.
    opacity: INK_PRESET.opacity * lerp(0.1, 1, confidence),
    penLift: INK_PRESET.penLift + (1 - confidence) * 0.018,

    // Arousal is travel speed and an unsteadier hand. The top of the speed
    // range also runs the stroke thin, so fast and calm look different twice.
    speed: lerp(0.35, 7, arousal) * damping.speed,
    jitter: lerp(0.04, 1.5, arousal),

    // Certainty is commitment: high draws one clean line, low re-sketches.
    commitment: certainty,

    // Paper shows the whole session; ink shows the moment.
    crinkle:
      INK_PRESET.baselineCrinkle +
      (1 - INK_PRESET.baselineCrinkle) * clamp01(wearCrinkle),

    // Paper shifts only slightly in temperature. The ink owns the hue.
    temperature: 0.35 + warmth * 0.4,
  };
}
