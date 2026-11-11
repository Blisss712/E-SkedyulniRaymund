"""Route package.

`api_router` is loaded lazily so a lightweight entry point (the assistant-only
server) can import one route module without pulling in the database-backed
admin/member routes.
"""

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import APIRouter

__all__ = ["api_router"]


def __getattr__(name: str):
    if name == "api_router":
        from .router import api_router as router

        globals()["api_router"] = router
        return router
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
