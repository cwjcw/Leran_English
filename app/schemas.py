from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class UserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=64)


class UserRead(BaseModel):
    id: int
    username: str
    total_stars: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserCreateResponse(UserRead):
    api_key: str


class ApiKeyCreate(BaseModel):
    name: str = Field(default="default", min_length=1, max_length=80)


class ApiKeyCreated(BaseModel):
    id: int
    name: str
    key_prefix: str
    api_key: str
    created_at: datetime


class ApiKeyRead(BaseModel):
    id: int
    name: str
    key_prefix: str
    created_at: datetime
    last_used_at: datetime | None
    revoked_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class WordBase(BaseModel):
    word: str = Field(min_length=1, max_length=80)
    translation: str = Field(default="", max_length=120)
    phonetic: str | None = Field(default=None, max_length=120)
    dynamic_tags: str | None = Field(default=None, max_length=255)


class WordCreate(WordBase):
    pass


class WordUpdate(BaseModel):
    word: str | None = Field(default=None, min_length=1, max_length=80)
    translation: str | None = Field(default=None, max_length=120)
    phonetic: str | None = Field(default=None, max_length=120)
    dynamic_tags: str | None = Field(default=None, max_length=255)


class WordRead(WordBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class BulkWordImport(BaseModel):
    words: list[WordCreate]


class ScenarioGenerateRequest(BaseModel):
    word_ids: list[int] = Field(min_length=1)


class ScenarioGenerateResponse(BaseModel):
    scenario_description: str
    ai_role: str
    child_role: str
    first_question: str


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ScenarioChatResponse(BaseModel):
    transcript: str
    ai_reply: str


class StoryGenerateRequest(BaseModel):
    user_id: int
    word_ids: list[int] = Field(min_length=1)


class StoryGenerateResponse(BaseModel):
    session_id: int
    standard_text: str


class WordStatus(BaseModel):
    word: str
    error_type: str


class StoryVerifyResponse(BaseModel):
    success: bool
    verified_index: int
    words_status: list[WordStatus]
    raw_assessment: dict[str, Any] | None = None


class SpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class TranscriptionResponse(BaseModel):
    transcript: str
