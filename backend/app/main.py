"""FastAPI proxy. Task 1 returns a hardcoded analysis; Task 6 swaps in the LLM."""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .schemas import Analysis, ProcessTextRequest, ProcessTextResponse

app = FastAPI(title="Sentiment Aura")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Step 1 stand-in. Deliberately not neutral, so the frontend wiring in Task 2
# visibly moves off its defaults.
HARDCODED = Analysis(
    valence=0.62,
    arousal=0.55,
    speaker_certainty=0.78,
    model_confidence=0.85,
    keywords=[
        {"text": "prototype", "weight": 0.9},
        {"text": "shipping", "weight": 0.6},
        {"text": "tomorrow", "weight": 0.4},
    ],
    rationale="Hardcoded sample analysis.",
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/process_text", response_model=ProcessTextResponse)
async def process_text(req: ProcessTextRequest) -> ProcessTextResponse:
    return ProcessTextResponse(seq=req.seq, analysis=HARDCODED)
