import { describe, expect, it } from "vitest";
import { CRINKLE_EPSILON, RERENDER_MS, shouldRerender } from "./paper";

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
