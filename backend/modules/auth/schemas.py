import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    name: str | None
    role: str
    handle: str | None
    avatar_url: str | None
    created_at: datetime


class LoginIn(BaseModel):
    access_token: str


class LoginOut(BaseModel):
    access_token: str
    user: UserOut
