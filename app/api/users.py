from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.security import generate_api_key, get_api_key_prefix, hash_api_key
from app.db.models import User, UserApiKey
from app.db.session import get_db
from app.schemas import ApiKeyCreate, ApiKeyCreated, ApiKeyRead, UserCreate, UserCreateResponse, UserRead


router = APIRouter(prefix="/users", tags=["users"])


@router.post("", response_model=UserCreateResponse, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, db: Session = Depends(get_db)) -> UserCreateResponse:
    plain_api_key = generate_api_key()
    user = User(username=payload.username)
    db.add(user)
    try:
        db.flush()
        db.add(
            UserApiKey(
                user_id=user.id,
                name="default",
                key_prefix=get_api_key_prefix(plain_api_key),
                key_hash=hash_api_key(plain_api_key),
            )
        )
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Username already exists.") from exc
    db.refresh(user)
    return UserCreateResponse(
        id=user.id,
        username=user.username,
        total_stars=user.total_stars,
        created_at=user.created_at,
        api_key=plain_api_key,
    )


@router.get("/me", response_model=UserRead)
def read_current_user(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.get("/me/api-keys", response_model=list[ApiKeyRead])
def list_my_api_keys(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[UserApiKey]:
    return list(
        db.scalars(
            select(UserApiKey)
            .where(UserApiKey.user_id == current_user.id)
            .order_by(UserApiKey.created_at.desc())
        ).all()
    )


@router.post("/me/api-keys", response_model=ApiKeyCreated, status_code=status.HTTP_201_CREATED)
def create_my_api_key(
    payload: ApiKeyCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ApiKeyCreated:
    plain_api_key = generate_api_key()
    api_key_record = UserApiKey(
        user_id=current_user.id,
        name=payload.name,
        key_prefix=get_api_key_prefix(plain_api_key),
        key_hash=hash_api_key(plain_api_key),
    )
    db.add(api_key_record)
    db.commit()
    db.refresh(api_key_record)
    return ApiKeyCreated(
        id=api_key_record.id,
        name=api_key_record.name,
        key_prefix=api_key_record.key_prefix,
        api_key=plain_api_key,
        created_at=api_key_record.created_at,
    )


@router.delete("/me/api-keys/{api_key_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_my_api_key(
    api_key_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    api_key_record = db.get(UserApiKey, api_key_id)
    if not api_key_record or api_key_record.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="API key not found.")
    if api_key_record.revoked_at is None:
        api_key_record.revoked_at = datetime.utcnow()
        db.commit()
