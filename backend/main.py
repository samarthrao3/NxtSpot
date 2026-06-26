from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from core.config import settings
from core.limiter import limiter
from modules.auth.router import router as auth_router
from modules.users.router import router as users_router
from modules.influencers.router import router as influencers_router
from modules.pins.router import router as pins_router
from modules.feed.router import router as feed_router
from modules.subscriptions.router import router as subscriptions_router
from modules.media.router import router as media_router

app = FastAPI(title="Bangalore Food Map API", version="0.1.0", redirect_slashes=False)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(users_router, prefix="/users", tags=["users"])
app.include_router(influencers_router, prefix="/influencers", tags=["influencers"])
app.include_router(pins_router, prefix="/pins", tags=["pins"])
app.include_router(feed_router, prefix="/feed", tags=["feed"])
app.include_router(subscriptions_router, prefix="/subscriptions", tags=["subscriptions"])
app.include_router(media_router, prefix="/media", tags=["media"])


@app.get("/health", tags=["meta"])
async def health():
    return {"status": "ok"}
