from fastapi import APIRouter, Depends

from ..config import Settings
from ..schemas.assistant import AssistantChatInput
from ..services.assistant_service import AssistantService
from .assistant_auth import require_identity

router = APIRouter(prefix="/member/assistant", tags=["Member Assistant"])
settings = Settings.from_env()
assistant_service = AssistantService(settings)


@router.get("/health")
def assistant_health():
    """Lets the app show whether the server has a Gemini key, without asking for one."""
    return {
        "configured": assistant_service.configured,
        "model": settings.gemini_model,
        "fallbackModels": list(settings.gemini_fallback_models),
        "activeModel": assistant_service.active_model,
    }


@router.post("/chat")
def assistant_chat(
    data: AssistantChatInput,
    _: str = Depends(require_identity),
):
    return assistant_service.answer(data.context, data.messages)
