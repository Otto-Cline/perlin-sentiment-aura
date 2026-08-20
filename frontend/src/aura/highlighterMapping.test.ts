import { describe, expect, it } from "vitest";
import { mapHighlighter } from "./highlighterMapping";
import { HIGHLIGHTER } from "./preset";
import { NEUTRAL_ANALYSIS, type Analysis } from "../types";

const base: Analysis = {
  valence: 0,
  arousal: 0.5,
  speaker_certainty: 0.5,
  model_confidence: 1,
  keywords: [],
  rationale: "",
};

describe("mapHighlighter", () => {
  it("keeps every hue inside the pink family", () => {
    // The whole point of one marker: no value may wander into green or blue.
    for (let v = -1; v <= 1.0001; v += 0.05) {
      const hue = mapHighlighter({ ...base, valence: v }, "live", 0).hue % 360;
      const isPink = hue >= 300 || hue <= 20;
      expect(isPink, `valence ${v.toFixed(2)} gave hue ${hue.toFixed(0)}`).toBe(
        true,
      );
    }
  });

  it("runs cool at negative valence and warm at positive", () => {
    expect(mapHighlighter({ ...base, valence: -1 }, "live", 0).hue).toBeCloseTo(
      HIGHLIGHTER.hueCool,
    );
    expect(mapHighlighter({ ...base, valence: 1 }, "live", 0).hue).toBeCloseTo(
      HIGHLIGHTER.hueWarm,
    );
  });

  it("is monotonic in valence", () => {
    let previous = -Infinity;
    for (let v = -1; v <= 1.0001; v += 0.05) {
      const hue = mapHighlighter({ ...base, valence: v }, "live", 0).hue;
      expect(hue).toBeGreaterThan(previous);
      previous = hue;
    }
  });

  it("makes an energetic mark faster and broader", () => {
    const calm = mapHighlighter({ ...base, arousal: 0 }, "live", 0);
    const hot = mapHighlighter({ ...base, arousal: 1 }, "live", 0);
    expect(hot.speed).toBeGreaterThan(calm.speed);
    expect(hot.thickness).toBeGreaterThan(calm.thickness);
  });

  it("turns certainty into a steady hand", () => {
    // High certainty must mean LOW sharpness — a sweep, not a scribble.
    const assured = mapHighlighter({ ...base, speaker_certainty: 1 }, "live", 0);
    const hedging = mapHighlighter({ ...base, speaker_certainty: 0 }, "live", 0);
    expect(assured.turnSharpness).toBeLessThan(hedging.turnSharpness);
    expect(assured.turnSharpness).toBeCloseTo(0);
    expect(hedging.turnSharpness).toBeCloseTo(1);
  });

  it("barely marks the page when unsure of its own read", () => {
    const unsure = mapHighlighter({ ...base, model_confidence: 0 }, "live", 0);
    const sure = mapHighlighter({ ...base, model_confidence: 1 }, "live", 0);
    expect(unsure.alpha).toBeLessThan(sure.alpha);
    expect(unsure.alpha).toBeCloseTo(HIGHLIGHTER.alphaMin);
  });

  it("keeps the marker translucent at every confidence", () => {
    // Opaque marker would hide the words it is supposed to be marking.
    for (let c = 0; c <= 1.0001; c += 0.1) {
      const alpha = mapHighlighter({ ...base, model_confidence: c }, "live", 0)
        .alpha;
      expect(alpha).toBeLessThan(0.4);
    }
  });

  it("desaturates and slows the marker while reconnecting", () => {
    const live = mapHighlighter(base, "live", 0);
    const reconnecting = mapHighlighter(base, "reconnecting", 0);
    expect(reconnecting.saturation).toBeLessThan(live.saturation);
    expect(reconnecting.speed).toBeLessThan(live.speed);
  });

  it("deepens crinkle with wear from a textured baseline", () => {
    expect(mapHighlighter(base, "live", 0).crinkle).toBeCloseTo(
      HIGHLIGHTER.baselineCrinkle,
    );
    expect(mapHighlighter(base, "live", 1).crinkle).toBeCloseTo(1);
    expect(mapHighlighter(base, "live", 99).crinkle).toBeCloseTo(1);
  });

  it("keeps every output finite for the neutral analysis", () => {
    const t = mapHighlighter(NEUTRAL_ANALYSIS, "idle", 0);
    for (const [key, value] of Object.entries(t)) {
      expect(Number.isFinite(value), key).toBe(true);
    }
  });

  it("clamps analysis values outside their documented ranges", () => {
    const wild: Analysis = {
      valence: -9,
      arousal: 4,
      speaker_certainty: -2,
      model_confidence: 7,
      keywords: [],
      rationale: "",
    };
    const t = mapHighlighter(wild, "live", 0);
    expect(t.hue).toBeCloseTo(HIGHLIGHTER.hueCool);
    expect(t.turnSharpness).toBe(1);
    expect(t.thickness).toBeCloseTo(HIGHLIGHTER.thicknessMax);
    for (const value of Object.values(t)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});
