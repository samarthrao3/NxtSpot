import uuid
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.config import settings
from core.database import get_db
from models import User

security = HTTPBearer()

ACCESS_TOKEN_EXPIRES = timedelta(days=7)


def create_access_token(user_id: uuid.UUID) -> str:
    payload = {
        "sub": str(user_id),
        "exp": datetime.now(timezone.utc) + ACCESS_TOKEN_EXPIRES,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def _decode_user_id(credentials: HTTPAuthorizationCredentials = Depends(security)) -> uuid.UUID:
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
        user_id: str | None = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return uuid.UUID(user_id)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_current_user_id(user_id: uuid.UUID = Depends(_decode_user_id)) -> uuid.UUID:
    """JWT-only auth — no DB round trip. Use for endpoints that only need the user's ID."""
    return user_id


async def get_current_user(
    user_id: uuid.UUID = Depends(_decode_user_id),
    db: AsyncSession = Depends(get_db),
) -> User:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found — please log in")
    return user
