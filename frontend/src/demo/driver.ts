import type { Analysis } from "../types";

const TICK_MS = 3200;

interface ScriptEntry {
  line: string;
  valence: number;
  arousal: number;
  speaker_certainty: number;
  model_confidence: number;
  rationale: string;
  kw: [string, number][];
}

/**
 * Scripted emotional arc. Walking a fixed script rather than emitting random
 * noise means the visualization can be tuned against repeatable input, and the
 * live demo has a predictable shape.
 */
const SCRIPT: ScriptEntry[] = [
  {
    line: "So, um, I guess we could try the new approach.",
    valence: 0.05,
    arousal: 0.2,
    speaker_certainty: 0.15,
    model_confidence: 0.45,
    rationale: "Heavy hedging, low energy.",
    kw: [["approach", 0.5]],
  },
  {
    line: "Actually, the numbers came back and they look strong.",
    valence: 0.55,
    arousal: 0.45,
    speaker_certainty: 0.7,
    model_confidence: 0.8,
    rationale: "Positive shift, assertive.",
    kw: [
      ["numbers", 0.8],
      ["strong", 0.7],
    ],
  },
  {
    line: "This is exactly what we needed. It works.",
    valence: 0.9,
    arousal: 0.8,
    speaker_certainty: 0.95,
    model_confidence: 0.9,
    rationale: "Emphatic and certain.",
    kw: [
      ["works", 0.95],
      ["needed", 0.6],
    ],
  },
  {
    line: "Wait. The deployment failed again.",
    valence: -0.7,
    arousal: 0.85,
    speaker_certainty: 0.85,
    model_confidence: 0.88,
    rationale: "Sharp negative turn, high activation.",
    kw: [
      ["deployment", 0.9],
      ["failed", 0.85],
    ],
  },
  {
    line: "Okay. Okay. Let me look at the logs.",
    valence: -0.15,
    arousal: 0.35,
    speaker_certainty: 0.6,
    model_confidence: 0.55,
    rationale: "Settling, recovering composure.",
    kw: [["logs", 0.6]],
  },
  {
    line: "Yeah so anyway the meeting is at four.",
    valence: 0.0,
    arousal: 0.2,
    speaker_certainty: 0.5,
    model_confidence: 0.12,
    rationale: "Logistics chatter, little emotional signal.",
    kw: [["meeting", 0.3]],
  },
];

export function nextDemoAnalysis(step: number): {
  analysis: Analysis;
  line: string;
} {
  const entry = SCRIPT[step % SCRIPT.length];
  return {
    line: entry.line,
    analysis: {
      valence: entry.valence,
      arousal: entry.arousal,
      speaker_certainty: entry.speaker_certainty,
      model_confidence: entry.model_confidence,
      rationale: entry.rationale,
      keywords: entry.kw.map(([text, weight]) => ({ text, weight })),
    },
  };
}

export function createDemoDriver(
  onUpdate: (analysis: Analysis, line: string) => void,
) {
  let timer: ReturnType<typeof setInterval> | null = null;
  let step = 0;

  return {
    start() {
      if (timer) return;
      const emit = () => {
        const { analysis, line } = nextDemoAnalysis(step++);
        onUpdate(analysis, line);
      };
      emit();
      timer = setInterval(emit, TICK_MS);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
