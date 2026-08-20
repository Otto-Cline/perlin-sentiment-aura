import { describe, expect, it } from "vitest";
import { resketchPasses, strokeWidthFor } from "./ink";
import { CRINKLE_EPSILON, RERENDER_MS, shouldRerender } from "./paper";

describe("resketchPasses", () => {
  it("draws one clean line at full commitment", () => {
    expect(resketchPasses(1)).toBe(1);
  });

  it("re-sketches the same path several times at low commitment", () => {
    expect(resketchPasses(0)).toBeGreaterThan(1);
  });

  it("keeps one clean line for a confident speaker", () => {
    // 0.8 certainty is still confident; it should not read as hesitant.
    expect(resketchPasses(0.8)).toBe(1);
    expect(resketchPasses(0.7)).toBe(1);
  });

  it("starts hesitating below the midpoint", () => {
    expect(resketchPasses(0.5)).toBeGreaterThan(1);
  });

  it("reaches a visible scribble at zero certainty", () => {
    // The channel has to be obvious in motion, not a subtle doubling.
    expect(resketchPasses(0)).toBeGreaterThanOrEqual(5);
  });

  it("separates assured from hedging by more than one pass", () => {
    expect(resketchPasses(0.15) - resketchPasses(0.85)).toBeGreaterThanOrEqual(3);
  });

  it("never increases with commitment", () => {
    let previous = Infinity;
    for (let c = 0; c <= 1.0001; c += 0.05) {
      const passes = resketchPasses(c);
      expect(passes).toBeLessThanOrEqual(previous);
      previous = passes;
    }
  });

  it("clamps input outside [0, 1]", () => {
    expect(resketchPasses(-3)).toBe(resketchPasses(0));
    expect(resketchPasses(9)).toBe(resketchPasses(1));
  });

  it("always draws at least one pass", () => {
    for (const c of [0, 0.5, 1, -1, 2, Number.NaN]) {
      expect(resketchPasses(c)).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("strokeWidthFor", () => {
  it("pools thick when the pen is slow", () => {
    expect(strokeWidthFor(0, 4.5)).toBeGreaterThan(strokeWidthFor(4.5, 4.5));
  });

  it("decreases monotonically with speed", () => {
    let previous = Infinity;
    for (let s = 0; s <= 4.5; s += 0.25) {
      const w = strokeWidthFor(s, 4.5);
      expect(w).toBeLessThanOrEqual(previous);
      previous = w;
    }
  });

  it("stays positive past the nominal maximum", () => {
    expect(strokeWidthFor(99, 4.5)).toBeGreaterThan(0);
  });

  it("does not divide by zero when there is no speed range", () => {
    expect(Number.isFinite(strokeWidthFor(1, 0))).toBe(true);
  });
});

describe("shouldRerender", () => {
  it("renders on the first call", () => {
    expect(shouldRerender(0, -1, 0, -1)).toBe(true);
  });

  it("skips a repeat inside the throttle window", () => {
    expect(shouldRerender(1000, 1000 - RERENDER_MS + 50, 0.5, 0.5)).toBe(false);
  });

  it("renders once the throttle window has passed", () => {
    expect(shouldRerender(1000, 1000 - RERENDER_MS, 0.5, 0.5)).toBe(true);
  });

  it("renders early when crinkle has moved meaningfully", () => {
    expect(shouldRerender(1000, 995, 0.5 + CRINKLE_EPSILON, 0.5)).toBe(true);
  });

  it("ignores crinkle drift below the epsilon", () => {
    expect(shouldRerender(1000, 995, 0.5 + CRINKLE_EPSILON / 4, 0.5)).toBe(
      false,
    );
  });
});
