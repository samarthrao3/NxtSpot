# NxtSpot

A food discovery platform for Bangalore. Influencers pin restaurant recommendations on a map; users follow curators and build their own list of saved spots.

---

## What it does

- **Influencers** create richly-tagged pins — photo, vibe, price range, must-order dish, rating — on an interactive Mapbox map
- **Users** follow curators, browse a personalised feed of their pins, and save favourites
- **Public influencer pages** (`/i/:handle`) are shareable without an account
- **Discover** surfaces unfollowed curators sorted by follower count, with a live marquee preview for signed-out visitors
- Bangalore-only MVP — every pin is validated against the city bounding box

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, React Router v6, Mapbox GL JS, TanStack Query, Tailwind CSS |
| Backend | FastAPI (Python 3.12), modular monolith |
| Database | Supabase (PostgreSQL + PostGIS + Storage) |
| Cache | Redis via Upstash |
| Auth | Supabase Auth — Google OAuth only |

---

## Project structure

```
/
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── ExplorePage.tsx      # Curator discovery (public)
│       │   ├── FollowingPage.tsx    # Followed curators
│       │   ├── MapPage.tsx          # Main feed map (auth required)
│       │   ├── SavedPage.tsx        # Saved spots (auth required)
│       │   └── InfluencerPage.tsx   # Public shareable map (/i/:handle)
│       ├── components/
│       │   ├── map/                 # Mapbox markers and layers
│       │   ├── pins/                # Pin cards and add/edit form
│       │   └── ui/                  # Shared primitives (nav, icons, spinner)
│       └── lib/
│           ├── api.ts               # Typed FastAPI client
│           ├── supabase.ts          # Supabase auth client
│           └── mapbox.ts            # Map config and Bangalore bbox
│
└── backend/
    ├── main.py                      # App entry, CORS, router registration
    ├── core/                        # Config, database session, Redis client
    └── modules/
        ├── auth/                    # Google OAuth token verification
        ├── users/                   # Profiles, roles, saved pins
        ├── influencers/             # Influencer listings
        ├── pins/                    # Pin CRUD with bbox validation
        ├── feed/                    # Aggregated feed for followers
        ├── subscriptions/           # Follow / unfollow
        └── media/                   # Presigned URL generation
```

---

## Getting started

### Prerequisites

- Node.js 20+
- Python 3.12+
- A Supabase project with PostGIS enabled
- A Mapbox account (public token)
- An Upstash Redis database

### Environment variables

**`frontend/.env`**
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_MAPBOX_TOKEN=
VITE_API_URL=http://localhost:8000
```

**`backend/.env`**
```
DATABASE_URL=
REDIS_URL=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
JWT_SECRET=
```

### Run locally

```bash
# Frontend
cd frontend
npm install
npm run dev          # http://localhost:5173

# Backend (separate terminal)
cd backend
pip install -r requirements.txt
alembic upgrade head
uvicorn main:app --reload   # http://localhost:8000
```

---

## Routes

| Path | Page | Auth |
|---|---|---|
| `/` | → redirect to `/explore` | — |
| `/explore` | Discover curators | Public |
| `/i/:handle` | Influencer's public map | Public |
| `/map` | Feed map | Required |
| `/following` | Followed curators | Required |
| `/saved` | Saved spots | Required |

---

## Database

PostgreSQL via Supabase with PostGIS. Migrations are managed with Alembic.

```bash
alembic upgrade head                              # apply migrations
alembic revision --autogenerate -m "description" # generate new migration
```

**Bangalore bounding box** enforced on every pin write:
```
lat: 12.834 – 13.139
lng: 77.469 – 77.752
```

---

## Media uploads

The frontend requests a presigned URL from `POST /media/presigned-url`, uploads the file directly to Supabase Storage, then includes the returned URL in the pin payload. Files never pass through the FastAPI server.
