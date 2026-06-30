"""add pins extended fields

Revision ID: b2d4f1e8a6c3
Revises: f7c3e2b1a094
Create Date: 2026-06-29

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "b2d4f1e8a6c3"
down_revision = "f7c3e2b1a094"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("pins", sa.Column("price_per_head", sa.String(length=20), nullable=True))
    op.add_column("pins", sa.Column("cuisine_tags", postgresql.ARRAY(sa.Text()), nullable=True))
    op.add_column("pins", sa.Column("reasoning", postgresql.ARRAY(sa.Text()), nullable=True))
    op.add_column("pins", sa.Column("must_order_dishes", postgresql.ARRAY(sa.Text()), nullable=True))
    op.add_column("pins", sa.Column("insider_tip", sa.Text(), nullable=True))
    op.add_column("pins", sa.Column("would_return", sa.String(length=20), nullable=True))
    op.add_column("pins", sa.Column("best_time", sa.String(length=40), nullable=True))
    op.add_column("pins", sa.Column("best_for", postgresql.ARRAY(sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column("pins", "best_for")
    op.drop_column("pins", "best_time")
    op.drop_column("pins", "would_return")
    op.drop_column("pins", "insider_tip")
    op.drop_column("pins", "must_order_dishes")
    op.drop_column("pins", "reasoning")
    op.drop_column("pins", "cuisine_tags")
    op.drop_column("pins", "price_per_head")
