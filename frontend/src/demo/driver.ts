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
/**
 * Scripted emotional arc, written to exercise the channels that actually drive
 * the visual: valence as turn sharpness, arousal as speed and nib width, and
 * model_confidence as opacity.
 *
 * It walks the corners deliberately — smooth and broad, then jagged and fast,
 * then jagged and slow, then a near-invisible ghost, then resolution — because
 * a subtle arc reads as one continuous texture. `speaker_certainty` is still
 * populated for schema fidelity but no longer drives anything.
 */
const SCRIPT: ScriptEntry[] = [
  {
    line: "Okay, the migration finished and everything came back clean.",
    valence: 0.6,
    arousal: 0.55,
    speaker_certainty: 0.8,
    model_confidence: 0.85,
    rationale: "Calm relief, assured.",
    kw: [
      ["migration", 0.85],
      ["clean", 0.7],
    ],
  },
  {
    line: "This is exactly what we wanted. The numbers are up across the board!",
    valence: 0.95,
    arousal: 0.92,
    speaker_certainty: 0.95,
    model_confidence: 0.92,
    rationale: "Elated and emphatic — broad, sweeping marks.",
    kw: [
      ["numbers", 0.95],
      ["board", 0.45],
    ],
  },
  {
    line: "Wait. Wait. The whole payment service just fell over.",
    valence: -0.85,
    arousal: 0.95,
    speaker_certainty: 0.9,
    model_confidence: 0.9,
    rationale: "Alarm — sharp turns at speed.",
    kw: [
      ["payment", 0.95],
      ["fell", 0.8],
    ],
  },
  {
    line: "I don't know. Nothing in the logs explains any of it.",
    valence: -0.45,
    arousal: 0.25,
    speaker_certainty: 0.3,
    model_confidence: 0.72,
    rationale: "Deflated and stuck — jagged but slow.",
    kw: [
      ["logs", 0.75],
      ["explains", 0.5],
    ],
  },
  {
    line: "Um, yeah, so, anyway. Standup is at ten I think.",
    valence: 0.0,
    arousal: 0.15,
    speaker_certainty: 0.2,
    model_confidence: 0.08,
    rationale: "Logistics filler — almost no emotional signal to read.",
    kw: [["standup", 0.3]],
  },
  {
    line: "Found it. One config flag. We are back up.",
    valence: 0.8,
    arousal: 0.75,
    speaker_certainty: 0.95,
    model_confidence: 0.9,
    rationale: "Resolved, decisive.",
    kw: [
      ["config", 0.85],
      ["back", 0.6],
    ],
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
