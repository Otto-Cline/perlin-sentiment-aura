"""Wire contract between the LLM, the backend, and the frontend.

Every value that reaches the visualization passes through these models, so the
range constraints here are the only guarantee the renderer needs.

Numeric fields CLAMP rather than reject. Structured output constrains shape but
not range — the API rejects `minimum`/`maximum` in the schema — so out-of-range
numbers are possible in principle. Discarding a whole reading because the model
returned 1.02 would drop the aura to neutral for a full utterance, a visible
glitch mid-demo; clamping keeps the reading and still guarantees the range.
Malformed shapes, wrong types and unknown fields are still rejected outright.
"""

from typing import Annotated, Any

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field


def _clamp(lo: float, hi: float):
    def clamp(value: Any) -> Any:
        # Anything non-numeric is passed through untouched so the field's own
        # type validation still rejects it.
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return value
        return min(hi, max(lo, float(value)))

    return clamp


Unit = Annotated[float, BeforeValidator(_clamp(0.0, 1.0))]
Signed = Annotated[float, BeforeValidator(_clamp(-1.0, 1.0))]

MAX_KEYWORDS = 8
MAX_RATIONALE = 240


def _truncate_list(value: Any) -> Any:
    """Keep the first few keywords instead of rejecting an over-long list."""
    if isinstance(value, list) and len(value) > MAX_KEYWORDS:
        return value[:MAX_KEYWORDS]
    return value


def _truncate_text(value: Any) -> Any:
    """Trim an over-long rationale instead of rejecting the whole reading."""
    if isinstance(value, str) and len(value) > MAX_RATIONALE:
        return value[:MAX_RATIONALE]
    return value


class Keyword(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=40)
    weight: Unit = Field(ge=0.0, le=1.0)


class Analysis(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # ge/le are belt and braces: the clamp above means they never trip, but they
    # document the contract and would catch a broken clamp.
    valence: Signed = Field(ge=-1.0, le=1.0)
    arousal: Unit = Field(ge=0.0, le=1.0)
    speaker_certainty: Unit = Field(ge=0.0, le=1.0)
    model_confidence: Unit = Field(ge=0.0, le=1.0)
    keywords: Annotated[
        list[Keyword], BeforeValidator(_truncate_list)
    ] = Field(default_factory=list, max_length=MAX_KEYWORDS)
    rationale: Annotated[str, BeforeValidator(_truncate_text)] = Field(
        default="", max_length=MAX_RATIONALE
    )


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
