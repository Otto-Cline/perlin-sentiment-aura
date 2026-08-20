/**
 * Cumulative paper wear. Monotonic by construction.
 *
 * The ink shows the present moment; the paper shows the whole session. A calm
 * conversation stays smooth, a long intense one leaves a permanently worn
 * surface that stays worn after things settle.
 *
 * `reset()` is the only path that lowers this, and it exists for an explicit
 * user reset. Nothing else may decrease it — that is why `value` is a getter
 * over a private field rather than a mutable property.
 */

/**
 * Wear added per analysis update, at full arousal.
 *
 * Arousal is SQUARED before scaling (see `add`), which is what lets this be
 * fast enough to see without erasing the point of the channel. Sized from the
 * demo's real cadence — one utterance every 3.2s, mean squared arousal ~0.45 —
 * it fully wears the sheet in roughly 65 seconds of energetic speech, while
 * quiet speech (arousal ~0.15) would need over twenty minutes.
 *
 * A linear scale could not do both: raising it enough to be visible in a demo
 * also wore the page during calm speech, and the original 0.01 needed nine
 * minutes of shouting before the surface moved at all. The depth reached at full
 * wear is set separately by SHADE_GAIN in paper.ts — this constant only controls
 * how quickly the surface gets there.
 */
export const WEAR_PER_AROUSAL = 0.11;

/** Crinkle saturates here; past this, more wear stops deepening the surface. */
export const WEAR_FULL_CRINKLE = 1;

export class PaperWear {
  #value = 0;

  get value(): number {
    return this.#value;
  }

  /**
   * Call once per analysis update — NOT once per frame. At 60fps a per-frame
   * call saturates crinkle in under three seconds, which defeats the point;
   * per utterance it takes a long, intense conversation to fully wear the sheet.
   * Arousal outside [0, 1] is clamped.
   */
  add(arousal: number): void {
    if (!Number.isFinite(arousal)) return;
    const clamped = Math.min(1, Math.max(0, arousal));
    // Squared: loud moments wear the sheet far faster than quiet ones, so the
    // surface can move inside a demo while a calm conversation stays smooth.
    this.#value += clamped * clamped * WEAR_PER_AROUSAL;
  }

  /** Normalized crinkle depth, [0, 1]. */
  get crinkle(): number {
    return Math.min(1, this.#value / WEAR_FULL_CRINKLE);
  }

  /** Explicit user reset — the only sanctioned way back to a fresh sheet. */
  reset(): void {
    this.#value = 0;
  }
}
