from pydantic import BaseModel


class UserUpdateIn(BaseModel):
    name: str | None = None
    avatar_url: str | None = None
