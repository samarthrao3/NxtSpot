"""enable rls

Revision ID: c1a9d4e7f203
Revises: a4f8c102b8e1
Create Date: 2026-06-25

"""
from alembic import op

revision = "c1a9d4e7f203"
down_revision = "a4f8c102b8e1"
branch_labels = None
depends_on = None

TABLES = ["users", "pins", "subscriptions", "saved_pins"]


def upgrade() -> None:
    # Supabase auto-exposes every public-schema table via its PostgREST API to
    # anyone holding the (public, frontend-bundled) anon key. RLS with no
    # policies denies that path entirely. The backend connects as the
    # privileged `postgres` role via the pooler, which bypasses RLS, so this
    # has no effect on FastAPI's own access.
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
