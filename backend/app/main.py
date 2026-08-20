"""FastAPI proxy: receives text, gets it scored, returns validated JSON."""

import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from .analyzer import analyze  # noqa: E402  (must follow load_dotenv)
from .deepgram_token import router as deepgram_router  # noqa: E402
from .schemas import ProcessTextRequest, ProcessTextResponse  # noqa: E402

app = FastAPI(title="Sentiment Aura")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(deepgram_router)


@app.get("/health")
async def health() -> dict[str, object]:
    # The configured flags make "why is the aura always neutral?" a one-request
    # question instead of a log hunt.
    return {
        "status": "ok",
        "llm_configured": bool(os.environ.get("ANTHROPIC_API_KEY")),
        "transcription_configured": bool(os.environ.get("DEEPGRAM_API_KEY")),
    }


@app.post("/process_text", response_model=ProcessTextResponse)
async def process_text(req: ProcessTextRequest) -> ProcessTextResponse:
    analysis = await analyze(req.utterances)
    return ProcessTextResponse(seq=req.seq, analysis=analysis)
