# Sentiment Aura — Design

Date: 2026-08-19
Status: approved, ready for implementation planning

## 1. What we are building

A full-stack web app that transcribes live speech, sends finalized utterances to a
backend, has an LLM score them along four emotional dimensions, and renders the result
as a continuously-evolving Perlin flow field — a "sentiment aura."

Three components, per the brief:

1. **Frontend** (React + Vite + TypeScript) — captures audio, holds the transcription
   socket, renders UI and visualization.
2. **Backend** (FastAPI) — receives text, calls the LLM, returns validated structured
   JSON. Hosts no models of its own.
3. **External APIs** — Deepgram (streaming transcription), Anthropic (analysis).

The graded qualities, per the rubric, are full-stack orchestration, data-driven
visualization, frontend polish, and async/error handling. Prompt quality is explicitly
not graded.

## 2. Constraints shaping this design

- **Deadline: tomorrow morning.** Scope is fixed; nothing speculative gets built.
- **No API keys in hand at design time.** Steps 4 and 5 (Anthropic, Deepgram) will be
  written but cannot be executed tonight. This is the single most important constraint
  and it drives section 5.
- **Demo runs on a laptop, possibly on battery, possibly on hostile conference wifi.**
  Hence `pixelDensity(1)`, a capped particle count, and a demo mode that needs neither
  mic nor network.

## 3. Deviations from the brief

Each of these is deliberate. Each gets a line in the README so it reads as a decision
rather than a misreading.

| Brief says | We do | Why |
|---|---|---|
| §4.5 fire `/process_text` on `is_final: true` | Fire on `speech_final` | `is_final` fires on every finalized interim chunk; using it would spam the LLM many times per sentence. `speech_final` marks an actual end-of-utterance. |
| §4.10 "React passes these new state variables as props to the visualization" | React state for the DOM UI; a `useRef` mirror for the sketch | Props captured in a p5 `draw()` closure go stale. Both are kept, so nothing in the brief's data flow is lost. |
| `react-p5` listed first | p5 instance mode inside `useEffect` | `react-p5` is effectively unmaintained. |
| `axios`, Web Audio API | `fetch`, `MediaRecorder` | Equivalent for our purposes; fewer dependencies. An AudioWorklet PCM pipeline is not worth the time. |

Two gaps in the brief worth recording:

- §4.6–4.7 reference "the prompt (see section 3)" and "a JSON (like in section 3)", but
  §3 contains neither a prompt nor a schema — and says prompt quality is not assessed.
  **The schema is therefore ours to define.** Section 4 below is that definition.
- Demo mode appears nowhere in the brief. It is an addition, justified by the
  "Async Management & Error Handling" rubric line and by being our live-demo fallback.

## 4. Analysis schema

```json
{
  "valence": -1.0,
  "arousal": 0.0,
  "speaker_certainty": 0.0,
  "model_confidence": 0.0,
  "keywords": [{ "text": "...", "weight": 0.0 }],
  "rationale": "one short sentence"
}
```

Ranges: `valence` in [-1, 1]; every other scalar in [0, 1].

Semantics:

- **valence** — pleasantness.
- **arousal** — energy / activation, independent of valence. Calm contentment is high
  valence and low arousal; panic is low valence and high arousal.
- **speaker_certainty** — hedging versus assertion. "maybe, I guess, sort of" scores
  low; flat declarative claims score high.
- **model_confidence** — the model's certainty in its *own* read. Sarcasm, filler,
  one-word utterances, and logistics chatter score low.

This is a strict superset of the brief's `setSentiment(0.85)` example, chosen because
"map abstract data to *multiple* visual parameters" is a rubric line and one scalar
cannot carry a rich visualization.

Rules:

- Send a **rolling window of the last 3 finalized utterances**, not just the newest, or
  values thrash on filler words.
- **Validate with Pydantic.** Never parse free-form JSON. Structured output / tool use
  guarantees the shape.

## 5. Architecture

### 5.1 Three sources behind one interface

Everything downstream consumes the same two streams — transcript lines and `Analysis`
objects — regardless of where they came from:

- **`demo`** — synthetic driver emitting plausible analysis objects on a timer. No mic,
  no network. The entire visualization is built and tuned against this.
- **`hardcoded`** — real backend, canned analysis. The step-1 verification target.
- **`live`** — Deepgram → `/process_text` → Anthropic.

This is load-bearing rather than extra scaffolding: it is what makes building without
keys possible, it is the step-by-step build order's seam, and it becomes the
user-facing demo toggle that is our fallback if the mic or network fails live.

### 5.2 Data flow (live source)

```
mic
 └─ MediaRecorder (audio/webm;codecs=opus, start(250))
     └─ WebSocket ──► Deepgram (smart_format, interim_results)
         ├─ interim  ──► transcript UI (grey, in-progress)
         └─ speech_final ──► transcript UI (committed)
                          └─ POST /process_text { utterances: [last 3], seq: n }
                              └─ backend ──► Anthropic (tool use, 5s timeout)
                                  └─ Analysis (Pydantic-validated)
                                      └─ drop if seq < last applied
                                          ├─ React state ──► keywords / transcript UI
                                          └─ useRef ──► sketch targets ──► per-frame lerp
```

### 5.3 Untested-path isolation

Because Anthropic and Deepgram cannot be exercised tonight, all code touching them is
confined to three files, each of which fails into a defined fallback rather than
throwing:

- `backend/app/analyzer.py` — Anthropic call. 5s timeout, returns a neutral analysis on
  any failure.
- `backend/app/deepgram_token.py` — mints a short-lived browser token.
- `frontend/src/state/useTranscription.ts` — the socket, keepalive, and backoff.

Plus `backend/scripts/smoke.py`, which validates each key in seconds once available.
"Untested" therefore means "three files to check," not "unknown app-wide risk."

### 5.4 Single smoothing layer

`aura/mapping.ts` is a **pure function**: `Analysis → target vector`. `aura/sketch.ts`
owns the current values and moves each toward its target every frame
(`cur += (target - cur) * 0.04`). Nothing else touches visual state.

This makes the "nothing snaps" rule enforceable in one place instead of scattered
through the sketch, and it makes the mapping unit-testable without a canvas.

## 6. Visual mapping and its justification

The aura is a Perlin flow field with persistent particles and low-alpha trails.

| Signal | Visual parameter | Reasoning |
|---|---|---|
| valence | hue (HSB: cold blue → warm gold) | Warmth reads as pleasantness pre-verbally; the single most legible channel gets the primary emotional axis. |
| arousal | particle speed, noise time-step, field turbulence | Energy in the data becomes energy in the motion. Literal and immediately readable. |
| speaker_certainty | field coherence — high aligns particles into smooth laminar streams; low makes octaves disagree and the flow fragment into eddies | Form mirrors conviction: a decisive speaker produces order, a hedging one produces turbulence. |
| model_confidence | saturation and opacity | Low confidence *literally looks washed out* — the visualization is honest about its own uncertainty instead of hiding it. |
| keyword weight | font size and lifetime | Important words are bigger and linger. |

The through-line: **four independent signals map to four independent visual channels**,
so a viewer can read them simultaneously without the channels colliding.

## 7. Non-negotiable implementation details

**p5**
- `pixelDensity(1)`. Cap particle count. Test on battery.
- Never pass analysis values as React props into the sketch — stale closures. Targets
  live in a `useRef` object; `draw()` reads `ref.current` every frame.
- Smooth *every* visual parameter per frame toward its target. Nothing snaps. This is
  the whole demo.

**Deepgram**
- Trigger the backend call on `speech_final`, not `is_final`.
- Send periodic `{"type":"KeepAlive"}` or the socket drops after ~10s of silence.
- Send `{"type":"CloseStream"}` on stop to flush the last utterance.
- `smart_format=true`, `interim_results=true`.
- Mint a short-lived token from the backend rather than shipping the API key to the
  browser. If the current endpoint turns out not to be straightforward, fall back to
  key-in-frontend and flag it in the README as a known tradeoff.

**Async correctness**
- Attach a monotonic sequence number to every `/process_text` call; drop any response
  older than the last applied one. Stale sentiment overwriting fresh sentiment is
  explicitly on the rubric.

**Backend**
- 5s timeout on the LLM call with a graceful neutral fallback. `CORSMiddleware`.

**Keywords**
- Key React elements by the keyword string, not array index, or the stagger animation
  breaks on re-render.
- Keep a `Map<string, timestamp>`, expire after ~20s, fade in one by one with a stagger.

## 8. Error handling is visual, not a toast

The aura has explicit connection states:

- **WebSocket drop** — desaturate and slow the field while reconnecting with
  exponential backoff.
- **LLM failure or timeout** — drift toward neutral rather than freezing.
- **Recording state** — a clear visual indicator, part of the aura rather than chrome.

## 9. File structure

```
sentiment-aura/
├── README.md                    setup, architecture sketch, mapping justification
├── .gitignore                   never commit real keys
├── .env.example
├── backend/
│   ├── pyproject.toml           uv
│   ├── app/
│   │   ├── main.py              FastAPI app, CORS, routes
│   │   ├── schemas.py           Pydantic: ProcessTextRequest, Analysis
│   │   ├── analyzer.py          Anthropic, tool use, 5s timeout, neutral fallback
│   │   └── deepgram_token.py    short-lived token minting
│   ├── scripts/smoke.py         validate keys when they arrive
│   └── tests/                   pytest
└── frontend/
    ├── package.json, vite.config.ts, index.html
    └── src/
        ├── main.tsx
        ├── App.tsx              layout, wiring
        ├── types.ts             Analysis and friends
        ├── state/
        │   ├── useAnalysis.ts       seq-numbered fetch, ref + state mirror
        │   └── useTranscription.ts  Deepgram socket, keepalive, backoff
        ├── demo/driver.ts           synthetic emitter, no mic/network
        ├── aura/
        │   ├── Aura.tsx             p5 instance-mode mount
        │   ├── sketch.ts            flow field, particles, per-frame smoothing
        │   └── mapping.ts           Analysis → visual targets (pure)
        └── ui/
            ├── TranscriptDisplay.tsx
            ├── KeywordsDisplay.tsx
            ├── Controls.tsx
            └── StatusIndicator.tsx
```

Preference is a small number of well-named files over deep nesting.

## 10. Testing scope

Deliberately narrow. Three places where a bug is invisible on screen:

- **pytest** — Pydantic validation (in-range, out-of-range, malformed) and the
  neutral-fallback path on timeout.
- **vitest** — the stale-response drop logic in `useAnalysis`.
- **vitest** — `mapping.ts` at boundary values.

Rendering is not unit-tested; that is what demo mode and human eyes are for.

## 11. Build order

Strictly sequential. Each step leaves the app runnable.

1. Backend `/process_text` returning hardcoded analysis JSON. Verify with curl.
2. React shell and state wiring against that hardcoded endpoint.
3. Demo mode driver. **Build and tune the entire visualization here.**
4. Swap in the real Anthropic call. *Cannot be executed without a key.*
5. Swap in real Deepgram audio. *Cannot be executed without a key.*

Demo mode stays in the final build as a user-facing toggle.

## 12. Deliverables

- `.env.example`
- `.gitignore` — no real key ever enters history
- README with setup steps, an architecture sketch, and a section justifying the
  sentiment → visual mapping
- A note on any deviation listed in section 3
