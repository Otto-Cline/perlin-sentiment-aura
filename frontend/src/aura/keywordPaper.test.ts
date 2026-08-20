import { describe, expect, it } from "vitest";
import {
  KEYWORD_STAGGER_MS,
  WRITE_MS,
  halfExtents,
  mergePlaced,
  placeKeyword,
  sizeForWeight,
  writeProgress,
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
      { text: "old", weight: 0.5, x: 100, y: 100, size: 20, tilt: 0, bornAt: 0 },
    ];
    const rand = sequence([100 / W, 100 / H, 0.9, 0.9]);
    const placed = placeKeyword(
      existing,
      { text: "new", weight: 0.5 },
      W,
      H,
      0,
      [],
      rand,
    );
    expect(Math.hypot(placed.x - 100, placed.y - 100)).toBeGreaterThan(200);
  });

  it("never writes a word inside a reserved panel", () => {
    // A word behind the transcript panel is simply lost.
    const panel = { x: 40, y: 500, width: 420, height: 260 };
    for (let i = 0; i < 200; i++) {
      const p = placeKeyword([], { text: "deployment", weight: 0.9 }, W, H, 0, [
        panel,
      ]);
      const insideX = p.x > panel.x && p.x < panel.x + panel.width;
      const insideY = p.y > panel.y && p.y < panel.y + panel.height;
      expect(insideX && insideY).toBe(false);
    }
  });

  it("keeps a word's whole bounding box out of a panel, not just its centre", () => {
    // The bug this guards: checking only the centre let long words clear the
    // panel by their midpoint while their glyphs overhung into it.
    const panel = { x: 40, y: 480, width: 460, height: 280 };
    for (let i = 0; i < 300; i++) {
      const p = placeKeyword([], { text: "deployment", weight: 1 }, W, H, 0, [
        panel,
      ]);
      const { halfW, halfH } = halfExtents(p.text, p.size);
      const overlapsX =
        p.x + halfW > panel.x && p.x - halfW < panel.x + panel.width;
      const overlapsY =
        p.y + halfH > panel.y && p.y - halfH < panel.y + panel.height;
      expect(overlapsX && overlapsY).toBe(false);
    }
  });

  it("treats handwriting as wider than a third of its point size per character", () => {
    // An underestimate here is what let words bleed under the transcript.
    const { halfW } = halfExtents("deployment", 44);
    expect(halfW * 2).toBeGreaterThan(180);
  });

  it("avoids several reserved panels at once", () => {
    const panels = [
      { x: 40, y: 500, width: 420, height: 260 },
      { x: 40, y: 40, width: 300, height: 80 },
    ];
    for (let i = 0; i < 200; i++) {
      const p = placeKeyword([], { text: "logs", weight: 0.5 }, W, H, 0, panels);
      for (const r of panels) {
        const inside =
          p.x > r.x && p.x < r.x + r.width && p.y > r.y && p.y < r.y + r.height;
        expect(inside).toBe(false);
      }
    }
  });

  it("still returns a position when panels cover the whole page", () => {
    // Degenerate, but it must place the word rather than loop or return NaN.
    const everything = [{ x: 0, y: 0, width: W, height: H }];
    const p = placeKeyword([], { text: "x", weight: 0.5 }, W, H, 0, everything);
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
  });

  it("keeps reserved avoidance when merging", () => {
    const panel = { x: 0, y: 0, width: W, height: H / 2 };
    let placed = mergePlaced([], [], W, H, 0, [panel]);
    for (let i = 0; i < 20; i++) {
      placed = mergePlaced(placed, [{ text: `w${i}`, weight: 0.6 }], W, H, i, [
        panel,
      ]);
    }
    for (const p of placed) expect(p.y).toBeGreaterThan(H / 2 - 60);
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

describe("one-by-one arrival", () => {
  const batch = [
    { text: "payment", weight: 0.9 },
    { text: "service", weight: 0.7 },
    { text: "fell", weight: 0.8 },
  ];

  it("staggers a batch so words do not all appear at once", () => {
    // The brief: keywords must fade in "one by one, not just pop in".
    const placed = mergePlaced([], batch, W, H, 1000);
    const starts = placed.map((p) => p.bornAt);
    expect(new Set(starts).size).toBe(batch.length);
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i] - starts[i - 1]).toBe(KEYWORD_STAGGER_MS);
    }
  });

  it("leaves later words unwritten while the first is still going", () => {
    const placed = mergePlaced([], batch, W, H, 0);
    const midFirstWord = WRITE_MS / 2;
    expect(writeProgress(placed[0].bornAt, midFirstWord)).toBeGreaterThan(0);
    expect(writeProgress(placed[2].bornAt, midFirstWord)).toBe(0);
  });

  it("finishes the whole batch eventually", () => {
    const placed = mergePlaced([], batch, W, H, 0);
    const wellAfter = WRITE_MS + KEYWORD_STAGGER_MS * batch.length + 1000;
    for (const p of placed) {
      expect(writeProgress(p.bornAt, wellAfter)).toBe(1);
    }
  });

  it("does not leave a gap in the sequence when a word repeats", () => {
    const first = mergePlaced([], [{ text: "payment", weight: 0.5 }], W, H, 0);
    const second = mergePlaced(first, batch, W, H, 5000);
    // "payment" already exists, so the two new words take arrivals 0 and 1.
    const fresh = second.filter((p) => p.text !== "payment");
    expect(fresh[1].bornAt - fresh[0].bornAt).toBe(KEYWORD_STAGGER_MS);
    expect(fresh[0].bornAt).toBe(5000);
  });
});

describe("writeProgress", () => {
  it("starts unwritten and finishes complete", () => {
    expect(writeProgress(0, 0)).toBe(0);
    expect(writeProgress(0, WRITE_MS)).toBe(1);
    expect(writeProgress(0, 10_000)).toBe(1);
  });

  it("is partway through mid-stroke", () => {
    const mid = writeProgress(0, WRITE_MS / 2);
    expect(mid).toBeGreaterThan(0.4);
    expect(mid).toBeLessThan(0.6);
  });

  it("never goes negative for a word placed in the future", () => {
    expect(writeProgress(1000, 0)).toBe(0);
  });
});

describe("tilt", () => {
  it("leans every word slightly off level", () => {
    // Nothing hand-written sits perfectly square.
    let sawTilt = false;
    for (let i = 0; i < 40; i++) {
      const p = placeKeyword([], { text: "logs", weight: 0.5 }, W, H, 0);
      expect(Math.abs(p.tilt)).toBeLessThan(0.12);
      if (Math.abs(p.tilt) > 0.005) sawTilt = true;
    }
    expect(sawTilt).toBe(true);
  });

  it("keeps a word's tilt fixed once placed", () => {
    const first = mergePlaced([], [{ text: "logs", weight: 0.4 }], W, H, 0);
    const again = mergePlaced(first, [{ text: "logs", weight: 0.9 }], W, H, 500);
    expect(again[0].tilt).toBe(first[0].tilt);
  });
});
