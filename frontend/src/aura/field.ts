/**
 * The one noise field. Paper and pen both read from here.
 *
 * Same function, same seed, same coordinates — only the input multiplier and
 * time rate differ between callers:
 *
 *   const gesture = field(x * 0.005, y * 0.005, t);        // pen direction
 *   const grain   = field(x * 0.09,  y * 0.09,  t * 0.05); // paper surface
 *
 * The correlation is the whole point: the paper bulges where the pen curves.
 * Do not add a second instance or a second seed.
 *
 * Seeded Perlin rather than p5's `noise()`, because p5's generator is bound to a
 * p5 instance and the tuning page has none — sharing a seed across both contexts
 * requires a generator that does not depend on p5.
 */

const OCTAVES = 3;
const GAIN = 0.5;
const LACUNARITY = 2;

export const DEFAULT_SEED = 0x5eed1;

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function buildPermutation(seed: number): Uint8Array {
  // xorshift32, so the table is reproducible from the seed alone.
  let s = seed | 0 || 1;
  const rand = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };

  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i++) base[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = base[i];
    base[i] = base[j];
    base[j] = t;
  }

  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = base[i & 255];
  return perm;
}

function grad(hash: number, x: number, y: number, z: number): number {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

/** Improved Perlin noise, roughly [-1, 1]. */
function perlin3(
  perm: Uint8Array,
  x: number,
  y: number,
  z: number,
): number {
  const xi = Math.floor(x) & 255;
  const yi = Math.floor(y) & 255;
  const zi = Math.floor(z) & 255;

  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const zf = z - Math.floor(z);

  const u = fade(xf);
  const v = fade(yf);
  const w = fade(zf);

  const a = perm[xi] + yi;
  const aa = perm[a] + zi;
  const ab = perm[a + 1] + zi;
  const b = perm[xi + 1] + yi;
  const ba = perm[b] + zi;
  const bb = perm[b + 1] + zi;

  const x1 = mix(
    grad(perm[aa], xf, yf, zf),
    grad(perm[ba], xf - 1, yf, zf),
    u,
  );
  const x2 = mix(
    grad(perm[ab], xf, yf - 1, zf),
    grad(perm[bb], xf - 1, yf - 1, zf),
    u,
  );
  const y1 = mix(x1, x2, v);

  const x3 = mix(
    grad(perm[aa + 1], xf, yf, zf - 1),
    grad(perm[ba + 1], xf - 1, yf, zf - 1),
    u,
  );
  const x4 = mix(
    grad(perm[ab + 1], xf, yf - 1, zf - 1),
    grad(perm[bb + 1], xf - 1, yf - 1, zf - 1),
    u,
  );
  const y2 = mix(x3, x4, v);

  return mix(y1, y2, w);
}

const permutation = buildPermutation(DEFAULT_SEED);

/**
 * Fractal Brownian motion over the shared Perlin field. Returns [0, 1].
 *
 * New in this version: the previous renderer blended two octaves with a weight
 * driven by speaker certainty. Certainty now drives stroke commitment instead,
 * so the octave weighting is fixed here.
 */
export function field(x: number, y: number, t: number): number {
  let sum = 0;
  let amplitude = 1;
  let frequency = 1;
  let normalizer = 0;

  for (let o = 0; o < OCTAVES; o++) {
    sum += perlin3(permutation, x * frequency, y * frequency, t * frequency) *
      amplitude;
    normalizer += amplitude;
    amplitude *= GAIN;
    frequency *= LACUNARITY;
  }

  // Perlin's range is narrower than [-1, 1] in practice; the clamp keeps the
  // contract exact so callers can trust [0, 1].
  const normalized = sum / normalizer;
  return Math.min(1, Math.max(0, (normalized + 1) / 2));
}

/** Pen direction, in radians. Preserves the previous `noise * TWO_PI * 2`. */
export function angleAt(x: number, y: number, t: number): number {
  return field(x, y, t) * Math.PI * 4;
}

export const GESTURE_SCALE = 0.005;
export const GRAIN_SCALE = 0.09;
export const GRAIN_TIME_RATE = 0.05;
