"""add index_thresholds table

Revision ID: 3ad6a7947d6a
Revises: e914bb22f2ea
Create Date: 2026-08-18 07:12:55.351399

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '3ad6a7947d6a'
down_revision: Union[str, Sequence[str], None] = 'e914bb22f2ea'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('index_thresholds',
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('crop_type', sa.String(), nullable=False),
    sa.Column('index_name', sa.String(), nullable=False),
    sa.Column('poor_max', sa.Float(), nullable=True),
    sa.Column('moderate_max', sa.Float(), nullable=True),
    sa.Column('weight', sa.Float(), nullable=True),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('crop_type', 'index_name', name='uix_crop_index')
    )
    # ### end Alembic commands ###


def downgrade() -> None:
    op.drop_table('index_thresholds')
    # ### end Alembic commands ###

