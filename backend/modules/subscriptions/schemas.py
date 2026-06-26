import uuid

from pydantic import BaseModel


class FollowingOut(BaseModel):
    influencer_id: uuid.UUID


class FollowingInfluencerOut(BaseModel):
    id: uuid.UUID
    name: str | None
    handle: str | None
    avatar_url: str | None
    pin_count: int
    follower_count: int
