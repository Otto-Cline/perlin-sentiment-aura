import { describe, expect, it } from "vitest";
import { splitWords, visibleLines } from "./transcriptLines";

describe("visibleLines", () => {
  it("returns every line when under the limit", () => {
    expect(visibleLines(["a", "b"], 8)).toEqual([
      { id: 0, text: "a" },
      { id: 1, text: "b" },
    ]);
  });

  it("windows to the most recent lines", () => {
    const lines = ["a", "b", "c", "d"];
    expect(visibleLines(lines, 2)).toEqual([
      { id: 2, text: "c" },
      { id: 3, text: "d" },
    ]);
  });

  it("keeps an id stable once the window starts sliding", () => {
    // The bug this guards: window-relative indices shift on every new line,
    // remounting every word and re-firing its entrance animation.
    const before = visibleLines(["a", "b", "c"], 2);
    const after = visibleLines(["a", "b", "c", "d"], 2);

    const cBefore = before.find((l) => l.text === "c");
    const cAfter = after.find((l) => l.text === "c");
    expect(cBefore?.id).toBe(cAfter?.id);
  });

  it("never reuses an id for different text", () => {
    const seen = new Map<number, string>();
    const lines: string[] = [];
    for (let i = 0; i < 20; i++) {
      lines.push(`line ${i}`);
      for (const l of visibleLines(lines, 5)) {
        const prior = seen.get(l.id);
        if (prior !== undefined) expect(prior).toBe(l.text);
        seen.set(l.id, l.text);
      }
    }
  });

  it("handles an empty transcript", () => {
    expect(visibleLines([], 8)).toEqual([]);
  });
});

describe("splitWords", () => {
  it("splits on whitespace", () => {
    expect(splitWords("the build is broken")).toEqual([
      "the",
      "build",
      "is",
      "broken",
    ]);
  });

  it("collapses runs of whitespace", () => {
    expect(splitWords("  two   words  ")).toEqual(["two", "words"]);
  });

  it("returns nothing for a blank string", () => {
    expect(splitWords("   ")).toEqual([]);
  });

  it("keeps punctuation attached to its word", () => {
    expect(splitWords("Wait. It failed!")).toEqual(["Wait.", "It", "failed!"]);
  });
});
