import json

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.redis import get_redis
from models import Pin, Subscription, User
from modules.auth.deps import get_current_user

router = APIRouter()

_TTL = 120  # 2 min


@router.get("/")
async def get_feed(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    redis = await get_redis()
    cache_key = f"feed_pins:{current_user.id}"
    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)

    result = await db.execute(
        select(Pin)
        .join(Subscription, Subscription.influencer_id == Pin.influencer_id)
        .where(Subscription.user_id == current_user.id)
        .order_by(Pin.created_at.desc())
    )
    pins = result.scalars().all()

    # Serialise UUIDs / datetimes for JSON cache
    data = [
        {
            **{c.key: getattr(p, c.key) for c in p.__table__.columns},
            "id": str(p.id),
            "influencer_id": str(p.influencer_id),
            "created_at": p.created_at.isoformat(),
        }
        for p in pins
    ]
    await redis.set(cache_key, json.dumps(data), ex=_TTL)
    return data
