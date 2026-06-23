import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


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


class PinCreate(BaseModel):
    restaurant_name: str = Field(min_length=1, max_length=200)
    lat: float
    lng: float
    photos: list[str] = []
    vibe_tag: VibeTag | None = None
    price_range: PriceRange | None = None
    must_order: str | None = None
    note: str | None = None
    rating: float | None = Field(default=None, ge=1.0, le=5.0)

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
    must_order: str | None = None
    note: str | None = None
    rating: float | None = Field(default=None, ge=1.0, le=5.0)

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
