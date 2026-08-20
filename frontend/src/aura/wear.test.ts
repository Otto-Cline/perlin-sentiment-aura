import { describe, expect, it } from "vitest";
import { PaperWear, WEAR_PER_AROUSAL } from "./wear";

describe("PaperWear", () => {
  it("starts at zero", () => {
    expect(new PaperWear().value).toBe(0);
  });

  it("accumulates with arousal", () => {
    const w = new PaperWear();
    w.add(1);
    expect(w.value).toBeCloseTo(WEAR_PER_AROUSAL);
    w.add(1);
    expect(w.value).toBeCloseTo(WEAR_PER_AROUSAL * 2);
  });

  it("never decreases, whatever the arousal sequence", () => {
    const w = new PaperWear();
    let previous = 0;
    const sequence = [1, 0, 0.5, 0, 0, 0.9, 0.1, 0, 0, 0, 0.7];
    for (const a of sequence) {
      w.add(a);
      expect(w.value).toBeGreaterThanOrEqual(previous);
      previous = w.value;
    }
    expect(w.value).toBeGreaterThan(0);
  });

  it("stays flat through a calm stretch instead of drifting down", () => {
    const w = new PaperWear();
    w.add(1);
    const afterSpike = w.value;
    for (let i = 0; i < 200; i++) w.add(0);
    expect(w.value).toBe(afterSpike);
  });

  it("clamps arousal above 1 rather than accumulating faster", () => {
    const w = new PaperWear();
    w.add(50);
    expect(w.value).toBeCloseTo(WEAR_PER_AROUSAL);
  });

  it("ignores negative arousal rather than eroding wear", () => {
    const w = new PaperWear();
    w.add(1);
    w.add(-100);
    expect(w.value).toBeCloseTo(WEAR_PER_AROUSAL);
  });

  it("ignores NaN rather than poisoning the accumulator", () => {
    const w = new PaperWear();
    w.add(1);
    w.add(Number.NaN);
    expect(Number.isFinite(w.value)).toBe(true);
    expect(w.value).toBeCloseTo(WEAR_PER_AROUSAL);
  });

  it("saturates crinkle at 1 but keeps accumulating underneath", () => {
    const w = new PaperWear();
    for (let i = 0; i < 500; i++) w.add(1);
    expect(w.crinkle).toBe(1);
    expect(w.value).toBeGreaterThan(1);
  });

  it("fully wears the sheet within a demo-length session", () => {
    // The reason this channel exists is to be seen. At the demo's cadence —
    // one utterance every 3.2s, mean arousal ~0.6 — the surface must reach full
    // depth inside a couple of minutes, or it carries no weight on camera.
    const w = new PaperWear();
    const utterances = Math.floor(120 / 3.2);
    for (let i = 0; i < utterances; i++) w.add(0.6);
    expect(w.crinkle).toBe(1);
  });

  it("still leaves a calm conversation smooth over the same span", () => {
    // ...but quiet speech must not wear it, or the distinction means nothing.
    const w = new PaperWear();
    const utterances = Math.floor(120 / 3.2);
    for (let i = 0; i < utterances; i++) w.add(0.15);
    expect(w.crinkle).toBeLessThan(0.4);
  });

  it("only returns to zero through an explicit reset", () => {
    const w = new PaperWear();
    w.add(1);
    expect(w.value).toBeGreaterThan(0);
    w.reset();
    expect(w.value).toBe(0);
  });

  it("refuses assignment outright rather than silently ignoring it", () => {
    const w = new PaperWear();
    w.add(1);
    const before = w.value;
    // `value` is a getter over a private field, so in strict mode (which ES
    // modules always are) an assignment throws instead of quietly succeeding.
    expect(() => {
      (w as unknown as Record<string, unknown>).value = 0;
    }).toThrow(TypeError);
    expect(w.value).toBe(before);
  });
});
