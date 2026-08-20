import { useEffect, useRef, useState } from "react";
import type { Keyword } from "../types";

export const KEYWORD_TTL_MS = 20_000;
const SWEEP_MS = 1000;

export interface LiveKeyword {
  text: string;
  weight: number;
  bornAt: number;
}

/**
 * Keyed by the keyword string, not position. `bornAt` survives a recurrence so
 * a word that keeps being said doesn't restart its fade-in animation.
 */
export function mergeKeywords(
  existing: Map<string, LiveKeyword>,
  incoming: Keyword[],
  now: number,
): Map<string, LiveKeyword> {
  const next = new Map(existing);
  for (const kw of incoming) {
    const prior = next.get(kw.text);
    next.set(kw.text, {
      text: kw.text,
      weight: kw.weight,
      bornAt: prior?.bornAt ?? now,
    });
  }
  return next;
}

export function expireKeywords(
  map: Map<string, LiveKeyword>,
  now: number,
): Map<string, LiveKeyword> {
  const next = new Map(map);
  for (const [text, kw] of next) {
    if (now - kw.bornAt >= KEYWORD_TTL_MS) next.delete(text);
  }
  return next;
}

export function useKeywordCloud(incoming: Keyword[]) {
  const [map, setMap] = useState<Map<string, LiveKeyword>>(new Map());
  const seenRef = useRef<Keyword[] | null>(null);

  useEffect(() => {
    if (incoming === seenRef.current) return;
    seenRef.current = incoming;
    if (incoming.length === 0) return;
    setMap((prev) => mergeKeywords(prev, incoming, Date.now()));
  }, [incoming]);

  useEffect(() => {
    const timer = setInterval(
      () => setMap((prev) => expireKeywords(prev, Date.now())),
      SWEEP_MS,
    );
    return () => clearInterval(timer);
  }, []);

  return [...map.values()].sort((a, b) => a.bornAt - b.bornAt);
}
