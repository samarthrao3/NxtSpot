import json

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.redis import get_redis
from models import Pin, Subscription, User

router = APIRouter()

_PROFILE_TTL = 600   # 10 min
_LIST_TTL = 120      # 2 min

# Correlated subqueries — reused across both endpoints
_pin_count = (
    select(func.count())
    .where(Pin.influencer_id == User.id)
    .correlate(User)
    .scalar_subquery()
    .label("pin_count")
)
_follower_count = (
    select(func.count())
    .where(Subscription.influencer_id == User.id)
    .correlate(User)
    .scalar_subquery()
    .label("follower_count")
)


@router.get("/{handle}", summary="Public influencer profile")
async def get_influencer(handle: str, db: AsyncSession = Depends(get_db)):
    redis = await get_redis()
    cache_key = f"influencer_public_profile:{handle}"
    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)

    row = (await db.execute(
        select(User.id, User.name, User.handle, User.avatar_url, _pin_count, _follower_count)
        .where(User.handle == handle, User.role == "influencer")
    )).one_or_none()

    if row is None:
        raise HTTPException(status_code=404, detail="Influencer not found")

    data = {
        "id": str(row.id),
        "name": row.name,
        "handle": row.handle,
        "avatar_url": row.avatar_url,
        "pin_count": row.pin_count,
        "follower_count": row.follower_count,
    }
    await redis.set(cache_key, json.dumps(data), ex=_PROFILE_TTL)
    return data


@router.get("", summary="List all influencers")
async def list_influencers(
    limit: int = Query(default=12, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    redis = await get_redis()
    cache_key = f"influencer_list:{limit}:{offset}"
    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)

    rows = (await db.execute(
        select(User.id, User.name, User.handle, User.avatar_url, _pin_count, _follower_count)
        .where(User.role == "influencer")
        .order_by(User.created_at.desc())
        .limit(limit + 1)
        .offset(offset)
    )).all()

    has_more = len(rows) > limit
    rows = rows[:limit]

    items = [
        {
            "id": str(r.id),
            "name": r.name,
            "handle": r.handle,
            "avatar_url": r.avatar_url,
            "pin_count": r.pin_count,
            "follower_count": r.follower_count,
        }
        for r in rows
    ]
    out = {"items": items, "has_more": has_more}
    await redis.set(cache_key, json.dumps(out), ex=_LIST_TTL)
    return out
