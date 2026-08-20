# Sentiment Aura Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A full-stack app that transcribes live speech, scores it along four emotional dimensions via an LLM, and renders the result as a continuously-smoothed Perlin flow field.

**Architecture:** FastAPI backend proxies text to Anthropic and returns Pydantic-validated JSON. React frontend consumes analysis from one of three interchangeable sources (`demo` / `hardcoded` / `live`), holds the values in a `useRef` mirror, and a p5 instance-mode sketch lerps every visual parameter toward those targets each frame.

**Tech Stack:** React 19 + Vite + TypeScript, p5.js (instance mode), FastAPI + Pydantic v2, `anthropic` Python SDK, Deepgram streaming WebSocket, uv, pytest, vitest.

**Spec:** `docs/superpowers/specs/2026-08-19-sentiment-aura-design.md`

## Global Constraints

- **Analysis ranges:** `valence` in [-1.0, 1.0]; `arousal`, `speaker_certainty`, `model_confidence` in [0.0, 1.0]; keyword `weight` in [0.0, 1.0].
- **Smoothing:** every visual parameter moves per-frame via `cur += (target - cur) * 0.04`. Nothing snaps, ever.
- **p5:** `pixelDensity(1)`. Particle count capped at a module constant.
- **Never pass analysis values as React props into the sketch.** Targets live in a `useRef`; `draw()` reads `ref.current` every frame.
- **LLM budget:** 5s timeout, `max_retries=0`, graceful neutral fallback on every failure path.
- **Deepgram:** fire the backend call on `speech_final` (never `is_final`); `smart_format=true`, `interim_results=true`; `KeepAlive` every 8s; `CloseStream` on stop.
- **Async correctness:** monotonic sequence number per `/process_text` call; drop any response whose seq is not greater than the last applied.
- **Keywords:** React elements keyed by keyword string (never array index); `Map<string, timestamp>`, expire after ~20s.
- **Secrets:** no real key in git, ever. `.env` is gitignored from the first commit.
- **Model default:** `ANTHROPIC_MODEL` env var, defaulting to `claude-opus-5`.

---

## Verification Status

Tasks 1–5 and 8 are fully executable tonight. Tasks 6 and 7 require API keys that are not available and **ship written-but-unexecuted** — their tests cover only the fallback and pure-logic paths, which is why both tasks isolate all network code into a single file with a smoke script beside it.

---

## Task 1: Repo scaffold and hardcoded `/process_text`

Build-order step 1. Deliverable: a backend that returns valid analysis JSON, verified with curl.

**Files:**
- Create: `.gitignore`, `.env.example`
- Create: `backend/pyproject.toml`
- Create: `backend/app/__init__.py`, `backend/app/schemas.py`, `backend/app/main.py`
- Test: `backend/tests/test_schemas.py`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `Analysis`, `Keyword`, `NEUTRAL`, `ProcessTextRequest`, `ProcessTextResponse` from `app.schemas`. `POST /process_text` accepting `{"utterances": [str], "seq": int}` and returning `{"seq": int, "analysis": Analysis}`. `GET /health` returning `{"status": "ok"}`.

- [ ] **Step 1: Write `.gitignore` and `.env.example`**

`.gitignore` (replaces the existing one-line file):

```gitignore
.DS_Store
.env
.env.local
__pycache__/
*.pyc
.venv/
.pytest_cache/
node_modules/
dist/
.vite/
```

`.env.example`:

```bash
# Copy to .env and fill in. .env is gitignored — never commit real keys.
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-opus-5
DEEPGRAM_API_KEY=...
CORS_ORIGINS=http://localhost:5173
```

- [ ] **Step 2: Write `backend/pyproject.toml`**

```toml
[project]
name = "sentiment-aura-backend"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.32",
    "pydantic>=2.9",
    "anthropic>=0.40",
    "httpx>=0.27",
    "python-dotenv>=1.0",
]

[dependency-groups]
dev = ["pytest>=8.3", "pytest-asyncio>=0.24"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
```

Run: `cd backend && uv sync`

- [ ] **Step 3: Write the failing schema test**

`backend/tests/test_schemas.py`:

```python
import pytest
from pydantic import ValidationError

from app.schemas import NEUTRAL, Analysis, ProcessTextRequest


def test_valid_analysis_round_trips():
    a = Analysis(
        valence=0.5,
        arousal=0.4,
        speaker_certainty=0.8,
        model_confidence=0.9,
        keywords=[{"text": "launch", "weight": 0.7}],
        rationale="Upbeat and assertive.",
    )
    assert a.keywords[0].text == "launch"


@pytest.mark.parametrize(
    "field,value",
    [
        ("valence", 1.5),
        ("valence", -1.5),
        ("arousal", -0.1),
        ("arousal", 1.1),
        ("speaker_certainty", 2.0),
        ("model_confidence", -1.0),
    ],
)
def test_out_of_range_scalars_rejected(field, value):
    payload = {
        "valence": 0.0,
        "arousal": 0.5,
        "speaker_certainty": 0.5,
        "model_confidence": 0.5,
        "keywords": [],
        "rationale": "",
    }
    payload[field] = value
    with pytest.raises(ValidationError):
        Analysis(**payload)


def test_unknown_field_rejected():
    with pytest.raises(ValidationError):
        Analysis(
            valence=0.0,
            arousal=0.5,
            speaker_certainty=0.5,
            model_confidence=0.5,
            keywords=[],
            rationale="",
            sentiment=0.85,
        )


def test_keyword_weight_out_of_range_rejected():
    with pytest.raises(ValidationError):
        Analysis(
            valence=0.0,
            arousal=0.5,
            speaker_certainty=0.5,
            model_confidence=0.5,
            keywords=[{"text": "x", "weight": 3.0}],
            rationale="",
        )


def test_neutral_has_zero_model_confidence():
    """The neutral fallback must read as washed out, not as a confident neutral."""
    assert NEUTRAL.model_confidence == 0.0
    assert NEUTRAL.valence == 0.0


def test_request_requires_at_least_one_utterance():
    with pytest.raises(ValidationError):
        ProcessTextRequest(utterances=[], seq=0)


def test_request_caps_window_at_three():
    with pytest.raises(ValidationError):
        ProcessTextRequest(utterances=["a", "b", "c", "d"], seq=0)
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd backend && uv run pytest tests/test_schemas.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.schemas'`

- [ ] **Step 5: Write `backend/app/schemas.py`**

```python
"""Wire contract between the LLM, the backend, and the frontend.

Every value that reaches the visualization passes through these models, so the
range constraints here are the only guarantee the sketch needs.
"""

from pydantic import BaseModel, ConfigDict, Field


class Keyword(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=40)
    weight: float = Field(ge=0.0, le=1.0)


class Analysis(BaseModel):
    model_config = ConfigDict(extra="forbid")

    valence: float = Field(ge=-1.0, le=1.0)
    arousal: float = Field(ge=0.0, le=1.0)
    speaker_certainty: float = Field(ge=0.0, le=1.0)
    model_confidence: float = Field(ge=0.0, le=1.0)
    keywords: list[Keyword] = Field(default_factory=list, max_length=8)
    rationale: str = Field(default="", max_length=240)


# Returned whenever the LLM fails, times out, refuses, or emits an invalid shape.
# model_confidence is 0.0 on purpose: the aura desaturates rather than asserting
# a confident neutral read.
NEUTRAL = Analysis(
    valence=0.0,
    arousal=0.15,
    speaker_certainty=0.5,
    model_confidence=0.0,
    keywords=[],
    rationale="No reading available.",
)


class ProcessTextRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    utterances: list[str] = Field(min_length=1, max_length=3)
    seq: int = Field(ge=0)


class ProcessTextResponse(BaseModel):
    seq: int
    analysis: Analysis
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd backend && uv run pytest tests/test_schemas.py -v`
Expected: PASS (10 tests)

- [ ] **Step 7: Write `backend/app/main.py` with a hardcoded analysis**

```python
"""FastAPI proxy. Task 1 returns a hardcoded analysis; Task 6 swaps in the LLM."""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .schemas import Analysis, ProcessTextRequest, ProcessTextResponse

app = FastAPI(title="Sentiment Aura")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Step 1 stand-in. Deliberately not neutral, so the frontend wiring in Task 2
# visibly moves off its defaults.
HARDCODED = Analysis(
    valence=0.62,
    arousal=0.55,
    speaker_certainty=0.78,
    model_confidence=0.85,
    keywords=[
        {"text": "prototype", "weight": 0.9},
        {"text": "shipping", "weight": 0.6},
        {"text": "tomorrow", "weight": 0.4},
    ],
    rationale="Hardcoded sample analysis.",
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/process_text", response_model=ProcessTextResponse)
async def process_text(req: ProcessTextRequest) -> ProcessTextResponse:
    return ProcessTextResponse(seq=req.seq, analysis=HARDCODED)
```

- [ ] **Step 8: Verify with curl**

Run in one terminal: `cd backend && uv run uvicorn app.main:app --reload --port 8000`

Then:

```bash
curl -s -X POST http://localhost:8000/process_text -H 'Content-Type: application/json' -d '{"utterances":["I think this is going to work"],"seq":0}'
```

Expected: JSON with `"seq": 0` and an `analysis` object containing all six fields.

Also confirm validation rejects a bad payload:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8000/process_text -H 'Content-Type: application/json' -d '{"utterances":[],"seq":0}'
```

Expected: `422`

- [ ] **Step 9: Commit**

```bash
git add .gitignore .env.example backend
git commit -m "feat: backend /process_text with validated hardcoded analysis"
```

---

## Task 2: Frontend shell wired to the hardcoded endpoint

Build-order step 2. Deliverable: a running React app that fetches analysis and displays it as raw numbers, with stale-response protection.

**Files:**
- Create: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/index.html`, `frontend/.env.example`
- Create: `frontend/src/main.tsx`, `frontend/src/types.ts`, `frontend/src/state/useAnalysis.ts`, `frontend/src/App.tsx`, `frontend/src/ui/Controls.tsx`, `frontend/src/ui/TranscriptDisplay.tsx`, `frontend/src/styles.css`
- Test: `frontend/src/state/useAnalysis.test.ts`

**Interfaces:**
- Consumes: `POST /process_text` from Task 1.
- Produces: `Analysis`, `Keyword`, `NEUTRAL_ANALYSIS`, `SourceMode`, `ConnectionState` from `src/types.ts`. `AnalysisGate` class (`issue(): number`, `accept(seq: number): boolean`) and `useAnalysis()` hook returning `{ analysis, analysisRef, submit, lastError }` from `src/state/useAnalysis.ts`.

- [ ] **Step 1: Scaffold Vite and install dependencies**

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend && npm install && npm install p5 && npm install -D vitest @types/p5
```

Add to `frontend/package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 2: Write `frontend/src/types.ts`**

```ts
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

export type ConnectionState =
  | "idle"
  | "connecting"
  | "live"
  | "reconnecting"
  | "error";
```

- [ ] **Step 3: Write the failing test for the sequence gate**

`frontend/src/state/useAnalysis.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { AnalysisGate } from "./useAnalysis";

describe("AnalysisGate", () => {
  it("issues monotonically increasing sequence numbers", () => {
    const gate = new AnalysisGate();
    expect(gate.issue()).toBe(0);
    expect(gate.issue()).toBe(1);
    expect(gate.issue()).toBe(2);
  });

  it("accepts responses arriving in order", () => {
    const gate = new AnalysisGate();
    expect(gate.accept(0)).toBe(true);
    expect(gate.accept(1)).toBe(true);
  });

  it("drops a stale response that arrives after a newer one", () => {
    const gate = new AnalysisGate();
    expect(gate.accept(5)).toBe(true);
    expect(gate.accept(3)).toBe(false);
  });

  it("drops a duplicate of the last applied response", () => {
    const gate = new AnalysisGate();
    expect(gate.accept(2)).toBe(true);
    expect(gate.accept(2)).toBe(false);
  });

  it("keeps dropping stale responses without lowering the watermark", () => {
    const gate = new AnalysisGate();
    gate.accept(10);
    expect(gate.accept(4)).toBe(false);
    expect(gate.accept(9)).toBe(false);
    expect(gate.accept(11)).toBe(true);
  });

  it("accepts seq 0 as the first response", () => {
    const gate = new AnalysisGate();
    expect(gate.accept(0)).toBe(true);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/state/useAnalysis.test.ts`
Expected: FAIL — cannot resolve `AnalysisGate` from `./useAnalysis`

- [ ] **Step 5: Write `frontend/src/state/useAnalysis.ts`**

```ts
import { useCallback, useRef, useState } from "react";
import { type Analysis, NEUTRAL_ANALYSIS } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

/**
 * Guards against out-of-order LLM responses. Each request gets a monotonic
 * sequence number; a response is applied only if it is strictly newer than the
 * last one applied. Stale sentiment overwriting fresh sentiment is the bug this
 * exists to prevent.
 */
export class AnalysisGate {
  private nextSeq = 0;
  private lastApplied = -1;

  issue(): number {
    return this.nextSeq++;
  }

  accept(seq: number): boolean {
    if (seq <= this.lastApplied) return false;
    this.lastApplied = seq;
    return true;
  }
}

export function useAnalysis() {
  // React state drives the DOM UI; the ref is what the p5 sketch reads each
  // frame. Both are updated together — never one without the other.
  const [analysis, setAnalysis] = useState<Analysis>(NEUTRAL_ANALYSIS);
  const analysisRef = useRef<Analysis>(NEUTRAL_ANALYSIS);
  const gateRef = useRef(new AnalysisGate());
  const [lastError, setLastError] = useState<string | null>(null);

  const apply = useCallback((next: Analysis) => {
    analysisRef.current = next;
    setAnalysis(next);
  }, []);

  const submit = useCallback(
    async (utterances: string[]) => {
      const seq = gateRef.current.issue();
      try {
        const res = await fetch(`${API_BASE}/process_text`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ utterances: utterances.slice(-3), seq }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { seq: number; analysis: Analysis };
        if (!gateRef.current.accept(data.seq)) return;
        setLastError(null);
        apply(data.analysis);
      } catch (err) {
        // Drift toward neutral rather than freezing on the last good value.
        setLastError(err instanceof Error ? err.message : "request failed");
        apply(NEUTRAL_ANALYSIS);
      }
    },
    [apply],
  );

  return { analysis, analysisRef, submit, apply, lastError };
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/state/useAnalysis.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 7: Write `frontend/src/ui/Controls.tsx`**

```tsx
import type { ConnectionState, SourceMode } from "../types";

interface Props {
  recording: boolean;
  connection: ConnectionState;
  source: SourceMode;
  onToggle: () => void;
  onSourceChange: (mode: SourceMode) => void;
}

const LABELS: Record<ConnectionState, string> = {
  idle: "Idle",
  connecting: "Connecting",
  live: "Live",
  reconnecting: "Reconnecting",
  error: "Error",
};

export function Controls({
  recording,
  connection,
  source,
  onToggle,
  onSourceChange,
}: Props) {
  return (
    <div className="controls">
      <button className={recording ? "stop" : "start"} onClick={onToggle}>
        {recording ? "Stop" : "Start"}
      </button>
      <span className={`status status-${connection}`}>
        <span className="dot" aria-hidden="true" />
        {LABELS[connection]}
      </span>
      <select
        value={source}
        onChange={(e) => onSourceChange(e.target.value as SourceMode)}
        aria-label="Analysis source"
      >
        <option value="demo">Demo mode</option>
        <option value="hardcoded">Backend (hardcoded)</option>
        <option value="live">Live mic</option>
      </select>
    </div>
  );
}
```

- [ ] **Step 8: Write `frontend/src/ui/TranscriptDisplay.tsx`**

```tsx
interface Props {
  lines: string[];
  interim: string;
}

export function TranscriptDisplay({ lines, interim }: Props) {
  return (
    <div className="transcript">
      {lines.slice(-8).map((line, i) => (
        // Committed lines are append-only, so index is stable here.
        <p key={`${i}-${line}`} className="final">
          {line}
        </p>
      ))}
      {interim && <p className="interim">{interim}</p>}
    </div>
  );
}
```

- [ ] **Step 9: Write `frontend/src/App.tsx` (numbers only for now)**

```tsx
import { useState } from "react";
import { Controls } from "./ui/Controls";
import { TranscriptDisplay } from "./ui/TranscriptDisplay";
import { useAnalysis } from "./state/useAnalysis";
import type { ConnectionState, SourceMode } from "./types";
import "./styles.css";

const SAMPLE = "I think this is going to work really well";

export default function App() {
  const [source, setSource] = useState<SourceMode>("hardcoded");
  const [recording, setRecording] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [lines, setLines] = useState<string[]>([]);
  const { analysis, submit, lastError } = useAnalysis();

  const toggle = async () => {
    if (recording) {
      setRecording(false);
      setConnection("idle");
      return;
    }
    setRecording(true);
    setConnection("live");
    setLines((prev) => [...prev, SAMPLE]);
    await submit([SAMPLE]);
  };

  return (
    <div className="app">
      <TranscriptDisplay lines={lines} interim="" />
      <pre className="debug">{JSON.stringify(analysis, null, 2)}</pre>
      {lastError && <p className="error">{lastError}</p>}
      <Controls
        recording={recording}
        connection={connection}
        source={source}
        onToggle={toggle}
        onSourceChange={setSource}
      />
    </div>
  );
}
```

- [ ] **Step 10: Write `frontend/src/styles.css`**

```css
:root {
  --ink: rgba(255, 255, 255, 0.92);
  --panel: rgba(10, 12, 20, 0.42);
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: #05070c;
  color: var(--ink);
  font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif;
  overflow: hidden;
}

.app { position: relative; height: 100vh; }

.transcript,
.debug,
.controls {
  position: absolute;
  backdrop-filter: blur(12px);
  background: var(--panel);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 16px 20px;
}

.transcript { left: 32px; bottom: 104px; width: min(46ch, 40vw); }
.transcript .final { margin: 0 0 6px; }
.transcript .interim { margin: 0; opacity: 0.45; font-style: italic; }

.debug { right: 32px; top: 32px; font-size: 12px; opacity: 0.7; }

.controls {
  left: 32px;
  bottom: 32px;
  display: flex;
  gap: 14px;
  align-items: center;
}

.controls button {
  border: 0;
  border-radius: 999px;
  padding: 10px 22px;
  font-weight: 600;
  color: #05070c;
  background: var(--ink);
  cursor: pointer;
}

.status { display: flex; align-items: center; gap: 7px; font-size: 13px; }

.status .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.status-live { color: #6ee7a8; }
.status-live .dot { animation: pulse 1.6s ease-in-out infinite; }
.status-connecting, .status-reconnecting { color: #f0c674; }
.status-error { color: #f08c8c; }
.status-idle { color: rgba(255, 255, 255, 0.4); }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.25; }
}

.error { position: absolute; right: 32px; bottom: 32px; color: #f08c8c; }
```

- [ ] **Step 11: Verify end to end**

With the backend running, run `cd frontend && npm run dev`, open the printed URL, and click Start.
Expected: the sample line appears in the transcript and the debug panel shows `valence: 0.62` and three keywords from the hardcoded backend response.

- [ ] **Step 12: Commit**

```bash
git add frontend
git commit -m "feat: React shell with sequence-guarded analysis fetching"
```

---

## Task 3: Demo mode driver

Build-order step 3a. Deliverable: a source that emits plausible analysis objects on a timer with no mic and no network.

**Files:**
- Create: `frontend/src/demo/driver.ts`
- Modify: `frontend/src/App.tsx`
- Test: `frontend/src/demo/driver.test.ts`

**Interfaces:**
- Consumes: `Analysis`, `NEUTRAL_ANALYSIS` from `src/types.ts`.
- Produces: `createDemoDriver(onUpdate: (a: Analysis, line: string) => void): { start(): void; stop(): void }` and `nextDemoAnalysis(step: number): { analysis: Analysis; line: string }` from `src/demo/driver.ts`.

- [ ] **Step 1: Write the failing test**

`frontend/src/demo/driver.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nextDemoAnalysis } from "./driver";

describe("nextDemoAnalysis", () => {
  it("produces in-range values for many steps", () => {
    for (let step = 0; step < 200; step++) {
      const { analysis } = nextDemoAnalysis(step);
      expect(analysis.valence).toBeGreaterThanOrEqual(-1);
      expect(analysis.valence).toBeLessThanOrEqual(1);
      for (const key of [
        "arousal",
        "speaker_certainty",
        "model_confidence",
      ] as const) {
        expect(analysis[key]).toBeGreaterThanOrEqual(0);
        expect(analysis[key]).toBeLessThanOrEqual(1);
      }
      for (const kw of analysis.keywords) {
        expect(kw.weight).toBeGreaterThanOrEqual(0);
        expect(kw.weight).toBeLessThanOrEqual(1);
      }
    }
  });

  it("is deterministic for a given step", () => {
    expect(nextDemoAnalysis(7)).toEqual(nextDemoAnalysis(7));
  });

  it("varies across steps so the aura visibly moves", () => {
    expect(nextDemoAnalysis(0).analysis.valence).not.toBe(
      nextDemoAnalysis(3).analysis.valence,
    );
  });

  it("emits a non-empty transcript line", () => {
    expect(nextDemoAnalysis(1).line.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/demo/driver.test.ts`
Expected: FAIL — cannot resolve `nextDemoAnalysis`

- [ ] **Step 3: Write `frontend/src/demo/driver.ts`**

```ts
import type { Analysis } from "../types";

const TICK_MS = 3200;

/**
 * Scripted emotional arc. Walking a fixed script rather than emitting random
 * noise means the visualization can be tuned against repeatable input, and the
 * live demo has a predictable shape.
 */
const SCRIPT: Array<{ line: string; a: Omit<Analysis, "keywords"> & { kw: [string, number][] } }> = [
  {
    line: "So, um, I guess we could try the new approach.",
    a: { valence: 0.05, arousal: 0.2, speaker_certainty: 0.15, model_confidence: 0.45, rationale: "Heavy hedging, low energy.", kw: [["approach", 0.5]] },
  },
  {
    line: "Actually, the numbers came back and they look strong.",
    a: { valence: 0.55, arousal: 0.45, speaker_certainty: 0.7, model_confidence: 0.8, rationale: "Positive shift, assertive.", kw: [["numbers", 0.8], ["strong", 0.7]] },
  },
  {
    line: "This is exactly what we needed. It works.",
    a: { valence: 0.9, arousal: 0.8, speaker_certainty: 0.95, model_confidence: 0.9, rationale: "Emphatic and certain.", kw: [["works", 0.95], ["needed", 0.6]] },
  },
  {
    line: "Wait. The deployment failed again.",
    a: { valence: -0.7, arousal: 0.85, speaker_certainty: 0.85, model_confidence: 0.88, rationale: "Sharp negative turn, high activation.", kw: [["deployment", 0.9], ["failed", 0.85]] },
  },
  {
    line: "Okay. Okay. Let me look at the logs.",
    a: { valence: -0.15, arousal: 0.35, speaker_certainty: 0.6, model_confidence: 0.55, rationale: "Settling, recovering composure.", kw: [["logs", 0.6]] },
  },
  {
    line: "Yeah so anyway the meeting is at four.",
    a: { valence: 0.0, arousal: 0.2, speaker_certainty: 0.5, model_confidence: 0.12, rationale: "Logistics chatter, little emotional signal.", kw: [["meeting", 0.3]] },
  },
];

export function nextDemoAnalysis(step: number): { analysis: Analysis; line: string } {
  const entry = SCRIPT[step % SCRIPT.length];
  return {
    line: entry.line,
    analysis: {
      valence: entry.a.valence,
      arousal: entry.a.arousal,
      speaker_certainty: entry.a.speaker_certainty,
      model_confidence: entry.a.model_confidence,
      rationale: entry.a.rationale,
      keywords: entry.a.kw.map(([text, weight]) => ({ text, weight })),
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/demo/driver.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Wire demo mode into `App.tsx`**

Replace the `toggle` handler and add a driver ref. The full changed portion of `App.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { Controls } from "./ui/Controls";
import { TranscriptDisplay } from "./ui/TranscriptDisplay";
import { useAnalysis } from "./state/useAnalysis";
import { createDemoDriver } from "./demo/driver";
import type { Analysis, ConnectionState, SourceMode } from "./types";
import "./styles.css";

const SAMPLE = "I think this is going to work really well";

export default function App() {
  const [source, setSource] = useState<SourceMode>("demo");
  const [recording, setRecording] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [lines, setLines] = useState<string[]>([]);
  const { analysis, analysisRef, submit, apply, lastError } = useAnalysis();

  const onDemoUpdate = useCallback(
    (next: Analysis, line: string) => {
      setLines((prev) => [...prev, line]);
      apply(next);
    },
    [apply],
  );

  const driverRef = useRef(createDemoDriver(onDemoUpdate));

  // The callback identity is stable via useCallback, but rebuild the driver if
  // it ever changes so the closure never goes stale.
  useEffect(() => {
    driverRef.current.stop();
    driverRef.current = createDemoDriver(onDemoUpdate);
  }, [onDemoUpdate]);

  useEffect(() => () => driverRef.current.stop(), []);

  const stop = useCallback(() => {
    driverRef.current.stop();
    setRecording(false);
    setConnection("idle");
  }, []);

  const start = useCallback(async () => {
    setRecording(true);
    if (source === "demo") {
      setConnection("live");
      driverRef.current.start();
      return;
    }
    if (source === "hardcoded") {
      setConnection("live");
      setLines((prev) => [...prev, SAMPLE]);
      await submit([SAMPLE]);
      return;
    }
    setConnection("connecting"); // Task 7 replaces this with the real socket.
  }, [source, submit]);

  const toggle = () => (recording ? stop() : void start());

  // Switching source mid-run always stops cleanly first.
  const changeSource = (next: SourceMode) => {
    stop();
    setSource(next);
  };

  return (
    <div className="app">
      <TranscriptDisplay lines={lines} interim="" />
      <pre className="debug">{JSON.stringify(analysis, null, 2)}</pre>
      {lastError && <p className="error">{lastError}</p>}
      <Controls
        recording={recording}
        connection={connection}
        source={source}
        onToggle={toggle}
        onSourceChange={changeSource}
      />
    </div>
  );
}
```

Note `analysisRef` is now destructured but unused — Task 4 consumes it.

- [ ] **Step 6: Verify demo mode runs with the backend stopped**

Stop the backend. Run `npm run dev`, select "Demo mode", click Start.
Expected: transcript lines and debug values change every ~3.2s with no network requests (confirm an empty Network tab in devtools).

- [ ] **Step 7: Commit**

```bash
git add frontend/src
git commit -m "feat: demo mode driver with scripted emotional arc"
```

---

## Task 4: The aura — mapping and sketch

Build-order step 3b. Deliverable: the visualization, tuned against demo mode. This is the task the rubric weighs most heavily.

**Files:**
- Create: `frontend/src/aura/mapping.ts`, `frontend/src/aura/sketch.ts`, `frontend/src/aura/Aura.tsx`
- Modify: `frontend/src/App.tsx`
- Test: `frontend/src/aura/mapping.test.ts`

**Interfaces:**
- Consumes: `Analysis`, `ConnectionState` from `src/types.ts`; `analysisRef` from `useAnalysis()`.
- Produces: `VisualTargets` interface with keys `hue`, `saturation`, `alpha`, `speed`, `noiseStep`, `turbulence`, `coherence`; `mapAnalysis(a: Analysis, conn: ConnectionState): VisualTargets`; `createSketch(getTargets: () => VisualTargets): (p: p5) => void`; `<Aura analysisRef={...} connection={...} />`.

- [ ] **Step 1: Write the failing mapping test**

`frontend/src/aura/mapping.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { HUE_NEGATIVE, HUE_POSITIVE, mapAnalysis } from "./mapping";
import { NEUTRAL_ANALYSIS, type Analysis } from "../types";

const base: Analysis = {
  valence: 0,
  arousal: 0.5,
  speaker_certainty: 0.5,
  model_confidence: 1,
  keywords: [],
  rationale: "",
};

describe("mapAnalysis", () => {
  it("maps minimum valence to the cold end of the hue range", () => {
    expect(mapAnalysis({ ...base, valence: -1 }, "live").hue).toBeCloseTo(
      HUE_NEGATIVE,
    );
  });

  it("maps maximum valence to the warm end of the hue range", () => {
    expect(mapAnalysis({ ...base, valence: 1 }, "live").hue).toBeCloseTo(
      HUE_POSITIVE,
    );
  });

  it("maps neutral valence to the midpoint of the hue range", () => {
    expect(mapAnalysis({ ...base, valence: 0 }, "live").hue).toBeCloseTo(
      (HUE_NEGATIVE + HUE_POSITIVE) / 2,
    );
  });

  it("increases speed and turbulence with arousal", () => {
    const calm = mapAnalysis({ ...base, arousal: 0 }, "live");
    const hot = mapAnalysis({ ...base, arousal: 1 }, "live");
    expect(hot.speed).toBeGreaterThan(calm.speed);
    expect(hot.turbulence).toBeGreaterThan(calm.turbulence);
    expect(hot.noiseStep).toBeGreaterThan(calm.noiseStep);
  });

  it("raises coherence with speaker certainty", () => {
    const hedging = mapAnalysis({ ...base, speaker_certainty: 0 }, "live");
    const assertive = mapAnalysis({ ...base, speaker_certainty: 1 }, "live");
    expect(assertive.coherence).toBeGreaterThan(hedging.coherence);
  });

  it("washes out saturation and alpha at low model confidence", () => {
    const unsure = mapAnalysis({ ...base, model_confidence: 0 }, "live");
    const sure = mapAnalysis({ ...base, model_confidence: 1 }, "live");
    expect(unsure.saturation).toBeLessThan(sure.saturation);
    expect(unsure.alpha).toBeLessThan(sure.alpha);
  });

  it("desaturates and slows the field while reconnecting", () => {
    const live = mapAnalysis(base, "live");
    const reconnecting = mapAnalysis(base, "reconnecting");
    expect(reconnecting.saturation).toBeLessThan(live.saturation);
    expect(reconnecting.speed).toBeLessThan(live.speed);
  });

  it("keeps every output finite for the neutral analysis", () => {
    const t = mapAnalysis(NEUTRAL_ANALYSIS, "idle");
    for (const value of Object.values(t)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/aura/mapping.test.ts`
Expected: FAIL — cannot resolve `./mapping`

- [ ] **Step 3: Write `frontend/src/aura/mapping.ts`**

```ts
import type { Analysis, ConnectionState } from "../types";

/**
 * Cold blue for unpleasant, warm gold for pleasant. The path between them runs
 * down through teal and green, so a neutral read looks calm rather than
 * arbitrary — a deliberate choice over wrapping through magenta and red.
 */
export const HUE_NEGATIVE = 212;
export const HUE_POSITIVE = 46;

export interface VisualTargets {
  hue: number;
  saturation: number;
  alpha: number;
  speed: number;
  noiseStep: number;
  turbulence: number;
  coherence: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Degraded connections read as a visibly weaker field, not as an error toast. */
const CONNECTION_DAMPING: Record<ConnectionState, { sat: number; speed: number }> = {
  idle: { sat: 0.55, speed: 0.5 },
  connecting: { sat: 0.5, speed: 0.45 },
  live: { sat: 1, speed: 1 },
  reconnecting: { sat: 0.25, speed: 0.35 },
  error: { sat: 0.18, speed: 0.25 },
};

export function mapAnalysis(a: Analysis, conn: ConnectionState): VisualTargets {
  const damping = CONNECTION_DAMPING[conn];

  // Valence in [-1, 1] normalized to [0, 1] before crossing the hue range.
  const warmth = clamp01((a.valence + 1) / 2);
  const arousal = clamp01(a.arousal);
  const certainty = clamp01(a.speaker_certainty);
  const confidence = clamp01(a.model_confidence);

  return {
    hue: lerp(HUE_NEGATIVE, HUE_POSITIVE, warmth),

    // Low model confidence literally looks washed out.
    saturation: lerp(14, 82, confidence) * damping.sat,
    alpha: lerp(9, 42, confidence),

    // Arousal is energy: faster particles, faster field evolution, more churn.
    speed: lerp(0.35, 3.4, arousal) * damping.speed,
    noiseStep: lerp(0.0008, 0.0055, arousal),
    turbulence: lerp(0.15, 1, arousal),

    // Certainty is order: high aligns the octaves into laminar streams,
    // low lets them disagree and fragment the flow into eddies.
    coherence: lerp(0.1, 1, certainty),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/aura/mapping.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Write `frontend/src/aura/sketch.ts`**

```ts
import type p5 from "p5";
import type { VisualTargets } from "./mapping";

const PARTICLE_COUNT = 850;
const SMOOTHING = 0.04;
const BG_HUE = 225;
const TRAIL_FADE = 13;

const START: VisualTargets = {
  hue: 212,
  saturation: 14,
  alpha: 9,
  speed: 0.35,
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
      p.strokeWeight(1);

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
```

- [ ] **Step 6: Write `frontend/src/aura/Aura.tsx`**

```tsx
import { useEffect, useRef } from "react";
import p5 from "p5";
import type { RefObject } from "react";
import type { Analysis, ConnectionState } from "../types";
import { mapAnalysis, type VisualTargets } from "./mapping";
import { createSketch } from "./sketch";

interface Props {
  analysisRef: RefObject<Analysis>;
  connection: ConnectionState;
}

export function Aura({ analysisRef, connection }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  // Connection state changes on a React render, but the sketch reads it per
  // frame — so it goes through a ref too, not the sketch closure.
  const connectionRef = useRef(connection);
  connectionRef.current = connection;

  useEffect(() => {
    if (!hostRef.current) return;
    const getTargets = (): VisualTargets =>
      mapAnalysis(analysisRef.current, connectionRef.current);
    const instance = new p5(createSketch(getTargets), hostRef.current);
    return () => instance.remove();
    // Mount once. Every value the sketch needs arrives through a ref.
  }, [analysisRef]);

  return <div className="aura" ref={hostRef} />;
}
```

- [ ] **Step 7: Mount the aura in `App.tsx` and add its style**

In `App.tsx`, add the import and render it as the first child of `.app`:

```tsx
import { Aura } from "./aura/Aura";
```

```tsx
    <div className="app">
      <Aura analysisRef={analysisRef} connection={connection} />
      <TranscriptDisplay lines={lines} interim="" />
```

Append to `styles.css`:

```css
.aura { position: fixed; inset: 0; z-index: 0; }
.transcript, .debug, .controls, .error { z-index: 1; }
```

- [ ] **Step 8: Tune against demo mode**

Run `npm run dev`, select Demo mode, click Start, and watch a full pass through the six-line script.

Confirm each of these, adjusting only the constants in `mapping.ts` and `sketch.ts`:
- Color drifts continuously — no visible jump at any script boundary.
- The hedging first line looks fragmented; "It works." looks like smooth aligned streams.
- The logistics line at the end visibly washes out (low `model_confidence`).
- Frame rate holds up on battery. If it drops, lower `PARTICLE_COUNT` first.

- [ ] **Step 9: Run the full test suite and commit**

Run: `cd frontend && npm test`
Expected: PASS (18 tests across three files)

```bash
git add frontend/src frontend/src/styles.css
git commit -m "feat: Perlin flow-field aura driven by smoothed analysis targets"
```

---

## Task 5: Keywords and status polish

Build-order step 3c. Deliverable: keywords that fade in one by one and expire, plus a recording indicator.

**Files:**
- Create: `frontend/src/ui/KeywordsDisplay.tsx`, `frontend/src/state/useKeywordCloud.ts`
- Modify: `frontend/src/App.tsx`, `frontend/src/styles.css`
- Test: `frontend/src/state/useKeywordCloud.test.ts`

**Interfaces:**
- Consumes: `Keyword` from `src/types.ts`.
- Produces: `mergeKeywords(existing: Map<string, LiveKeyword>, incoming: Keyword[], now: number): Map<string, LiveKeyword>` and `expireKeywords(map, now)`, where `LiveKeyword = { text: string; weight: number; bornAt: number }`; `<KeywordsDisplay keywords={LiveKeyword[]} />`.

- [ ] **Step 1: Write the failing test**

`frontend/src/state/useKeywordCloud.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  KEYWORD_TTL_MS,
  expireKeywords,
  mergeKeywords,
} from "./useKeywordCloud";

describe("keyword cloud", () => {
  it("adds new keywords with a birth timestamp", () => {
    const map = mergeKeywords(new Map(), [{ text: "launch", weight: 0.8 }], 1000);
    expect(map.get("launch")).toEqual({
      text: "launch",
      weight: 0.8,
      bornAt: 1000,
    });
  });

  it("keeps the original bornAt when a keyword recurs", () => {
    let map = mergeKeywords(new Map(), [{ text: "launch", weight: 0.5 }], 1000);
    map = mergeKeywords(map, [{ text: "launch", weight: 0.9 }], 5000);
    expect(map.get("launch")?.bornAt).toBe(1000);
  });

  it("refreshes the weight when a keyword recurs", () => {
    let map = mergeKeywords(new Map(), [{ text: "launch", weight: 0.5 }], 1000);
    map = mergeKeywords(map, [{ text: "launch", weight: 0.9 }], 5000);
    expect(map.get("launch")?.weight).toBe(0.9);
  });

  it("expires keywords older than the TTL", () => {
    const map = mergeKeywords(new Map(), [{ text: "old", weight: 0.5 }], 0);
    expect(expireKeywords(map, KEYWORD_TTL_MS + 1).size).toBe(0);
  });

  it("keeps keywords inside the TTL", () => {
    const map = mergeKeywords(new Map(), [{ text: "fresh", weight: 0.5 }], 0);
    expect(expireKeywords(map, KEYWORD_TTL_MS - 1).size).toBe(1);
  });

  it("does not mutate the input map", () => {
    const original = mergeKeywords(new Map(), [{ text: "a", weight: 0.5 }], 0);
    mergeKeywords(original, [{ text: "b", weight: 0.5 }], 10);
    expect(original.size).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/state/useKeywordCloud.test.ts`
Expected: FAIL — cannot resolve `./useKeywordCloud`

- [ ] **Step 3: Write `frontend/src/state/useKeywordCloud.ts`**

```ts
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
  const seenRef = useRef<Keyword[]>([]);

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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/state/useKeywordCloud.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Write `frontend/src/ui/KeywordsDisplay.tsx`**

```tsx
import type { LiveKeyword } from "../state/useKeywordCloud";

interface Props {
  keywords: LiveKeyword[];
}

const STAGGER_MS = 140;

export function KeywordsDisplay({ keywords }: Props) {
  return (
    <div className="keywords">
      {keywords.map((kw, i) => (
        // Keyed by text: index keys would restart the animation on re-render.
        <span
          key={kw.text}
          className="keyword"
          style={{
            fontSize: `${14 + kw.weight * 26}px`,
            opacity: 0.35 + kw.weight * 0.65,
            animationDelay: `${(i % 6) * STAGGER_MS}ms`,
          }}
        >
          {kw.text}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Add the keyword styles to `styles.css`**

```css
.keywords {
  position: absolute;
  right: 32px;
  bottom: 32px;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  justify-content: flex-end;
  align-items: baseline;
  max-width: 36vw;
}

.keyword {
  animation: rise 900ms cubic-bezier(0.16, 1, 0.3, 1) both;
  font-weight: 300;
  letter-spacing: 0.01em;
  text-shadow: 0 2px 20px rgba(0, 0, 0, 0.7);
}

@keyframes rise {
  from { opacity: 0; transform: translateY(14px); filter: blur(6px); }
  to { transform: translateY(0); filter: blur(0); }
}

@media (prefers-reduced-motion: reduce) {
  .keyword { animation-duration: 1ms; }
}
```

The `both` fill mode plus `animation-delay` is what produces the one-by-one entrance: each element stays invisible until its own delay elapses.

- [ ] **Step 7: Wire into `App.tsx`**

Add imports and replace the debug panel:

```tsx
import { KeywordsDisplay } from "./ui/KeywordsDisplay";
import { useKeywordCloud } from "./state/useKeywordCloud";
```

Inside the component, after `useAnalysis()`:

```tsx
  const keywords = useKeywordCloud(analysis.keywords);
```

In the JSX, replace `<pre className="debug">…</pre>` with:

```tsx
      <KeywordsDisplay keywords={keywords} />
      {analysis.rationale && <p className="rationale">{analysis.rationale}</p>}
```

And add to `styles.css`:

```css
.rationale {
  position: absolute;
  left: 32px;
  top: 32px;
  z-index: 1;
  margin: 0;
  max-width: 40ch;
  font-size: 13px;
  opacity: 0.5;
  font-style: italic;
}
```

- [ ] **Step 8: Verify and commit**

Run `npm run dev` in demo mode. Confirm keywords fade upward one at a time, larger words are visibly heavier, and words disappear about 20s after first appearing.

Run: `cd frontend && npm test`
Expected: PASS (24 tests)

```bash
git add frontend/src frontend/src/styles.css
git commit -m "feat: staggered keyword cloud with TTL expiry"
```

---

## Task 6: Real Anthropic call

Build-order step 4. **Ships unexecuted — no API key available.** Tests cover the fallback and parsing paths without network access.

**Files:**
- Create: `backend/app/analyzer.py`, `backend/scripts/smoke_anthropic.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_analyzer.py`

**Interfaces:**
- Consumes: `Analysis`, `NEUTRAL` from `app.schemas`.
- Produces: `async analyze(utterances: list[str]) -> Analysis` and `ANALYSIS_JSON_SCHEMA` from `app.analyzer`.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_analyzer.py`:

```python
"""Covers every path that does not require a live API key.

The one thing these tests cannot prove is that a real Anthropic response parses.
That is what scripts/smoke_anthropic.py is for.
"""

import anthropic
import pytest

from app import analyzer
from app.schemas import NEUTRAL, Analysis

VALID_JSON = (
    '{"valence": 0.4, "arousal": 0.6, "speaker_certainty": 0.7, '
    '"model_confidence": 0.8, "keywords": [{"text": "ship", "weight": 0.9}], '
    '"rationale": "Positive and energised."}'
)


class FakeBlock:
    def __init__(self, text: str):
        self.type = "text"
        self.text = text


class FakeResponse:
    def __init__(self, text: str = VALID_JSON, stop_reason: str = "end_turn"):
        self.content = [FakeBlock(text)]
        self.stop_reason = stop_reason


def patch_create(monkeypatch, result):
    """Replace the SDK call with a stub that returns or raises `result`."""

    async def fake_create(**kwargs):
        if isinstance(result, Exception):
            raise result
        return result

    class FakeMessages:
        create = staticmethod(fake_create)

    class FakeScoped:
        messages = FakeMessages()

    monkeypatch.setattr(
        analyzer._client, "with_options", lambda **kw: FakeScoped()
    )


async def test_valid_response_is_parsed(monkeypatch):
    patch_create(monkeypatch, FakeResponse())
    result = await analyzer.analyze(["We are shipping tomorrow"])
    assert isinstance(result, Analysis)
    assert result.valence == 0.4
    assert result.keywords[0].text == "ship"


async def test_timeout_falls_back_to_neutral(monkeypatch):
    patch_create(
        monkeypatch,
        anthropic.APITimeoutError(request=None),
    )
    assert await analyzer.analyze(["anything"]) == NEUTRAL


async def test_connection_error_falls_back_to_neutral(monkeypatch):
    patch_create(
        monkeypatch,
        anthropic.APIConnectionError(request=None),
    )
    assert await analyzer.analyze(["anything"]) == NEUTRAL


async def test_refusal_falls_back_to_neutral(monkeypatch):
    patch_create(monkeypatch, FakeResponse(stop_reason="refusal"))
    assert await analyzer.analyze(["anything"]) == NEUTRAL


async def test_out_of_range_value_falls_back_to_neutral(monkeypatch):
    patch_create(
        monkeypatch,
        FakeResponse('{"valence": 4.0, "arousal": 0.5, "speaker_certainty": 0.5, '
                     '"model_confidence": 0.5, "keywords": [], "rationale": ""}'),
    )
    assert await analyzer.analyze(["anything"]) == NEUTRAL


async def test_malformed_json_falls_back_to_neutral(monkeypatch):
    patch_create(monkeypatch, FakeResponse("not json at all"))
    assert await analyzer.analyze(["anything"]) == NEUTRAL


async def test_response_without_text_block_falls_back_to_neutral(monkeypatch):
    empty = FakeResponse()
    empty.content = []
    patch_create(monkeypatch, empty)
    assert await analyzer.analyze(["anything"]) == NEUTRAL


def test_schema_is_closed_and_fully_required():
    """A closed schema is what lets us trust the shape without defensive parsing."""
    assert analyzer.ANALYSIS_JSON_SCHEMA["additionalProperties"] is False
    assert set(analyzer.ANALYSIS_JSON_SCHEMA["required"]) == {
        "valence",
        "arousal",
        "speaker_certainty",
        "model_confidence",
        "keywords",
        "rationale",
    }
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && uv run pytest tests/test_analyzer.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.analyzer'`

- [ ] **Step 3: Write `backend/app/analyzer.py`**

```python
"""The only module that talks to Anthropic.

Every failure mode — timeout, network error, HTTP error, refusal, malformed or
out-of-range output — returns NEUTRAL rather than raising, so the frontend
drifts toward a washed-out neutral field instead of freezing on stale values.
"""

import os

import anthropic
from anthropic import AsyncAnthropic
from pydantic import ValidationError

from .schemas import NEUTRAL, Analysis

MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-opus-5")

# Total wall-clock budget. max_retries=0 below is load-bearing: the SDK retries
# timeouts by default, which would turn this into a 15s budget.
LLM_TIMEOUT_SECONDS = 5.0

# Hand-written rather than generated from the Pydantic model: model_json_schema()
# emits $defs/$ref for the nested Keyword, and a flat inline schema is the shape
# the API is documented to accept. schemas.Analysis remains the validator.
ANALYSIS_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "valence": {"type": "number", "minimum": -1, "maximum": 1},
        "arousal": {"type": "number", "minimum": 0, "maximum": 1},
        "speaker_certainty": {"type": "number", "minimum": 0, "maximum": 1},
        "model_confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "keywords": {
            "type": "array",
            "maxItems": 6,
            "items": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "weight": {"type": "number", "minimum": 0, "maximum": 1},
                },
                "required": ["text", "weight"],
                "additionalProperties": False,
            },
        },
        "rationale": {"type": "string"},
    },
    "required": [
        "valence",
        "arousal",
        "speaker_certainty",
        "model_confidence",
        "keywords",
        "rationale",
    ],
    "additionalProperties": False,
}

SYSTEM = """\
You score short spoken utterances for a live visualization. Judge the most \
recent utterance, using the earlier ones only as context.

valence: pleasantness, -1 (very unpleasant) to 1 (very pleasant).
arousal: energy and activation, 0 (flat, still) to 1 (highly activated). \
Independent of valence — calm contentment is high valence with low arousal.
speaker_certainty: how assertive the speaker sounds. Hedging ("maybe", "I \
guess", "sort of") is low; flat declarative claims are high.
model_confidence: how confident YOU are in your own read. Sarcasm, filler, \
one-word utterances, and logistics chatter should be low.
keywords: at most 4 content words actually present in the utterance, weighted \
by how much they carry its meaning. Skip function words.
rationale: one short sentence.

This is speech, so expect disfluency and fragments. Do not inflate \
model_confidence on thin input."""


_client = AsyncAnthropic()


async def analyze(utterances: list[str]) -> Analysis:
    """Score a rolling window of utterances. Never raises."""
    window = "\n".join(f"- {u}" for u in utterances)

    try:
        response = await _client.with_options(
            timeout=LLM_TIMEOUT_SECONDS,
            max_retries=0,
        ).messages.create(
            model=MODEL,
            max_tokens=1024,
            system=SYSTEM,
            # effort=low keeps adaptive thinking from spending the whole budget
            # on what is a short classification task.
            output_config={
                "effort": "low",
                "format": {"type": "json_schema", "schema": ANALYSIS_JSON_SCHEMA},
            },
            messages=[
                {
                    "role": "user",
                    "content": f"Recent utterances, oldest first:\n{window}",
                }
            ],
        )
    except (
        anthropic.APITimeoutError,
        anthropic.APIConnectionError,
        anthropic.APIStatusError,
    ):
        return NEUTRAL

    if response.stop_reason == "refusal":
        return NEUTRAL

    text = next((b.text for b in response.content if b.type == "text"), None)
    if text is None:
        return NEUTRAL

    try:
        return Analysis.model_validate_json(text)
    except ValidationError:
        return NEUTRAL
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && uv run pytest tests/test_analyzer.py -v`
Expected: PASS (8 tests)

- [ ] **Step 5: Swap the analyzer into `main.py`**

Replace the `HARDCODED` constant and the `process_text` body:

```python
from .analyzer import analyze
```

```python
@app.post("/process_text", response_model=ProcessTextResponse)
async def process_text(req: ProcessTextRequest) -> ProcessTextResponse:
    analysis = await analyze(req.utterances)
    return ProcessTextResponse(seq=req.seq, analysis=analysis)
```

Delete the now-unused `HARDCODED` constant and the `Analysis` import if it is no longer referenced. The frontend's `hardcoded` source mode still works — it now exercises the real path with a fixed input string, which is more useful than a canned response.

- [ ] **Step 6: Write `backend/scripts/smoke_anthropic.py`**

```python
"""Validate ANTHROPIC_API_KEY and the analyzer end to end.

Run once a key is available:  uv run python scripts/smoke_anthropic.py
"""

import asyncio
import os
import sys
import time

from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.analyzer import MODEL, analyze  # noqa: E402
from app.schemas import NEUTRAL  # noqa: E402

CASES = [
    "Honestly this is the best result we've had all quarter.",
    "I mean, maybe it works? I'm not really sure.",
    "The build is broken again and nobody knows why.",
    "Meeting's at four in the usual room.",
]


async def main() -> int:
    load_dotenv()
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY is not set — copy .env.example to .env first.")
        return 1

    print(f"model: {MODEL}\n")
    failures = 0

    for text in CASES:
        started = time.perf_counter()
        result = await analyze([text])
        elapsed = time.perf_counter() - started
        fell_back = result == NEUTRAL

        print(f"{text}\n  {elapsed:.2f}s  fallback={fell_back}")
        print(
            f"  valence={result.valence:+.2f} arousal={result.arousal:.2f} "
            f"certainty={result.speaker_certainty:.2f} "
            f"confidence={result.model_confidence:.2f}"
        )
        print(f"  keywords={[k.text for k in result.keywords]}\n")

        if fell_back:
            failures += 1

    if failures:
        print(f"{failures}/{len(CASES)} calls fell back to NEUTRAL.")
        print("If every call fell back, check the key. If only slow ones did,")
        print("raise LLM_TIMEOUT_SECONDS or set ANTHROPIC_MODEL to a faster model.")
        return 1

    print("All calls returned a parsed analysis.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
```

- [ ] **Step 7: Confirm the backend still starts and commit**

Run: `cd backend && uv run pytest -v` — expected PASS (18 tests).

Then confirm the app imports cleanly without a key present (the client is constructed lazily enough that import succeeds; the call itself will fall back):

```bash
cd backend && uv run python -c "from app.main import app; print('import ok')"
```

Expected: `import ok`

```bash
git add backend
git commit -m "feat: Anthropic analyzer with neutral fallback on every failure path"
```

---

## Task 7: Real Deepgram audio

Build-order step 5. **Ships unexecuted — no API key available.**

**Files:**
- Create: `backend/app/deepgram_token.py`, `frontend/src/state/useTranscription.ts`
- Modify: `backend/app/main.py`, `frontend/src/App.tsx`
- Test: `backend/tests/test_deepgram_token.py`, `frontend/src/state/useTranscription.test.ts`

**Interfaces:**
- Consumes: `AnalysisGate` / `useAnalysis` from Task 2.
- Produces: `GET /deepgram_token` returning `{"access_token": str, "expires_in": float}`; `useTranscription({ onSpeechFinal, onInterim, onConnectionChange })` returning `{ start, stop }`; `backoffDelay(attempt: number): number` and `shouldSubmit(msg)` from `src/state/useTranscription.ts`.

**Verified API facts** (checked against Deepgram docs on 2026-08-19):
- Mint: `POST https://api.deepgram.com/v1/auth/grant`, header `Authorization: Token <API_KEY>`, body `{"ttl_seconds": N}`, response `{"access_token", "expires_in"}`. Default TTL is 30s.
- The token only needs to be valid at connection time — the socket stays open afterward, so a short TTL is fine.
- Browsers cannot set WebSocket headers, so auth goes through `Sec-WebSocket-Protocol`. The documented API-key form is `["token", API_KEY]`; the JWT uses the Bearer scheme, hence `["bearer", access_token]`. **This is the one shape the docs do not show literally** — it is isolated behind a single constant with a documented fallback.

- [ ] **Step 1: Write the failing backend test**

`backend/tests/test_deepgram_token.py`:

```python
import httpx
import pytest
from fastapi.testclient import TestClient

from app import deepgram_token
from app.main import app

client = TestClient(app)


def patch_post(monkeypatch, result):
    async def fake_post(self, url, **kwargs):
        if isinstance(result, Exception):
            raise result
        return result

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)


def test_returns_token_on_success(monkeypatch):
    monkeypatch.setenv("DEEPGRAM_API_KEY", "fake-key")
    patch_post(
        monkeypatch,
        httpx.Response(200, json={"access_token": "jwt-abc", "expires_in": 30.0}),
    )
    res = client.get("/deepgram_token")
    assert res.status_code == 200
    assert res.json() == {"access_token": "jwt-abc", "expires_in": 30.0}


def test_returns_503_when_key_missing(monkeypatch):
    monkeypatch.delenv("DEEPGRAM_API_KEY", raising=False)
    res = client.get("/deepgram_token")
    assert res.status_code == 503


def test_returns_502_when_deepgram_rejects(monkeypatch):
    monkeypatch.setenv("DEEPGRAM_API_KEY", "fake-key")
    patch_post(monkeypatch, httpx.Response(401, json={"err_code": "INVALID_AUTH"}))
    res = client.get("/deepgram_token")
    assert res.status_code == 502


def test_returns_502_on_network_failure(monkeypatch):
    monkeypatch.setenv("DEEPGRAM_API_KEY", "fake-key")
    patch_post(monkeypatch, httpx.ConnectError("boom"))
    res = client.get("/deepgram_token")
    assert res.status_code == 502


def test_never_leaks_the_api_key_in_the_response(monkeypatch):
    monkeypatch.setenv("DEEPGRAM_API_KEY", "super-secret-key")
    patch_post(monkeypatch, httpx.Response(401, text="nope"))
    res = client.get("/deepgram_token")
    assert "super-secret-key" not in res.text
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && uv run pytest tests/test_deepgram_token.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.deepgram_token'`

- [ ] **Step 3: Write `backend/app/deepgram_token.py`**

```python
"""Mints short-lived Deepgram tokens so the API key never reaches the browser."""

import os

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

GRANT_URL = "https://api.deepgram.com/v1/auth/grant"

# The token only has to be valid for the connection handshake; the socket stays
# open afterward. 60s is ample headroom over the 30s default.
TTL_SECONDS = 60

router = APIRouter()


class TokenResponse(BaseModel):
    access_token: str
    expires_in: float


@router.get("/deepgram_token", response_model=TokenResponse)
async def deepgram_token() -> TokenResponse:
    api_key = os.environ.get("DEEPGRAM_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Transcription not configured")

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.post(
                GRANT_URL,
                headers={
                    "Authorization": f"Token {api_key}",
                    "Content-Type": "application/json",
                },
                json={"ttl_seconds": TTL_SECONDS},
            )
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Could not reach Deepgram")

    if res.status_code != 200:
        # Deliberately does not forward Deepgram's body — it can echo the key.
        raise HTTPException(status_code=502, detail="Deepgram rejected the request")

    data = res.json()
    return TokenResponse(
        access_token=data["access_token"],
        expires_in=float(data.get("expires_in", TTL_SECONDS)),
    )
```

Register it in `main.py`:

```python
from .deepgram_token import router as deepgram_router

app.include_router(deepgram_router)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && uv run pytest tests/test_deepgram_token.py -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Write the failing frontend test**

`frontend/src/state/useTranscription.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MAX_BACKOFF_MS, backoffDelay, shouldSubmit } from "./useTranscription";

describe("backoffDelay", () => {
  it("grows exponentially", () => {
    expect(backoffDelay(0)).toBe(500);
    expect(backoffDelay(1)).toBe(1000);
    expect(backoffDelay(2)).toBe(2000);
  });

  it("caps at the maximum", () => {
    expect(backoffDelay(20)).toBe(MAX_BACKOFF_MS);
  });
});

describe("shouldSubmit", () => {
  const msg = (over: Record<string, unknown>) => ({
    type: "Results",
    is_final: false,
    speech_final: false,
    channel: { alternatives: [{ transcript: "hello there" }] },
    ...over,
  });

  it("submits on speech_final", () => {
    expect(shouldSubmit(msg({ speech_final: true }))).toBe(true);
  });

  it("does NOT submit on is_final alone", () => {
    // is_final fires constantly; submitting on it would spam the LLM.
    expect(shouldSubmit(msg({ is_final: true }))).toBe(false);
  });

  it("does not submit on an interim result", () => {
    expect(shouldSubmit(msg({}))).toBe(false);
  });

  it("does not submit an empty transcript", () => {
    expect(
      shouldSubmit(
        msg({
          speech_final: true,
          channel: { alternatives: [{ transcript: "   " }] },
        }),
      ),
    ).toBe(false);
  });

  it("ignores non-Results messages", () => {
    expect(shouldSubmit({ type: "Metadata" })).toBe(false);
  });

  it("tolerates a malformed payload", () => {
    expect(shouldSubmit({ type: "Results", speech_final: true })).toBe(false);
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/state/useTranscription.test.ts`
Expected: FAIL — cannot resolve `./useTranscription`

- [ ] **Step 7: Write `frontend/src/state/useTranscription.ts`**

```ts
import { useCallback, useRef } from "react";
import type { ConnectionState } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

const DEEPGRAM_URL =
  "wss://api.deepgram.com/v1/listen" +
  "?model=nova-3&smart_format=true&interim_results=true&punctuate=true";

/**
 * Browsers cannot set WebSocket headers, so credentials ride the
 * Sec-WebSocket-Protocol header. The documented API-key form is
 * ["token", KEY]; a minted JWT uses the Bearer scheme.
 *
 * If the handshake fails with a valid token, switch to KEY_SUBPROTOCOL and set
 * VITE_DEEPGRAM_KEY — the README documents that as a known tradeoff.
 */
const jwtSubprotocol = (token: string) => ["bearer", token];
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const keySubprotocol = (key: string) => ["token", key];

const KEEPALIVE_MS = 8000; // Deepgram drops the socket after ~10s of silence.
export const MAX_BACKOFF_MS = 8000;
const MAX_ATTEMPTS = 6;

export function backoffDelay(attempt: number): number {
  return Math.min(500 * 2 ** attempt, MAX_BACKOFF_MS);
}

export function transcriptOf(msg: unknown): string {
  const alt = (msg as { channel?: { alternatives?: { transcript?: string }[] } })
    ?.channel?.alternatives?.[0];
  return alt?.transcript ?? "";
}

/**
 * Fire the backend call on speech_final only. is_final fires on every finalized
 * interim chunk — many times per sentence — and would spam the LLM.
 */
export function shouldSubmit(msg: unknown): boolean {
  const m = msg as { type?: string; speech_final?: boolean };
  if (m?.type !== "Results") return false;
  if (!m.speech_final) return false;
  return transcriptOf(msg).trim().length > 0;
}

interface Options {
  onSpeechFinal: (text: string) => void;
  onInterim: (text: string) => void;
  onConnectionChange: (state: ConnectionState) => void;
}

export function useTranscription({
  onSpeechFinal,
  onInterim,
  onConnectionChange,
}: Options) {
  const socketRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const keepaliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const wantOpenRef = useRef(false);

  const teardownSocket = useCallback(() => {
    if (keepaliveRef.current) clearInterval(keepaliveRef.current);
    keepaliveRef.current = null;
    const sock = socketRef.current;
    socketRef.current = null;
    if (sock && sock.readyState === WebSocket.OPEN) {
      // Flushes the final utterance instead of dropping it.
      sock.send(JSON.stringify({ type: "CloseStream" }));
    }
    sock?.close();
  }, []);

  const stop = useCallback(() => {
    wantOpenRef.current = false;
    if (retryRef.current) clearTimeout(retryRef.current);
    retryRef.current = null;
    recorderRef.current?.state !== "inactive" && recorderRef.current?.stop();
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    teardownSocket();
    onConnectionChange("idle");
  }, [onConnectionChange, teardownSocket]);

  const connect = useCallback(async () => {
    onConnectionChange(attemptRef.current === 0 ? "connecting" : "reconnecting");

    const res = await fetch(`${API_BASE}/deepgram_token`);
    if (!res.ok) throw new Error(`token endpoint returned ${res.status}`);
    const { access_token } = (await res.json()) as { access_token: string };

    const socket = new WebSocket(DEEPGRAM_URL, jwtSubprotocol(access_token));
    socketRef.current = socket;

    socket.onopen = () => {
      attemptRef.current = 0;
      onConnectionChange("live");
      keepaliveRef.current = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "KeepAlive" }));
        }
      }, KEEPALIVE_MS);
      recorderRef.current?.start(250);
    };

    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg?.type !== "Results") return;
      const text = transcriptOf(msg).trim();
      if (shouldSubmit(msg)) {
        onInterim("");
        onSpeechFinal(text);
      } else if (text) {
        onInterim(text);
      }
    };

    socket.onclose = () => {
      if (keepaliveRef.current) clearInterval(keepaliveRef.current);
      keepaliveRef.current = null;
      if (!wantOpenRef.current) return;

      if (attemptRef.current >= MAX_ATTEMPTS) {
        onConnectionChange("error");
        return;
      }
      const delay = backoffDelay(attemptRef.current++);
      onConnectionChange("reconnecting");
      retryRef.current = setTimeout(() => {
        connect().catch(() => onConnectionChange("error"));
      }, delay);
    };
  }, [onConnectionChange, onInterim, onSpeechFinal]);

  const start = useCallback(async () => {
    wantOpenRef.current = true;
    attemptRef.current = 0;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Containerized Opus — Deepgram detects the format, so do NOT send
      // encoding or sample_rate query params (those are for raw PCM only).
      const recorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0 && socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(e.data);
        }
      };

      await connect();
    } catch {
      onConnectionChange("error");
      stop();
    }
  }, [connect, onConnectionChange, stop]);

  return { start, stop };
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/state/useTranscription.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 9: Wire live mode into `App.tsx`**

Add the import, a rolling window ref, and the hook:

```tsx
import { useTranscription } from "./state/useTranscription";
```

Inside the component:

```tsx
  const [interim, setInterim] = useState("");
  const windowRef = useRef<string[]>([]);

  const onSpeechFinal = useCallback(
    (text: string) => {
      setLines((prev) => [...prev, text]);
      // Rolling window of the last 3 utterances — a single utterance makes the
      // values thrash on filler words.
      windowRef.current = [...windowRef.current, text].slice(-3);
      void submit(windowRef.current);
    },
    [submit],
  );

  const transcription = useTranscription({
    onSpeechFinal,
    onInterim: setInterim,
    onConnectionChange: setConnection,
  });
```

Replace the `live` branch of `start`:

```tsx
    await transcription.start();
```

And in `stop`, before `setRecording(false)`:

```tsx
    transcription.stop();
```

Pass the interim text through: `<TranscriptDisplay lines={lines} interim={interim} />`.

- [ ] **Step 10: Add the frontend env example and commit**

`frontend/.env.example`:

```bash
VITE_API_BASE=http://localhost:8000
# Fallback only — see README "Known tradeoffs". Leave unset when the
# /deepgram_token endpoint works.
# VITE_DEEPGRAM_KEY=
```

Run both suites: `cd backend && uv run pytest -q && cd ../frontend && npm test`
Expected: PASS (23 backend + 32 frontend)

```bash
git add backend frontend
git commit -m "feat: Deepgram streaming transcription with token minting and backoff"
```

---

## Task 8: README and documentation

Deliverable: the written deliverables from the spec.

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: no code.

- [ ] **Step 1: Write `README.md`**

It must contain these sections. Write real prose, not placeholders:

1. **What this is** — two sentences plus a screenshot placeholder line.
2. **Setup** — exact commands:
   ```bash
   cp .env.example .env    # then fill in keys
   cd backend && uv sync && uv run uvicorn app.main:app --reload --port 8000
   cd frontend && npm install && npm run dev
   ```
3. **Architecture sketch** — the ASCII data-flow diagram from spec §5.2, plus the three-source table (`demo` / `hardcoded` / `live`).
4. **Why this sentiment → visual mapping** — the table from spec §6 with the reasoning column, and the note that four independent signals map to four independent visual channels so they can be read simultaneously.
5. **Async and error handling** — sequence-number staleness guard; 5s LLM timeout with `max_retries=0` and neutral fallback; WebSocket exponential backoff; error states expressed as desaturation and slowdown rather than toasts.
6. **Deliberate deviations from the brief** — the table from spec §3, all four rows.
7. **Known tradeoffs** — write these three honestly:
   - The Deepgram JWT subprotocol shape (`["bearer", token]`) is inferred from the Bearer-scheme documentation rather than shown literally in the WebSocket docs. If the handshake fails, `keySubprotocol` in `useTranscription.ts` plus `VITE_DEEPGRAM_KEY` is the documented fallback, at the cost of exposing the key to the browser.
   - `ANTHROPIC_MODEL` defaults to `claude-opus-5`. A real-time loop with a 5s budget may want a faster model; it is a one-line env change, and `scripts/smoke_anthropic.py` reports per-call latency.
   - Demo mode is not in the brief. It exists as the live-demo fallback and as the surface the visualization was tuned against.
8. **Tests** — `cd backend && uv run pytest` and `cd frontend && npm test`, with what each covers and the explicit note that the Anthropic and Deepgram network paths are covered only at their fallback boundaries.

- [ ] **Step 2: Verify every command in the README actually runs**

Execute each command block in a clean shell. Fix any that fail.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: setup, architecture, mapping justification, and tradeoffs"
```

---

## Self-Review

**Spec coverage:** §3 deviations → Task 8 step 1.6. §4 schema → Task 1. §5.1 three sources → Tasks 1–3. §5.2 data flow → Tasks 2, 7. §5.3 isolation → Tasks 6, 7. §5.4 smoothing → Task 4. §6 mapping → Task 4 + Task 8. §7 non-negotiables → distributed, all covered. §8 visual errors → Task 4 (`CONNECTION_DAMPING`) + Task 7 (backoff). §9 file structure → matches, with two additions: `state/useKeywordCloud.ts` (keyword TTL logic needed a testable home) and `scripts/smoke_anthropic.py` split from a single `smoke.py` so each key can be validated independently. §10 testing → Tasks 1, 2, 4, 6, 7 (plus keyword and demo-driver coverage). §11 build order → task order. §12 deliverables → Tasks 1, 8.

**Type consistency:** `Analysis` field names identical across `schemas.py`, `types.ts`, and `ANALYSIS_JSON_SCHEMA`. `VisualTargets` keys identical in `mapping.ts` and `sketch.ts`'s `START` and `cur` (the `Object.keys` loop requires exactly this). `analysisRef` named consistently in `useAnalysis`, `App`, and `Aura`. `apply` is exported from `useAnalysis` in Task 2 because Task 3 needs it for demo mode.

**Known open item:** the Deepgram JWT subprotocol array is the one shape not literally documented. Isolated to one constant, with a fallback and a README entry.
