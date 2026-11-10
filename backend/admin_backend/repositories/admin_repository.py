from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..models.admin_profile import AdminProfile

class AdminRepository:
    def __init__(self, session: Session):
        self.session = session

    def by_username_or_email(self, identity: str) -> AdminProfile | None:
        statement = select(AdminProfile).where(
            or_(AdminProfile.username == identity.strip(), AdminProfile.email.ilike(identity.strip()))
        )
        return self.session.scalar(statement)

    def by_user_id(self, user_id: UUID) -> AdminProfile | None:
        return self.session.get(AdminProfile, user_id)
