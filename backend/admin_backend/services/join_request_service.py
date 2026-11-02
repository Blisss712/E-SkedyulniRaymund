from datetime import datetime, timezone
from uuid import uuid4
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.errors import NotFoundError
from ..models.join_request import OrganizationJoinRequest
from ..schemas.join_request import JoinRequestCreate


class JoinRequestService:
    def __init__(self, session: Session):
        self.session = session

    def list(self, status: str | None = None):
        query = select(OrganizationJoinRequest).order_by(
            OrganizationJoinRequest.requested_at.desc()
        )
        if status:
            query = query.where(OrganizationJoinRequest.status == status)
        return list(self.session.scalars(query))

    def create(self, data: JoinRequestCreate):
        item = OrganizationJoinRequest(
            id=uuid4().hex,
            member_name=data.memberName.strip(),
            group_code=data.groupCode.strip(),
            group_name=data.groupName.strip(),
            status="pending",
            requested_at=datetime.now(timezone.utc),
        )
        self.session.add(item)
        self.session.commit()
        return item

    def get(self, request_id: str):
        item = self.session.get(OrganizationJoinRequest, request_id)
        if not item:
            raise NotFoundError("Join request not found.")
        return item

    def update_status(self, request_id: str, status: str, reviewer_id: str):
        item = self.session.get(OrganizationJoinRequest, request_id)
        if not item:
            raise NotFoundError("Join request not found.")
        item.status = status
        item.reviewed_at = datetime.now(timezone.utc)
        item.reviewed_by = UUID(reviewer_id)
        self.session.commit()
        return item
