from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response

from app.api.deps import get_current_user
from app.db.models import User
from app.schemas import SpeechRequest, TranscriptionResponse
from app.services.tts_service import TTSService
from app.services.speech_service import TranscriptionService


router = APIRouter(prefix="/audio", tags=["audio"])


@router.post("/speech")
async def create_speech(
    payload: SpeechRequest,
    current_user: User = Depends(get_current_user),
) -> Response:
    try:
        audio = await TTSService().synthesize(payload.text)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Text-to-speech failed: {exc}") from exc
    return Response(content=audio, media_type="audio/mpeg")


@router.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(
    audio: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
) -> TranscriptionResponse:
    transcript = await TranscriptionService().transcribe_audio(audio)
    return TranscriptionResponse(transcript=transcript)
