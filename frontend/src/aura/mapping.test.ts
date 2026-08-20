import { describe, expect, it } from "vitest";
import { HUE_NEGATIVE, HUE_POSITIVE, mapAnalysis } from "./mapping";
import { NEUTRAL_ANALYSIS, type Analysis } from "../types";

const base: Analysis = {
  valence: 0,
  arousal: 0.5,
  speaker_certainty: 0.5,
  model_confidence: 1,
  keywords: [],
  rationale: "",
};

describe("mapAnalysis", () => {
  it("maps minimum valence to the cold end of the hue range", () => {
    expect(mapAnalysis({ ...base, valence: -1 }, "live").hue).toBeCloseTo(
      HUE_NEGATIVE,
    );
  });

  it("maps maximum valence to the warm end of the hue range", () => {
    expect(mapAnalysis({ ...base, valence: 1 }, "live").hue).toBeCloseTo(
      HUE_POSITIVE,
    );
  });

  it("maps neutral valence to the midpoint of the hue range", () => {
    expect(mapAnalysis({ ...base, valence: 0 }, "live").hue).toBeCloseTo(
      (HUE_NEGATIVE + HUE_POSITIVE) / 2,
    );
  });

  it("increases speed and turbulence with arousal", () => {
    const calm = mapAnalysis({ ...base, arousal: 0 }, "live");
    const hot = mapAnalysis({ ...base, arousal: 1 }, "live");
    expect(hot.speed).toBeGreaterThan(calm.speed);
    expect(hot.turbulence).toBeGreaterThan(calm.turbulence);
    expect(hot.noiseStep).toBeGreaterThan(calm.noiseStep);
  });

  it("raises coherence with speaker certainty", () => {
    const hedging = mapAnalysis({ ...base, speaker_certainty: 0 }, "live");
    const assertive = mapAnalysis({ ...base, speaker_certainty: 1 }, "live");
    expect(assertive.coherence).toBeGreaterThan(hedging.coherence);
  });

  it("washes out saturation and alpha at low model confidence", () => {
    const unsure = mapAnalysis({ ...base, model_confidence: 0 }, "live");
    const sure = mapAnalysis({ ...base, model_confidence: 1 }, "live");
    expect(unsure.saturation).toBeLessThan(sure.saturation);
    expect(unsure.alpha).toBeLessThan(sure.alpha);
  });

  it("desaturates and slows the field while reconnecting", () => {
    const live = mapAnalysis(base, "live");
    const reconnecting = mapAnalysis(base, "reconnecting");
    expect(reconnecting.saturation).toBeLessThan(live.saturation);
    expect(reconnecting.speed).toBeLessThan(live.speed);
  });

  it("keeps every output finite for the neutral analysis", () => {
    const t = mapAnalysis(NEUTRAL_ANALYSIS, "idle");
    for (const value of Object.values(t)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});
