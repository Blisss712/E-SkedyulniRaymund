from uuid import UUID

from fastapi import APIRouter, Depends, Query

from ..config import Settings
from ..database import Database
from ..schemas.join_request import (
    JoinRequestCreate,
    JoinRequestStatusUpdate,
    JoinRequestView,
)
from ..services.join_request_service import JoinRequestService
from .deps import require_admin, require_member

member_router = APIRouter(prefix="/member/join-requests", tags=["Member Join Requests"])
admin_router = APIRouter(prefix="/admin/join-requests", tags=["Admin Join Requests"])
settings = Settings.from_env()
database = Database(settings.database_url)


def to_response(item, organization):
    return {
        "id": item.id,
        "memberName": item.member_name,
        "groupCode": item.submitted_join_code,
        "groupName": organization.name,
        "status": item.status,
        "requestedAt": item.requested_at,
        "reviewedAt": item.reviewed_at,
    }


@member_router.get("/groups/{group_code}")
def lookup_group(group_code: str, _: dict = Depends(require_member)):
    with database.session() as session:
        organization = JoinRequestService(session).find_organization_by_code(group_code)
        return {"id": organization.id, "name": organization.name, "category": organization.category}


@member_router.post("", response_model=JoinRequestView, status_code=201)
def create_join_request(
    data: JoinRequestCreate, member: dict = Depends(require_member)
):
    with database.session() as session:
        item, organization = JoinRequestService(session).create(
            data, UUID(member["userId"])
        )
        return to_response(item, organization)


@member_router.get("/{request_id}", response_model=JoinRequestView)
def get_join_request(request_id: str, member: dict = Depends(require_member)):
    with database.session() as session:
        item, organization = JoinRequestService(session).get(
            request_id, UUID(member["userId"])
        )
        return to_response(item, organization)


@admin_router.get("", response_model=list[JoinRequestView])
def list_join_requests(
    status: str | None = Query(default=None),
    _: dict = Depends(require_admin),
):
    with database.session() as session:
        return [
            to_response(item, organization)
            for item, organization in JoinRequestService(session).list(status)
        ]


@admin_router.patch("/{request_id}", response_model=JoinRequestView)
def update_join_request(
    request_id: str,
    data: JoinRequestStatusUpdate,
    admin: dict = Depends(require_admin),
):
    with database.session() as session:
        item, organization = JoinRequestService(session).update_status(
            request_id,
            data.status,
            admin["userId"],
        )
        return to_response(item, organization)
