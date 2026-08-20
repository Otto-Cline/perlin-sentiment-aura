import { describe, expect, it } from "vitest";
import {
  keywordFadeIn,
  mergePlaced,
  placeKeyword,
  sizeForWeight,
} from "./keywordPaper";
import { HIGHLIGHTER } from "./preset";

const W = 1200;
const H = 800;

/** Deterministic stand-in for Math.random. */
function sequence(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("sizeForWeight", () => {
  it("spans the configured range", () => {
    expect(sizeForWeight(0)).toBeCloseTo(HIGHLIGHTER.fontSizeMin);
    expect(sizeForWeight(1)).toBeCloseTo(HIGHLIGHTER.fontSizeMax);
  });

  it("grows with weight", () => {
    expect(sizeForWeight(0.9)).toBeGreaterThan(sizeForWeight(0.2));
  });

  it("clamps out-of-range weights", () => {
    expect(sizeForWeight(-2)).toBeCloseTo(HIGHLIGHTER.fontSizeMin);
    expect(sizeForWeight(9)).toBeCloseTo(HIGHLIGHTER.fontSizeMax);
  });
});

describe("placeKeyword", () => {
  it("stays inside the page", () => {
    for (let i = 0; i < 60; i++) {
      const p = placeKeyword([], { text: "deployment", weight: 0.9 }, W, H, 0);
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(W);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(H);
    }
  });

  it("prefers the least crowded candidate", () => {
    // Two candidates: the first lands on top of an existing word, the second is
    // far away. The far one must win.
    const existing = [
      { text: "old", weight: 0.5, x: 100, y: 100, size: 20, bornAt: 0 },
    ];
    const rand = sequence([100 / W, 100 / H, 0.9, 0.9]);
    const placed = placeKeyword(
      existing,
      { text: "new", weight: 0.5 },
      W,
      H,
      0,
      rand,
    );
    expect(Math.hypot(placed.x - 100, placed.y - 100)).toBeGreaterThan(200);
  });

  it("does not crash on a tiny page", () => {
    const p = placeKeyword([], { text: "x", weight: 1 }, 10, 10, 0);
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
  });
});

describe("mergePlaced", () => {
  it("adds new words", () => {
    const out = mergePlaced([], [{ text: "logs", weight: 0.6 }], W, H, 0);
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe("logs");
  });

  it("leaves a repeated word where it was", () => {
    const first = mergePlaced([], [{ text: "logs", weight: 0.4 }], W, H, 0);
    const again = mergePlaced(first, [{ text: "logs", weight: 0.9 }], W, H, 500);
    expect(again).toHaveLength(1);
    expect(again[0].x).toBe(first[0].x);
    expect(again[0].y).toBe(first[0].y);
  });

  it("grows a repeated word and keeps its original entrance", () => {
    const first = mergePlaced([], [{ text: "logs", weight: 0.4 }], W, H, 0);
    const again = mergePlaced(first, [{ text: "logs", weight: 0.9 }], W, H, 500);
    expect(again[0].size).toBeGreaterThan(first[0].size);
    expect(again[0].bornAt).toBe(0);
  });

  it("never shrinks a word that recurs more weakly", () => {
    const first = mergePlaced([], [{ text: "logs", weight: 0.9 }], W, H, 0);
    const again = mergePlaced(first, [{ text: "logs", weight: 0.1 }], W, H, 500);
    expect(again[0].size).toBe(first[0].size);
  });

  it("caps the page and drops the oldest words", () => {
    let placed = mergePlaced([], [], W, H, 0);
    for (let i = 0; i < HIGHLIGHTER.maxKeywords + 12; i++) {
      placed = mergePlaced(placed, [{ text: `w${i}`, weight: 0.5 }], W, H, i);
    }
    expect(placed).toHaveLength(HIGHLIGHTER.maxKeywords);
    expect(placed.some((p) => p.text === "w0")).toBe(false);
    expect(
      placed.some((p) => p.text === `w${HIGHLIGHTER.maxKeywords + 11}`),
    ).toBe(true);
  });

  it("does not mutate the input", () => {
    const first = mergePlaced([], [{ text: "a", weight: 0.5 }], W, H, 0);
    mergePlaced(first, [{ text: "b", weight: 0.5 }], W, H, 1);
    expect(first).toHaveLength(1);
  });
});

describe("keywordFadeIn", () => {
  it("starts invisible and ends opaque", () => {
    expect(keywordFadeIn(0, 0)).toBe(0);
    expect(keywordFadeIn(0, 10_000)).toBe(1);
  });

  it("is partway through mid-entrance", () => {
    const mid = keywordFadeIn(0, 450);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
});
