import os
from datetime import date, datetime, time, timezone
from uuid import uuid4

os.environ.setdefault("DATABASE_URL", "sqlite://")

from fastapi.testclient import TestClient

from admin_backend.app import app
from admin_backend.database import Database
from admin_backend.models.member_data import Notification, VolunteerSlot
from admin_backend.models.admin_profile import AdminProfile
from admin_backend.models.join_request import OrganizationJoinRequest
from admin_backend.models.member_organization import OrganizationMemberAccount
from admin_backend.models.member_profile import MemberProfile
from admin_backend.models.organization import Organization
from admin_backend.routes import deps, member as member_routes
from admin_backend.routes import join_requests as join_request_routes
from admin_backend.schemas.join_request import JoinRequestCreate
from admin_backend.services.join_request_service import JoinRequestService


def test_member_endpoints_are_authenticated():
    response = TestClient(app).get("/member/availability")
    assert response.status_code == 401


def test_member_availability_and_slot_capacity_are_scoped(tmp_path, monkeypatch):
    database = Database(f"sqlite:///{tmp_path / 'members.db'}")
    database.create_tables()
    original_database = member_routes.database
    original_auth_database = deps.database
    member_routes.database = database
    deps.database = database

    member_id = uuid4()
    another_member_id = uuid4()
    current_member_id = [member_id]
    slot_id = uuid4().hex

    with database.session() as session:
        session.add_all(
            [
                MemberProfile(
                    user_id=member_id,
                    email="member@example.test",
                    full_name="Test Member",
                    active=True,
                    created_at=datetime.now(timezone.utc),
                ),
                MemberProfile(
                    user_id=another_member_id,
                    email="other@example.test",
                    full_name="Other Member",
                    active=True,
                    created_at=datetime.now(timezone.utc),
                ),
                Organization(
                    id="test-org",
                    name="Test Organization",
                    description="",
                    contact_email="test@example.test",
                    phone="",
                    timezone="Asia/Manila",
                    address="",
                    category="Test",
                    status="active",
                    created_at=datetime.now(timezone.utc),
                ),
            ]
        )
        session.commit()
        session.add(
            VolunteerSlot(
                id=slot_id,
                organization_id="test-org",
                slot_date=date(2026, 12, 1),
                slot_time=time(9, 0),
                mass_name="Test Mass",
                total_spots=1,
                created_at=datetime.now(timezone.utc),
            )
        )
        session.commit()

    client = TestClient(app)
    client.headers["Authorization"] = "Bearer test-token"
    monkeypatch.setattr(
        deps.auth_service,
        "verify_member",
        lambda session, token: session.get(MemberProfile, current_member_id[0]),
    )

    try:
        saved = client.put(
            "/member/availability/recurring",
            json={
                "id": "weekly",
                "days": ["Sun", "Sun"],
                "startTime": "09:00",
                "endTime": "10:00",
            },
        )
        assert saved.status_code == 200, saved.text
        assert saved.json()["days"] == ["Sun"]
        assert client.get("/member/availability").json()["recurring"][0]["id"] == "weekly"

        assert client.post(f"/member/slots/{slot_id}/signup").status_code == 201
        assert client.get("/member/slots").json()[0]["status"] == "serving"
        assert client.post(f"/member/slots/{slot_id}/signup").status_code == 409

        with database.session() as session:
            session.add(
                Notification(
                    id=uuid4(),
                    user_id=another_member_id,
                    title="Private",
                    message="Do not expose",
                    kind="schedule",
                    created_at=datetime.now(timezone.utc),
                )
            )
            session.commit()
        assert client.get("/member/notifications").json() == []

        current_member_id[0] = another_member_id
        assert client.get("/member/availability").json()["recurring"] == []
        stolen_entry = client.put(
            "/member/availability/recurring",
            json={
                "id": "weekly",
                "days": ["Mon"],
                "startTime": "09:00",
                "endTime": "10:00",
            },
        )
        assert stolen_entry.status_code == 409

        full_slot = client.post(f"/member/slots/{slot_id}/signup")
        assert full_slot.status_code == 409

        notification = client.post(
            "/member/notifications",
            json={
                "title": "Schedule update",
                "message": "A test update.",
                "kind": "schedule",
            },
        )
        assert notification.status_code == 201
        notification_id = notification.json()["id"]
        marked = client.patch(f"/member/notifications/{notification_id}/read")
        assert marked.status_code == 200
        assert marked.json()["readAt"] is not None
    finally:
        member_routes.database = original_database
        deps.database = original_auth_database
        database.dispose()


def test_join_request_uses_real_group_code_and_approval_adds_membership(tmp_path):
    database = Database(f"sqlite:///{tmp_path / 'join-requests.db'}")
    database.create_tables()
    member_id = uuid4()
    admin_id = uuid4()
    with database.session() as session:
        session.add_all(
            [
                MemberProfile(
                    user_id=member_id,
                    email="member@example.test",
                    full_name="Test Member",
                    active=True,
                    created_at=datetime.now(timezone.utc),
                ),
                AdminProfile(
                    user_id=admin_id,
                    username="test-admin",
                    email="admin@example.test",
                    full_name="Test Admin",
                    role="admin",
                    active=True,
                    created_at=datetime.now(timezone.utc),
                ),
                Organization(
                    id="choir",
                    name="Parish Choir",
                    description="",
                    contact_email="choir@example.test",
                    phone="",
                    timezone="Asia/Manila",
                    address="",
                    category="Ministry",
                    status="active",
                    join_code="CHOIR-123",
                    created_at=datetime.now(timezone.utc),
                ),
            ]
        )
        session.commit()

        service = JoinRequestService(session)
        organization = service.find_organization_by_code("choir-123")
        assert organization.id == "choir"

        request, request_organization = service.create(
            JoinRequestCreate(memberName="Test Member", groupCode="choir-123"),
            member_id,
        )
        assert request_organization.name == "Parish Choir"
        assert request.submitted_join_code == "CHOIR-123"

        reviewed, _ = service.update_status(
            request.id,
            "approved",
            str(admin_id),
        )
        assert reviewed.status == "approved"
        assert reviewed.reviewed_by == admin_id
        assert session.get(
            OrganizationMemberAccount,
            {"organization_id": "choir", "user_id": member_id},
        )
        assert session.get(OrganizationJoinRequest, request.id).organization_id == "choir"
    database.dispose()


def test_join_request_api_lookup_submission_and_admin_approval(tmp_path, monkeypatch):
    database = Database(f"sqlite:///{tmp_path / 'join-request-api.db'}")
    database.create_tables()
    monkeypatch.setattr(member_routes, "database", database)
    monkeypatch.setattr(join_request_routes, "database", database)
    monkeypatch.setattr(deps, "database", database)

    member_id = uuid4()
    admin_id = uuid4()
    with database.session() as session:
        session.add_all(
            [
                MemberProfile(
                    user_id=member_id,
                    email="member@example.test",
                    full_name="Test Member",
                    active=True,
                    created_at=datetime.now(timezone.utc),
                ),
                AdminProfile(
                    user_id=admin_id,
                    username="test-admin",
                    email="admin@example.test",
                    full_name="Test Admin",
                    role="admin",
                    active=True,
                    created_at=datetime.now(timezone.utc),
                ),
                Organization(
                    id="choir",
                    name="Parish Choir",
                    description="",
                    contact_email="choir@example.test",
                    phone="",
                    timezone="Asia/Manila",
                    address="",
                    category="Ministry",
                    status="active",
                    join_code="CHOIR-123",
                    created_at=datetime.now(timezone.utc),
                ),
            ]
        )
        session.commit()

    monkeypatch.setattr(
        deps.auth_service,
        "verify_member",
        lambda session, token: session.get(MemberProfile, member_id),
    )
    monkeypatch.setattr(
        deps.auth_service,
        "verify",
        lambda session, token: session.get(AdminProfile, admin_id),
    )
    client = TestClient(app)
    client.headers["Authorization"] = "Bearer member-token"

    group = client.get("/member/join-requests/groups/choir-123")
    assert group.status_code == 200
    assert group.json() == {
        "id": "choir",
        "name": "Parish Choir",
        "category": "Ministry",
    }

    created = client.post(
        "/member/join-requests",
        json={"memberName": "Test Member", "groupCode": "choir-123"},
    )
    assert created.status_code == 201, created.text
    request_id = created.json()["id"]
    assert created.json()["groupName"] == "Parish Choir"

    pending = client.get(f"/member/join-requests/{request_id}")
    assert pending.status_code == 200
    assert pending.json()["status"] == "pending"

    client.headers["Authorization"] = "Bearer admin-token"
    queue = client.get("/admin/join-requests")
    assert queue.status_code == 200
    assert queue.json()[0]["groupCode"] == "CHOIR-123"

    approved = client.patch(
        f"/admin/join-requests/{request_id}",
        json={"status": "approved"},
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"
    with database.session() as session:
        assert session.get(
            OrganizationMemberAccount,
            {"organization_id": "choir", "user_id": member_id},
        )
    database.dispose()
