import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.redis import get_redis
from models import Pin, SavedPin, Subscription, User
from modules.auth.deps import get_current_user
from .schemas import FollowingOut

router = APIRouter()


@router.get("", response_model=list[FollowingOut])
async def list_following(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[FollowingOut]:
    result = await db.execute(
        select(Subscription.influencer_id).where(Subscription.user_id == current_user.id)
    )
    return [FollowingOut(influencer_id=row[0]) for row in result]


@router.post("/{influencer_id}", status_code=201)
async def follow(
    influencer_id: uuid.UUID,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    if influencer_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot follow yourself")
    existing = await db.execute(
        select(Subscription).where(
            Subscription.user_id == current_user.id,
            Subscription.influencer_id == influencer_id,
        )
    )
    if existing.scalar_one_or_none():
        response.status_code = 200
        return
    sub = Subscription(user_id=current_user.id, influencer_id=influencer_id)
    db.add(sub)
    await db.commit()
    redis = await get_redis()
    await redis.delete(f"feed_pins:{current_user.id}")


@router.delete("/{influencer_id}", status_code=204)
async def unfollow(
    influencer_id: uuid.UUID,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    result = await db.execute(
        select(Subscription).where(
            Subscription.user_id == current_user.id,
            Subscription.influencer_id == influencer_id,
        )
    )
    sub = result.scalar_one_or_none()
    if sub is None:
        response.status_code = 200
        return
    await db.delete(sub)

    # Remove saved pins that belong to this influencer
    pins_result = await db.execute(
        select(SavedPin)
        .join(Pin, Pin.id == SavedPin.pin_id)
        .where(SavedPin.user_id == current_user.id, Pin.influencer_id == influencer_id)
    )
    for saved in pins_result.scalars().all():
        await db.delete(saved)

    await db.commit()
    redis = await get_redis()
    await redis.delete(f"feed_pins:{current_user.id}")
