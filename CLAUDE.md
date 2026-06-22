# Bangalore Food Map

Full-stack food discovery platform where influencers pin restaurant recommendations on a map and users subscribe to follow them. Bangalore-only MVP.

## Stack

**Frontend:** React 18, Vite, React Router v6, Mapbox GL JS, TanStack Query, Tailwind CSS  
**Backend:** FastAPI (Python 3.12), modular monolith  
**Database:** Supabase (PostgreSQL + PostGIS + Storage), Redis via Upstash  
**Auth:** Supabase Auth (Google OAuth only)  
**Run locally** — no hosting setup for MVP

## Project Structure

```
/
├── frontend/                  # React 18 + Vite app
│   ├── index.html
│   ├── vite.config.ts
│   ├── src/
│   │   ├── main.tsx           # App entry, React Router provider setup
│   │   ├── router.tsx         # All route definitions (React Router v6)
│   │   ├── pages/
│   │   │   ├── ExplorePage.tsx        # Curated influencer discovery
│   │   │   ├── InfluencerPage.tsx     # Public shareable influencer map (/i/:handle)
│   │   │   ├── MapPage.tsx            # Main logged-in feed map
│   │   │   └── SavedPage.tsx          # User's saved pins
│   │   ├── components/
│   │   │   ├── map/           # Mapbox components, pin markers
│   │   │   ├── pins/          # Pin cards, pin form
│   │   │   └── ui/            # Shared UI primitives
│   │   └── lib/
│   │       ├── mapbox.ts      # Mapbox config, Bangalore bbox constant
│   │       ├── api.ts         # FastAPI client (typed fetch wrappers)
│   │       └── supabase.ts    # Supabase client (auth only)
│
└── backend/                   # FastAPI modular monolith
    ├── main.py                # App entry, router registration, CORS
    ├── core/
    │   ├── config.py          # Settings (env vars via pydantic-settings)
    │   ├── database.py        # SQLAlchemy async engine + session
    │   └── redis.py           # Upstash Redis client
    ├── modules/
    │   ├── auth/              # Google OAuth token verify, JWT session
    │   ├── users/             # User profiles, roles, saved pins
    │   ├── influencers/       # Influencer profiles
    │   ├── pins/              # Pin CRUD, Bangalore bbox validation, cascade
    │   ├── feed/              # Aggregate pins from followed influencers
    │   ├── subscriptions/     # Follow/unfollow influencers (free, no payment)
    │   └── media/             # Presigned URL generation for Supabase Storage
    └── models/                # SQLAlchemy models (shared across modules)
```

## Commands

```bash
# Frontend
cd frontend
npm run dev          # Start dev server on port 5173 (Vite default)
npm run build        # Production build
npm run lint         # ESLint
npm run type-check   # tsc --noEmit

# Backend
cd backend
uvicorn main:app --reload          # Start dev server on port 8000
alembic upgrade head               # Run migrations
alembic revision --autogenerate -m "description"  # Generate migration
pytest                             # Run tests
pytest -v -k "test_name"          # Run specific test
```

## Routing (React Router v6)

```
/                    → redirect to /explore
/explore             → ExplorePage (public)
/i/:handle           → InfluencerPage (public shareable influencer map)
/map                 → MapPage (auth required)
/saved               → SavedPage (auth required)
```

Auth-required routes use a `<ProtectedRoute>` wrapper that checks Supabase session and redirects to `/explore` if not logged in.

## Database

PostgreSQL via Supabase with PostGIS. All migrations via Alembic.

**Key tables:** `users`, `pins`, `subscriptions`, `saved_pins`

**Critical:** `saved_pins` has FK to `pins` with `ON DELETE CASCADE` — deleting a pin auto-removes all saved references. Never bypass this with raw SQL.

**Bangalore bounding box** (enforce on every pin write):
```
lat: 12.834 to 13.139
lng: 77.469 to 77.752
```

**Indexes to never remove:**
- `idx_pins_influencer_id` on `pins(influencer_id)`
- `idx_pins_location` on `pins` using GIST
- `idx_subscriptions_user_id` on `subscriptions(user_id)`
- `idx_saved_pins_user_id` on `saved_pins(user_id)`

## Database Schema

```sql
users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT DEFAULT 'user',   -- 'user' or 'influencer'
  handle TEXT UNIQUE,         -- only set for influencers
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
)

pins (
  id UUID PRIMARY KEY,
  influencer_id UUID REFERENCES users(id) ON DELETE CASCADE,
  restaurant_name TEXT NOT NULL,
  lat FLOAT NOT NULL,
  lng FLOAT NOT NULL,
  photos TEXT[],              -- array of Supabase Storage URLs
  vibe_tag TEXT,              -- 'Casual', 'Date Night', 'Hidden Gem', 'Street Food'
  price_range TEXT,           -- '₹', '₹₹', '₹₹₹'
  must_order TEXT,
  note TEXT,
  rating FLOAT,               -- 1.0 to 5.0
  created_at TIMESTAMPTZ DEFAULT now()
)

subscriptions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  influencer_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, influencer_id)
)

saved_pins (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  pin_id UUID REFERENCES pins(id) ON DELETE CASCADE,
  saved_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, pin_id)
)
```

## Redis Cache Keys

```
feed_pins:{user_id}                     TTL: 120s
influencer_public_profile:{handle}      TTL: 600s
```

Invalidate `feed_pins:{user_id}` for ALL followers when an influencer creates, edits, or deletes a pin.

## Access Rules

- All pins are publicly visible — no payment gating in MVP
- All endpoints require JWT auth except:
  - `GET /influencers/:handle` (public profile)
  - `GET /pins/influencer/:influencer_id` (public pin list)
- Only users with `role = 'influencer'` can create, edit, or delete pins
- Influencers can only edit/delete their own pins — check `pin.influencer_id == current_user.id`
- Pin lat/lng must be validated within Bangalore bbox on every write — reject with 422 if outside

## Media Uploads

Frontend requests a presigned URL from `POST /media/presigned-url`, uploads directly to Supabase Storage, then submits the returned URL in the pin form. Never proxy file uploads through FastAPI.

## MVP Scope

**In scope:**
- Google OAuth login
- Influencer profiles + public shareable map URLs (`/i/:handle`)
- Pin CRUD (photo, vibe tag, price range, must-order dish, note, rating)
- Mapbox map with per-influencer pin layers
- Follow/unfollow influencers (free, no payment)
- Feed — see pins from all followed influencers
- Save/unsave pins
- Curated explore page

**Out of scope (post-MVP):**
- Payments and subscriptions (Razorpay)
- Pin gating / paywalls
- Notifications
- Influencer analytics dashboard
- Search and filters
- Multi-city support
- Video pins

## Environment Variables

```
# Backend (.env)
DATABASE_URL=
REDIS_URL=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
JWT_SECRET=

# Frontend (.env)
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_MAPBOX_TOKEN=
VITE_API_URL=http://localhost:8000
```

Note: Vite env vars must be prefixed with `VITE_` to be accessible in the browser. Never commit `.env`. Never log secrets or tokens.
