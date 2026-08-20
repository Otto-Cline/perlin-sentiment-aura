# Sentiment Aura

A live speech visualization. You talk; the words appear on screen and a Perlin
flow field behind them shifts its colour, energy and form to match the emotional
shape of what you said. Speech goes to Deepgram, finalized utterances go to a
FastAPI backend, and Claude scores each one along four independent emotional
dimensions that drive four independent visual channels.

## Setup

Requires Python 3.11+, Node 20+, and [uv](https://docs.astral.sh/uv/).

```bash
cp .env.example .env
```

Fill in `ANTHROPIC_API_KEY` and `DEEPGRAM_API_KEY`. Then, in one terminal:

```bash
cd backend && uv sync && uv run uvicorn app.main:app --reload --port 8000
```

And in another:

```bash
cd frontend && npm install && npm run dev
```

Open the URL Vite prints. Confirm both keys were picked up:

```bash
curl -s http://localhost:8000/health
```

`{"status":"ok","llm_configured":true,"transcription_configured":true}` means
you're ready. Either flag reading `false` is why the aura looks washed out.

Validate the Anthropic key and see per-call latency:

```bash
cd backend && uv run python scripts/smoke_anthropic.py
```

## The three source modes

The dropdown in the bottom-left switches where analysis comes from. All three
feed the identical downstream pipeline.

| Mode | Transcript | Analysis | Needs |
|---|---|---|---|
| **Demo** | scripted six-line arc | scripted, on a 3.2s timer | nothing — no mic, no network |
| **Sample** | one fixed sample line | real `/process_text` → Claude | Anthropic key |
| **Live mic** | real Deepgram stream | real `/process_text` → Claude | both keys |

Demo mode is the fallback if the mic or the network fails during a live demo,
and it is the mode the visualization was tuned against.

## Architecture

```
mic
 └─ MediaRecorder (audio/webm;codecs=opus, start(250))
     └─ WebSocket ──► Deepgram (smart_format, interim_results)
         ├─ interim  ──► transcript UI (greyed, in progress)
         └─ speech_final ──► transcript UI (committed)
                          └─ POST /process_text { utterances: [last 3], seq: n }
                              └─ backend ──► Claude (json_schema, 5s timeout)
                                  └─ Analysis (Pydantic-validated)
                                      └─ drop if seq <= last applied
                                          ├─ React state ──► transcript, keywords
                                          └─ useRef ──► sketch targets ──► per-frame lerp
```

The backend hosts no models. It holds the API keys, calls Claude, validates the
response, and hands back clean JSON.

Three files own all network I/O — `backend/app/analyzer.py`,
`backend/app/deepgram_token.py`, and `frontend/src/state/useTranscription.ts` —
and each degrades to a defined fallback rather than throwing.

### Why the analysis is four numbers, not one

The brief's example passes a single `sentiment` scalar. One number cannot drive a
rich visualization, and "map abstract data to *multiple* visual parameters" is on
the rubric, so the schema carries four independent signals plus weighted
keywords:

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

`valence` is pleasantness. `arousal` is energy, independent of valence — calm
contentment is high valence and low arousal. `speaker_certainty` is hedging
versus assertion. `model_confidence` is the model's certainty in its *own* read.

A rolling window of the last three utterances is sent, not just the newest;
scoring one utterance at a time makes the values thrash on filler words.

## Why this sentiment → visual mapping

### The visualization

Three layers, back to front:

1. **Paper** — a crinkled surface, shaded from the noise field.
2. **Keywords** — the model's keywords printed onto the page as they arrive,
   sized and darkened by weight, and left there.
3. **Highlighter** — two translucent pink markers tracing the field, composited
   with `multiply` so the words stay readable underneath.

**The marker never targets the words.** The Perlin field is the only thing
steering it; whichever keywords happen to lie under the path get marked. That
keeps the field the sole driver, which is both the brief's requirement and the
reason the composition stays unpredictable.

`field()` and `angleAt()` in `aura/field.ts` are the single source of noise.
Paper grain and pen gesture call the *same function with the same seed* at
different input multipliers — grain at ~18× the gesture scale — so the paper
bulges where the pen curves. That correlation is deliberate; a second seed would
destroy it.

**Paper wear is cumulative and never resets.** Each analysis update adds
`arousal * 0.01` to a monotonic accumulator that drives crinkle depth. A calm
conversation stays smooth; a long intense one leaves a permanently worn surface
that stays worn after things settle. Only an explicit reset lowers it — the
value is a getter over a private field, so an assignment throws rather than
silently succeeding.

### Visual direction

The field is a pen plotter tracing a vector field, so the whole interface is
built as instrument-on-paper: dark ink on warm off-white stock, strokes
darkening the paper as they overlap rather than glowing. Two typefaces, both
from system stacks so there is no webfont that can fail mid-demo — a serif for
transcript text, because that is speech being typeset, and a monospace for
instrument chrome (labels, controls, status). The only saturated colour in the
interface is the ink hue itself; one oxblood is reserved for recording and
errors, and nothing else competes.

| Signal | Visual parameter | Reasoning |
|---|---|---|
| valence | ink hue (slate blue → bronze) | Warmth reads as pleasantness pre-verbally, so the most legible channel carries the primary emotional axis. At ink brightness a cold hue reads as slate blue and a warm one as bronze — gold ink does not exist, ochre does. Valence is eased (exponent 0.55) before crossing the hue range: a linear map spends its whole middle in green, which is where ordinary speech sits, so the field would look green nearly always and true blue would appear only at valence -1. Eased, green is confined to roughly \|valence\| < 0.15. |
| arousal | particle speed, noise time-step, field turbulence | Energy in the data becomes energy in the motion. Immediately readable without a legend. |
| speaker_certainty | field coherence — high aligns particles into laminar streams, low makes the noise octaves disagree and fragments the flow into eddies | Form mirrors conviction: a decisive speaker produces order, a hedging one produces turbulence. |
| model_confidence | saturation and opacity | Low confidence *literally looks washed out* — on paper it reads as grey graphite rather than coloured ink. The visualization is honest about its own uncertainty instead of asserting a confident neutral. |
| keyword weight | font size and lifetime | Important words are bigger and linger longer. |

The through-line: four independent signals drive four independent visual
channels, so a viewer reads them simultaneously without the channels colliding.

Every marker channel is an intensity or a gesture, so valence — the one
categorical signal — rides a narrow hue shift *inside the pink family* rather
than a full colour ramp. It stays one marker, and the channel survives.

| Signal | Marker parameter | Reasoning |
|---|---|---|
| valence | hue, cool violet-magenta → warm rose | Real highlighters span this range, so it reads as one pen. Pushing the warm anchor past ~355 turns it orange and it stops reading as pink at all. |
| arousal | stroke speed and nib thickness | Energy is a fast, broad mark. Legible twice over. |
| speaker_certainty | turn sharpness | A decisive speaker sweeps in long arcs; a hedging one wanders and jerks. Certainty is inverted into sharpness, so high certainty means a steady hand. |
| model_confidence | stroke lightness | An unsure read barely marks the page. Capped well below opaque at every confidence — a solid marker would hide the words it is supposed to be marking. |
| keyword weight | size and darkness on the page | Important words are larger and sit heavier in the paper. |
| cumulative arousal | paper crinkle depth | The only channel that records history rather than the present. |

Two things are set on a curve rather than linearly: valence is eased before it
crosses the hue ramp, and the nib deliberately *resists* the field. The field's
heading spans two full turns, so a marker that tracks it closely writhes like a
ribbon; resisting it is what makes a stroke read as a deliberate mark.

Marks fade slowly, and that is arithmetic rather than preference: two 24px nibs
travelling ~3px per frame lay down ~144 px² per frame, which covers a 1280×800
page in about two and a half minutes. Without a fade the page goes solid pink.

Two consequences worth pointing out in a demo. Because every parameter eases
toward its target at a fixed fraction per frame, the trails record recent
emotional history as a colour gradient — you can see where the conversation has
just been. And because the trail wash is what leaves those streaks, a sudden
sentiment change never snaps; it arrives as a wave through the existing field.

## Async behaviour and error handling

Errors are expressed in the aura itself, not as toasts.

- **Out-of-order responses.** Every `/process_text` call carries a monotonic
  sequence number, echoed back by the backend. A response whose seq is not
  strictly greater than the last applied one is dropped, so a slow reply can
  never overwrite a fresh one.
- **Slow or failing LLM.** 5s timeout with `max_retries=0` — the SDK retries
  timeouts by default, which would silently make the budget 15s. Any failure
  (timeout, network, HTTP error, refusal, malformed or out-of-range output,
  missing key) returns a neutral analysis with `model_confidence: 0.0`, so the
  field drifts toward washed-out neutral rather than freezing.
- **WebSocket disconnect.** Reconnects with exponential backoff (500ms
  doubling, capped at 8s, six attempts). While reconnecting the field
  desaturates and slows; on giving up it goes essentially greyscale.
- **Recording state.** A pulsing dot beside the Start/Stop button, plus the
  colour of the connection label.

Deepgram specifics: the backend call fires on `speech_final`, not `is_final`
(see deviations below); `KeepAlive` every 8s or the socket drops after ~10s of
silence; `CloseStream` on stop so the last utterance is flushed rather than lost.

## Deliberate deviations from the brief

| Brief says | This does | Why |
|---|---|---|
| §4.5 fire `/process_text` on `is_final: true` | fires on `speech_final` | `is_final` fires on every finalized interim chunk — many times per sentence — and would spam the LLM. `speech_final` marks an actual end of utterance. |
| §4.10 "React passes these new state variables as props to the visualization" | React state for the DOM UI, a `useRef` mirror for the sketch | Props captured in a p5 `draw()` closure go stale. Both are kept, so nothing in the brief's data flow is lost. |
| `react-p5` listed first | p5 instance mode inside `useEffect` | `react-p5` is effectively unmaintained. |
| `axios`, Web Audio API | `fetch`, `MediaRecorder` | Equivalent here, fewer dependencies. An AudioWorklet PCM pipeline wasn't worth the time. |
| OpenAI in §4.6–4.7 | Anthropic | §1 explicitly permits it. |

Two gaps in the brief are worth noting. §4.6–4.7 reference "the prompt (see
section 3)" and "a JSON (like in section 3)", but §3 contains neither — and says
prompt quality isn't assessed — so the schema above is this project's own
definition. And demo mode appears nowhere in the brief; it's an addition,
justified by the error-handling rubric line and by being the live-demo fallback.

## Known tradeoffs

- **The Deepgram JWT WebSocket subprotocol is inferred, not documented.**
  Browsers can't set WebSocket headers, so credentials ride
  `Sec-WebSocket-Protocol`. Deepgram documents the API-key form as
  `["token", KEY]` and documents the Bearer scheme for minted JWTs, but doesn't
  show the JWT subprotocol array literally. This code uses
  `["bearer", access_token]`. If the handshake fails with a valid token, switch
  to the exported `keySubprotocol` in `frontend/src/state/useTranscription.ts`
  and supply `VITE_DEEPGRAM_KEY` — that works, at the cost of exposing the key
  to the browser.
- **`ANTHROPIC_MODEL` defaults to `claude-opus-5`.** A real-time loop on a 5s
  budget may want something faster; it's a one-line env change, and
  `scripts/smoke_anthropic.py` prints per-call latency so the decision can be
  made from data.
- **The live audio path has not been executed.** No Deepgram or Anthropic key
  was available while building. Every other path is verified; these two are
  covered only at their fallback boundaries, which is why all their network code
  sits in the three isolated files named above.
- **No component-level React tests.** The state coordination between
  `useTranscription` and `App` was verified in a browser rather than with a
  testing library. Pure logic is unit-tested; rendering is not.
- **Reduced motion is implemented but not exercised.** `prefers-reduced-motion`
  zeroes the word, keyword and pill animations. The rule is in place; no
  environment was available to assert it with the preference actually set.

## Tests

```bash
cd backend && uv run pytest
```

29 tests: schema range validation and closure, and every analyzer fallback path
(timeout, connection error, refusal, malformed JSON, out-of-range values,
missing key, unexpected exception), plus the token endpoint's success, 503, 502
and key-leak cases.

```bash
cd frontend && npm test
```

92 tests: the sequence-number staleness gate, the sentiment→marker mapping at
its boundaries (including that no valence leaves the pink family), the noise
field's range, continuity and paper-vs-pen scale separation, the monotonic wear
invariant, shortest-angle wrapping and turn rates, keyword placement, sizing and
page cap, paper re-render throttling, transcript line identity across the
sliding window, the demo driver's output ranges, and the
`speech_final`-not-`is_final` submit rule with backoff growth.

There is also a standalone tuning page at `/tune.html` in dev, with sliders for
every paper, marker and colour parameter, plus sample words to judge the
highlighter-over-text balance. It imports the same modules the app uses, so
values dialled in there transfer directly. It is not part of the production
build.

The visualization itself is verified by eye — and, in automated checks, by
driving frames through p5's `redraw()` and measuring canvas luminance and
saturation, since browsers suspend `requestAnimationFrame` in hidden tabs.
