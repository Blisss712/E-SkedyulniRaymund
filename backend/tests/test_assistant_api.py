import pytest
from fastapi.testclient import TestClient

from admin_backend.assistant_app import app
from admin_backend.routes import assistant as assistant_routes
from admin_backend.routes.assistant_auth import require_identity

VALID_BODY = {
    "context": "=== MEMBER DATA ===\nMember: Derek",
    "messages": [{"role": "user", "text": "What is next?"}],
}


class FakeAssistantService:
    configured = True
    active_model = "gemini-3.6-flash"

    def answer(self, context: str, messages) -> dict:
        assert "MEMBER DATA" in context
        assert messages[-1].text == "What is next?"
        return {"answer": "Test answer", "model": "gemini-3.6-flash"}


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(assistant_routes, "assistant_service", FakeAssistantService())
    app.dependency_overrides[require_identity] = lambda: "test-user"
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_health_reports_the_server_key_status(client):
    response = client.get("/member/assistant/health")

    assert response.status_code == 200
    body = response.json()
    assert body["configured"] is True
    assert body["model"] == "gemini-3.6-flash"
    assert "fallbackModels" in body


def test_chat_requires_a_signed_in_member(client):
    app.dependency_overrides.clear()

    response = TestClient(app).post("/member/assistant/chat", json=VALID_BODY)

    assert response.status_code == 401
    assert response.json()["detail"]


def test_chat_returns_the_model_answer(client):
    response = client.post("/member/assistant/chat", json=VALID_BODY)

    assert response.status_code == 200
    assert response.json() == {
        "answer": "Test answer",
        "model": "gemini-3.6-flash",
    }


def test_chat_rejects_an_empty_body(client):
    response = client.post("/member/assistant/chat", json={})

    assert response.status_code == 422
