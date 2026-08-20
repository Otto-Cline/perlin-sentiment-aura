# Sentiment Aura

A live speech visualization. You talk; your words appear on screen, the key ones
are written by hand onto a sheet of paper, and a pink highlighter sweeps across
that page — its speed, width, opacity and gesture all driven by the emotional
shape of what you said.

Speech goes to Deepgram, finalized utterances go to a FastAPI backend, and Claude
scores each one. The marker follows a Perlin noise field and never targets the
words; whatever lies under it gets marked.

## Running it

Needs Python 3.11+, Node 20+, and [uv](https://docs.astral.sh/uv/).

```bash
cp .env.example .env                     # fill in ANTHROPIC_API_KEY and DEEPGRAM_API_KEY
cp frontend/.env.example frontend/.env   # only needed for live mic — see tradeoffs
```

Backend, in one terminal:

```bash
cd backend && uv sync && uv run uvicorn app.main:app --reload --port 8000
```

Frontend, in another:

```bash
cd frontend && npm install && npm run dev
```

Open the URL Vite prints. To check both keys were picked up:

```bash
curl -s http://localhost:8000/health
```

`{"status":"ok","llm_configured":true,"transcription_configured":true}` means
you're ready. Either flag reading `false` is why the marker looks washed out.

To validate the Anthropic key and see per-call latency:

```bash
cd backend && uv run python scripts/smoke_anthropic.py
```

**Two modes**, chosen bottom-left. **Live mic** is the real thing. **Demo** plays
a scripted six-line conversation with no microphone and no network — it drives
every layer identically, and it's the fallback if the mic fails mid-demo.

## How it fits together

```
mic
 └─ MediaRecorder ──► WebSocket ──► Deepgram
      ├─ interim results ──────────► transcript, greyed
      └─ speech_final ────────────► POST /process_text { utterances: [last 3], seq }
                                      └─ FastAPI ──► Claude (JSON schema, 8s timeout)
                                          └─ Pydantic-validated Analysis
                                              └─ drop if seq <= last applied
                                                  ├─ React state ─► transcript, keywords
                                                  └─ useRef ─────► canvas, read per frame
```

The backend hosts no models. It holds the Anthropic key, calls Claude, validates
the response, and returns clean JSON. All network I/O lives in three files —
`backend/app/analyzer.py`, `backend/app/deepgram_token.py` and
`frontend/src/state/useTranscription.ts` — and each degrades to a defined
fallback rather than throwing.

A rolling window of the last three utterances is sent, not just the newest;
scoring one at a time makes the values thrash on filler words.

## What the model returns

```json
{
  "valence": 0.62,
  "arousal": 0.55,
  "speaker_certainty": 0.78,
  "model_confidence": 0.85,
  "keywords": [{ "text": "prototype", "weight": 0.9 }],
  "rationale": "one short sentence"
}
```

The brief's example passes a single `sentiment` scalar, and the section it points
to for the schema contains neither a prompt nor a schema — so this is the
project's own definition. One number can't drive a rich visualization.

`valence` is pleasantness. `arousal` is energy, independent of valence — calm
contentment is high valence, low arousal. `model_confidence` is the model's
certainty in its *own* read: sarcasm, filler and one-word utterances score low.

## Sentiment → visual

**The pen never changes colour.** Hue and saturation are fixed, so it reads as one
physical highlighter throughout. Sentiment changes how it *moves* and how heavily
it marks, never what colour it is — a channel given up deliberately to keep the
object believable.

| signal | what it drives | why |
|---|---|---|
| valence | turn sharpness | pleasant sweeps in long calm arcs; unpleasant turns sharply and jerks |
| arousal | speed and nib width | energy is a fast, broad mark — legible twice over |
| model_confidence | opacity | an unsure read barely marks the page; capped short of opaque so words stay readable |
| keyword weight | size and darkness | important words are larger and sit heavier |
| *cumulative* arousal | paper crinkle depth | the only channel that records history rather than the present |

`speaker_certainty` is deliberately unmapped — three strong channels read better
than four weak ones, and valence carries the gesture instead.

**Paper wear never resets.** Each reading adds `arousal² × 0.11` to a monotonic
accumulator. A calm conversation stays smooth; a loud one crumples the sheet and
it stays crumpled after things settle. Only an explicit reset lowers it — the
value is a getter over a private field, so an assignment throws.

## The Perlin field

`field()` and `angleAt()` in `frontend/src/aura/field.ts` are the only source of
noise in the app. Every point on the canvas has a direction; the marker asks
"which way at my position?" each frame and steps, so its path is a single flow
line through the field. The usual way to show a flow field is hundreds of thin
particles — this is one thick pen instead.

The paper is the *same function at eighteen times the zoom*, shaded by finite
differences and lit from the upper left, so the grain you can see is the field
itself. One seed, two scales; a second seed would destroy the correlation.

The marker also deliberately *resists* the field. Tracking it exactly makes the
stroke writhe like a ribbon; resisting it is what makes a mark read as deliberate.

Layers go paper → words → marker, composited with `multiply` so the words read
through the ink. Because `multiply(pink, black)` is black, the marker alone had no
effect on the words it crossed — so the words render to their own layer and the
marker knocks their opacity down where it passes. That's the detail that made it
finally look like a highlighter going *over* the page.

## Errors

Failures show up in the artwork, not in a toast.

- **Out-of-order responses.** Every request carries a monotonic sequence number
  the backend echoes back. Anything not strictly newer is dropped, so a slow reply
  can never overwrite a fresh one.
- **Slow or failing LLM.** 8s timeout with `max_retries=0` — that zero matters,
  since the SDK retries timeouts by default. Any failure returns a neutral
  reading, so the marker drifts washed-out rather than freezing.
- **WebSocket drop.** Exponential backoff, 500ms doubling to 8s, six attempts.
  While reconnecting the marker desaturates and slows; on giving up it goes grey.
- **Deepgram specifics.** `KeepAlive` every 8s or the socket drops after ~10s of
  silence; `CloseStream` on stop so the last utterance is flushed.

## Deliberate deviations from the brief

| brief says | this does | why |
|---|---|---|
| fire on `is_final: true` | fires on `speech_final` | `is_final` fires several times per sentence and would hammer the LLM |
| pass state as props to the visualization | React state for the DOM, a `useRef` mirror for the canvas | props captured in a p5 `draw()` closure go stale; both are kept |
| `react-p5` | p5 instance mode in `useEffect` | `react-p5` is effectively unmaintained |
| `axios`, Web Audio API | `fetch`, `MediaRecorder` | equivalent here, fewer dependencies |
| OpenAI | Anthropic | the brief explicitly permits it |

## Known tradeoffs

- **The Deepgram key authenticates from the browser.** The intended design mints a
  short-lived token server-side, but the available key returns `FORBIDDEN` from
  `/v1/auth/grant` — valid, but without token-grant permission. The app asks the
  backend for a token first and falls back to `VITE_DEEPGRAM_KEY`, so a
  token-capable key upgrades it with no code change. The brief's own data flow has
  the frontend connect to Deepgram directly anyway.
- **Colour is not mapped to sentiment.** The brief names colour as a parameter;
  this maps gesture, speed, width and opacity instead, to keep the marker
  believable as a single physical pen. Failure is the only thing that drains it.
- **Mic capture is the one path not verified.** The token endpoint, socket
  handshake, backend and LLM were all exercised against live services; browser mic
  capture was not, because the available browser blocked `getUserMedia`.
- **Every font is a system stack** — handwriting for the page, a serif for the
  transcript, a grotesque for the chrome. A webfont that fails to load on unknown
  demo wifi is a visible failure. On a non-Mac the words are still handwriting,
  but not the same faces.

## Tests

```bash
cd backend && uv run pytest     # 37
cd frontend && npm test         # 124
```

They cover the sequence-number gate, the sentiment→visual mapping at its
boundaries, the noise field's range and continuity, the monotonic wear invariant,
keyword placement and one-by-one arrival, every analyzer fallback path, and the
`speech_final`-not-`is_final` rule. Rendering isn't unit-tested — that's what demo
mode and human eyes are for.

There's also a tuning page at `/tune.html` in dev, with sliders for every paper
and marker parameter. It imports the same modules the app uses, so values dialled
in there transfer directly. It isn't part of the production build.
