from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..core.errors import NotFoundError
from ..models.event import Event
from ..models.organization import Organization

class OrganizationRepository:
    def __init__(self, session: Session):
        self.session = session

    def list(self, query: str | None, status: str | None):
        statement = select(Organization).order_by(Organization.name.asc())
        if query:
            statement = statement.where(Organization.name.ilike(f"%{query.strip()}%"))
        if status:
            statement = statement.where(Organization.status == status)
        return list(self.session.scalars(statement))

    def get(self, organization_id: str) -> Organization:
        item = self.session.get(Organization, organization_id)
        if not item:
            raise NotFoundError("Organization not found.")
        return item

    def name_exists(self, name: str, exclude_id: str | None = None) -> bool:
        statement = select(Organization.id).where(func.lower(Organization.name) == name.strip().lower())
        if exclude_id:
            statement = statement.where(Organization.id != exclude_id)
        return self.session.scalar(statement) is not None

    def count_events(self, organization_id: str) -> int:
        return int(self.session.scalar(select(func.count(Event.id)).where(Event.organization_id == organization_id)) or 0)

    def events_for(self, organization_id: str):
        return list(self.session.scalars(select(Event).where(Event.organization_id == organization_id).order_by(Event.starts_at.asc())))
