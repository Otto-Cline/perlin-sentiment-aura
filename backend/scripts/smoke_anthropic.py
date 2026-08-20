"""Validate ANTHROPIC_API_KEY and the analyzer end to end.

Run once a key is available:  uv run python scripts/smoke_anthropic.py
"""

import asyncio
import os
import sys
import time

from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.analyzer import MODEL, analyze  # noqa: E402
from app.schemas import NEUTRAL  # noqa: E402

CASES = [
    "Honestly this is the best result we've had all quarter.",
    "I mean, maybe it works? I'm not really sure.",
    "The build is broken again and nobody knows why.",
    "Meeting's at four in the usual room.",
]


async def main() -> int:
    load_dotenv()
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY is not set — copy .env.example to .env first.")
        return 1

    print(f"model: {MODEL}\n")
    failures = 0

    for text in CASES:
        started = time.perf_counter()
        result = await analyze([text])
        elapsed = time.perf_counter() - started
        fell_back = result == NEUTRAL

        print(f"{text}\n  {elapsed:.2f}s  fallback={fell_back}")
        print(
            f"  valence={result.valence:+.2f} arousal={result.arousal:.2f} "
            f"certainty={result.speaker_certainty:.2f} "
            f"confidence={result.model_confidence:.2f}"
        )
        print(f"  keywords={[k.text for k in result.keywords]}\n")

        if fell_back:
            failures += 1

    if failures:
        print(f"{failures}/{len(CASES)} calls fell back to NEUTRAL.")
        print("If every call fell back, check the key. If only slow ones did,")
        print("raise LLM_TIMEOUT_SECONDS or set ANTHROPIC_MODEL to a faster model.")
        return 1

    print("All calls returned a parsed analysis.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
