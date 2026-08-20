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

describe("the demo script exercises the mapping", () => {
  // One pass over the whole script, so a future edit cannot quietly flatten it.
  const cycle = () => {
    const seen: ReturnType<typeof nextDemoAnalysis>[] = [];
    const first = nextDemoAnalysis(0).line;
    for (let step = 0; step < 64; step++) {
      const entry = nextDemoAnalysis(step);
      if (step > 0 && entry.line === first) break;
      seen.push(entry);
    }
    return seen;
  };

  const span = (pick: (a: ReturnType<typeof nextDemoAnalysis>) => number) => {
    const values = cycle().map(pick);
    return Math.max(...values) - Math.min(...values);
  };

  it("swings valence across most of its range, so turn sharpness is obvious", () => {
    expect(span((e) => e.analysis.valence)).toBeGreaterThan(1.5);
  });

  it("swings arousal across most of its range, so speed and width are obvious", () => {
    expect(span((e) => e.analysis.arousal)).toBeGreaterThan(0.7);
  });

  it("includes a genuinely low-confidence utterance", () => {
    // Without one, the opacity channel never shows itself.
    const lowest = Math.min(...cycle().map((e) => e.analysis.model_confidence));
    expect(lowest).toBeLessThan(0.2);
  });

  it("includes a confident utterance too", () => {
    const highest = Math.max(...cycle().map((e) => e.analysis.model_confidence));
    expect(highest).toBeGreaterThan(0.85);
  });

  it("pairs high arousal with both a positive and a negative reading", () => {
    // Arousal and valence must be visibly independent, not correlated.
    const energetic = cycle().filter((e) => e.analysis.arousal > 0.7);
    expect(energetic.some((e) => e.analysis.valence > 0.5)).toBe(true);
    expect(energetic.some((e) => e.analysis.valence < -0.5)).toBe(true);
  });

  it("puts enough words on the page to be highlighted", () => {
    const total = cycle().reduce((n, e) => n + e.analysis.keywords.length, 0);
    expect(total).toBeGreaterThanOrEqual(8);
  });

  it("varies keyword weight, so size on the page differs", () => {
    const weights = cycle().flatMap((e) =>
      e.analysis.keywords.map((k) => k.weight),
    );
    expect(Math.max(...weights) - Math.min(...weights)).toBeGreaterThan(0.4);
  });
});
