/**
 * Composites the paper and ink layers, easing every parameter per frame.
 *
 * Owns no React state and no canvas of its own: the caller supplies the target
 * 2D context, so this runs identically inside a p5 sketch (via
 * `p.drawingContext`) and on the standalone tuning page.
 */

import { blitPaper, createPaperLayer, type PaperLayer } from "./paper";
import { createInkLayer, type InkLayer, type InkParams } from "./ink";
import type { InkTargets } from "./inkMapping";
import { INK_PRESET } from "./preset";

/** Same per-frame easing fraction the streams renderer uses. Nothing snaps. */
const EASING = 0.04;

/** Frames drawn before first display, so the page is never blank on arrival. */
const SEED_STEPS = 900;

/** Seed marks are graphite, not coloured ink — they predate any utterance. */
const SEED_SATURATION = 6;

/**
 * The fade is applied in periodic bites rather than every frame: a per-frame
 * erase small enough to be slow rounds to nothing in 8-bit alpha.
 */
const FADE_BITE = 0.004;

export interface InkRenderer {
  render(
    ctx: CanvasRenderingContext2D,
    targets: InkTargets,
    now: number,
  ): void;
  resize(width: number, height: number): void;
  /** Current eased values, for diagnostics. */
  readonly eased: Readonly<InkTargets>;
}

function initialEased(targets: InkTargets): InkTargets {
  return { ...targets };
}

export function createInkRenderer(
  width: number,
  height: number,
  initialTargets: InkTargets,
): InkRenderer {
  let paper: PaperLayer = createPaperLayer(width, height);
  let ink: InkLayer = createInkLayer(width, height);

  const eased = initialEased(initialTargets);
  let t = 0;
  let fadeAccumulator = 0;
  let seeded = false;

  const inkParams = (): InkParams => ({
    strokeCount: INK_PRESET.strokeCount,
    speed: eased.speed,
    jitter: eased.jitter,
    commitment: eased.commitment,
    opacity: eased.opacity,
    penLift: eased.penLift,
    hue: eased.hue,
    saturation: eased.saturation,
    lightness: eased.lightness,
    lifetime: INK_PRESET.lifetime,
    followContours: INK_PRESET.followContours,
    gestureScale: INK_PRESET.gestureScale,
  });

  return {
    eased,

    resize(w: number, h: number) {
      paper.resize(w, h);
      ink.resize(w, h);
      paper.invalidate();
      seeded = false;
    },

    render(ctx, targets, now) {
      for (const key of Object.keys(eased) as (keyof InkTargets)[]) {
        eased[key] += (targets[key] - eased[key]) * EASING;
      }

      if (!seeded) {
        // Start mid-drawing rather than on a blank sheet — but in near-grey
        // graphite. These marks precede anything the speaker said, so they must
        // not claim a sentiment: with no fade they would otherwise stain the
        // whole session with the startup hue.
        ink.seed({ ...inkParams(), saturation: SEED_SATURATION }, t, SEED_STEPS);
        seeded = true;
      }

      t += 0.004 + eased.speed * 0.0006;

      paper.update(
        {
          crinkle: eased.crinkle,
          grainScale: INK_PRESET.grainScale,
          temperature: eased.temperature,
        },
        t,
        now,
      );

      if (INK_PRESET.fadeRate > 0) {
        fadeAccumulator += INK_PRESET.fadeRate;
        if (fadeAccumulator >= FADE_BITE) {
          ink.fade(fadeAccumulator);
          fadeAccumulator = 0;
        }
      }

      ink.step(inkParams(), t);

      const w = ctx.canvas.width;
      const h = ctx.canvas.height;
      ctx.clearRect(0, 0, w, h);
      blitPaper(ctx, paper, w, h);
      ctx.drawImage(ink.canvas, 0, 0);
    },
  };
}
