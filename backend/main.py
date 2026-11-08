"""YT Downloader — FastAPI backend.

Local run:  python main.py   (from the backend/ directory)
Deployed:   gunicorn main:app --workers 1 --worker-class uvicorn.workers.UvicornWorker ...
"""

from __future__ import annotations

import logging
import os
from urllib.parse import quote

import yt_dlp
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, field_validator
from starlette.background import BackgroundTask

from services import downloader
from services.downloader import _friendly_error, mark_delivered, sanitize_filename, take_file
from services.youtube import analyze
from utils import is_ffmpeg_available, is_youtube_url

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("yt_downloader")

app = FastAPI(title="YT Downloader API", version="1.2.0")

_DEFAULT_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
]


def _cors_origins() -> list[str]:
    """CORS origins from CORS_ORIGINS env (comma-separated) or local dev list."""
    raw = (os.getenv("CORS_ORIGINS") or "").strip()
    if raw:
        return [origin.strip() for origin in raw.split(",") if origin.strip()]
    return _DEFAULT_CORS_ORIGINS


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    url: str = Field(..., min_length=5, max_length=2048)

    @field_validator("url")
    @classmethod
    def _validate_url(cls, value: str) -> str:
        if not is_youtube_url(value):
            raise ValueError("Not a valid YouTube URL")
        return value


class DownloadRequest(BaseModel):
    url: str = Field(..., min_length=5, max_length=2048)
    type: str = Field(..., pattern="^(video|audio)$")
    quality: str = Field(..., min_length=1, max_length=20)
    output_format: str = Field(..., min_length=1, max_length=10)

    @field_validator("url")
    @classmethod
    def _validate_url(cls, value: str) -> str:
        if not is_youtube_url(value):
            raise ValueError("Not a valid YouTube URL")
        return value

    @field_validator("output_format")
    @classmethod
    def _validate_output_format(cls, value: str, info) -> str:
        media_type = info.data.get("type")
        allowed = ("mp4",) if media_type == "video" else ("mp3", "m4a")
        if value not in allowed:
            raise ValueError(f"output_format must be one of {allowed} for type={media_type}")
        return value


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "ffmpeg_available": is_ffmpeg_available(),
        "version": "1.2.0",
    }


@app.post("/api/analyze")
def analyze_endpoint(request: AnalyzeRequest) -> dict:
    try:
        return analyze(request.url)
    except yt_dlp.utils.DownloadError as exc:
        raise HTTPException(status_code=422, detail=_friendly_error(str(exc)))
    except Exception as exc:  # noqa: BLE001
        logger.exception("Analyze failed")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {exc}")


@app.post("/api/download")
def download_endpoint(request: DownloadRequest) -> dict:
    # FFmpeg is only *required* for merging (video) and MP3 conversion.
    # Native-M4A audio can be saved without it.
    needs_ffmpeg = request.type == "video" or request.output_format == "mp3"
    if needs_ffmpeg and not is_ffmpeg_available():
        raise HTTPException(
            status_code=503,
            detail=(
                "FFmpeg is not installed or not on PATH. It is required for merging "
                "video/audio and converting audio. Install FFmpeg and restart the backend."
            ),
        )
    state = downloader.start_download(
        url=request.url,
        media_type=request.type,
        quality=request.quality,
        output_format=request.output_format,
    )
    return {
        "download_id": state.download_id,
        "status": state.status,
        "message": "Download started",
    }


@app.get("/api/download-progress/{download_id}")
def download_progress(download_id: str) -> dict:
    state = downloader.get_state(download_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Unknown download ID")
    return {
        "download_id": state.download_id,
        "status": state.status,
        "status_message": state.status_message,
        "progress": round(state.progress, 2),
        "downloaded_bytes": state.downloaded_bytes,
        "total_bytes": state.total_bytes,
        "speed": state.speed,
        "eta": state.eta,
        "filename": state.filename,
        "error": state.error,
    }


@app.get("/api/download-file/{download_id}")
def download_file(download_id: str):
    """Stream the finished file to the browser as a normal attachment.

    The file lives in a server-side temp dir; Chrome/Edge decide where to save
    it (their usual download behavior). The server copy is deleted only after
    the response has been fully sent (BackgroundTask), so the temp file is
    never removed mid-transfer.
    """
    taken = take_file(download_id)
    if taken is None:
        raise HTTPException(status_code=404, detail="File not ready or already delivered")

    path, content_type = taken
    state = downloader.get_state(download_id)
    requested = (state.filename if state else None) or path.name
    safe_name = sanitize_filename(requested)

    # RFC 6266/5987: ASCII fallback + UTF-8 form so non-Latin titles survive.
    ascii_name = safe_name.encode("ascii", "ignore").decode("ascii").strip() or "download"
    disposition = f'attachment; filename="{ascii_name}"'
    if ascii_name != safe_name:
        disposition += f"; filename*=UTF-8''{quote(safe_name)}"

    if not path.exists():
        raise HTTPException(status_code=410, detail="File is no longer available")

    return FileResponse(
        path=path,
        media_type=content_type,
        headers={"Content-Disposition": disposition},
        background=BackgroundTask(mark_delivered, download_id),
    )


if __name__ == "__main__":
    import uvicorn

    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host=host, port=port, reload=False)
