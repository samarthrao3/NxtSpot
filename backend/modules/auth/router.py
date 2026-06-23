import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import get_db
from models import User
from .deps import create_access_token, get_current_user
from .schemas import LoginIn, LoginOut, UserOut

router = APIRouter()


@router.post("/login", response_model=LoginOut, summary="Exchange a Supabase Google OAuth token for an app JWT")
async def login(body: LoginIn, db: AsyncSession = Depends(get_db)) -> LoginOut:
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{settings.supabase_url}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {body.access_token}",
                "apikey": settings.supabase_service_key,
            },
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid or expired Google OAuth token")

    supabase_user = resp.json()
    email = supabase_user.get("email")
    if not email:
        raise HTTPException(status_code=401, detail="Token did not resolve to a user with an email")

    user_id = uuid.UUID(supabase_user["id"])
    metadata = supabase_user.get("user_metadata") or {}
    name = metadata.get("full_name") or metadata.get("name")
    avatar_url = metadata.get("avatar_url") or metadata.get("picture")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        user = User(id=user_id, email=email, name=name, avatar_url=avatar_url)
        db.add(user)
    else:
        user.name = name
        user.avatar_url = avatar_url
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user_id=user.id, role=user.role)
    return LoginOut(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut, summary="Get current user profile")
async def get_me(current_user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(current_user)
