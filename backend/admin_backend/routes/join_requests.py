from fastapi import APIRouter, Depends, Query

from ..config import Settings
from ..database import Database
from ..schemas.join_request import (
    JoinRequestCreate,
    JoinRequestStatusUpdate,
    JoinRequestView,
)
from ..services.join_request_service import JoinRequestService
from .deps import require_admin

public_router = APIRouter(prefix="/join-requests", tags=["Join Requests"])
admin_router = APIRouter(prefix="/admin/join-requests", tags=["Admin Join Requests"])
settings = Settings.from_env()
database = Database(settings.database_url)


def to_response(item):
    return {
        "id": item.id,
        "memberName": item.member_name,
        "groupCode": item.group_code,
        "groupName": item.group_name,
        "status": item.status,
        "requestedAt": item.requested_at,
        "reviewedAt": item.reviewed_at,
    }


@public_router.post("", response_model=JoinRequestView, status_code=201)
def create_join_request(data: JoinRequestCreate):
    with database.session() as session:
        return to_response(JoinRequestService(session).create(data))


@public_router.get("/{request_id}", response_model=JoinRequestView)
def get_join_request(request_id: str):
    with database.session() as session:
        return to_response(JoinRequestService(session).get(request_id))


@admin_router.get("", response_model=list[JoinRequestView])
def list_join_requests(
    status: str | None = Query(default=None),
    _: dict = Depends(require_admin),
):
    with database.session() as session:
        return [to_response(item) for item in JoinRequestService(session).list(status)]


@admin_router.patch("/{request_id}", response_model=JoinRequestView)
def update_join_request(
    request_id: str,
    data: JoinRequestStatusUpdate,
    admin: dict = Depends(require_admin),
):
    with database.session() as session:
        return to_response(
            JoinRequestService(session).update_status(
                request_id,
                data.status,
                admin["userId"],
            )
        )
