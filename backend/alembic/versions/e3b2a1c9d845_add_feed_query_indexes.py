"""add feed query indexes

Revision ID: e3b2a1c9d845
Revises: c1a9d4e7f203
Create Date: 2026-06-26

"""
from alembic import op

revision = "e3b2a1c9d845"
down_revision = "c1a9d4e7f203"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Composite index for the feed window function (partition by influencer_id, order by created_at)
    op.create_index(
        "idx_pins_influencer_created",
        "pins",
        ["influencer_id", "created_at"],
        postgresql_ops={"created_at": "DESC"},
    )
    # Index for _invalidate_follower_feeds which queries subscriptions by influencer_id
    op.create_index(
        "idx_subscriptions_influencer_id",
        "subscriptions",
        ["influencer_id"],
    )


def downgrade() -> None:
    op.drop_index("idx_subscriptions_influencer_id", table_name="subscriptions")
    op.drop_index("idx_pins_influencer_created", table_name="pins")
