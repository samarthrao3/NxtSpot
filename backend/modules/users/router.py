import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import get_db
from models import User, Pin, SavedPin
from modules.auth.deps import get_current_user
from modules.auth.schemas import UserOut
from modules.pins.schemas import PinOut
from .schemas import UserUpdateIn

router = APIRouter()


@router.get("/me", response_model=UserOut, summary="Get current user profile")
async def get_me(current_user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(current_user)


@router.patch("/me", response_model=UserOut, summary="Update name, avatar_url, and/or handle")
async def update_me(
    body: UserUpdateIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserOut:
    updates = body.model_dump(exclude_unset=True)
    if "handle" in updates and current_user.role != "influencer":
        raise HTTPException(status_code=403, detail="Only influencers can set a handle")

    for field, value in updates.items():
        setattr(current_user, field, value)

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        detail = str(exc.orig) if exc.orig else ""
        if "handle" in detail:
            raise HTTPException(status_code=409, detail="That handle is already taken")
        raise HTTPException(status_code=409, detail="Update failed due to a conflict")

    await db.refresh(current_user)
    return UserOut.model_validate(current_user)


@router.delete("/me", status_code=204, summary="Permanently delete the current user's account")
async def delete_me(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.delete(
            f"{settings.supabase_url}/auth/v1/admin/users/{current_user.id}",
            headers={
                "Authorization": f"Bearer {settings.supabase_service_key}",
                "apikey": settings.supabase_service_key,
            },
        )
    if resp.status_code not in (200, 404):
        raise HTTPException(status_code=502, detail="Could not delete account, please try again")

    await db.delete(current_user)
    await db.commit()


@router.get("/me/saved", response_model=list[PinOut], summary="All pins the current user has saved")
async def get_saved_pins(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[PinOut]:
    result = await db.execute(
        select(Pin)
        .join(SavedPin, SavedPin.pin_id == Pin.id)
        .where(SavedPin.user_id == current_user.id)
    )
    return [PinOut.model_validate(p) for p in result.scalars().all()]


@router.post("/me/saved/{pin_id}", status_code=201, summary="Save a pin")
async def save_pin(
    pin_id: uuid.UUID,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    existing = await db.execute(
        select(SavedPin).where(
            SavedPin.user_id == current_user.id, SavedPin.pin_id == pin_id
        )
    )
    if existing.scalar_one_or_none():
        response.status_code = 200
        return
    pin = await db.get(Pin, pin_id)
    if pin is None:
        raise HTTPException(status_code=404, detail="Pin not found")
    saved = SavedPin(user_id=current_user.id, pin_id=pin_id)
    db.add(saved)
    await db.commit()


@router.delete("/me/saved/{pin_id}", status_code=204, summary="Unsave a pin")
async def unsave_pin(
    pin_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    result = await db.execute(
        select(SavedPin).where(
            SavedPin.user_id == current_user.id, SavedPin.pin_id == pin_id
        )
    )
    saved = result.scalar_one_or_none()
    if saved:
        await db.delete(saved)
        await db.commit()
