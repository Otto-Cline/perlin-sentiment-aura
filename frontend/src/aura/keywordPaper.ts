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
  /** Frame-independent age, for the fade-in. */
  bornAt: number;
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

/**
 * Picks the least crowded of several candidate positions.
 *
 * Purely random placement collides and reads as a mess; this keeps the page
 * looking composed without arranging it into a grid. `rand` is injected so the
 * behaviour is testable.
 */
export function placeKeyword(
  existing: PlacedKeyword[],
  keyword: Keyword,
  width: number,
  height: number,
  now: number,
  rand: () => number = Math.random,
): PlacedKeyword {
  const size = sizeForWeight(keyword.weight);
  // Rough text extent, enough for spacing decisions.
  const halfW = (keyword.text.length * size * 0.3) / 2;
  const marginX = Math.min(width / 2 - 1, halfW + 24);
  const marginY = Math.min(height / 2 - 1, size + 24);

  let best = { x: width / 2, y: height / 2, clearance: -1 };

  for (let i = 0; i < HIGHLIGHTER.placementTries; i++) {
    const x = marginX + rand() * Math.max(1, width - marginX * 2);
    const y = marginY + rand() * Math.max(1, height - marginY * 2);

    let clearance = Infinity;
    for (const other of existing) {
      const dx = other.x - x;
      const dy = other.y - y;
      clearance = Math.min(clearance, Math.hypot(dx, dy));
    }
    if (clearance > best.clearance) best = { x, y, clearance };
  }

  return { text: keyword.text, weight: keyword.weight, x: best.x, y: best.y, size, bornAt: now };
}

/** Adds new words, refreshes repeats, and drops the oldest past the cap. */
export function mergePlaced(
  existing: PlacedKeyword[],
  incoming: Keyword[],
  width: number,
  height: number,
  now: number,
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
    next.push(placeKeyword(next, keyword, width, height, now, rand));
  }

  if (next.length > HIGHLIGHTER.maxKeywords) {
    next = next.slice(next.length - HIGHLIGHTER.maxKeywords);
  }
  return next;
}

/** Opacity for a word's entrance, [0, 1]. */
export function keywordFadeIn(bornAt: number, now: number): number {
  const FADE_MS = 900;
  return clamp01((now - bornAt) / FADE_MS);
}

const FONT_STACK =
  '"New York", "Iowan Old Style", Georgia, "Times New Roman", serif';

/** Draws the page's words. Ink, not marker — the highlighter goes over these. */
export function drawKeywords(
  ctx: CanvasRenderingContext2D,
  placed: PlacedKeyword[],
  now: number,
): void {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const word of placed) {
    const fade = keywordFadeIn(word.bornAt, now);
    if (fade <= 0) continue;
    ctx.font = `${word.size}px ${FONT_STACK}`;
    // Heavier words sit darker on the page as well as larger.
    const darkness = 0.42 + word.weight * 0.38;
    ctx.fillStyle = `rgba(27, 26, 23, ${(darkness * fade).toFixed(3)})`;
    ctx.fillText(word.text, word.x, word.y);
  }

  ctx.restore();
}
