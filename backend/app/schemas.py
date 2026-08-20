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
