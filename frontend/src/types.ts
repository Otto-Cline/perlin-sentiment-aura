export interface Keyword {
  text: string;
  weight: number;
}

export interface Analysis {
  valence: number;
  arousal: number;
  speaker_certainty: number;
  model_confidence: number;
  keywords: Keyword[];
  rationale: string;
}

/** Mirrors backend NEUTRAL. Zero model_confidence so the aura starts washed out. */
export const NEUTRAL_ANALYSIS: Analysis = {
  valence: 0,
  arousal: 0.15,
  speaker_certainty: 0.5,
  model_confidence: 0,
  keywords: [],
  rationale: "",
};

export type SourceMode = "demo" | "hardcoded" | "live";

/** Which visualization is drawing. Both read the same analysis stream. */
export type RendererMode = "ink" | "streams";

export type ConnectionState =
  | "idle"
  | "connecting"
  | "live"
  | "reconnecting"
  | "error";
