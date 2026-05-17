from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import (
    generate_api_key,
    get_api_key_prefix,
    hash_api_key,
    hash_password,
    verify_password,
)
from app.db.models import Child, User, UserApiKey, UserProfile
from app.db.session import get_db
from app.schemas import AuthResponse, LoginRequest, RegisterRequest, UserRead


router = APIRouter(prefix="/auth", tags=["auth"])


def _issue_api_key(db: Session, user_id: int) -> str:
    plain_api_key = generate_api_key()
    db.add(
        UserApiKey(
            user_id=user_id,
            name="login",
            key_prefix=get_api_key_prefix(plain_api_key),
            key_hash=hash_api_key(plain_api_key),
        )
    )
    return plain_api_key


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> AuthResponse:
    if db.scalar(select(User).where(User.username == payload.username)):
        raise HTTPException(status_code=409, detail="Username already exists.")

    user = User(username=payload.username)
    db.add(user)
    db.flush()
    db.add(
        UserProfile(
            user_id=user.id,
            password_hash=hash_password(payload.password),
            email=payload.email,
            phone=payload.phone,
            city=payload.city,
            school=payload.school,
        )
    )
    children = [Child(user_id=user.id, name=child.name, birth_date=child.birth_date) for child in payload.children]
    db.add_all(children)
    api_key = _issue_api_key(db, user.id)
    db.commit()
    db.refresh(user)
    for child in children:
        db.refresh(child)
    return AuthResponse(api_key=api_key, user=UserRead.model_validate(user), children=children)


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> AuthResponse:
    user = db.scalar(select(User).where(User.username == payload.username))
    if not user or not user.profile or not verify_password(payload.password, user.profile.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password.")
    api_key = _issue_api_key(db, user.id)
    children = list(db.scalars(select(Child).where(Child.user_id == user.id).order_by(Child.id)).all())
    db.commit()
    return AuthResponse(api_key=api_key, user=UserRead.model_validate(user), children=children)
