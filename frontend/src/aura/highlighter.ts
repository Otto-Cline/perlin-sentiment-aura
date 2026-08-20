/**
 * The highlighter layer.
 *
 * One or two translucent nibs following the shared Perlin field. There is no
 * targeting: the field is the only thing steering, and whichever words happen
 * to lie under the path get marked. Composited with `multiply` so the words
 * stay readable underneath, the way a real marker behaves.
 */

import { GESTURE_SCALE, angleAt } from "./field";
import { HIGHLIGHTER } from "./preset";

export interface HighlighterParams {
  hue: number;
  saturation: number;
  lightness: number;
  alpha: number;
  thickness: number;
  speed: number;
  /** [0, 1]. 0 = long smooth sweeps, 1 = abrupt erratic turns. */
  turnSharpness: number;
}

const TAU = Math.PI * 2;

/**
 * How hard a smooth hand resists the field, and how hard a jittery one snaps.
 *
 * Both are low. The field's heading spans two full turns, so a nib that tracks
 * it closely writhes like a ribbon instead of sweeping — resisting the field is
 * what makes a stroke read as a deliberate mark.
 */
const TURN_RATE_SMOOTH = 0.02;
const TURN_RATE_SHARP = 0.34;

/** At full sharpness the hand also kicks outright, this often per frame. */
const KINK_CHANCE = 0.06;
const KINK_RADIANS = 1.1;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Signed shortest rotation from `from` to `to`, in [-PI, PI].
 *
 * Without the wrap, a heading crossing 0/2PI turns the long way round and the
 * stroke visibly loops backwards.
 */
export function shortestAngleDelta(from: number, to: number): number {
  let delta = (to - from) % TAU;
  if (delta > Math.PI) delta -= TAU;
  if (delta < -Math.PI) delta += TAU;
  return delta;
}

/** Fraction of the way to the field's heading taken per frame. */
export function turnRateFor(sharpness: number): number {
  return (
    TURN_RATE_SMOOTH +
    (TURN_RATE_SHARP - TURN_RATE_SMOOTH) * clamp01(sharpness)
  );
}

interface Nib {
  x: number;
  y: number;
  heading: number;
}

export interface HighlighterLayer {
  readonly canvas: HTMLCanvasElement;
  step(params: HighlighterParams, t: number): void;
  fade(rate: number): void;
  seed(params: HighlighterParams, t: number, steps: number): void;
  resize(width: number, height: number): void;
  clear(): void;
}

export function createHighlighterLayer(
  width: number,
  height: number,
  rand: () => number = Math.random,
): HighlighterLayer {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("highlighter layer: 2D context unavailable");

  // Square caps and joins: a chisel nib, not a ballpoint.
  ctx.lineCap = "square";
  ctx.lineJoin = "round";

  let nibs: Nib[] = [];

  const spawn = (): Nib => ({
    x: rand() * canvas.width,
    y: rand() * canvas.height,
    heading: rand() * TAU,
  });

  const step = (params: HighlighterParams, t: number) => {
    while (nibs.length < HIGHLIGHTER.strokeCount) nibs.push(spawn());
    if (nibs.length > HIGHLIGHTER.strokeCount) {
      nibs.length = HIGHLIGHTER.strokeCount;
    }

    const scale = GESTURE_SCALE * HIGHLIGHTER.gestureScale;
    const turnRate = turnRateFor(params.turnSharpness);

    ctx.strokeStyle = `hsla(${params.hue % 360}, ${params.saturation}%, ${
      params.lightness
    }%, ${params.alpha})`;
    ctx.lineWidth = Math.max(1, params.thickness);

    for (const nib of nibs) {
      const fieldHeading = angleAt(nib.x * scale, nib.y * scale, t);
      nib.heading += shortestAngleDelta(nib.heading, fieldHeading) * turnRate;

      // A hesitant hand does not merely turn faster, it jerks.
      if (params.turnSharpness > 0.5 && rand() < KINK_CHANCE * params.turnSharpness) {
        nib.heading += (rand() * 2 - 1) * KINK_RADIANS;
      }

      const fromX = nib.x;
      const fromY = nib.y;
      nib.x += Math.cos(nib.heading) * params.speed;
      nib.y += Math.sin(nib.heading) * params.speed;

      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(nib.x, nib.y);
      ctx.stroke();

      const margin = params.thickness;
      if (
        nib.x < -margin ||
        nib.x > canvas.width + margin ||
        nib.y < -margin ||
        nib.y > canvas.height + margin
      ) {
        Object.assign(nib, spawn());
      }
    }
  };

  return {
    canvas,
    step,

    fade(rate: number) {
      if (rate <= 0) return;
      const previous = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(1, rate)})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = previous;
    },

    seed(params: HighlighterParams, t: number, steps: number) {
      for (let i = 0; i < steps; i++) step(params, t + i * 0.002);
    },

    resize(w: number, h: number) {
      canvas.width = Math.max(1, w);
      canvas.height = Math.max(1, h);
      ctx.lineCap = "square";
      ctx.lineJoin = "round";
      nibs = [];
    },

    clear() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      nibs = [];
    },
  };
}
