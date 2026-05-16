from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.models import RecitationSession, User, Word
from app.db.session import get_db
from app.schemas import StoryGenerateRequest, StoryGenerateResponse, StoryVerifyResponse
from app.services.ai_service import AIService
from app.services.speech_service import PronunciationAssessmentService, TranscriptionService
from app.core.config import get_settings


router = APIRouter(prefix="/story", tags=["story"])


def _get_words(db: Session, word_ids: list[int]) -> list[Word]:
    words = list(db.scalars(select(Word).where(Word.id.in_(word_ids))).all())
    if len(words) != len(set(word_ids)):
        raise HTTPException(status_code=404, detail="One or more words were not found.")
    return words


@router.post("/generate", response_model=StoryGenerateResponse)
async def generate_story(
    payload: StoryGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StoryGenerateResponse:
    if payload.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cannot create a story session for another user.")
    words = _get_words(db, payload.word_ids)
    standard_text = await AIService().generate_story(words)
    session = RecitationSession(user_id=payload.user_id, standard_text=standard_text)
    db.add(session)
    db.commit()
    db.refresh(session)
    return StoryGenerateResponse(session_id=session.id, standard_text=session.standard_text)


@router.post("/verify", response_model=StoryVerifyResponse)
async def verify_story(
    session_id: int,
    audio: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StoryVerifyResponse:
    session = db.get(RecitationSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Recitation session not found.")
    if session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cannot verify another user's recitation session.")

    settings = get_settings()
    if settings.azure_speech_key and settings.azure_speech_region:
        service = PronunciationAssessmentService()
        assessment_json = await service.assess_recitation(audio, session.standard_text)
        verified_index, words_status = service.summarize_alignment(assessment_json, session.standard_text)
    else:
        transcript = await TranscriptionService().transcribe_audio(audio)
        verified_index, words_status = PronunciationAssessmentService.summarize_transcription_alignment(
            transcript,
            session.standard_text,
        )
        assessment_json = {
            "provider": "transcription_fallback",
            "message": "Azure Speech is not configured. Used transcription-based alignment instead.",
            "transcript": transcript,
        }

    session.current_index = max(session.current_index, verified_index)
    session.is_completed = session.current_index >= len(words_status)
    db.commit()

    return StoryVerifyResponse(
        success=True,
        verified_index=session.current_index,
        words_status=words_status,
        raw_assessment=assessment_json,
    )
