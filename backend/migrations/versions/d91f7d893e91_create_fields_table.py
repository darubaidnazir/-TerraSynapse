"""create fields table

Revision ID: d91f7d893e91
Revises: 0ee0cfeda3dd
Create Date: 2026-08-18 06:55:58.137662

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import geoalchemy2
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'd91f7d893e91'
down_revision: Union[str, Sequence[str], None] = '0ee0cfeda3dd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('fields',
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('owner_id', sa.String(), nullable=True),
    sa.Column('name', sa.String(), nullable=True),
    sa.Column('geometry', geoalchemy2.types.Geography(geometry_type='POLYGON', srid=4326, from_text='ST_GeogFromText', name='geography', nullable=False), nullable=False),
    sa.Column('area_ha', sa.Float(), nullable=True),
    sa.Column('crop_type', sa.String(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    # ### end Alembic commands ###


def downgrade() -> None:
    op.drop_table('fields')
    # ### end Alembic commands ###

