import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models import User
from .deps import get_current_user

router = APIRouter()


class UpsertUserIn(BaseModel):
    email: str
    name: str | None = None
    avatar_url: str | None = None


@router.post("/me", summary="Upsert user on first login")
async def upsert_me(body: UpsertUserIn, db: AsyncSession = Depends(get_db)):
    """Called by the frontend immediately after Supabase OAuth completes."""
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if user is None:
        user = User(id=uuid.uuid4(), email=body.email, name=body.name, avatar_url=body.avatar_url)
        db.add(user)
        await db.commit()
        await db.refresh(user)
    return user


@router.get("/me", summary="Get current user profile")
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user
