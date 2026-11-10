from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy.orm import Session

from ..core.errors import ConflictError
from ..core.timekeeping import get_zone
from ..core.validation import raise_duplicate
from ..repositories.organization_repository import OrganizationRepository
from ..schemas.organization import OrganizationCreate, OrganizationUpdate
from ..models.organization import Organization

class OrganizationService:
    def __init__(self, session: Session):
        self.session = session
        self.repo = OrganizationRepository(session)

    def list(self, query, status):
        return self.repo.list(query, status)

    def get(self, organization_id):
        return self.repo.get(organization_id)

    def create(self, data: OrganizationCreate):
        if self.repo.name_exists(data.name):
            raise_duplicate("An organization with this name already exists.")
        item = Organization(
            id=uuid4().hex,
            name=data.name.strip(),
            description=data.description.strip(),
            contact_email=str(data.contactEmail),
            phone=data.phone.strip(),
            timezone=data.timezone.strip(),
            address=data.address.strip(),
            category=data.category.strip() or "General",
            status=data.status,
            created_at=datetime.now(timezone.utc),
        )
        get_zone(item.timezone)
        self.session.add(item)
        self.session.commit()
        return item

    def update(self, organization_id, data: OrganizationUpdate):
        item = self.repo.get(organization_id)
        if self.repo.name_exists(data.name, organization_id):
            raise_duplicate("An organization with this name already exists.")
        get_zone(data.timezone)
        item.name = data.name.strip()
        item.description = data.description.strip()
        item.contact_email = str(data.contactEmail)
        item.phone = data.phone.strip()
        item.timezone = data.timezone.strip()
        item.address = data.address.strip()
        item.category = data.category.strip() or "General"
        item.status = data.status
        self.session.commit()
        return item

    def toggle(self, organization_id):
        item = self.repo.get(organization_id)
        item.status = "inactive" if item.status == "active" else "active"
        self.session.commit()
        return item

    def delete(self, organization_id):
        item = self.repo.get(organization_id)
        if self.repo.count_events(organization_id):
            raise ConflictError("This organization still has events. Delete or move those events before deleting the organization.")
        self.session.delete(item)
        self.session.commit()
