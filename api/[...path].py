"""Vercel Python catch-all function for the OCEANNOVA FastAPI service.

Vercel forwards /api/* requests into this ASGI application. The FastAPI
routes remain defined in ml_service.main so local and deployed behavior stay
consistent.
"""

from ml_service.main import app

__all__ = ["app"]
