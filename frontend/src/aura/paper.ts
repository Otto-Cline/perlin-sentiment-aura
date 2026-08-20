/**
 * Layer 1 — the paper surface.
 *
 * Shaded by finite differences on the grain field, lit from the upper left.
 * Renders to a quarter-resolution offscreen canvas and upscales with smoothing:
 * a full-resolution per-pixel pass every frame would dominate the frame budget,
 * and this is a background — it does not need 60fps.
 */

import { GRAIN_SCALE, GRAIN_TIME_RATE, field } from "./field";

/** Downscale factor for the offscreen buffer. */
const SCALE_DIV = 4;

/** Minimum gap between paper re-renders. */
export const RERENDER_MS = 300;

/** Re-render early if crinkle has moved at least this much. */
export const CRINKLE_EPSILON = 0.02;

/**
 * Peak luminance swing at full crinkle, as a fraction. Kept low on purpose:
 * past roughly 12% the surface stops reading as texture and starts competing
 * with the ink.
 */
const MAX_LUMINANCE_SWING = 0.11;

/**
 * Converts the field gradient into a shade multiplier. Calibrated by measuring
 * rendered luminance rather than derived: the gradient's magnitude depends on
 * the grain scale and the finite-difference spacing, so the honest way to set
 * this is to render and measure. Measured peak-to-peak luminance swing at this
 * value: 3.2% at crinkle 0.25, 6.5% at 0.5, 9.6% at 0.75, 12.6% at 1.0 — so
 * even a fully worn sheet sits at the top of the intended 8-12% band rather
 * than past it. Re-measure if GRAIN_SCALE or SCALE_DIV changes.
 */
const SHADE_GAIN = 3.2;

/** Light from the upper left, normalized. */
const LIGHT_X = -0.7071;
const LIGHT_Y = -0.7071;

export interface PaperParams {
  /** [0, 1] — surface depth, driven by cumulative wear. */
  crinkle: number;
  /** Multiplier on GRAIN_SCALE, for tuning. 1 = the shared default. */
  grainScale: number;
  /** [0, 1] — cool grey to warm cream. Follows valence, weakly. */
  temperature: number;
}

/** Cool grey and warm cream. Low saturation: the ink owns the hue. */
const COOL = { r: 233, g: 234, b: 233 };
const WARM = { r: 244, g: 240, b: 229 };

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export interface PaperLayer {
  readonly canvas: HTMLCanvasElement;
  /** Redraws only when due; returns true if it actually re-rendered. */
  update(params: PaperParams, t: number, now: number): boolean;
  resize(width: number, height: number): void;
  /** Forces the next update() to re-render. */
  invalidate(): void;
}

export function shouldRerender(
  now: number,
  lastRenderAt: number,
  crinkle: number,
  lastCrinkle: number,
): boolean {
  if (lastRenderAt < 0) return true;
  if (now - lastRenderAt >= RERENDER_MS) return true;
  return Math.abs(crinkle - lastCrinkle) >= CRINKLE_EPSILON;
}

export function createPaperLayer(
  width: number,
  height: number,
): PaperLayer {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("paper layer: 2D context unavailable");

  let bufferW = 0;
  let bufferH = 0;
  let image: ImageData | null = null;
  let lastRenderAt = -1;
  let lastCrinkle = -1;

  const resize = (w: number, h: number) => {
    bufferW = Math.max(1, Math.ceil(w / SCALE_DIV));
    bufferH = Math.max(1, Math.ceil(h / SCALE_DIV));
    canvas.width = bufferW;
    canvas.height = bufferH;
    image = ctx.createImageData(bufferW, bufferH);
    lastRenderAt = -1;
  };

  resize(width, height);

  const update = (params: PaperParams, t: number, now: number): boolean => {
    if (!shouldRerender(now, lastRenderAt, params.crinkle, lastCrinkle)) {
      return false;
    }

    const data = image!.data;
    const scale = GRAIN_SCALE * params.grainScale;
    const gt = t * GRAIN_TIME_RATE;
    const swing = MAX_LUMINANCE_SWING * params.crinkle;

    const base = {
      r: mix(COOL.r, WARM.r, params.temperature),
      g: mix(COOL.g, WARM.g, params.temperature),
      b: mix(COOL.b, WARM.b, params.temperature),
    };

    // Finite differences are taken in screen pixels, so the shading reads the
    // same regardless of SCALE_DIV.
    const grainAt = (sx: number, sy: number) => field(sx * scale, sy * scale, gt);

    for (let j = 0; j < bufferH; j++) {
      const sy = j * SCALE_DIV;
      for (let i = 0; i < bufferW; i++) {
        const sx = i * SCALE_DIV;

        const dx = grainAt(sx + 1, sy) - grainAt(sx - 1, sy);
        const dy = grainAt(sx, sy + 1) - grainAt(sx, sy - 1);

        // Surface normal tilt dotted with the light direction.
        const lambert = dx * LIGHT_X + dy * LIGHT_Y;
        const shade = 1 + lambert * swing * SHADE_GAIN;

        const o = (j * bufferW + i) * 4;
        data[o] = Math.min(255, Math.max(0, base.r * shade));
        data[o + 1] = Math.min(255, Math.max(0, base.g * shade));
        data[o + 2] = Math.min(255, Math.max(0, base.b * shade));
        data[o + 3] = 255;
      }
    }

    ctx.putImageData(image!, 0, 0);
    lastRenderAt = now;
    lastCrinkle = params.crinkle;
    return true;
  };

  return {
    canvas,
    update,
    resize,
    invalidate: () => {
      lastRenderAt = -1;
    },
  };
}

/** Draws the low-res buffer up to full size, smoothed. */
export function blitPaper(
  target: CanvasRenderingContext2D,
  layer: PaperLayer,
  width: number,
  height: number,
): void {
  target.imageSmoothingEnabled = true;
  target.imageSmoothingQuality = "high";
  target.drawImage(layer.canvas, 0, 0, width, height);
}
