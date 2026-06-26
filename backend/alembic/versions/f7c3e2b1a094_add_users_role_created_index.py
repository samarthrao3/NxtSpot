"""add users role created_at index

Revision ID: f7c3e2b1a094
Revises: e3b2a1c9d845
Create Date: 2026-06-26

"""
from alembic import op

revision = "f7c3e2b1a094"
down_revision = "e3b2a1c9d845"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Covers WHERE role = 'influencer' ORDER BY created_at DESC on the list endpoint
    op.create_index(
        "idx_users_role_created",
        "users",
        ["role", "created_at"],
        postgresql_ops={"created_at": "DESC"},
    )


def downgrade() -> None:
    op.drop_index("idx_users_role_created", table_name="users")
