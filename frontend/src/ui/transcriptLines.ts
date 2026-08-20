export interface TranscriptLine {
  id: number;
  text: string;
}

export const VISIBLE_LINES = 8;

/**
 * Windows the transcript to the most recent lines, tagging each with a stable
 * id.
 *
 * The id is the line's absolute position, not its position in the window. Lines
 * are append-only, so an absolute id never changes — whereas a window index
 * shifts every time the window slides, which would remount every word and
 * re-fire its entrance animation on each new utterance.
 */
export function visibleLines(
  lines: string[],
  limit: number = VISIBLE_LINES,
): TranscriptLine[] {
  const start = Math.max(0, lines.length - limit);
  return lines.slice(start).map((text, i) => ({ id: start + i, text }));
}

/** Words for per-word entrance animation. Whitespace is re-added by the view. */
export function splitWords(line: string): string[] {
  return line.trim().split(/\s+/).filter(Boolean);
}
