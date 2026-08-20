import { describe, expect, it } from "vitest";
import {
  GESTURE_SCALE,
  GRAIN_SCALE,
  angleAt,
  field,
} from "./field";

describe("field", () => {
  it("stays inside [0, 1] across a wide sweep", () => {
    for (let i = 0; i < 4000; i++) {
      const x = (i % 97) * 0.37 - 18;
      const y = (i % 61) * 0.71 - 22;
      const t = i * 0.013;
      const v = field(x, y, t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("is deterministic for the same coordinates", () => {
    expect(field(1.5, -2.25, 0.75)).toBe(field(1.5, -2.25, 0.75));
  });

  it("varies over space", () => {
    expect(field(0, 0, 0)).not.toBe(field(4.3, 1.1, 0));
  });

  it("varies over time", () => {
    expect(field(2, 2, 0)).not.toBe(field(2, 2, 3.7));
  });

  it("is continuous — small steps make small changes", () => {
    // A flow field built on a discontinuous source produces visible seams.
    let worst = 0;
    for (let i = 0; i < 500; i++) {
      const x = i * 0.11;
      const delta = Math.abs(field(x, 5, 1) - field(x + 0.01, 5, 1));
      worst = Math.max(worst, delta);
    }
    expect(worst).toBeLessThan(0.05);
  });

  it("actually uses the whole range, not just the middle", () => {
    let lo = 1;
    let hi = 0;
    for (let i = 0; i < 5000; i++) {
      const v = field(i * 0.19, i * 0.07, i * 0.021);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    // A field pinned near 0.5 would make every stroke travel the same heading.
    expect(hi - lo).toBeGreaterThan(0.4);
  });

  it("gives paper and pen genuinely different structure at their own scales", () => {
    // Same function and seed, but the grain scale is ~18x the gesture scale, so
    // the grain must vary much faster across the same screen distance.
    const gestureDeltas: number[] = [];
    const grainDeltas: number[] = [];
    for (let px = 0; px < 300; px += 3) {
      gestureDeltas.push(
        Math.abs(
          field(px * GESTURE_SCALE, 0, 0) -
            field((px + 3) * GESTURE_SCALE, 0, 0),
        ),
      );
      grainDeltas.push(
        Math.abs(
          field(px * GRAIN_SCALE, 0, 0) - field((px + 3) * GRAIN_SCALE, 0, 0),
        ),
      );
    }
    const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    expect(mean(grainDeltas)).toBeGreaterThan(mean(gestureDeltas) * 3);
  });
});

describe("angleAt", () => {
  it("spans two full turns, matching the previous renderer's convention", () => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < 5000; i++) {
      const a = angleAt(i * 0.19, i * 0.07, i * 0.021);
      lo = Math.min(lo, a);
      hi = Math.max(hi, a);
    }
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(Math.PI * 4 + 1e-9);
    expect(hi - lo).toBeGreaterThan(Math.PI);
  });
});
