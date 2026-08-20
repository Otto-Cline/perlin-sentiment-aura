"""The only module that talks to Anthropic.

Every failure mode — timeout, network error, HTTP error, refusal, malformed or
out-of-range output — returns NEUTRAL rather than raising, so the frontend
drifts toward a washed-out neutral field instead of freezing on stale values.
"""

import logging
import os

import anthropic
from anthropic import AsyncAnthropic
from pydantic import ValidationError

from .schemas import NEUTRAL, Analysis

log = logging.getLogger(__name__)

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
    ) as exc:
        log.warning("LLM call failed (%s), returning neutral", type(exc).__name__)
        return NEUTRAL
    except Exception as exc:
        # Deliberate catch-all so this function's "never raises" contract holds.
        # An unset or unresolvable API key raises TypeError from the SDK, not an
        # APIError, and a 500 here would be a worse demo failure than a neutral
        # aura. Logged at error level because this branch means misconfiguration.
        log.error("LLM call raised %s: %s", type(exc).__name__, exc)
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
