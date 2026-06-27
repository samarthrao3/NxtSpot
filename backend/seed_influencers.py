"""
Dev-only seed: creates 50 dummy influencers with 10 pins each.

  python seed_influencers.py          # add data
  python seed_influencers.py --clean  # remove all dummy data
"""
import asyncio
import pathlib
import random
import sys
import uuid

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from sqlalchemy import delete, select

from core.database import AsyncSessionLocal
from core.redis import get_redis
from models.pin import Pin
from models.user import User

_MARKER = "seed_dummy_"

_ADJECTIVES = [
    "Spicy", "Golden", "Urban", "Secret", "Velvet", "Smoky", "Crispy",
    "Royal", "Rustic", "Coastal", "Pepper", "Saffron", "Mint", "Honey",
    "Bold", "Fresh", "Dark", "Wild", "Lazy", "Crunchy",
]
_NOUNS = [
    "Eater", "Fork", "Palate", "Bite", "Table", "Plate", "Spoon",
    "Chef", "Feast", "Grub", "Taste", "Nosh", "Diner", "Bowl",
    "Curry", "Spice", "Flavour", "Crumb", "Drizzle", "Zest",
]

_RESTAURANTS = [
    "The Spice Route", "Karavalli", "Mavalli Tiffin Room", "Vidyarthi Bhavan",
    "Truffles", "Toit Brewpub", "The Only Place", "Koshy's", "Brahmin's Coffee Bar",
    "CTR Shivaji Nagar", "Meghana Foods", "Empire Restaurant", "Hole in the Wall Cafe",
    "The Fatty Bao", "Byg Brewski", "Sunny's", "Harima", "Ebony", "Rim Naam",
    "The Permit Room", "Glen's Bakehouse", "Corner House", "Creamy Inn",
    "Nagarjuna", "Airlines Hotel", "Udupi Palace", "Sagar Ratna",
    "The Humming Tree", "Social Indiranagar", "Farmlore",
]

_VIBE_TAGS = ["Casual", "Date Night", "Hidden Gem", "Street Food"]
_PRICE_RANGES = ["₹", "₹₹", "₹₹₹"]
_MUST_ORDERS = [
    "Masala Dosa", "Filter Coffee", "Biryani", "Butter Chicken", "Pav Bhaji",
    "Mutton Curry", "Paneer Tikka", "Idli Vada", "Chole Bhature", "Fish Curry",
]

# Bangalore bbox
_LAT_MIN, _LAT_MAX = 12.834, 13.139
_LNG_MIN, _LNG_MAX = 77.469, 77.752


async def _flush_cache() -> None:
    redis = await get_redis()
    keys = await redis.keys("influencer_list:*")
    if keys:
        await redis.delete(*keys)
    await redis.delete("influencer_list")
    print(f"Flushed {len(keys)} cache key(s).")


async def seed() -> None:
    async with AsyncSessionLocal() as db:
        influencers_created = 0
        pins_created = 0

        for i in range(50):
            adj = _ADJECTIVES[i % len(_ADJECTIVES)]
            noun = _NOUNS[i % len(_NOUNS)]
            n = i + 1
            handle = f"{adj.lower()}{noun.lower()}{n}"
            email = f"{_MARKER}{handle}@example.com"

            existing = await db.scalar(select(User).where(User.email == email))
            if existing:
                influencer = existing
            else:
                influencer = User(
                    id=uuid.uuid4(),
                    email=email,
                    name=f"{adj} {noun} {n}",
                    role="influencer",
                    handle=handle,
                    avatar_url=f"https://api.dicebear.com/7.x/initials/svg?seed={handle}",
                )
                db.add(influencer)
                await db.flush()  # get influencer.id before adding pins
                influencers_created += 1

            # Add 10 pins per influencer (skip if already seeded)
            existing_pins = await db.scalar(
                select(Pin).where(Pin.influencer_id == influencer.id).limit(1)
            )
            if not existing_pins:
                for j in range(10):
                    restaurant = _RESTAURANTS[(i * 10 + j) % len(_RESTAURANTS)]
                    db.add(Pin(
                        id=uuid.uuid4(),
                        influencer_id=influencer.id,
                        restaurant_name=f"{restaurant} {j + 1}" if j > 0 else restaurant,
                        lat=round(random.uniform(_LAT_MIN, _LAT_MAX), 6),
                        lng=round(random.uniform(_LNG_MIN, _LNG_MAX), 6),
                        photos=[],
                        vibe_tag=random.choice(_VIBE_TAGS),
                        price_range=random.choice(_PRICE_RANGES),
                        must_order=random.choice(_MUST_ORDERS),
                        rating=round(random.uniform(3.0, 5.0), 1),
                    ))
                    pins_created += 1

        await db.commit()
        print(f"Created {influencers_created} influencers and {pins_created} pins.")

    await _flush_cache()


async def clean() -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            delete(User).where(User.email.like(f"{_MARKER}%"))
        )
        await db.commit()
        print(f"Removed {result.rowcount} dummy influencers (pins cascade-deleted).")

    await _flush_cache()


if __name__ == "__main__":
    if "--clean" in sys.argv:
        asyncio.run(clean())
    else:
        asyncio.run(seed())
