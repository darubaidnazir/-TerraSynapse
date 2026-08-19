"""Add overrides and planting date

Revision ID: 2b22c47225ac
Revises: 3ad6a7947d6a
Create Date: 2026-08-18 10:50:28.430792

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '2b22c47225ac'
down_revision: Union[str, Sequence[str], None] = '3ad6a7947d6a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('fields', sa.Column('planting_date', sa.DateTime(timezone=True), nullable=True))
    op.add_column('fields', sa.Column('override_ph', sa.Float(), nullable=True))
    op.add_column('fields', sa.Column('override_organic_carbon', sa.Float(), nullable=True))
    op.add_column('fields', sa.Column('override_cec', sa.Float(), nullable=True))
    op.add_column('fields', sa.Column('override_n_proxy', sa.Float(), nullable=True))

def downgrade() -> None:
    op.drop_column('fields', 'override_n_proxy')
    op.drop_column('fields', 'override_cec')
    op.drop_column('fields', 'override_organic_carbon')
    op.drop_column('fields', 'override_ph')
    op.drop_column('fields', 'planting_date')
