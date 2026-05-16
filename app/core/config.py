from functools import lru_cache
from typing import Literal, Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables or .env."""

    app_name: str = "Grade 4 English Speaking API"
    api_prefix: str = "/api"

    database_url: str = Field(
        default="sqlite:///./english_learning.db",
        description="Use postgresql+psycopg://user:password@host:5432/dbname for PostgreSQL.",
    )

    llm_provider: Literal["deepseek", "siliconflow", "qwen", "openrouter"] = "deepseek"

    deepseek_api_key: Optional[str] = None
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-chat"

    siliconflow_api_key: Optional[str] = None
    siliconflow_base_url: str = "https://api.siliconflow.cn/v1"
    siliconflow_model: str = "deepseek-ai/DeepSeek-V3"

    qwen_api_key: Optional[str] = None
    qwen_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    qwen_model: str = "qwen-plus"

    openrouter_api_key: Optional[str] = None
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_model: str = "openrouter/auto"

    openai_api_key: Optional[str] = None
    whisper_model: str = "whisper-1"

    # Optional OpenAI-compatible transcription endpoint, e.g. SiliconFlow.
    transcription_base_url: Optional[str] = "https://api.siliconflow.cn/v1"
    transcription_api_key: Optional[str] = None
    transcription_model: str = "FunAudioLLM/SenseVoiceSmall"

    tts_base_url: Optional[str] = "https://api.siliconflow.cn/v1"
    tts_api_key: Optional[str] = None
    tts_model: str = "FunAudioLLM/CosyVoice2-0.5B"
    tts_voice: str = "FunAudioLLM/CosyVoice2-0.5B:alex"

    azure_speech_key: Optional[str] = None
    azure_speech_region: Optional[str] = None
    azure_speech_language: str = "en-US"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
