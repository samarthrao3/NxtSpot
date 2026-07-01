"""add category to pins

Revision ID: d5e6f7a8b9c0
Revises: b2d4f1e8a6c3
Create Date: 2026-07-01

"""
from alembic import op
import sqlalchemy as sa

revision = "d5e6f7a8b9c0"
down_revision = "b2d4f1e8a6c3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("pins", sa.Column("category", sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column("pins", "category")
