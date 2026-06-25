import mimetypes
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core.config import settings
from models import User
from modules.auth.deps import get_current_user

router = APIRouter()


class PresignedUrlRequest(BaseModel):
    filename: str


@router.post("/presigned-url")
async def get_presigned_url(
    body: PresignedUrlRequest,
    current_user: User = Depends(get_current_user),
):
    """Return a Supabase Storage presigned upload URL. Frontend uploads directly."""
    ext = body.filename.rsplit(".", 1)[-1].lower() if "." in body.filename else "bin"
    allowed = {"jpg", "jpeg", "png", "webp", "heic"}
    if ext not in allowed:
        raise HTTPException(status_code=422, detail="Unsupported file type")

    object_path = f"pins/{current_user.id}/{uuid.uuid4()}.{ext}"
    content_type = mimetypes.guess_type(body.filename)[0] or "application/octet-stream"

    async with httpx.AsyncClient() as client:
        res = await client.post(
            f"{settings.supabase_url}/storage/v1/object/upload/sign/photos/{object_path}",
            headers={
                "Authorization": f"Bearer {settings.supabase_service_key}",
                "Content-Type": "application/json",
            },
            json={"expiresIn": 300, "fileSizeLimit": 10485760},  # 10 MB cap
        )

    if res.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to generate upload URL")

    relative_url: str = res.json()["url"]
    signed_url = f"{settings.supabase_url}/storage/v1{relative_url}"
    public_url = f"{settings.supabase_url}/storage/v1/object/public/photos/{object_path}"

    return {"url": signed_url, "public_url": public_url, "content_type": content_type}
