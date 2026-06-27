import json

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.redis import get_redis
from models import Pin, Subscription, User
from modules.auth.deps import get_current_user
from .schemas import PinWithInfluencer, RestaurantGroup

router = APIRouter()

_TTL = 120  # 2 min
_PINS_PER_INFLUENCER = 20


@router.get("", response_model=list[RestaurantGroup])
async def get_feed(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[RestaurantGroup]:
    redis = await get_redis()
    cache_key = f"feed_pins:{current_user.id}"
    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)

    # Latest _PINS_PER_INFLUENCER pins per followed influencer
    ranked = (
        select(
            Pin.id,
            func.row_number().over(
                partition_by=Pin.influencer_id,
                order_by=Pin.created_at.desc(),
            ).label("rn"),
        )
        .join(Subscription, Subscription.influencer_id == Pin.influencer_id)
        .where(Subscription.user_id == current_user.id)
        .subquery()
    )

    pins_result = await db.execute(
        select(Pin)
        .join(ranked, Pin.id == ranked.c.id)
        .where(ranked.c.rn <= _PINS_PER_INFLUENCER)
        .order_by(Pin.created_at.desc())
    )

    restaurant_groups: dict[str, RestaurantGroup] = {}
    for pin in pins_result.scalars().all():
        key = pin.restaurant_name.lower().strip()
        if key not in restaurant_groups:
            restaurant_groups[key] = RestaurantGroup(
                restaurant_key=key,
                lat=pin.lat,
                lng=pin.lng,
                pins=[],
            )
        restaurant_groups[key].pins.append(PinWithInfluencer.model_validate(pin))

    groups = list(restaurant_groups.values())
    data = [g.model_dump(mode="json") for g in groups]
    await redis.set(cache_key, json.dumps(data), ex=_TTL)
    return data
