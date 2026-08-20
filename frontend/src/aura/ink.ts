/**
 * Layer 2 — the ink.
 *
 * A handful of pens tracing the shared field and leaving permanent-ish trails.
 * Ink lives on its own transparent canvas and fades by erasing (destination-out)
 * rather than by washing paper over itself: erasing decays toward transparent so
 * the paper shows through, where a coloured wash would silt up into mud.
 */

import { GESTURE_SCALE, angleAt } from "./field";

export interface InkParams {
  /** Pens on the page. Small — this is a drawing, not a swarm. */
  strokeCount: number;
  /** Pixels per frame at full arousal. */
  speed: number;
  /** Radians of random wobble added to the field angle — an unsteady hand. */
  jitter: number;
  /** [0, 1]. High: one clean line. Low: the same path re-sketched, offset. */
  commitment: number;
  /** [0, 1] — ink opacity. */
  opacity: number;
  /** [0, 1] — chance per frame that a pen lifts off the page. */
  penLift: number;
  /** Hue in degrees, saturation and lightness as percentages. */
  hue: number;
  saturation: number;
  lightness: number;
  /** Frames a pen draws before it respawns elsewhere. */
  lifetime: number;
  /** Rotate 90° to travel along contours rather than into sinks. */
  followContours: boolean;
  /** Multiplier on GESTURE_SCALE, for tuning. */
  gestureScale: number;
}

/** Extra passes at zero commitment. Each is one re-sketch of the same path. */
const MAX_RESKETCH_PASSES = 5;

/**
 * Shapes how fast hesitation sets in. Above 1 keeps a confident speaker on a
 * single clean line and then ramps hard, so the difference between assured and
 * hedging is obvious rather than gradual.
 */
const RESKETCH_CURVE = 1.6;

/** How far a re-sketch pass strays, in pixels. Wide enough to read as scribble. */
const RESKETCH_OFFSET = 4.5;

/** Slow pens pool like real ink; fast ones run thin. */
const WIDTH_AT_REST = 5;
const WIDTH_AT_SPEED = 0.45;

/** Top of the mapped speed range, for normalizing stroke width. */
const SPEED_CEILING = 7;

interface Pen {
  x: number;
  y: number;
  age: number;
  life: number;
  /** False while the pen is lifted, so the line breaks instead of jumping. */
  down: boolean;
}

export interface InkLayer {
  readonly canvas: HTMLCanvasElement;
  step(params: InkParams, t: number): void;
  /** Erases a little, so old marks recede without the page going muddy. */
  fade(rate: number): void;
  /** Runs steps without display, so the page is never blank on arrival. */
  seed(params: InkParams, t: number, steps: number): void;
  resize(width: number, height: number): void;
  clear(): void;
  readonly penCount: number;
}

export function strokeWidthFor(speed: number, maxSpeed: number): number {
  const normalized = maxSpeed <= 0 ? 0 : Math.min(1, speed / maxSpeed);
  return WIDTH_AT_REST + (WIDTH_AT_SPEED - WIDTH_AT_REST) * normalized;
}

export function resketchPasses(commitment: number): number {
  // A non-finite commitment would make `alpha = opacity / passes` NaN, which
  // silently erases every stroke instead of failing loudly. Treat it as fully
  // committed — one clean line.
  if (!Number.isFinite(commitment)) return 1;
  const clamped = Math.min(1, Math.max(0, commitment));
  // Curved and floored: a confident speaker holds one clean line down to ~0.72,
  // then hesitation ramps steeply to a visible scribble at zero.
  const hesitation = (1 - clamped) ** RESKETCH_CURVE;
  return 1 + Math.floor(hesitation * MAX_RESKETCH_PASSES);
}

export function createInkLayer(width: number, height: number): InkLayer {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("ink layer: 2D context unavailable");

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  let pens: Pen[] = [];

  const spawn = (): Pen => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    age: 0,
    // Staggered so pens don't all respawn on the same frame.
    life: 0,
    down: true,
  });

  const syncCount = (target: number, lifetime: number) => {
    const wanted = Math.max(1, Math.round(target));
    while (pens.length < wanted) {
      const pen = spawn();
      pen.life = lifetime * (0.4 + Math.random() * 0.9);
      pens.push(pen);
    }
    if (pens.length > wanted) pens.length = wanted;
  };

  const step = (params: InkParams, t: number) => {
    syncCount(params.strokeCount, params.lifetime);

    const scale = GESTURE_SCALE * params.gestureScale;
    const passes = resketchPasses(params.commitment);
    // sqrt, not linear: dividing by the pass count made a hesitant stroke fade
    // out rather than look scribbled. This keeps overall density roughly steady
    // while the overlapping passes stay individually visible.
    const alpha = params.opacity / Math.sqrt(passes);

    ctx.strokeStyle =
      `hsla(${params.hue}, ${params.saturation}%, ${params.lightness}%, ${alpha})`;

    for (const pen of pens) {
      // A lifted pen still travels; it just leaves no mark.
      if (Math.random() < params.penLift) pen.down = !pen.down;

      let angle = angleAt(pen.x * scale, pen.y * scale, t);
      if (params.followContours) angle += Math.PI / 2;
      if (params.jitter > 0) angle += (Math.random() * 2 - 1) * params.jitter;

      const fromX = pen.x;
      const fromY = pen.y;
      pen.x += Math.cos(angle) * params.speed;
      pen.y += Math.sin(angle) * params.speed;

      if (pen.down) {
        ctx.lineWidth = strokeWidthFor(params.speed, SPEED_CEILING);
        for (let pass = 0; pass < passes; pass++) {
          // Pass 0 is the true path; the rest are the hesitant re-draws.
          const jx = pass === 0 ? 0 : (Math.random() * 2 - 1) * RESKETCH_OFFSET;
          const jy = pass === 0 ? 0 : (Math.random() * 2 - 1) * RESKETCH_OFFSET;
          ctx.beginPath();
          ctx.moveTo(fromX + jx, fromY + jy);
          ctx.lineTo(pen.x + jx, pen.y + jy);
          ctx.stroke();
        }
      }

      pen.age += 1;
      const offPage =
        pen.x < 0 || pen.x > canvas.width || pen.y < 0 || pen.y > canvas.height;

      // Lifetime matters even on-page: a lone pen can fall into a vortex and
      // circle the same loop indefinitely.
      if (offPage || pen.age > pen.life) {
        const fresh = spawn();
        fresh.life = params.lifetime * (0.6 + Math.random() * 0.8);
        Object.assign(pen, fresh);
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

    seed(params: InkParams, t: number, steps: number) {
      for (let i = 0; i < steps; i++) step(params, t + i * 0.002);
    },

    resize(w: number, h: number) {
      canvas.width = Math.max(1, w);
      canvas.height = Math.max(1, h);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      pens = [];
    },

    clear() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pens = [];
    },

    get penCount() {
      return pens.length;
    },
  };
}
