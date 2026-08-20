import { describe, expect, it } from "vitest";
import {
  KEYWORD_TTL_MS,
  expireKeywords,
  mergeKeywords,
} from "./useKeywordCloud";

describe("keyword cloud", () => {
  it("adds new keywords with a birth timestamp", () => {
    const map = mergeKeywords(new Map(), [{ text: "launch", weight: 0.8 }], 1000);
    expect(map.get("launch")).toEqual({
      text: "launch",
      weight: 0.8,
      bornAt: 1000,
    });
  });

  it("keeps the original bornAt when a keyword recurs", () => {
    let map = mergeKeywords(new Map(), [{ text: "launch", weight: 0.5 }], 1000);
    map = mergeKeywords(map, [{ text: "launch", weight: 0.9 }], 5000);
    expect(map.get("launch")?.bornAt).toBe(1000);
  });

  it("refreshes the weight when a keyword recurs", () => {
    let map = mergeKeywords(new Map(), [{ text: "launch", weight: 0.5 }], 1000);
    map = mergeKeywords(map, [{ text: "launch", weight: 0.9 }], 5000);
    expect(map.get("launch")?.weight).toBe(0.9);
  });

  it("expires keywords older than the TTL", () => {
    const map = mergeKeywords(new Map(), [{ text: "old", weight: 0.5 }], 0);
    expect(expireKeywords(map, KEYWORD_TTL_MS + 1).size).toBe(0);
  });

  it("keeps keywords inside the TTL", () => {
    const map = mergeKeywords(new Map(), [{ text: "fresh", weight: 0.5 }], 0);
    expect(expireKeywords(map, KEYWORD_TTL_MS - 1).size).toBe(1);
  });

  it("does not mutate the input map", () => {
    const original = mergeKeywords(new Map(), [{ text: "a", weight: 0.5 }], 0);
    mergeKeywords(original, [{ text: "b", weight: 0.5 }], 10);
    expect(original.size).toBe(1);
  });
});
