"""initial schema

Revision ID: a4f8c102b8e1
Revises:
Create Date: 2026-06-24

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "a4f8c102b8e1"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=True),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("handle", sa.Text(), nullable=True),
        sa.Column("avatar_url", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("email"),
        sa.UniqueConstraint("handle"),
    )

    op.create_table(
        "pins",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("influencer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("restaurant_name", sa.Text(), nullable=False),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("lng", sa.Float(), nullable=False),
        sa.Column("photos", postgresql.ARRAY(sa.Text()), nullable=False),
        sa.Column("vibe_tag", sa.String(length=50), nullable=True),
        sa.Column("price_range", sa.String(length=10), nullable=True),
        sa.Column("must_order", sa.Text(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("rating", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["influencer_id"], ["users.id"], ondelete="CASCADE"),
    )

    op.create_table(
        "subscriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("influencer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["influencer_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", "influencer_id"),
    )

    op.create_table(
        "saved_pins",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("pin_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("saved_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["pin_id"], ["pins.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "pin_id"),
    )

    op.create_index("idx_pins_influencer_id", "pins", ["influencer_id"])
    op.create_index(
        "idx_pins_location",
        "pins",
        [sa.text("ST_SetSRID(ST_MakePoint(lng, lat), 4326)")],
        postgresql_using="gist",
    )
    op.create_index("idx_subscriptions_user_id", "subscriptions", ["user_id"])
    op.create_index("idx_saved_pins_user_id", "saved_pins", ["user_id"])


def downgrade() -> None:
    op.drop_index("idx_saved_pins_user_id", table_name="saved_pins")
    op.drop_index("idx_subscriptions_user_id", table_name="subscriptions")
    op.drop_index("idx_pins_location", table_name="pins")
    op.drop_index("idx_pins_influencer_id", table_name="pins")

    op.drop_table("saved_pins")
    op.drop_table("subscriptions")
    op.drop_table("pins")
    op.drop_table("users")
