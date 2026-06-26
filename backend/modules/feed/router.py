import json
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.redis import get_redis
from models import Pin, Subscription, User
from modules.auth.deps import get_current_user
from modules.pins.schemas import PinOut
from .schemas import FeedGroup

router = APIRouter()

_TTL = 120  # 2 min


@router.get("", response_model=list[FeedGroup])
async def get_feed(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[FeedGroup]:
    redis = await get_redis()
    cache_key = f"feed_pins:{current_user.id}"
    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)

    sub_result = await db.execute(
        select(Subscription.influencer_id).where(Subscription.user_id == current_user.id)
    )
    influencer_ids = [row[0] for row in sub_result]

    groups: list[FeedGroup] = []
    if influencer_ids:
        pins_result = await db.execute(
            select(Pin)
            .where(Pin.influencer_id.in_(influencer_ids))
            .order_by(Pin.created_at.desc())
        )
        grouped: dict[uuid.UUID, list[PinOut]] = {}
        for pin in pins_result.scalars().all():
            grouped.setdefault(pin.influencer_id, []).append(PinOut.model_validate(pin))
        groups = [FeedGroup(influencer_id=iid, pins=pins) for iid, pins in grouped.items()]

    data = [g.model_dump(mode="json") for g in groups]
    await redis.set(cache_key, json.dumps(data), ex=_TTL)
    return data
