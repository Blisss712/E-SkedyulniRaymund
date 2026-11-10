from datetime import datetime, timezone
from uuid import uuid4, UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..core.errors import ConflictError, NotFoundError
from ..models.member_organization import OrganizationMemberAccount
from ..models.join_request import OrganizationJoinRequest
from ..models.member_profile import MemberProfile
from ..models.organization import Organization
from ..schemas.join_request import JoinRequestCreate


class JoinRequestService:
    def __init__(self, session: Session):
        self.session = session

    def list(self, status: str | None = None):
        query = (
            select(OrganizationJoinRequest, Organization)
            .join(
                Organization,
                Organization.id == OrganizationJoinRequest.organization_id,
            )
            .order_by(OrganizationJoinRequest.requested_at.desc())
        )
        if status:
            query = query.where(OrganizationJoinRequest.status == status)
        return list(self.session.execute(query).all())

    def find_organization_by_code(self, group_code: str) -> Organization:
        code = group_code.strip().upper()
        organization = self.session.scalar(
            select(Organization).where(
                func.upper(Organization.join_code) == code,
                Organization.status == "active",
            )
        )
        if not organization:
            raise NotFoundError("No active organization uses that join code.")
        return organization

    def create(self, data: JoinRequestCreate, member_id: UUID):
        profile = self.session.get(MemberProfile, member_id)
        if not profile or not profile.active:
            raise NotFoundError("Active member profile not found.")
        organization = self.find_organization_by_code(data.groupCode)
        membership = self.session.get(
            OrganizationMemberAccount,
            {"organization_id": organization.id, "user_id": member_id},
        )
        if membership:
            raise ConflictError("You already belong to this organization.")
        pending = self.session.scalar(
            select(OrganizationJoinRequest).where(
                OrganizationJoinRequest.organization_id == organization.id,
                OrganizationJoinRequest.member_user_id == member_id,
                OrganizationJoinRequest.status == "pending",
            )
        )
        if pending:
            raise ConflictError("Your request to join this organization is already pending.")
        item = OrganizationJoinRequest(
            id=f"req-{uuid4().hex[:12]}",
            organization_id=organization.id,
            member_user_id=member_id,
            member_name=data.memberName.strip(),
            submitted_join_code=data.groupCode.strip().upper(),
            status="pending",
            requested_at=datetime.now(timezone.utc),
            reviewer_note="",
        )
        self.session.add(item)
        self.session.commit()
        return item, organization

    def get(self, request_id: str, member_id: UUID | None = None):
        item = self.session.get(OrganizationJoinRequest, request_id)
        if not item or (member_id and item.member_user_id != member_id):
            raise NotFoundError("Join request not found.")
        organization = self.session.get(Organization, item.organization_id)
        return item, organization

    def update_status(self, request_id: str, status: str, reviewer_id: str):
        item = self.session.get(OrganizationJoinRequest, request_id)
        if not item:
            raise NotFoundError("Join request not found.")
        if item.status != "pending" and item.status != status:
            raise ConflictError("This join request has already been reviewed.")
        admin_id = UUID(reviewer_id)
        if status == "approved":
            if not item.member_user_id:
                raise ConflictError("This request is not linked to a member account.")
            member = self.session.get(MemberProfile, item.member_user_id)
            if not member or not member.active:
                raise ConflictError("This member account is no longer active.")
            membership = self.session.get(
                OrganizationMemberAccount,
                {
                    "organization_id": item.organization_id,
                    "user_id": item.member_user_id,
                },
            )
            if not membership:
                self.session.add(
                    OrganizationMemberAccount(
                        organization_id=item.organization_id,
                        user_id=item.member_user_id,
                        joined_at=datetime.now(timezone.utc),
                    )
                )
        item.status = status
        item.reviewed_at = datetime.now(timezone.utc)
        item.reviewed_by = admin_id
        self.session.commit()
        organization = self.session.get(Organization, item.organization_id)
        return item, organization
