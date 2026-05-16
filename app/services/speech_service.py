import json
import re
import tempfile
from pathlib import Path

import azure.cognitiveservices.speech as speechsdk
from fastapi import UploadFile
from openai import AsyncOpenAI

from app.core.config import get_settings


class TranscriptionService:
    def __init__(self) -> None:
        settings = get_settings()
        api_key = settings.transcription_api_key or settings.siliconflow_api_key or settings.openai_api_key
        if not api_key:
            raise RuntimeError("TRANSCRIPTION_API_KEY, SILICONFLOW_API_KEY, or OPENAI_API_KEY is not configured.")
        self.settings = settings
        base_url = settings.transcription_base_url
        if not base_url and api_key == settings.siliconflow_api_key:
            base_url = settings.siliconflow_base_url
        self.client = AsyncOpenAI(api_key=api_key, base_url=base_url)

    async def transcribe_audio(self, audio: UploadFile) -> str:
        suffix = Path(audio.filename or "audio.webm").suffix or ".webm"
        content = await audio.read()
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(content)
            tmp_path = Path(tmp.name)

        try:
            with tmp_path.open("rb") as audio_file:
                result = await self.client.audio.transcriptions.create(
                    model=self.settings.transcription_model,
                    file=audio_file,
                    language="en",
                )
            return result.text.strip()
        finally:
            tmp_path.unlink(missing_ok=True)


class PronunciationAssessmentService:
    def __init__(self) -> None:
        settings = get_settings()
        if not settings.azure_speech_key or not settings.azure_speech_region:
            raise RuntimeError("AZURE_SPEECH_KEY and AZURE_SPEECH_REGION are not configured.")
        self.settings = settings

    async def assess_recitation(self, audio: UploadFile, reference_text: str) -> dict:
        suffix = Path(audio.filename or "recitation.wav").suffix or ".wav"
        content = await audio.read()
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(content)
            tmp_path = Path(tmp.name)

        try:
            speech_config = speechsdk.SpeechConfig(
                subscription=self.settings.azure_speech_key,
                region=self.settings.azure_speech_region,
            )
            speech_config.speech_recognition_language = self.settings.azure_speech_language

            audio_config = speechsdk.AudioConfig(filename=str(tmp_path))
            assessment_config = speechsdk.PronunciationAssessmentConfig(
                reference_text=reference_text,
                grading_system=speechsdk.PronunciationAssessmentGradingSystem.HundredMark,
                granularity=speechsdk.PronunciationAssessmentGranularity.Word,
                enable_miscue=True,
            )
            assessment_config.enable_prosody_assessment()
            recognizer = speechsdk.SpeechRecognizer(speech_config=speech_config, audio_config=audio_config)
            assessment_config.apply_to(recognizer)
            result = recognizer.recognize_once_async().get()

            if result.reason != speechsdk.ResultReason.RecognizedSpeech:
                return {"NBest": [{"Words": []}], "RecognitionStatus": str(result.reason)}

            raw_json = result.properties.get(speechsdk.PropertyId.SpeechServiceResponse_JsonResult)
            return json.loads(raw_json)
        finally:
            tmp_path.unlink(missing_ok=True)

    @staticmethod
    def summarize_alignment(assessment_json: dict, reference_text: str) -> tuple[int, list[dict[str, str]]]:
        reference_words = re.findall(r"[A-Za-z']+", reference_text)
        azure_words = assessment_json.get("NBest", [{}])[0].get("Words", [])

        words_status: list[dict[str, str]] = []
        latest_correct_index = 0

        for index, ref_word in enumerate(reference_words, start=1):
            azure_word = azure_words[index - 1] if index - 1 < len(azure_words) else {}
            error_type = azure_word.get("PronunciationAssessment", {}).get("ErrorType", "Omission")
            recognized = azure_word.get("Word", ref_word)
            words_status.append({"word": recognized or ref_word, "error_type": error_type})
            if error_type == "None":
                latest_correct_index = index
            elif latest_correct_index < index:
                break

        if len(words_status) < len(reference_words):
            for ref_word in reference_words[len(words_status) :]:
                words_status.append({"word": ref_word, "error_type": "Omission"})

        return latest_correct_index, words_status

    @staticmethod
    def summarize_transcription_alignment(transcript: str, reference_text: str) -> tuple[int, list[dict[str, str]]]:
        reference_words = re.findall(r"[A-Za-z']+", reference_text)
        spoken_words = [word.lower() for word in re.findall(r"[A-Za-z']+", transcript)]

        words_status: list[dict[str, str]] = []
        latest_correct_index = 0

        for index, ref_word in enumerate(reference_words, start=1):
            spoken_word = spoken_words[index - 1] if index - 1 < len(spoken_words) else None
            if spoken_word is None:
                error_type = "Omission"
            elif spoken_word == ref_word.lower():
                error_type = "None"
                if latest_correct_index == index - 1:
                    latest_correct_index = index
            else:
                error_type = "Mispronunciation"

            words_status.append({"word": ref_word, "error_type": error_type})

        return latest_correct_index, words_status
