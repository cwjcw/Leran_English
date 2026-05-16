import httpx

from app.core.config import get_settings


class TTSService:
    def __init__(self) -> None:
        settings = get_settings()
        api_key = settings.tts_api_key or settings.siliconflow_api_key or settings.openai_api_key
        if not api_key:
            raise RuntimeError("TTS_API_KEY, SILICONFLOW_API_KEY, or OPENAI_API_KEY is not configured.")
        self.settings = settings
        self.api_key = api_key
        self.base_url = (settings.tts_base_url or "https://api.siliconflow.cn/v1").rstrip("/")

    async def synthesize(self, text: str) -> bytes:
        payload = {
            "model": self.settings.tts_model,
            "voice": self.settings.tts_voice,
            "input": text,
            "response_format": "mp3",
        }
        headers = {"Authorization": f"Bearer {self.api_key}"}
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(f"{self.base_url}/audio/speech", json=payload, headers=headers)
            response.raise_for_status()
            return response.content
