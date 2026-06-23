import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.redis import get_redis
from models import Pin, Subscription, User

router = APIRouter()

_TTL = 600  # 10 min


def _serialize(user: User, pin_count: int, follower_count: int) -> dict:
    return {
        "id": str(user.id),
        "name": user.name,
        "handle": user.handle,
        "avatar_url": user.avatar_url,
        "pin_count": pin_count,
        "follower_count": follower_count,
    }


@router.get("/{handle}", summary="Public influencer profile")
async def get_influencer(handle: str, db: AsyncSession = Depends(get_db)):
    redis = await get_redis()
    cache_key = f"influencer_public_profile:{handle}"
    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)

    result = await db.execute(select(User).where(User.handle == handle, User.role == "influencer"))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="Influencer not found")

    pin_count = (await db.execute(select(func.count()).where(Pin.influencer_id == user.id))).scalar_one()
    follower_count = (
        await db.execute(select(func.count()).where(Subscription.influencer_id == user.id))
    ).scalar_one()

    data = _serialize(user, pin_count, follower_count)
    await redis.set(cache_key, json.dumps(data), ex=_TTL)
    return data


@router.get("/", summary="List all influencers")
async def list_influencers(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).where(User.role == "influencer").order_by(User.created_at.desc())
    )
    users = result.scalars().all()
    out = []
    for u in users:
        pc = (await db.execute(select(func.count()).where(Pin.influencer_id == u.id))).scalar_one()
        fc = (await db.execute(select(func.count()).where(Subscription.influencer_id == u.id))).scalar_one()
        out.append(_serialize(u, pc, fc))
    return out
