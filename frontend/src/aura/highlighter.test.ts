import { describe, expect, it } from "vitest";
import { shortestAngleDelta, turnRateFor } from "./highlighter";

describe("shortestAngleDelta", () => {
  it("is zero for identical headings", () => {
    expect(shortestAngleDelta(1.2, 1.2)).toBeCloseTo(0);
  });

  it("takes the short way across the 0/2PI seam", () => {
    // The bug this guards: without wrapping, a heading at 0.1 turning to 6.2
    // rotates almost all the way round and the stroke visibly loops backwards.
    const delta = shortestAngleDelta(0.1, Math.PI * 2 - 0.1);
    expect(Math.abs(delta)).toBeLessThan(0.5);
    expect(delta).toBeLessThan(0);
  });

  it("never exceeds half a turn in either direction", () => {
    for (let from = -8; from < 8; from += 0.31) {
      for (let to = -8; to < 8; to += 0.29) {
        const delta = shortestAngleDelta(from, to);
        expect(delta).toBeGreaterThanOrEqual(-Math.PI - 1e-9);
        expect(delta).toBeLessThanOrEqual(Math.PI + 1e-9);
      }
    }
  });

  it("points toward the target", () => {
    expect(shortestAngleDelta(0, 1)).toBeGreaterThan(0);
    expect(shortestAngleDelta(1, 0)).toBeLessThan(0);
  });

  it("handles headings well outside one turn", () => {
    const delta = shortestAngleDelta(12.9, 0.2);
    expect(Number.isFinite(delta)).toBe(true);
    expect(Math.abs(delta)).toBeLessThanOrEqual(Math.PI + 1e-9);
  });
});

describe("turnRateFor", () => {
  it("turns lazily for a decisive hand and hard for a hesitant one", () => {
    expect(turnRateFor(0)).toBeLessThan(turnRateFor(1));
  });

  it("keeps a confident sweep genuinely smooth", () => {
    // A high rate at zero sharpness would snap to the field every frame and no
    // stroke would read as a sweep.
    expect(turnRateFor(0)).toBeLessThan(0.06);
  });

  it("separates the extremes by an order of magnitude", () => {
    expect(turnRateFor(1) / turnRateFor(0)).toBeGreaterThan(10);
  });

  it("increases monotonically with sharpness", () => {
    let previous = -Infinity;
    for (let s = 0; s <= 1.0001; s += 0.05) {
      const rate = turnRateFor(s);
      expect(rate).toBeGreaterThan(previous);
      previous = rate;
    }
  });

  it("stays a usable fraction for out-of-range input", () => {
    for (const s of [-5, 5, Number.NaN]) {
      const rate = turnRateFor(s);
      if (Number.isFinite(rate)) {
        expect(rate).toBeGreaterThan(0);
        expect(rate).toBeLessThanOrEqual(1);
      }
    }
  });
});
