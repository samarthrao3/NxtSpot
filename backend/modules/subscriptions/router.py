import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.redis import get_redis
from models import Subscription, User
from modules.auth.deps import get_current_user

router = APIRouter()


@router.get("/")
async def list_following(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Subscription).where(Subscription.user_id == current_user.id)
    )
    return result.scalars().all()


@router.post("/{influencer_id}", status_code=201)
async def follow(
    influencer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if influencer_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot follow yourself")
    existing = await db.execute(
        select(Subscription).where(
            Subscription.user_id == current_user.id,
            Subscription.influencer_id == influencer_id,
        )
    )
    if existing.scalar_one_or_none():
        return  # idempotent
    sub = Subscription(user_id=current_user.id, influencer_id=influencer_id)
    db.add(sub)
    await db.commit()
    # Invalidate this user's feed so the new influencer's pins appear
    redis = await get_redis()
    await redis.delete(f"feed_pins:{current_user.id}")


@router.delete("/{influencer_id}", status_code=204)
async def unfollow(
    influencer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Subscription).where(
            Subscription.user_id == current_user.id,
            Subscription.influencer_id == influencer_id,
        )
    )
    sub = result.scalar_one_or_none()
    if sub:
        await db.delete(sub)
        await db.commit()
    redis = await get_redis()
    await redis.delete(f"feed_pins:{current_user.id}")
