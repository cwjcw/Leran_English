from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.models import Child, ChildWordScore, PointTransaction, Reward, User, Word
from app.db.session import get_db
from app.schemas import (
    AwardPointsRequest,
    ChildRead,
    PointTransactionRead,
    RedeemRewardRequest,
    RewardCreate,
    RewardRead,
    WordScoreUpdate,
    WordbookItem,
)


router = APIRouter(tags=["points"])


def _get_owned_child(db: Session, user_id: int, child_id: int) -> Child:
    child = db.get(Child, child_id)
    if not child or child.user_id != user_id:
        raise HTTPException(status_code=404, detail="Child not found.")
    return child


@router.get("/children", response_model=list[ChildRead])
def list_children(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[Child]:
    return list(db.scalars(select(Child).where(Child.user_id == current_user.id).order_by(Child.id)).all())


@router.post("/points/award", response_model=PointTransactionRead)
def award_points(
    payload: AwardPointsRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PointTransaction:
    child = _get_owned_child(db, current_user.id, payload.child_id)
    child.points += payload.points
    tx = PointTransaction(
        user_id=current_user.id,
        child_id=child.id,
        task_type=payload.task_type,
        points=payload.points,
        description=payload.description,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


@router.get("/rewards", response_model=list[RewardRead])
def list_rewards(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[Reward]:
    return list(db.scalars(select(Reward).where(Reward.user_id == current_user.id).order_by(Reward.points_required)).all())


@router.post("/rewards", response_model=RewardRead, status_code=status.HTTP_201_CREATED)
def create_reward(
    payload: RewardCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Reward:
    reward = Reward(user_id=current_user.id, **payload.model_dump())
    db.add(reward)
    db.commit()
    db.refresh(reward)
    return reward


@router.delete("/rewards/{reward_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reward(
    reward_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    reward = db.get(Reward, reward_id)
    if not reward or reward.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Reward not found.")
    db.delete(reward)
    db.commit()


@router.post("/rewards/redeem", response_model=ChildRead)
def redeem_reward(
    payload: RedeemRewardRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Child:
    child = _get_owned_child(db, current_user.id, payload.child_id)
    reward = db.get(Reward, payload.reward_id)
    if not reward or reward.user_id != current_user.id or not reward.is_active:
        raise HTTPException(status_code=404, detail="Reward not found.")
    if child.points < reward.points_required:
        raise HTTPException(status_code=400, detail="Not enough points.")
    child.points -= reward.points_required
    db.add(
        PointTransaction(
            user_id=current_user.id,
            child_id=child.id,
            task_type="reward_redeem",
            points=-reward.points_required,
            description=f"Redeemed reward: {reward.name}",
        )
    )
    db.commit()
    db.refresh(child)
    return child


@router.post("/wordbook/score", response_model=WordbookItem)
def update_word_score(
    payload: WordScoreUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WordbookItem:
    child = _get_owned_child(db, current_user.id, payload.child_id)
    word = db.get(Word, payload.word_id)
    if not word:
        raise HTTPException(status_code=404, detail="Word not found.")

    score = db.scalar(
        select(ChildWordScore).where(
            ChildWordScore.child_id == child.id,
            ChildWordScore.word_id == word.id,
        )
    )
    if not score:
        score = ChildWordScore(user_id=current_user.id, child_id=child.id, word_id=word.id)
        db.add(score)

    score.spelling_score = max(score.spelling_score or 0, payload.spelling_score)
    score.pronunciation_score = max(score.pronunciation_score or 0, payload.pronunciation_score)
    score.total_score = min(1.0, score.spelling_score + score.pronunciation_score)
    score.attempts = (score.attempts or 0) + 1
    db.commit()
    db.refresh(score)
    return _wordbook_item(word, score)


@router.get("/wordbook/{child_id}", response_model=list[WordbookItem])
def get_wordbook(
    child_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[WordbookItem]:
    child = _get_owned_child(db, current_user.id, child_id)
    rows = db.execute(
        select(Word, ChildWordScore)
        .join(ChildWordScore, ChildWordScore.word_id == Word.id)
        .where(ChildWordScore.child_id == child.id)
        .order_by(Word.word)
    ).all()
    return [_wordbook_item(word, score) for word, score in rows]


def _wordbook_item(word: Word, score: ChildWordScore) -> WordbookItem:
    return WordbookItem(
        word_id=word.id,
        word=word.word,
        translation=word.translation,
        phonetic=word.phonetic,
        textbook=word.textbook,
        grade=word.grade,
        unit=word.unit,
        lesson=word.lesson,
        spelling_score=score.spelling_score,
        pronunciation_score=score.pronunciation_score,
        total_score=score.total_score,
        attempts=score.attempts,
    )
