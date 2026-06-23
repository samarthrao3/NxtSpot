import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models import User, Pin, SavedPin
from modules.auth.deps import get_current_user
from modules.auth.schemas import UserOut
from .schemas import UserUpdateIn

router = APIRouter()


@router.get("/me", response_model=UserOut, summary="Get current user profile")
async def get_me(current_user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(current_user)


@router.patch("/me", response_model=UserOut, summary="Update name and/or avatar_url")
async def update_me(
    body: UserUpdateIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserOut:
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(current_user, field, value)
    await db.commit()
    await db.refresh(current_user)
    return UserOut.model_validate(current_user)


@router.get("/saved")
async def get_saved_pins(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Pin)
        .join(SavedPin, SavedPin.pin_id == Pin.id)
        .where(SavedPin.user_id == current_user.id)
    )
    return result.scalars().all()


@router.post("/saved/{pin_id}", status_code=201)
async def save_pin(
    pin_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pin = await db.get(Pin, pin_id)
    if pin is None:
        raise HTTPException(status_code=404, detail="Pin not found")
    saved = SavedPin(user_id=current_user.id, pin_id=pin_id)
    db.add(saved)
    await db.commit()


@router.delete("/saved/{pin_id}", status_code=204)
async def unsave_pin(
    pin_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SavedPin).where(
            SavedPin.user_id == current_user.id, SavedPin.pin_id == pin_id
        )
    )
    saved = result.scalar_one_or_none()
    if saved:
        await db.delete(saved)
        await db.commit()
