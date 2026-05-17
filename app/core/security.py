import hashlib
import hmac
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


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000).hex()
    return f"pbkdf2_sha256${salt}${digest}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algorithm, salt, expected = password_hash.split("$", 2)
    except ValueError:
        return False
    if algorithm != "pbkdf2_sha256":
        return False
    actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000).hex()
    return hmac.compare_digest(actual, expected)
