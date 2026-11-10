
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models.organization import Organization
from ..models.organization_membership import OrganizationMembership


class OrganizationMembershipRepository:
    def __init__(self, session: Session):
        self.session = session

    def get(
        self,
        organization_id: str,
        user_id: UUID,
    ) -> OrganizationMembership | None:
        return self.session.get(
            OrganizationMembership,
            {
                "organization_id": organization_id,
                "user_id": user_id,
            },
        )

    def add(self, membership: OrganizationMembership) -> None:
        self.session.add(membership)

    def list_for_user(
        self,
        user_id: UUID,
    ) -> list[Organization]:
        statement = (
            select(Organization)
            .join(
                OrganizationMembership,
                OrganizationMembership.organization_id
                == Organization.id,
            )
            .where(
                OrganizationMembership.user_id == user_id
            )
            .order_by(Organization.name.asc())
        )

        return list(self.session.scalars(statement))

    def list_available_for_user(
        self,
        user_id: UUID,
        query: str | None = None,
    ) -> list[Organization]:
        joined_ids = (
            select(OrganizationMembership.organization_id)
            .where(
                OrganizationMembership.user_id == user_id
            )
        )

        statement = (
            select(Organization)
            .where(
                Organization.status == "active",
                Organization.id.not_in(joined_ids),
            )
            .order_by(Organization.name.asc())
        )

        if query and query.strip():
            statement = statement.where(
                Organization.name.ilike(
                    f"%{query.strip()}%"
                )
            )

        return list(self.session.scalars(statement))
