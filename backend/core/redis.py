import redis.asyncio as aioredis

from core.config import settings

_client: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    global _client
    if _client is None:
        _client = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _client


async def invalidate_feed(user_id: str) -> None:
    r = await get_redis()
    await r.delete(f"feed_pins:{user_id}")
