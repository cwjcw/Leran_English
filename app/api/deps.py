from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_api_key, is_api_key_active, mark_api_key_used
from app.db.models import User, UserApiKey
from app.db.session import get_db


def get_current_user(
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    db: Session = Depends(get_db),
) -> User:
    if not x_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-API-Key header.",
        )

    key_hash = hash_api_key(x_api_key)
    api_key_record = db.scalar(select(UserApiKey).where(UserApiKey.key_hash == key_hash))
    if not api_key_record or not is_api_key_active(api_key_record):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked API key.",
        )

    user = db.get(User, api_key_record.user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key user no longer exists.",
        )

    mark_api_key_used(api_key_record)
    db.commit()
    return user
