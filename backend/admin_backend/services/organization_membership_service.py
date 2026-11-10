
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..core.errors import ConflictError
from ..models.organization_membership import OrganizationMembership
from ..repositories.organization_membership_repository import (
    OrganizationMembershipRepository,
)
from ..repositories.organization_repository import (
    OrganizationRepository,
)


class OrganizationMembershipService:
    """Business rules for joining organizations."""

    def __init__(self, session: Session):
        self.session = session
        self.organizations = OrganizationRepository(session)
        self.memberships = OrganizationMembershipRepository(session)

    def join(
        self,
        organization_id: str,
        user_id: UUID,
    ):
        organization = self.organizations.get(organization_id)

        if organization.status != "active":
            raise ConflictError(
                "You can only join an active organization."
            )

        if self.memberships.get(organization_id, user_id):
            raise ConflictError(
                "You have already joined this organization."
            )

        membership = OrganizationMembership(
            organization_id=organization_id,
            user_id=user_id,
            joined_at=datetime.now(timezone.utc),
        )

        self.memberships.add(membership)

        try:
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            raise ConflictError(
                "You have already joined this organization."
            ) from exc

        self.session.refresh(membership)

        return organization, membership

    def mine(self, user_id: UUID):
        return self.memberships.list_for_user(user_id)

    def available(
        self,
        user_id: UUID,
        query: str | None = None,
    ):
        return self.memberships.list_available_for_user(
            user_id,
            query,
        )
