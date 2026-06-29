import json
import math
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.redis import get_redis
from models import Pin, Subscription
from modules.auth.deps import get_current_user_id
from .schemas import PinWithInfluencer, RestaurantGroup

router = APIRouter()

_TTL = 120  # 2 min
_PINS_PER_INFLUENCER = 20
_GROUP_RADIUS_M = 500


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlng / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


@router.get("", response_model=list[RestaurantGroup])
async def get_feed(
    db: AsyncSession = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
) -> list[RestaurantGroup]:
    redis = await get_redis()
    cache_key = f"feed_pins:{current_user_id}"
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
        .where(Subscription.user_id == current_user_id)
        .subquery()
    )

    pins_result = await db.execute(
        select(Pin)
        .join(ranked, Pin.id == ranked.c.id)
        .where(ranked.c.rn <= _PINS_PER_INFLUENCER)
        .order_by(Pin.created_at.desc())
    )

    # Group by name + proximity: same name and within 500 m → one group.
    # Multiple branches of the same chain stay separate if they're farther apart.
    groups: list[RestaurantGroup] = []
    name_index: dict[str, list[int]] = {}  # name key → indices into groups

    for pin in pins_result.scalars().all():
        key = pin.restaurant_name.lower().strip()
        matched: RestaurantGroup | None = None

        for idx in name_index.get(key, []):
            g = groups[idx]
            if _haversine_m(pin.lat, pin.lng, g.lat, g.lng) <= _GROUP_RADIUS_M:
                matched = g
                break

        if matched is None:
            matched = RestaurantGroup(restaurant_key=key, lat=pin.lat, lng=pin.lng, pins=[])
            name_index.setdefault(key, []).append(len(groups))
            groups.append(matched)

        matched.pins.append(PinWithInfluencer.model_validate(pin))

    data = [g.model_dump(mode="json") for g in groups]
    await redis.set(cache_key, json.dumps(data), ex=_TTL)
    return data
