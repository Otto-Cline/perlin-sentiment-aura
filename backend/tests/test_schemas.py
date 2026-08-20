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
