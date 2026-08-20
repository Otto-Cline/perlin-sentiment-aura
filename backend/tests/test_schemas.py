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
    "field,value,expected",
    [
        ("valence", 1.5, 1.0),
        ("valence", -1.5, -1.0),
        ("arousal", -0.1, 0.0),
        ("arousal", 1.1, 1.0),
        ("speaker_certainty", 2.0, 1.0),
        ("model_confidence", -1.0, 0.0),
    ],
)
def test_out_of_range_scalars_are_clamped(field, value, expected):
    """Clamped, not rejected.

    Structured output cannot enforce numeric range — the API rejects
    minimum/maximum in the schema — so out-of-range values are possible.
    Discarding the whole reading would drop the aura to neutral for a full
    utterance, a visible glitch; clamping keeps it and still guarantees range.
    """
    payload = {
        "valence": 0.0,
        "arousal": 0.5,
        "speaker_certainty": 0.5,
        "model_confidence": 0.5,
        "keywords": [],
        "rationale": "",
    }
    payload[field] = value
    assert getattr(Analysis(**payload), field) == expected


@pytest.mark.parametrize("junk", ["not a number", None, [], {}])
def test_non_numeric_scalars_still_rejected(junk):
    """Clamping must not swallow genuinely malformed values."""
    payload = {
        "valence": junk,
        "arousal": 0.5,
        "speaker_certainty": 0.5,
        "model_confidence": 0.5,
        "keywords": [],
        "rationale": "",
    }
    with pytest.raises(ValidationError):
        Analysis(**payload)


def test_over_long_keyword_list_is_truncated():
    a = Analysis(
        valence=0.0,
        arousal=0.5,
        speaker_certainty=0.5,
        model_confidence=0.5,
        keywords=[{"text": f"w{i}", "weight": 0.5} for i in range(30)],
        rationale="",
    )
    assert len(a.keywords) == 8


def test_over_long_rationale_is_truncated():
    a = Analysis(
        valence=0.0,
        arousal=0.5,
        speaker_certainty=0.5,
        model_confidence=0.5,
        keywords=[],
        rationale="x" * 900,
    )
    assert len(a.rationale) == 240


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


def test_keyword_weight_out_of_range_is_clamped():
    a = Analysis(
        valence=0.0,
        arousal=0.5,
        speaker_certainty=0.5,
        model_confidence=0.5,
        keywords=[{"text": "x", "weight": 3.0}],
        rationale="",
    )
    assert a.keywords[0].weight == 1.0


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
