import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from core.config import settings


VibeTag = Literal["Casual", "Date Night", "Hidden Gem", "Street Food"]
PriceRange = Literal["₹", "₹₹", "₹₹₹"]

BBOX = {
    "lat": (12.834, 13.139),
    "lng": (77.469, 77.752),
}


def _assert_bangalore(lat: float | None, lng: float | None) -> None:
    if lat is not None and not (BBOX["lat"][0] <= lat <= BBOX["lat"][1]):
        raise ValueError("Latitude outside Bangalore bounding box")
    if lng is not None and not (BBOX["lng"][0] <= lng <= BBOX["lng"][1]):
        raise ValueError("Longitude outside Bangalore bounding box")


def _assert_photo_urls(photos: list[str]) -> list[str]:
    prefix = f"{settings.supabase_url}/storage/v1/object/public/photos/"
    for url in photos:
        if not url.startswith(prefix):
            raise ValueError(f"Photo URL must point to this app's Supabase Storage bucket")
    return photos


class PinCreate(BaseModel):
    restaurant_name: str = Field(min_length=1, max_length=200)
    lat: float
    lng: float
    photos: list[str] = []
    vibe_tag: VibeTag | None = None
    price_range: PriceRange | None = None
    must_order: str | None = Field(default=None, max_length=100)
    note: str | None = Field(default=None, max_length=500)
    rating: float | None = Field(default=None, ge=0.0, le=5.0)
    price_per_head: str | None = Field(default=None, max_length=20)
    cuisine_tags: list[str] | None = Field(default=None, max_length=13)
    reasoning: list[str] | None = Field(default=None, max_length=8)
    must_order_dishes: list[str] | None = Field(default=None, max_length=3)
    insider_tip: str | None = Field(default=None, max_length=300)
    would_return: str | None = Field(default=None, max_length=20)
    best_time: str | None = Field(default=None, max_length=40)
    best_for: list[str] | None = Field(default=None, max_length=7)

    @field_validator("photos")
    @classmethod
    def validate_photos(cls, v: list[str]) -> list[str]:
        return _assert_photo_urls(v)

    @model_validator(mode="after")
    def validate_bbox(self) -> "PinCreate":
        _assert_bangalore(self.lat, self.lng)
        return self


class PinUpdate(BaseModel):
    restaurant_name: str | None = Field(default=None, min_length=1, max_length=200)
    lat: float | None = None
    lng: float | None = None
    photos: list[str] | None = None
    vibe_tag: VibeTag | None = None
    price_range: PriceRange | None = None
    must_order: str | None = Field(default=None, max_length=100)
    note: str | None = Field(default=None, max_length=500)
    rating: float | None = Field(default=None, ge=0.0, le=5.0)
    price_per_head: str | None = Field(default=None, max_length=20)
    cuisine_tags: list[str] | None = Field(default=None, max_length=13)
    reasoning: list[str] | None = Field(default=None, max_length=8)
    must_order_dishes: list[str] | None = Field(default=None, max_length=3)
    insider_tip: str | None = Field(default=None, max_length=300)
    would_return: str | None = Field(default=None, max_length=20)
    best_time: str | None = Field(default=None, max_length=40)
    best_for: list[str] | None = Field(default=None, max_length=7)

    @field_validator("photos")
    @classmethod
    def validate_photos(cls, v: list[str] | None) -> list[str] | None:
        if v is not None:
            return _assert_photo_urls(v)
        return v

    @model_validator(mode="after")
    def validate_bbox(self) -> "PinUpdate":
        _assert_bangalore(self.lat, self.lng)
        return self


class PinOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    influencer_id: uuid.UUID
    restaurant_name: str
    lat: float
    lng: float
    photos: list[str]
    vibe_tag: VibeTag | None
    price_range: PriceRange | None
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
