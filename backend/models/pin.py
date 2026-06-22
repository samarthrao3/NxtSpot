import uuid
from datetime import datetime

from sqlalchemy import ARRAY, Float, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base


class Pin(Base):
    __tablename__ = "pins"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    influencer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    restaurant_name: Mapped[str] = mapped_column(Text, nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    photos: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    vibe_tag: Mapped[str | None] = mapped_column(String(50))
    price_range: Mapped[str | None] = mapped_column(String(10))
    must_order: Mapped[str | None] = mapped_column(Text)
    note: Mapped[str | None] = mapped_column(Text)
    rating: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    influencer: Mapped["User"] = relationship("User", back_populates="pins")  # type: ignore[name-defined]
