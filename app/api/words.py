from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.models import User
from app.db.models import Word
from app.db.session import get_db
from app.schemas import BulkWordImport, WordCreate, WordRead, WordUpdate
from app.services.ai_service import AIService


router = APIRouter(prefix="/words", tags=["words"])


@router.get("", response_model=list[WordRead])
def list_words(
    tag: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Word]:
    stmt = select(Word).order_by(Word.id)
    if tag:
        stmt = stmt.where(Word.dynamic_tags.like(f"%{tag}%"))
    return list(db.scalars(stmt).all())


@router.post("", response_model=WordRead, status_code=status.HTTP_201_CREATED)
def create_word(
    payload: WordCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Word:
    word = Word(**payload.model_dump())
    db.add(word)
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Word already exists or payload is invalid.") from exc
    db.refresh(word)
    return word


@router.post("/bulk", response_model=list[WordRead], status_code=status.HTTP_201_CREATED)
async def bulk_import_words(
    payload: BulkWordImport,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Word]:
    created: list[Word] = []
    items = [item.model_copy() for item in payload.words]
    missing_translation = [item.word for item in items if not item.translation]
    if missing_translation:
        try:
            enriched = await AIService().enrich_words(missing_translation)
            for item in items:
                data = enriched.get(item.word.lower())
                if data:
                    if not data.get("is_valid", True):
                        reason = data.get("reason") or "不是有效英文单词。"
                        raise HTTPException(status_code=422, detail=f"{item.word}: {reason}")
                    item.translation = data.get("translation", item.translation)
                    item.phonetic = item.phonetic or data.get("phonetic")
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Unable to validate words: {exc}") from exc

    for item in items:
        existing = db.scalar(select(Word).where(Word.word == item.word))
        if existing:
            for key, value in item.model_dump().items():
                setattr(existing, key, value)
            created.append(existing)
        else:
            word = Word(**item.model_dump())
            db.add(word)
            created.append(word)
    db.commit()
    for word in created:
        db.refresh(word)
    return created


@router.get("/{word_id}", response_model=WordRead)
def get_word(
    word_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Word:
    word = db.get(Word, word_id)
    if not word:
        raise HTTPException(status_code=404, detail="Word not found.")
    return word


@router.patch("/{word_id}", response_model=WordRead)
def update_word(
    word_id: int,
    payload: WordUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Word:
    word = db.get(Word, word_id)
    if not word:
        raise HTTPException(status_code=404, detail="Word not found.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(word, key, value)
    db.commit()
    db.refresh(word)
    return word


@router.delete("/{word_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_word(
    word_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    word = db.get(Word, word_id)
    if not word:
        raise HTTPException(status_code=404, detail="Word not found.")
    db.delete(word)
    db.commit()
