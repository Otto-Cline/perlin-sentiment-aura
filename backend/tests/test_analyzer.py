"""Covers every path that does not require a live API key.

The one thing these tests cannot prove is that a real Anthropic response parses.
That is what scripts/smoke_anthropic.py is for.
"""

import anthropic

from app import analyzer
from app.schemas import NEUTRAL, Analysis

VALID_JSON = (
    '{"valence": 0.4, "arousal": 0.6, "speaker_certainty": 0.7, '
    '"model_confidence": 0.8, "keywords": [{"text": "ship", "weight": 0.9}], '
    '"rationale": "Positive and energised."}'
)


class FakeBlock:
    def __init__(self, text: str):
        self.type = "text"
        self.text = text


class FakeResponse:
    def __init__(self, text: str = VALID_JSON, stop_reason: str = "end_turn"):
        self.content = [FakeBlock(text)]
        self.stop_reason = stop_reason


def patch_create(monkeypatch, result):
    """Replace the SDK call with a stub that returns or raises `result`."""

    async def fake_create(**kwargs):
        if isinstance(result, Exception):
            raise result
        return result

    class FakeMessages:
        create = staticmethod(fake_create)

    class FakeScoped:
        messages = FakeMessages()

    monkeypatch.setattr(analyzer._client, "with_options", lambda **kw: FakeScoped())


async def test_valid_response_is_parsed(monkeypatch):
    patch_create(monkeypatch, FakeResponse())
    result = await analyzer.analyze(["We are shipping tomorrow"])
    assert isinstance(result, Analysis)
    assert result.valence == 0.4
    assert result.keywords[0].text == "ship"


async def test_timeout_falls_back_to_neutral(monkeypatch):
    patch_create(monkeypatch, anthropic.APITimeoutError(request=None))
    assert await analyzer.analyze(["anything"]) == NEUTRAL


async def test_connection_error_falls_back_to_neutral(monkeypatch):
    patch_create(monkeypatch, anthropic.APIConnectionError(request=None))
    assert await analyzer.analyze(["anything"]) == NEUTRAL


async def test_refusal_falls_back_to_neutral(monkeypatch):
    patch_create(monkeypatch, FakeResponse(stop_reason="refusal"))
    assert await analyzer.analyze(["anything"]) == NEUTRAL


async def test_out_of_range_value_is_clamped_not_discarded(monkeypatch):
    """A slightly out-of-range number must not cost the whole reading."""
    patch_create(
        monkeypatch,
        FakeResponse(
            '{"valence": 4.0, "arousal": 0.5, "speaker_certainty": 0.5, '
            '"model_confidence": 0.5, "keywords": [], "rationale": ""}'
        ),
    )
    result = await analyzer.analyze(["anything"])
    assert result != NEUTRAL
    assert result.valence == 1.0


async def test_wrong_type_still_falls_back_to_neutral(monkeypatch):
    patch_create(
        monkeypatch,
        FakeResponse(
            '{"valence": "very good", "arousal": 0.5, "speaker_certainty": 0.5, '
            '"model_confidence": 0.5, "keywords": [], "rationale": ""}'
        ),
    )
    assert await analyzer.analyze(["anything"]) == NEUTRAL


async def test_malformed_json_falls_back_to_neutral(monkeypatch):
    patch_create(monkeypatch, FakeResponse("not json at all"))
    assert await analyzer.analyze(["anything"]) == NEUTRAL


async def test_response_without_text_block_falls_back_to_neutral(monkeypatch):
    empty = FakeResponse()
    empty.content = []
    patch_create(monkeypatch, empty)
    assert await analyzer.analyze(["anything"]) == NEUTRAL


async def test_missing_api_key_falls_back_to_neutral(monkeypatch):
    """An unset key raises TypeError from the SDK, not an APIError. A 500 here
    would be a worse demo failure than a neutral aura."""
    patch_create(
        monkeypatch,
        TypeError("Could not resolve authentication method."),
    )
    assert await analyzer.analyze(["anything"]) == NEUTRAL


async def test_unexpected_exception_falls_back_to_neutral(monkeypatch):
    patch_create(monkeypatch, RuntimeError("something entirely unexpected"))
    assert await analyzer.analyze(["anything"]) == NEUTRAL


async def test_rolling_window_is_sent_oldest_first(monkeypatch):
    """The prompt must preserve order — the newest utterance is what gets scored."""
    captured = {}

    async def fake_create(**kwargs):
        captured.update(kwargs)
        return FakeResponse()

    class FakeMessages:
        create = staticmethod(fake_create)

    class FakeScoped:
        messages = FakeMessages()

    monkeypatch.setattr(analyzer._client, "with_options", lambda **kw: FakeScoped())

    await analyzer.analyze(["first", "second", "third"])
    content = captured["messages"][0]["content"]
    assert content.index("first") < content.index("second") < content.index("third")


def test_schema_carries_no_validation_keywords():
    """Structured output rejects them, verified against the live API:
    "For 'number' type, properties maximum, minimum are not supported" and
    "For 'array' type, property 'maxItems' is not supported".
    """
    import json

    body = json.dumps(analyzer.ANALYSIS_JSON_SCHEMA)
    for banned in ("minimum", "maximum", "maxItems", "minItems"):
        assert banned not in body


def test_schema_is_closed_and_fully_required():
    """A closed schema is what lets us trust the shape without defensive parsing."""
    assert analyzer.ANALYSIS_JSON_SCHEMA["additionalProperties"] is False
    assert set(analyzer.ANALYSIS_JSON_SCHEMA["required"]) == {
        "valence",
        "arousal",
        "speaker_certainty",
        "model_confidence",
        "keywords",
        "rationale",
    }
