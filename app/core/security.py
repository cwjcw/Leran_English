import hashlib
import secrets
from datetime import datetime

from app.db.models import UserApiKey


API_KEY_PREFIX = "le"
API_KEY_RANDOM_BYTES = 32


def generate_api_key() -> str:
    token = secrets.token_urlsafe(API_KEY_RANDOM_BYTES)
    return f"{API_KEY_PREFIX}_{token}"


def hash_api_key(api_key: str) -> str:
    return hashlib.sha256(api_key.encode("utf-8")).hexdigest()


def get_api_key_prefix(api_key: str) -> str:
    return api_key[:12]


def is_api_key_active(api_key_record: UserApiKey) -> bool:
    return api_key_record.revoked_at is None


def mark_api_key_used(api_key_record: UserApiKey) -> None:
    api_key_record.last_used_at = datetime.utcnow()
