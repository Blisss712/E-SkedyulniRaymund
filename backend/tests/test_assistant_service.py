import json

import httpx
import pytest

from admin_backend.config import Settings
from admin_backend.core.errors import ServiceUnavailableError
from admin_backend.services.assistant_service import AssistantService


class Turn:
    def __init__(self, role: str, text: str):
        self.role = role
        self.text = text


def make_settings(**overrides) -> Settings:
    values = {
        "database_url": "",
        "supabase_url": "",
        "supabase_publishable_key": "",
        "supabase_secret_key": "",
        "admin_username": "admin",
        "cors_origins": ("http://localhost:8443",),
        "auto_create_tables": False,
        "gemini_api_key": "test-key",
        "gemini_model": "gemini-3.6-flash",
        "gemini_fallback_models": ("gemini-3.5-flash-lite",),
        "gemini_api_base": "https://gemini.test/v1beta",
    }
    values.update(overrides)
    return Settings(**values)


def model_from(request: httpx.Request) -> str:
    return str(request.url).split("/models/")[1].split(":")[0]


def answer_payload(text: str, thought: str | None = None) -> dict:
    parts = [{"text": text}]
    if thought:
        parts.append({"text": thought, "thought": True})
    return {
        "candidates": [
            {"content": {"parts": parts}, "finishReason": "STOP"}
        ]
    }


def test_falls_back_to_the_next_free_model_when_capacity_is_busy():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        model = model_from(request)
        assert request.headers["x-goog-api-key"] == "test-key"

        if model == "gemini-3.6-flash":
            return httpx.Response(
                503,
                json={"error": {"message": "This model is experiencing high demand"}},
            )

        body = json.loads(request.content)
        system = body["systemInstruction"]["parts"][0]["text"]
        assert "Choir Rehearsal" in system
        assert body["contents"][-1]["parts"][0]["text"] == "What's next?"
        return httpx.Response(
            200,
            json=answer_payload("**Choir** rehearsal at 6 PM.", "internal thought"),
        )

    service = AssistantService(make_settings(), transport=httpx.MockTransport(handler))
    result = service.answer(
        "=== MEMBER DATA ===\nChoir Rehearsal at 6 PM",
        [Turn("model", "Hi!"), Turn("user", "What's next?")],
    )

    assert result == {
        "answer": "Choir rehearsal at 6 PM.",
        "model": "gemini-3.5-flash-lite",
    }
    assert service.active_model == "gemini-3.5-flash-lite"
    assert [model_from(call) for call in calls] == [
        "gemini-3.6-flash",
        "gemini-3.5-flash-lite",
    ]


def test_reuses_the_model_that_worked_last_time():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(200, json=answer_payload("OK"))

    service = AssistantService(make_settings(), transport=httpx.MockTransport(handler))
    service.answer("data", [Turn("user", "First")])
    service.answer("data", [Turn("user", "Second")])

    assert [model_from(call) for call in calls] == [
        "gemini-3.6-flash",
        "gemini-3.6-flash",
    ]
    assert service.active_model == "gemini-3.6-flash"


def test_rejects_an_invalid_server_key_without_trying_fallbacks():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(401, json={"error": {"message": "API key not valid"}})

    service = AssistantService(make_settings(), transport=httpx.MockTransport(handler))

    with pytest.raises(ServiceUnavailableError) as error:
        service.answer("data", [Turn("user", "Hello")])

    assert "GEMINI_API_KEY" in error.value.message
    assert [model_from(call) for call in calls] == ["gemini-3.6-flash"]


def test_reports_when_the_assistant_has_no_key():
    service = AssistantService(
        make_settings(gemini_api_key=""),
        transport=httpx.MockTransport(
            lambda request: httpx.Response(200, json=answer_payload("unused"))
        ),
    )

    with pytest.raises(ServiceUnavailableError) as error:
        service.answer("data", [Turn("user", "Hello")])

    assert "GEMINI_API_KEY" in error.value.message


def test_all_busy_models_produce_a_friendly_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"error": {"message": "high demand"}})

    service = AssistantService(make_settings(), transport=httpx.MockTransport(handler))

    with pytest.raises(ServiceUnavailableError) as error:
        service.answer("data", [Turn("user", "Hello")])

    assert "busy" in error.value.message.lower()
