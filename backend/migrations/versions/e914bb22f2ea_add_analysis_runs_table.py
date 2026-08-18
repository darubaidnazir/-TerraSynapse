"""add analysis_runs table

Revision ID: e914bb22f2ea
Revises: d91f7d893e91
Create Date: 2026-08-18 07:09:29.955537

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'e914bb22f2ea'
down_revision: Union[str, Sequence[str], None] = 'd91f7d893e91'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('analysis_runs',
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('field_id', sa.UUID(), nullable=False),
    sa.Column('run_date', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.Column('acquisition_date', sa.String(), nullable=True),
    sa.Column('cloud_cover_pct', sa.Float(), nullable=True),
    sa.Column('indices', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('health_score_pct', sa.Float(), nullable=True),
    sa.Column('recommendations', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('status', sa.String(), nullable=True),
    sa.Column('job_id', sa.String(), nullable=True),
    sa.ForeignKeyConstraint(['field_id'], ['fields.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    # ### end Alembic commands ###


def downgrade() -> None:
    op.drop_table('analysis_runs')
    # ### end Alembic commands ###

