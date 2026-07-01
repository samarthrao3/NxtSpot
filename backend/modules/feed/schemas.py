import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class PinWithInfluencer(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    influencer_id: uuid.UUID
    restaurant_name: str
    lat: float
    lng: float
    photos: list[str]
    vibe_tag: str | None
    price_range: str | None
    must_order: str | None
    note: str | None
    rating: float | None
    created_at: datetime
    price_per_head: str | None
    cuisine_tags: list[str] | None
    reasoning: list[str] | None
    must_order_dishes: list[str] | None
    insider_tip: str | None
    would_return: str | None
    best_time: str | None
    best_for: list[str] | None
    category: str | None


class RestaurantGroup(BaseModel):
    restaurant_key: str
    lat: float
    lng: float
    pins: list[PinWithInfluencer]
