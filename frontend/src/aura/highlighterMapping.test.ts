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
  it("never changes the pen's colour, whatever the sentiment", () => {
    // The point of one marker: no sentiment value may shift hue or saturation.
    for (let v = -1; v <= 1.0001; v += 0.1) {
      for (const c of [0, 0.5, 1]) {
        const t = mapHighlighter(
          { ...base, valence: v, model_confidence: c },
          "live",
          0,
        );
        expect(t.hue).toBe(HIGHLIGHTER.hue);
        expect(t.saturation).toBeCloseTo(HIGHLIGHTER.saturation);
        expect(t.lightness).toBe(HIGHLIGHTER.lightness);
      }
    }
  });

  it("keeps the fixed hue inside the pink family", () => {
    const hue = mapHighlighter(base, "live", 0).hue % 360;
    expect(hue >= 300 || hue <= 20).toBe(true);
  });

  it("turns valence into the gesture", () => {
    // Pleasant sweeps; unpleasant jerks.
    const pleasant = mapHighlighter({ ...base, valence: 1 }, "live", 0);
    const unpleasant = mapHighlighter({ ...base, valence: -1 }, "live", 0);
    expect(pleasant.turnSharpness).toBeCloseTo(0);
    expect(unpleasant.turnSharpness).toBeCloseTo(1);
  });

  it("makes turn sharpness fall monotonically as valence rises", () => {
    let previous = Infinity;
    for (let v = -1; v <= 1.0001; v += 0.05) {
      const sharpness = mapHighlighter({ ...base, valence: v }, "live", 0)
        .turnSharpness;
      expect(sharpness).toBeLessThan(previous);
      previous = sharpness;
    }
  });

  it("already looks agitated at moderately negative valence", () => {
    // Eased, so -0.4 should be well past halfway to fully jagged rather than
    // merely tilted — the effect has to be obvious in motion.
    expect(
      mapHighlighter({ ...base, valence: -0.4 }, "live", 0).turnSharpness,
    ).toBeGreaterThan(0.6);
  });

  it("ignores speaker_certainty entirely", () => {
    const low = mapHighlighter({ ...base, speaker_certainty: 0 }, "live", 0);
    const high = mapHighlighter({ ...base, speaker_certainty: 1 }, "live", 0);
    expect(low).toEqual(high);
  });

  it("makes an energetic mark much faster and much broader", () => {
    const calm = mapHighlighter({ ...base, arousal: 0 }, "live", 0);
    const hot = mapHighlighter({ ...base, arousal: 1 }, "live", 0);
    // Wide ratios on purpose: narrow ones read as one continuous texture.
    expect(hot.speed / calm.speed).toBeGreaterThan(8);
    expect(hot.thickness / calm.thickness).toBeGreaterThan(2);
  });

  it("varies opacity widely with confidence, and nothing else", () => {
    const unsure = mapHighlighter({ ...base, model_confidence: 0 }, "live", 0);
    const sure = mapHighlighter({ ...base, model_confidence: 1 }, "live", 0);
    expect(sure.alpha / unsure.alpha).toBeGreaterThan(8);
    expect(unsure.saturation).toBeCloseTo(sure.saturation);
    expect(unsure.thickness).toBeCloseTo(sure.thickness);
    expect(unsure.speed).toBeCloseTo(sure.speed);
  });

  it("keeps the marker translucent at every confidence", () => {
    // A solid marker would hide the words it is supposed to be marking.
    for (let c = 0; c <= 1.0001; c += 0.1) {
      expect(
        mapHighlighter({ ...base, model_confidence: c }, "live", 0).alpha,
      ).toBeLessThan(0.45);
    }
  });

  it("drains colour and slows the marker while reconnecting", () => {
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
    expect(t.turnSharpness).toBeCloseTo(1);
    expect(t.thickness).toBeCloseTo(HIGHLIGHTER.thicknessMax);
    expect(t.alpha).toBeCloseTo(HIGHLIGHTER.alphaMax);
    for (const value of Object.values(t)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});
