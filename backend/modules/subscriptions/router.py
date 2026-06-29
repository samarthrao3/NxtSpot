import json
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.redis import get_redis, invalidate_user_caches
from models import Pin, Subscription, User
from modules.auth.deps import get_current_user_id
from .schemas import FollowingOut, FollowingInfluencerOut

router = APIRouter()

_FOLLOWING_TTL = 300  # 5 min


@router.get("", response_model=list[FollowingOut])
async def list_following(
    db: AsyncSession = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
) -> list[FollowingOut]:
    result = await db.execute(
        select(Subscription.influencer_id).where(Subscription.user_id == current_user_id)
    )
    return [FollowingOut(influencer_id=row[0]) for row in result]


@router.get("/influencers", response_model=list[FollowingInfluencerOut])
async def list_following_influencers(
    db: AsyncSession = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
) -> list[FollowingInfluencerOut]:
    redis = await get_redis()
    cache_key = f"following_influencers:{current_user_id}"
    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)

    pin_count = (
        select(func.count())
        .where(Pin.influencer_id == User.id)
        .correlate(User)
        .scalar_subquery()
        .label("pin_count")
    )
    follower_count = (
        select(func.count())
        .where(Subscription.influencer_id == User.id)
        .correlate(User)
        .scalar_subquery()
        .label("follower_count")
    )
    rows = (await db.execute(
        select(User.id, User.name, User.handle, User.avatar_url, pin_count, follower_count)
        .join(Subscription, Subscription.influencer_id == User.id)
        .where(Subscription.user_id == current_user_id)
        .order_by(Subscription.created_at.desc())
    )).all()

    data = [
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
    await redis.set(cache_key, json.dumps(data), ex=_FOLLOWING_TTL)
    return data


@router.post("/{influencer_id}", status_code=201)
async def follow(
    influencer_id: uuid.UUID,
    response: Response,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
) -> None:
    if influencer_id == current_user_id:
        raise HTTPException(status_code=400, detail="Cannot follow yourself")
    stmt = (
        pg_insert(Subscription)
        .values(user_id=current_user_id, influencer_id=influencer_id)
        .on_conflict_do_nothing()
    )
    result = await db.execute(stmt)
    await db.commit()
    if result.rowcount == 0:
        response.status_code = 200
        return
    background_tasks.add_task(invalidate_user_caches, str(current_user_id))


@router.delete("/{influencer_id}", status_code=204)
async def unfollow(
    influencer_id: uuid.UUID,
    response: Response,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
) -> None:
    result = await db.execute(
        delete(Subscription).where(
            Subscription.user_id == current_user_id,
            Subscription.influencer_id == influencer_id,
        )
    )
    await db.commit()
    if result.rowcount == 0:
        response.status_code = 200
        return
    background_tasks.add_task(invalidate_user_caches, str(current_user_id))
