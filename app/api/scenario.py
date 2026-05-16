import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.models import Word
from app.db.models import User
from app.db.session import get_db
from app.schemas import ScenarioChatResponse, ScenarioGenerateRequest, ScenarioGenerateResponse
from app.services.ai_service import AIService
from app.services.speech_service import TranscriptionService


router = APIRouter(prefix="/scenario", tags=["scenario"])


def _get_words(db: Session, word_ids: list[int]) -> list[Word]:
    words = list(db.scalars(select(Word).where(Word.id.in_(word_ids))).all())
    if len(words) != len(set(word_ids)):
        raise HTTPException(status_code=404, detail="One or more words were not found.")
    return words


@router.post("/generate", response_model=ScenarioGenerateResponse)
async def generate_scenario(
    payload: ScenarioGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    words = _get_words(db, payload.word_ids)
    return await AIService().generate_scenario(words)


@router.post("/chat", response_model=ScenarioChatResponse)
async def chat_with_scenario(
    audio: UploadFile = File(...),
    history_json: str = Form(default="[]"),
    ai_role: str | None = Form(default=None),
    child_role: str | None = Form(default=None),
    core_words_json: str = Form(default="[]"),
    current_user: User = Depends(get_current_user),
) -> ScenarioChatResponse:
    try:
        history = json.loads(history_json)
        core_words = json.loads(core_words_json)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail="history_json or core_words_json is invalid JSON.") from exc

    transcript = await TranscriptionService().transcribe_audio(audio)
    ai_reply = await AIService().continue_scenario_chat(
        transcript=transcript,
        history=history,
        ai_role=ai_role,
        child_role=child_role,
        core_words=core_words,
    )
    return ScenarioChatResponse(transcript=transcript, ai_reply=ai_reply)
