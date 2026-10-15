import logging
import os

from fastapi import APIRouter, Header, HTTPException

logger = logging.getLogger("oceannova.real_api")
from .real_engine import ENGINE

router = APIRouter(prefix="/real", tags=["real-data"])

@router.get("/status")
def status():
    return ENGINE.status()

@router.post("/refresh")
def refresh():
    try:
        return ENGINE.get_snapshot(force=True)
    except Exception as exc:
        raise HTTPException(503, str(exc))


@router.post("/export")
def export_records(
    x_earthdata_token: str | None = Header(default=None),
    x_earthdata_username: str | None = Header(default=None),
    x_earthdata_password: str | None = Header(default=None),
    x_noaa_api_token: str | None = Header(default=None),
):
    _apply_forwarded_credentials(x_earthdata_token, x_earthdata_username, x_earthdata_password, x_noaa_api_token)
    try:
        return ENGINE.export_records()
    except Exception as exc:
        logger.exception("PACE/NOAA export failed")
        raise HTTPException(503, str(exc))

def _apply_forwarded_credentials(
    earthdata_token: str | None,
    earthdata_username: str | None,
    earthdata_password: str | None,
    noaa_api_token: str | None,
) -> None:
    """Accept credentials only from the trusted server-side Next proxy."""
    forwarded = {
        "EARTHDATA_TOKEN": earthdata_token,
        "EARTHDATA_USERNAME": earthdata_username,
        "EARTHDATA_PASSWORD": earthdata_password,
        "NOAA_API_TOKEN": noaa_api_token,
    }
    for key, value in forwarded.items():
        if value:
            os.environ[key] = value


def _anomaly_snapshot(
    earthdata_token: str | None,
    earthdata_username: str | None,
    earthdata_password: str | None,
    noaa_api_token: str | None,
):
    _apply_forwarded_credentials(
        earthdata_token,
        earthdata_username,
        earthdata_password,
        noaa_api_token,
    )
    try:
        return ENGINE.get_snapshot(force=False)
    except Exception as exc:
        logger.exception("Real anomaly snapshot failed")
        raise HTTPException(503, str(exc))


def _credential_headers(
    x_earthdata_token: str | None,
    x_earthdata_username: str | None,
    x_earthdata_password: str | None,
    x_noaa_api_token: str | None,
):
    return x_earthdata_token, x_earthdata_username, x_earthdata_password, x_noaa_api_token


@router.get("/anomalies")
def anomalies(
    x_earthdata_token: str | None = Header(default=None),
    x_earthdata_username: str | None = Header(default=None),
    x_earthdata_password: str | None = Header(default=None),
    x_noaa_api_token: str | None = Header(default=None),
):
    return _anomaly_snapshot(*_credential_headers(
        x_earthdata_token,
        x_earthdata_username,
        x_earthdata_password,
        x_noaa_api_token,
    ))


@router.get("/forecast")
def forecast(
    x_earthdata_token: str | None = Header(default=None),
    x_earthdata_username: str | None = Header(default=None),
    x_earthdata_password: str | None = Header(default=None),
    x_noaa_api_token: str | None = Header(default=None),
):
    """Compatibility alias for clients that call the service's forecast path."""
    return _anomaly_snapshot(*_credential_headers(
        x_earthdata_token,
        x_earthdata_username,
        x_earthdata_password,
        x_noaa_api_token,
    ))
