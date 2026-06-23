import uuid

from pydantic import BaseModel

from modules.pins.schemas import PinOut


class FeedGroup(BaseModel):
    influencer_id: uuid.UUID
    pins: list[PinOut]
