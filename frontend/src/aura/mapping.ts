import type { Analysis, ConnectionState } from "../types";

/**
 * Cold blue for unpleasant, warm gold for pleasant. The path between them runs
 * down through teal and green — a deliberate choice over wrapping through
 * magenta and red, which is prettier but reads less like a scale.
 */
export const HUE_NEGATIVE = 222;
export const HUE_POSITIVE = 46;

/**
 * Valence is eased before it crosses the hue range. A linear map spends its
 * whole middle in green, which is exactly where ordinary speech sits, so the
 * aura would look green most of the time and true blue would only ever appear
 * at valence -1. An exponent below 1 is steep near neutral and flat near the
 * ends: hue leaves the green band quickly and then holds near blue and gold.
 */
const VALENCE_EASE = 0.55;

const easeValence = (v: number) => Math.sign(v) * Math.abs(v) ** VALENCE_EASE;

export interface VisualTargets {
  hue: number;
  saturation: number;
  alpha: number;
  speed: number;
  noiseStep: number;
  turbulence: number;
  coherence: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const clampSigned = (v: number) => Math.min(1, Math.max(-1, v));

/** Degraded connections read as a visibly weaker field, not as an error toast. */
const CONNECTION_DAMPING: Record<
  ConnectionState,
  { sat: number; speed: number }
> = {
  idle: { sat: 0.55, speed: 0.5 },
  connecting: { sat: 0.5, speed: 0.45 },
  live: { sat: 1, speed: 1 },
  reconnecting: { sat: 0.25, speed: 0.35 },
  error: { sat: 0.18, speed: 0.25 },
};

export function mapAnalysis(a: Analysis, conn: ConnectionState): VisualTargets {
  const damping = CONNECTION_DAMPING[conn];

  // Valence in [-1, 1], eased, then normalized to [0, 1] for the hue range.
  const warmth = clamp01((easeValence(clampSigned(a.valence)) + 1) / 2);
  const arousal = clamp01(a.arousal);
  const certainty = clamp01(a.speaker_certainty);
  const confidence = clamp01(a.model_confidence);

  return {
    hue: lerp(HUE_NEGATIVE, HUE_POSITIVE, warmth),

    // Low model confidence literally looks washed out.
    saturation: lerp(16, 84, confidence) * damping.sat,
    // Tuned against TRAIL_FADE in sketch.ts: too low and the wipe erases each
    // stroke before neighbouring passes can accumulate into a visible stream.
    alpha: lerp(34, 132, confidence),

    // Arousal is energy: faster particles, faster field evolution, more churn.
    // The floor stays high enough that segments are lines rather than dots.
    speed: lerp(0.8, 4.2, arousal) * damping.speed,
    noiseStep: lerp(0.0008, 0.0055, arousal),
    turbulence: lerp(0.15, 1, arousal),

    // Certainty is order: high aligns the octaves into laminar streams,
    // low lets them disagree and fragment the flow into eddies.
    coherence: lerp(0.1, 1, certainty),
  };
}
