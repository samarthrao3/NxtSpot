import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.redis import get_redis
from models import Pin, Subscription, User
from modules.auth.deps import get_current_user
from .schemas import PinCreate, PinOut, PinSearchOut, PinUpdate

router = APIRouter()


@router.get("/search", response_model=list[PinSearchOut])
async def search_pins(
    q: str = Query(min_length=1, max_length=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[PinSearchOut]:
    pattern = f"%{q}%"
    followed_subq = select(Subscription.influencer_id).where(
        Subscription.user_id == current_user.id
    )
    result = await db.execute(
        select(Pin, User.handle.label("influencer_handle"), User.name.label("influencer_name"))
        .join(User, Pin.influencer_id == User.id)
        .where(
            Pin.influencer_id.in_(followed_subq),
            or_(
                Pin.restaurant_name.ilike(pattern),
                Pin.category.ilike(pattern),
                Pin.vibe_tag.ilike(pattern),
                Pin.must_order.ilike(pattern),
                func.array_to_string(Pin.cuisine_tags, ",").ilike(pattern),
                func.array_to_string(Pin.must_order_dishes, ",").ilike(pattern),
                User.handle.ilike(pattern),
                User.name.ilike(pattern),
            ),
        )
        .order_by(Pin.created_at.desc())
        .limit(20)
    )
    return [
        PinSearchOut(
            **PinOut.model_validate(row.Pin).model_dump(),
            influencer_handle=row.influencer_handle,
            influencer_name=row.influencer_name,
        )
        for row in result.all()
    ]


@router.get("/influencer/{influencer_id}", response_model=list[PinOut], summary="Public pin list for an influencer")
async def get_influencer_pins(influencer_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> list[PinOut]:
    result = await db.execute(select(Pin).where(Pin.influencer_id == influencer_id))
    return [PinOut.model_validate(p) for p in result.scalars().all()]


@router.post("", response_model=PinOut, status_code=201)
async def create_pin(
    body: PinCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PinOut:
    if current_user.role != "influencer":
        raise HTTPException(status_code=403, detail="Only influencers can create pins")
    pin = Pin(influencer_id=current_user.id, **body.model_dump())
    db.add(pin)
    await db.commit()
    await db.refresh(pin)
    await _invalidate_follower_feeds(current_user.id, db)
    return PinOut.model_validate(pin)


@router.patch("/{pin_id}", response_model=PinOut)
async def update_pin(
    pin_id: uuid.UUID,
    body: PinUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PinOut:
    pin = await _get_own_pin(pin_id, current_user, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(pin, field, value)
    await db.commit()
    await db.refresh(pin)
    await _invalidate_follower_feeds(current_user.id, db)
    return PinOut.model_validate(pin)


@router.delete("/{pin_id}", status_code=204)
async def delete_pin(
    pin_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pin = await _get_own_pin(pin_id, current_user, db)
    await db.delete(pin)
    await db.commit()
    await _invalidate_follower_feeds(current_user.id, db)


async def _get_own_pin(pin_id: uuid.UUID, user: User, db: AsyncSession) -> Pin:
    result = await db.execute(select(Pin).where(Pin.id == pin_id))
    pin = result.scalar_one_or_none()
    if pin is None:
        raise HTTPException(status_code=404, detail="Pin not found")
    if pin.influencer_id != user.id:
        raise HTTPException(status_code=403, detail="Not your pin")
    return pin


async def _invalidate_follower_feeds(influencer_id: uuid.UUID, db: AsyncSession) -> None:
    result = await db.execute(
        select(Subscription.user_id).where(Subscription.influencer_id == influencer_id)
    )
    redis = await get_redis()
    for (uid,) in result:
        await redis.delete(f"feed_pins:{uid}")
