import { describe, expect, it } from "vitest";
import { nextDemoAnalysis } from "./driver";

describe("nextDemoAnalysis", () => {
  it("produces in-range values for many steps", () => {
    for (let step = 0; step < 200; step++) {
      const { analysis } = nextDemoAnalysis(step);
      expect(analysis.valence).toBeGreaterThanOrEqual(-1);
      expect(analysis.valence).toBeLessThanOrEqual(1);
      for (const key of [
        "arousal",
        "speaker_certainty",
        "model_confidence",
      ] as const) {
        expect(analysis[key]).toBeGreaterThanOrEqual(0);
        expect(analysis[key]).toBeLessThanOrEqual(1);
      }
      for (const kw of analysis.keywords) {
        expect(kw.weight).toBeGreaterThanOrEqual(0);
        expect(kw.weight).toBeLessThanOrEqual(1);
      }
    }
  });

  it("is deterministic for a given step", () => {
    expect(nextDemoAnalysis(7)).toEqual(nextDemoAnalysis(7));
  });

  it("varies across steps so the aura visibly moves", () => {
    expect(nextDemoAnalysis(0).analysis.valence).not.toBe(
      nextDemoAnalysis(3).analysis.valence,
    );
  });

  it("emits a non-empty transcript line", () => {
    expect(nextDemoAnalysis(1).line.length).toBeGreaterThan(0);
  });
});
