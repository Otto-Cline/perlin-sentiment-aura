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

MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5")

# Total wall-clock budget. max_retries=0 below is load-bearing: the SDK retries
# timeouts by default, which would turn this into a 24s budget.
#
# Measured on this prompt, four utterances each:
#   claude-opus-5    median 4.67s, max 5.88s  — exceeds a 5s budget
#   claude-sonnet-5  median 3.08s, max 3.20s
#   claude-haiku-4-5 median 2.15s, max 6.73s  — fast but with outliers
# Hence sonnet by default and 8s of headroom: a timeout costs a whole utterance,
# and the aura visibly drops to neutral when it happens.
LLM_TIMEOUT_SECONDS = 8.0

# Models that accept output_config.effort. Haiku 4.5 rejects it outright with
# "This model does not support the effort parameter" (400), so switching
# ANTHROPIC_MODEL to it used to break every call. Unknown models omit effort,
# which is always valid.
EFFORT_CAPABLE = {
    "claude-fable-5",
    "claude-opus-5",
    "claude-opus-4-8",
    "claude-opus-4-7",
    "claude-opus-4-6",
    "claude-sonnet-5",
    "claude-sonnet-4-6",
}

# Hand-written rather than generated from the Pydantic model: model_json_schema()
# emits $defs/$ref for the nested Keyword, and a flat inline schema is the shape
# the API accepts. schemas.Analysis remains the validator.
#
# Structured output constrains SHAPE ONLY. It rejects JSON Schema validation
# keywords, verified against the live API:
#   "For 'number' type, properties maximum, minimum are not supported"
#   "For 'array' type, property 'maxItems' is not supported"
# So no minimum/maximum/maxItems here. Ranges are stated in the system prompt and
# enforced by schemas.Analysis, which clamps on ingest.
ANALYSIS_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "valence": {"type": "number"},
        "arousal": {"type": "number"},
        "speaker_certainty": {"type": "number"},
        "model_confidence": {"type": "number"},
        "keywords": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "weight": {"type": "number"},
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
keywords: at most 4 SINGLE words, each appearing verbatim in the utterance, \
weighted by how much it carries the meaning. One word per entry — never a \
phrase, never two words joined. Skip function words.
rationale: one short sentence.

This is speech, so expect disfluency and fragments. Do not inflate \
model_confidence on thin input."""


_client = AsyncAnthropic()


def _output_config() -> dict:
    """Structured output, plus low effort where the model accepts it.

    effort=low keeps adaptive thinking from spending the whole latency budget on
    what is a short classification task.
    """
    config: dict = {
        "format": {"type": "json_schema", "schema": ANALYSIS_JSON_SCHEMA}
    }
    if MODEL in EFFORT_CAPABLE:
        config["effort"] = "low"
    return config


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
            output_config=_output_config(),
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
