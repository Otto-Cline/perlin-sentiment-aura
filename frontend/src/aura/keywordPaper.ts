/**
 * Words on the page.
 *
 * Keywords are printed onto the paper as the model returns them, and stay put.
 * The highlighter never targets them — it follows the field and marks whatever
 * happens to lie under it.
 */

import type { Keyword } from "../types";
import { HIGHLIGHTER } from "./preset";

export interface PlacedKeyword {
  text: string;
  weight: number;
  x: number;
  y: number;
  size: number;
  /** Radians of tilt, fixed at placement. Nothing hand-written sits square. */
  tilt: number;
  /** Frame-independent age, for the write-on. */
  bornAt: number;
}

/** Peak tilt either side of level. Small — a lean, not a slant. */
const MAX_TILT = 0.055;

/** How long a word takes to write itself on. */
export const WRITE_MS = 620;

/**
 * Handwriting from the system stack rather than a webfont: a demo runs on
 * unknown networks and a font that fails to load is a visible failure. Leads
 * with macOS handwriting faces, so it degrades to a generic cursive elsewhere.
 */
const HAND_FONT =
  '"Bradley Hand", "Noteworthy", "Marker Felt", "Segoe Print", ' +
  '"Comic Sans MS", cursive';

/**
 * Fraction of a word that has been written, [0, 1].
 *
 * Real stroke-by-stroke handwriting would need per-glyph path data. Revealing
 * the word left to right behind a growing clip is the same gesture at a
 * fraction of the cost — it reads as a hand moving across the page.
 */
export function writeProgress(bornAt: number, now: number): number {
  return clamp01((now - bornAt) / WRITE_MS);
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function sizeForWeight(weight: number): number {
  return lerp(
    HIGHLIGHTER.fontSizeMin,
    HIGHLIGHTER.fontSizeMax,
    clamp01(weight),
  );
}

/** A region of the canvas the UI already occupies. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Clearance kept between a word and a reserved panel. */
const RESERVED_PAD = 16;

/**
 * Estimated half-extents of a rendered word.
 *
 * Deliberately generous. These feed the reserved-panel test, and an
 * underestimate is the failure that matters: the word's centre clears the panel
 * while its glyphs overhang into it. Handwriting faces are wider per character
 * than the 0.3 factor first used here, which let words bleed under the
 * transcript. Over-estimating only costs a little spacing.
 */
export function halfExtents(text: string, size: number) {
  return {
    halfW: (text.length * size * 0.52) / 2,
    halfH: size * 0.78,
  };
}

function intersectsReserved(
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  reserved: Rect[],
): boolean {
  for (const r of reserved) {
    if (
      cx + halfW > r.x - RESERVED_PAD &&
      cx - halfW < r.x + r.width + RESERVED_PAD &&
      cy + halfH > r.y - RESERVED_PAD &&
      cy - halfH < r.y + r.height + RESERVED_PAD
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Picks the least crowded of several candidate positions, avoiding regions the
 * UI covers.
 *
 * Purely random placement collides and reads as a mess; this keeps the page
 * looking composed without arranging it into a grid. Candidates overlapping a
 * reserved rect are rejected outright — a word behind the transcript panel is
 * simply lost. `rand` is injected so the behaviour is testable.
 */
export function placeKeyword(
  existing: PlacedKeyword[],
  keyword: Keyword,
  width: number,
  height: number,
  now: number,
  reserved: Rect[] = [],
  rand: () => number = Math.random,
): PlacedKeyword {
  const size = sizeForWeight(keyword.weight);
  const { halfW, halfH } = halfExtents(keyword.text, size);
  const marginX = Math.min(width / 2 - 1, halfW + 24);
  const marginY = Math.min(height / 2 - 1, size + 24);

  const candidate = () => ({
    x: marginX + rand() * Math.max(1, width - marginX * 2),
    y: marginY + rand() * Math.max(1, height - marginY * 2),
  });

  let best = { x: width / 2, y: height / 2, clearance: -1 };
  let bestBlocked = { x: width / 2, y: height / 2, clearance: -1 };

  // Extra tries when panels are reserved, since some candidates are discarded.
  const tries = HIGHLIGHTER.placementTries * (reserved.length ? 3 : 1);

  for (let i = 0; i < tries; i++) {
    const { x, y } = candidate();

    let clearance = Infinity;
    for (const other of existing) {
      clearance = Math.min(clearance, Math.hypot(other.x - x, other.y - y));
    }

    if (intersectsReserved(x, y, halfW, halfH, reserved)) {
      // Kept only as a last resort if every candidate lands on a panel.
      if (clearance > bestBlocked.clearance) {
        bestBlocked = { x, y, clearance };
      }
      continue;
    }
    if (clearance > best.clearance) best = { x, y, clearance };
  }

  if (best.clearance < 0) best = bestBlocked;

  return {
    text: keyword.text,
    weight: keyword.weight,
    x: best.x,
    y: best.y,
    size,
    tilt: (rand() * 2 - 1) * MAX_TILT,
    bornAt: now,
  };
}

/** Adds new words, refreshes repeats, and drops the oldest past the cap. */
export function mergePlaced(
  existing: PlacedKeyword[],
  incoming: Keyword[],
  width: number,
  height: number,
  now: number,
  reserved: Rect[] = [],
  rand: () => number = Math.random,
): PlacedKeyword[] {
  let next = [...existing];

  for (const keyword of incoming) {
    const priorIndex = next.findIndex((p) => p.text === keyword.text);
    if (priorIndex >= 0) {
      // A word said again grows, but does not move or restart its fade-in.
      const prior = next[priorIndex];
      next[priorIndex] = {
        ...prior,
        weight: Math.max(prior.weight, keyword.weight),
        size: sizeForWeight(Math.max(prior.weight, keyword.weight)),
      };
      continue;
    }
    next.push(placeKeyword(next, keyword, width, height, now, reserved, rand));
  }

  if (next.length > HIGHLIGHTER.maxKeywords) {
    next = next.slice(next.length - HIGHLIGHTER.maxKeywords);
  }
  return next;
}

/**
 * How much of a word's own opacity the marker removes where it crosses it.
 *
 * Applied on the words' own layer with `destination-out`, so the erase is
 * proportional to the marker's alpha at each pixel. Kept below 1 so a heavily
 * marked passage stays legible rather than vanishing.
 */
const TEXT_KNOCKDOWN = 0.8;

export interface KeywordLayer {
  readonly canvas: HTMLCanvasElement;
  /** Redraws the words, then lowers their opacity under the marker. */
  render(
    placed: PlacedKeyword[],
    now: number,
    markerCanvas: HTMLCanvasElement,
  ): void;
  resize(width: number, height: number): void;
}

/**
 * The words, on their own layer.
 *
 * A separate layer exists so the marker can lower the words' opacity directly.
 * Compositing the marker over the words cannot do it: `multiply` leaves dark
 * pixels untouched, and a normal-blend veil strong enough to be visible on text
 * also washes the whole page pink.
 */
export function createKeywordLayer(
  width: number,
  height: number,
): KeywordLayer {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("keyword layer: 2D context unavailable");

  return {
    canvas,

    render(placed, now, markerCanvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawKeywords(ctx, placed, now);

      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.globalAlpha = TEXT_KNOCKDOWN;
      ctx.drawImage(markerCanvas, 0, 0);
      ctx.restore();
    },

    resize(w, h) {
      canvas.width = Math.max(1, w);
      canvas.height = Math.max(1, h);
    },
  };
}

/**
 * Draws the page's words, written on by hand.
 *
 * Ink, not marker — the highlighter goes over these afterwards.
 */
export function drawKeywords(
  ctx: CanvasRenderingContext2D,
  placed: PlacedKeyword[],
  now: number,
): void {
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  for (const word of placed) {
    const written = writeProgress(word.bornAt, now);
    if (written <= 0) continue;

    ctx.font = `${word.size}px ${HAND_FONT}`;
    const width = ctx.measureText(word.text).width;

    ctx.save();
    ctx.translate(word.x, word.y);
    ctx.rotate(word.tilt);

    if (written < 1) {
      // Clip to the written portion, so the word appears left to right.
      ctx.beginPath();
      ctx.rect(
        -width / 2,
        -word.size,
        width * written,
        word.size * 2,
      );
      ctx.clip();
    }

    // Heavier words sit darker on the page as well as larger.
    const darkness = 0.42 + word.weight * 0.38;
    ctx.fillStyle = `rgba(27, 26, 23, ${darkness.toFixed(3)})`;
    ctx.fillText(word.text, -width / 2, 0);

    ctx.restore();
  }

  ctx.restore();
}
