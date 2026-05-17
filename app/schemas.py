from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


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


class ChildCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    birth_date: date


class ChildRead(BaseModel):
    id: int
    name: str
    birth_date: date
    points: int

    model_config = ConfigDict(from_attributes=True)


class RegisterRequest(BaseModel):
    username: str = Field(min_length=5, max_length=10, pattern=r"^[A-Za-z][A-Za-z0-9]{4,9}$")
    password: str = Field(min_length=6, max_length=80)
    email: str = Field(min_length=3, max_length=180)
    children: list[ChildCreate] = Field(min_length=1)
    phone: str | None = Field(default=None, max_length=40)
    city: str | None = Field(default=None, max_length=80)
    school: str | None = Field(default=None, max_length=120)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        if "@" not in value or "." not in value:
            raise ValueError("Invalid email address.")
        return value


class LoginRequest(BaseModel):
    username: str = Field(min_length=5, max_length=10)
    password: str = Field(min_length=1, max_length=80)


class AuthResponse(BaseModel):
    api_key: str
    user: UserRead
    children: list[ChildRead]


class ProfileRead(BaseModel):
    user: UserRead
    email: str
    phone: str | None
    city: str | None
    school: str | None
    children: list[ChildRead]


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
    textbook: str | None = Field(default=None, max_length=120)
    grade: str | None = Field(default=None, max_length=40)
    unit: str | None = Field(default=None, max_length=80)
    lesson: str | None = Field(default=None, max_length=80)


class WordCreate(WordBase):
    pass


class WordUpdate(BaseModel):
    word: str | None = Field(default=None, min_length=1, max_length=80)
    translation: str | None = Field(default=None, max_length=120)
    phonetic: str | None = Field(default=None, max_length=120)
    dynamic_tags: str | None = Field(default=None, max_length=255)
    textbook: str | None = Field(default=None, max_length=120)
    grade: str | None = Field(default=None, max_length=40)
    unit: str | None = Field(default=None, max_length=80)
    lesson: str | None = Field(default=None, max_length=80)


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


class AwardPointsRequest(BaseModel):
    child_id: int
    task_type: str = Field(min_length=1, max_length=40)
    points: int = Field(default=10, ge=1, le=1000)
    description: str | None = Field(default=None, max_length=255)


class PointTransactionRead(BaseModel):
    id: int
    child_id: int
    task_type: str
    points: int
    description: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RewardCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    points_required: int = Field(ge=1, le=100000)
    description: str | None = Field(default=None, max_length=255)
    image_url: str | None = Field(default=None, max_length=500)


class RewardRead(BaseModel):
    id: int
    name: str
    points_required: int
    description: str | None
    image_url: str | None
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class RedeemRewardRequest(BaseModel):
    child_id: int
    reward_id: int


class WordScoreUpdate(BaseModel):
    child_id: int
    word_id: int
    spelling_score: float = Field(default=0, ge=0, le=0.5)
    pronunciation_score: float = Field(default=0, ge=0, le=0.5)


class WordbookItem(BaseModel):
    word_id: int
    word: str
    translation: str
    phonetic: str | None
    textbook: str | None
    grade: str | None
    unit: str | None
    lesson: str | None
    spelling_score: float
    pronunciation_score: float
    total_score: float
    attempts: int
