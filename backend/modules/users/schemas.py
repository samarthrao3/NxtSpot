import re

from pydantic import BaseModel, field_validator

from core.config import settings

HANDLE_RE = re.compile(r'^[a-z0-9_-]{3,30}$')


class UserUpdateIn(BaseModel):
    name: str | None = None
    avatar_url: str | None = None
    handle: str | None = None

    @field_validator("handle")
    @classmethod
    def validate_handle(cls, v: str | None) -> str | None:
        if v is not None and not HANDLE_RE.match(v):
            raise ValueError("Handle must be 3–30 lowercase letters, numbers, hyphens, or underscores")
        return v

    @field_validator("avatar_url")
    @classmethod
    def validate_avatar_url(cls, v: str | None) -> str | None:
        if v is not None:
            if not v.startswith("https://"):
                raise ValueError("avatar_url must be an HTTPS URL")
            if not v.startswith(settings.supabase_url):
                raise ValueError("avatar_url must point to this app's Supabase Storage")
        return v
