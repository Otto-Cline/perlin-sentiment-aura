# Sentiment Aura

A live speech Perlin field visualization in which your words animate a highlighter on a page.
As you speak, the highlighter draws lines on a paper corresponding to sentiment. Over time, the paper
will crinkle if the highlighter is used heavy-handedly (corresponding to a more urgent sentiment).

[![Watch the demo](https://youtu.be/PJVE0zh8Gzs)]

**Two modes**, chosen bottom-left. **Live mic** is the real thing. **Demo** plays
a scripted six-line conversation with no microphone and no network.

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


`valence` is pleasantness. `arousal` is energy, independent of valence; calm
contentment is high valence, low arousal. `model_confidence` is the model's
certainty in its own read: sarcasm, filler and one-word utterances score low.

## Sentiment to visualization

Note: I explicitly took a risk in that I didn't involve color changes as part of this visualization as to make the highlighting feel realistic.

| signal | what it drives | why |
|---|---|---|
| valence | turn sharpness | pleasant sweeps in long calm arcs; unpleasant turns sharply and jerks |
| arousal | speed and nib width | energy is a fast, broad mark |
| model_confidence | opacity | an unsure read barely marks the page |
| keyword weight | size and darkness | important words are larger and sit heavier |
| *cumulative* arousal | paper crinkle depth | the only channel that records history rather than the present |

## The Perlin field

`field()` in `frontend/src/aura/field.ts` is the only source of noise in the app.

**The marker reads that landscape as direction.** Each frame it asks "which way
at my position?" and steps, so its path is a single flow line through the field.
The usual way to show a flow field is hundreds of thin particles; this is one
thick pen instead.

**The paper reads the same landscape as height.** For every pixel it compares
neighbouring values to get the slope, then shades it as if lit from the upper
left. So the grain / crinkliness you can see is the field itself.

The only difference is scale: the marker samples it at `0.00375` per pixel and
the paper at `0.0495`, about 13× finer.

The marker also deliberately *resists* the field. Tracking it exactly makes the
stroke writhe like a ribbon; resisting it is what makes a mark read as deliberate.

Layers go paper → words → marker, composited with `multiply` so the words read
through the ink. Because `multiply(pink, black)` is black, the marker alone had no
effect on the words it crossed, so the words render to their own layer and the
marker knocks their opacity down where it passes.

## Error handling

- **Out-of-order responses.** Every request carries a monotonic sequence number
  the backend echoes back. Anything not strictly newer is dropped, so a slow reply
  can never overwrite a fresh one.
- **Slow or failing LLM.** 8s timeout with `max_retries=0` — SDK retries timeouts by default. Any failure returns a neutral
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
| `axios`, Web Audio API | `fetch`, `MediaRecorder` | equivalent here, fewer deps |

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

## Tests

```bash
cd backend && uv run pytest     # 37
cd frontend && npm test         # 124
```


