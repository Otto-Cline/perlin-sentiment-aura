import { describe, expect, it } from "vitest";
import { AnalysisGate } from "./useAnalysis";

describe("AnalysisGate", () => {
  it("issues monotonically increasing sequence numbers", () => {
    const gate = new AnalysisGate();
    expect(gate.issue()).toBe(0);
    expect(gate.issue()).toBe(1);
    expect(gate.issue()).toBe(2);
  });

  it("accepts responses arriving in order", () => {
    const gate = new AnalysisGate();
    expect(gate.accept(0)).toBe(true);
    expect(gate.accept(1)).toBe(true);
  });

  it("drops a stale response that arrives after a newer one", () => {
    const gate = new AnalysisGate();
    expect(gate.accept(5)).toBe(true);
    expect(gate.accept(3)).toBe(false);
  });

  it("drops a duplicate of the last applied response", () => {
    const gate = new AnalysisGate();
    expect(gate.accept(2)).toBe(true);
    expect(gate.accept(2)).toBe(false);
  });

  it("keeps dropping stale responses without lowering the watermark", () => {
    const gate = new AnalysisGate();
    gate.accept(10);
    expect(gate.accept(4)).toBe(false);
    expect(gate.accept(9)).toBe(false);
    expect(gate.accept(11)).toBe(true);
  });

  it("accepts seq 0 as the first response", () => {
    const gate = new AnalysisGate();
    expect(gate.accept(0)).toBe(true);
  });
});
