
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from ..config import Settings
from ..database import Database
from ..schemas.common import OrganizationResponse
from ..schemas.organization import OrganizationCreate, OrganizationUpdate
from ..schemas.membership import OrganizationMembershipResponse
from ..services.organization_service import OrganizationService
from ..services.organization_membership_service import (
    OrganizationMembershipService,
)
from .deps import require_admin


router = APIRouter(
    prefix="/admin/organizations",
    tags=["Admin Organizations"],
)

settings = Settings.from_env()
database = Database(settings.database_url)


def to_response(item):
    return {
        "id": item.id,
        "name": item.name,
        "description": item.description,
        "contactEmail": item.contact_email,
        "phone": item.phone,
        "timezone": item.timezone,
        "address": item.address,
        "category": item.category,
        "status": item.status,
        "createdAt": item.created_at.date().isoformat(),
    }


@router.get("", response_model=list[OrganizationResponse])
def list_organizations(
    query: str | None = Query(default=None),
    status: str | None = Query(default=None),
    _: dict = Depends(require_admin),
):
    with database.session() as session:
        organizations = OrganizationService(session).list(
            query,
            status,
        )
        return [to_response(item) for item in organizations]


@router.post(
    "",
    response_model=OrganizationResponse,
    status_code=201,
)
def create_organization(
    data: OrganizationCreate,
    _: dict = Depends(require_admin),
):
    with database.session() as session:
        organization = OrganizationService(session).create(data)
        return to_response(organization)


@router.get(
    "/available",
    response_model=list[OrganizationResponse],
)
def list_available_organizations(
    query: str | None = Query(default=None),
    current_admin: dict = Depends(require_admin),
):
    """List active organizations not yet joined by this admin."""
    user_id = UUID(current_admin["userId"])

    with database.session() as session:
        organizations = OrganizationMembershipService(
            session
        ).available(user_id, query)

        return [to_response(item) for item in organizations]


@router.get(
    "/mine",
    response_model=list[OrganizationResponse],
)
def list_my_organizations(
    current_admin: dict = Depends(require_admin),
):
    """List organizations joined by the current admin."""
    user_id = UUID(current_admin["userId"])

    with database.session() as session:
        organizations = OrganizationMembershipService(
            session
        ).mine(user_id)

        return [to_response(item) for item in organizations]


@router.post(
    "/{organization_id}/join",
    response_model=OrganizationMembershipResponse,
    status_code=201,
)
def join_organization(
    organization_id: str,
    current_admin: dict = Depends(require_admin),
):
    """Join an active organization."""
    user_id = UUID(current_admin["userId"])

    with database.session() as session:
        organization, membership = OrganizationMembershipService(
            session
        ).join(organization_id, user_id)

        return {
            "organizationId": organization.id,
            "organizationName": organization.name,
            "userId": str(user_id),
            "joinedAt": membership.joined_at.isoformat(),
            "message": (
                f"You joined {organization.name} successfully."
            ),
        }


@router.get(
    "/{organization_id}",
    response_model=OrganizationResponse,
)
def get_organization(
    organization_id: str,
    _: dict = Depends(require_admin),
):
    with database.session() as session:
        organization = OrganizationService(session).get(
            organization_id
        )
        return to_response(organization)


@router.put(
    "/{organization_id}",
    response_model=OrganizationResponse,
)
def update_organization(
    organization_id: str,
    data: OrganizationUpdate,
    _: dict = Depends(require_admin),
):
    with database.session() as session:
        organization = OrganizationService(session).update(
            organization_id,
            data,
        )
        return to_response(organization)


@router.patch(
    "/{organization_id}/toggle-status",
    response_model=OrganizationResponse,
)
def toggle_organization(
    organization_id: str,
    _: dict = Depends(require_admin),
):
    with database.session() as session:
        organization = OrganizationService(session).toggle(
            organization_id
        )
        return to_response(organization)


@router.delete("/{organization_id}")
def delete_organization(
    organization_id: str,
    _: dict = Depends(require_admin),
):
    with database.session() as session:
        OrganizationService(session).delete(organization_id)

        return {
            "message": "Organization deleted successfully."
        }
