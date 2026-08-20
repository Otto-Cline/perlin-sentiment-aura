import { describe, expect, it } from "vitest";
import { mapInk } from "./inkMapping";
import { INK_PRESET } from "./preset";
import { NEUTRAL_ANALYSIS, type Analysis } from "../types";

const base: Analysis = {
  valence: 0,
  arousal: 0.5,
  speaker_certainty: 0.5,
  model_confidence: 1,
  keywords: [],
  rationale: "",
};

describe("mapInk", () => {
  it("anchors the hue ramp at blue and amber", () => {
    expect(mapInk({ ...base, valence: -1 }, "live", 0).hue).toBeCloseTo(
      INK_PRESET.hueCold,
    );
    expect(mapInk({ ...base, valence: 1 }, "live", 0).hue).toBeCloseTo(
      INK_PRESET.hueWarm,
    );
  });

  it("keeps negative valence on the blue side of the ramp", () => {
    // The whole point of "blue instead of green": a clearly negative utterance
    // must not land in the green midband.
    const midpoint = (INK_PRESET.hueCold + INK_PRESET.hueWarm) / 2;
    expect(mapInk({ ...base, valence: -0.3 }, "live", 0).hue).toBeGreaterThan(
      midpoint,
    );
  });

  it("is monotonic in valence", () => {
    let previous = Infinity;
    for (let v = -1; v <= 1.0001; v += 0.05) {
      const hue = mapInk({ ...base, valence: v }, "live", 0).hue;
      expect(hue).toBeLessThan(previous);
      previous = hue;
    }
  });

  it("speeds up and destabilises the hand with arousal", () => {
    const calm = mapInk({ ...base, arousal: 0 }, "live", 0);
    const hot = mapInk({ ...base, arousal: 1 }, "live", 0);
    expect(hot.speed).toBeGreaterThan(calm.speed);
    expect(hot.jitter).toBeGreaterThan(calm.jitter);
  });

  it("passes certainty straight through as commitment", () => {
    expect(mapInk({ ...base, speaker_certainty: 0.8 }, "live", 0).commitment)
      .toBeCloseTo(0.8);
  });

  it("thins the ink and lifts the pen more when unsure of its own read", () => {
    const unsure = mapInk({ ...base, model_confidence: 0 }, "live", 0);
    const sure = mapInk({ ...base, model_confidence: 1 }, "live", 0);
    expect(unsure.opacity).toBeLessThan(sure.opacity);
    expect(unsure.saturation).toBeLessThan(sure.saturation);
    expect(unsure.penLift).toBeGreaterThan(sure.penLift);
  });

  it("desaturates and slows the ink while reconnecting", () => {
    const live = mapInk(base, "live", 0);
    const reconnecting = mapInk(base, "reconnecting", 0);
    expect(reconnecting.saturation).toBeLessThan(live.saturation);
    expect(reconnecting.speed).toBeLessThan(live.speed);
  });

  it("leaves an unworn sheet with tooth but not depth", () => {
    const fresh = mapInk(base, "live", 0).crinkle;
    expect(fresh).toBeCloseTo(INK_PRESET.baselineCrinkle);
    expect(fresh).toBeGreaterThan(0);
    expect(fresh).toBeLessThan(0.3);
  });

  it("deepens crinkle with wear, up to full depth", () => {
    expect(mapInk(base, "live", 1).crinkle).toBeCloseTo(1);
    expect(mapInk(base, "live", 0.5).crinkle).toBeGreaterThan(
      mapInk(base, "live", 0).crinkle,
    );
  });

  it("never lets crinkle exceed full depth, whatever wear reports", () => {
    expect(mapInk(base, "live", 99).crinkle).toBeCloseTo(1);
  });

  it("keeps every output finite for the neutral analysis", () => {
    const t = mapInk(NEUTRAL_ANALYSIS, "idle", 0);
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
    const t = mapInk(wild, "live", 0);
    expect(t.hue).toBeCloseTo(INK_PRESET.hueCold);
    expect(t.commitment).toBe(0);
    for (const value of Object.values(t)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});
