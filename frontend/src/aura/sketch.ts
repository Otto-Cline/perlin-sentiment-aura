import type p5 from "p5";
import type { VisualTargets } from "./mapping";

const PARTICLE_COUNT = 850;
const SMOOTHING = 0.04;
const BG_HUE = 225;
// Per-frame wipe, out of 255. Sets how long trails persist: lower means longer
// streaks and more accumulation. Balanced against `alpha` in mapping.ts.
const TRAIL_FADE = 7;
const STROKE_WEIGHT = 1.2;

const START: VisualTargets = {
  hue: 212,
  saturation: 16,
  alpha: 34,
  speed: 0.8,
  noiseStep: 0.0008,
  turbulence: 0.15,
  coherence: 0.5,
};

/**
 * p5 instance-mode sketch factory.
 *
 * `getTargets` is read fresh on every frame — never closed over a React prop.
 * Each target is approached by a fixed fraction per frame, which is what makes
 * every transition continuous no matter how abruptly the analysis changes.
 */
export function createSketch(getTargets: () => VisualTargets) {
  return (p: p5) => {
    const cur: VisualTargets = { ...START };
    const xs = new Float32Array(PARTICLE_COUNT);
    const ys = new Float32Array(PARTICLE_COUNT);
    let zoff = 0;

    const scatter = (i: number) => {
      xs[i] = p.random(p.width);
      ys[i] = p.random(p.height);
    };

    p.setup = () => {
      p.createCanvas(p.windowWidth, p.windowHeight);
      p.pixelDensity(1);
      p.colorMode(p.HSB, 360, 100, 100, 255);
      p.background(BG_HUE, 34, 5);
      for (let i = 0; i < PARTICLE_COUNT; i++) scatter(i);
    };

    p.draw = () => {
      const target = getTargets();
      for (const key of Object.keys(cur) as (keyof VisualTargets)[]) {
        cur[key] += (target[key] - cur[key]) * SMOOTHING;
      }

      // Low-alpha wash instead of a hard clear: this is what leaves trails.
      p.noStroke();
      p.fill(BG_HUE, 34, 5, TRAIL_FADE);
      p.rect(0, 0, p.width, p.height);

      p.stroke(cur.hue, cur.saturation, 96, cur.alpha);
      p.strokeWeight(STROKE_WEIGHT);

      const scale = 0.0015 + cur.turbulence * 0.0021;
      // Coherence inverts into how much the finer octave is allowed to argue
      // with the base field.
      const dissent = 1 - cur.coherence;

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const base = p.noise(xs[i] * scale, ys[i] * scale, zoff);
        const fine = p.noise(
          xs[i] * scale * 3.3,
          ys[i] * scale * 3.3,
          zoff + 40,
        );
        const angle = (base * (1 - dissent) + fine * dissent) * p.TWO_PI * 2;

        const px = xs[i];
        const py = ys[i];
        xs[i] += Math.cos(angle) * cur.speed;
        ys[i] += Math.sin(angle) * cur.speed;
        p.line(px, py, xs[i], ys[i]);

        if (xs[i] < 0 || xs[i] > p.width || ys[i] < 0 || ys[i] > p.height) {
          scatter(i);
        }
      }

      zoff += cur.noiseStep;
    };

    p.windowResized = () => {
      p.resizeCanvas(p.windowWidth, p.windowHeight);
      p.background(BG_HUE, 34, 5);
      for (let i = 0; i < PARTICLE_COUNT; i++) scatter(i);
    };
  };
}
