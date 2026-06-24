import uuid

from pydantic import BaseModel


class FollowingOut(BaseModel):
    influencer_id: uuid.UUID
