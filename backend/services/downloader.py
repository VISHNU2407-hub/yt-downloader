"""Real yt-dlp downloads with per-download progress tracking.

Each download gets its own ID; progress lives in an in-memory registry that
the /api/download-progress/{id} endpoint polls.

Files are staged in a private per-download temporary directory. Once yt-dlp
(+ FFmpeg) finishes, the final file is served to the browser as an HTTP
attachment (Content-Disposition), so Chrome/Edge handle the save location
like a normal download. The server-side copy is deleted only after the
response has been fully sent.
"""

from __future__ import annotations

import logging
import shutil
import tempfile
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

import yt_dlp

from utils import is_ffmpeg_available, resolve_ffmpeg

logger = logging.getLogger("yt_downloader.downloader")

# How long a finished temp file waits for the browser to fetch it before the
# janitor sweeps it (the frontend triggers the fetch immediately, so this is
# just a safety net for closed tabs / lost connections).
RETENTION_SECONDS = 10 * 60


@dataclass
class DownloadState:
    download_id: str
    url: str
    status: str = "starting"  # starting|downloading|processing|finished|error
    status_message: str = ""
    progress: float = 0.0  # 0-100
    downloaded_bytes: int = 0
    total_bytes: int | None = None
    speed: float | None = None  # bytes/s
    eta: int | None = None  # seconds
    filename: str | None = None
    error: str | None = None
    started_at: float = field(default_factory=time.time)
    finished_at: float | None = None
    # Internal: how many streams (video/audio parts) already completed.
    streams_done: int = 0
    # Internal: staged temp file ready to be served / deleted after delivery.
    file_path: Path | None = None
    file_content_type: str | None = None
    delivered: bool = False


# download_id -> DownloadState
_registry: dict[str, DownloadState] = {}
_registry_lock = threading.Lock()


def get_state(download_id: str) -> DownloadState | None:
    with _registry_lock:
        return _registry.get(download_id)


def _update(download_id: str, **kwargs) -> None:
    with _registry_lock:
        state = _registry.get(download_id)
        if state is not None:
            for key, value in kwargs.items():
                setattr(state, key, value)


def start_download(
    url: str,
    media_type: str,  # "video" | "audio"
    quality: str,  # e.g. "best", "1080p", "320kbps"
    output_format: str,  # e.g. "mp4", "mp3", "m4a"
) -> DownloadState:
    """Kick off a background yt-dlp download and return its initial state."""
    download_id = uuid.uuid4().hex[:12]
    state = DownloadState(download_id=download_id, url=url)
    with _registry_lock:
        _registry[download_id] = state

    thread = threading.Thread(
        target=_run,
        args=(download_id, url, media_type, quality, output_format),
        daemon=True,
    )
    thread.start()
    return state


def take_file(download_id: str) -> tuple[Path, str] | None:
    """Return (path, content_type) for a finished download, if deliverable."""
    with _registry_lock:
        state = _registry.get(download_id)
        if state is None or state.status != "finished" or state.file_path is None:
            return None
        return state.file_path, state.file_content_type or "application/octet-stream"


def mark_delivered(download_id: str) -> None:
    """Record that the browser has the file, then clean up in the background."""
    with _registry_lock:
        state = _registry.get(download_id)
        if state is None:
            return
        state.delivered = True
        path = state.file_path

    if path is not None:
        threading.Thread(target=_cleanup_file, args=(download_id, path), daemon=True).start()


def _cleanup_file(download_id: str, path: Path) -> None:
    """Delete the staged file, giving the OS a moment to release the handle."""
    for attempt in range(5):
        try:
            path.unlink(missing_ok=True)
            with _registry_lock:
                state = _registry.get(download_id)
                if state is not None:
                    state.file_path = None
                    tmp = state.__dict__.get("_tmp_dir")
                    if tmp:
                        shutil.rmtree(tmp, ignore_errors=True)
            return
        except PermissionError:
            # Windows: the response stream may still hold the file open.
            time.sleep(0.5 * (attempt + 1))
        except OSError:
            return
    logger.warning("Could not delete staged file for download %s", download_id)


def _run(
    download_id: str,
    url: str,
    media_type: str,
    quality: str,
    output_format: str,
) -> None:
    tmp_dir = tempfile.mkdtemp(prefix=f"ytdl_{download_id}_")
    with _registry_lock:
        state = _registry.get(download_id)
        if state is not None:
            state.__dict__["_tmp_dir"] = tmp_dir

    try:
        # FFmpeg is only *required* for merging (video) and MP3 conversion.
        needs_ffmpeg = media_type == "video" or output_format == "mp3"
        if needs_ffmpeg and not is_ffmpeg_available():
            raise RuntimeError(
                "FFmpeg was not found on PATH. FFmpeg is required for merging video+audio "
                "and for MP3 conversion. Install it and restart the backend."
            )

        outtmpl = str(Path(tmp_dir) / "%(title).150B [%(id)s].%(ext)s")

        ydl_opts: dict = {
            "outtmpl": outtmpl,
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "progress_hooks": [_progress_hook(download_id)],
            "postprocessor_hooks": [_pp_hook(download_id)],
            "restrictfilenames": False,
        }

        ffmpeg_path = resolve_ffmpeg()
        if ffmpeg_path:
            ydl_opts["ffmpeg_location"] = ffmpeg_path

        if media_type == "video":
            height = None if quality == "best" else int(str(quality).rstrip("p"))
            ydl_opts["format"] = _video_format_selector(height)
            ydl_opts["format_sort"] = ["res", "ext:mp4:m4a", "proto"]
            ydl_opts["merge_output_format"] = output_format or "mp4"
        else:
            if output_format == "m4a":
                # Prefer a native m4a stream so no re-encode is needed.
                ydl_opts["format"] = "bestaudio[ext=m4a]/bestaudio/best"
                if is_ffmpeg_available():
                    ydl_opts["postprocessors"] = [
                        {"key": "FFmpegExtractAudio", "preferredcodec": "m4a", "preferredquality": "0"},
                    ]
            else:  # mp3 — always needs ffmpeg (enforced at the API layer too)
                kbps = None if quality in ("best", "") else int(str(quality).rstrip("kbps").strip())
                ydl_opts["format"] = "bestaudio/best"
                ydl_opts["postprocessors"] = [
                    {
                        "key": "FFmpegExtractAudio",
                        "preferredcodec": "mp3",
                        # yt-dlp maps "0" to default/high retention; numeric -> CBR
                        "preferredquality": str(kbps) if kbps else "0",
                    }
                ]

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            prepared = ydl.prepare_filename(info) if info else None

        final_file = _find_final_file(Path(prepared) if prepared else None, Path(tmp_dir))
        if final_file is None:
            raise RuntimeError("Download finished but the output file could not be located.")

        content_type = _content_type_for(final_file)
        _update(
            download_id,
            status="finished",
            progress=100.0,
            filename=final_file.name,
            file_path=final_file,
            file_content_type=content_type,
            finished_at=time.time(),
            status_message="Done",
        )
    except yt_dlp.utils.DownloadError as exc:
        _update(download_id, status="error", error=_friendly_error(str(exc)), finished_at=time.time())
    except Exception as exc:  # noqa: BLE001
        _update(download_id, status="error", error=_friendly_error(str(exc)), finished_at=time.time())
    finally:
        # On error (or if never fetched), the janitor reaps the temp dir later.
        threading.Thread(target=_janitor, args=(download_id,), daemon=True).start()


def _janitor(download_id: str) -> None:
    """Sweep the temp dir once the retention window passes after finishing."""
    while True:
        with _registry_lock:
            state = _registry.get(download_id)
            if state is None:
                return
            done = state.finished_at
            delivered = state.delivered
            tmp_dir = state.__dict__.get("_tmp_dir")
            file_path = state.file_path

        if delivered:
            return  # _cleanup_file owns removal now.
        if done is None:
            time.sleep(5)  # still running; re-check
            continue
        if time.time() - done < RETENTION_SECONDS:
            time.sleep(15)
            continue

        if file_path is not None:
            try:
                file_path.unlink(missing_ok=True)
            except OSError:
                pass
        if tmp_dir:
            shutil.rmtree(tmp_dir, ignore_errors=True)
        with _registry_lock:
            state = _registry.get(download_id)
            if state is not None:
                state.file_path = None
                state.__dict__.pop("_tmp_dir", None)
        return


def _progress_hook(download_id: str):
    def hook(d: dict) -> None:
        if d.get("status") == "downloading":
            downloaded = d.get("downloaded_bytes") or 0
            total = d.get("total_bytes") or d.get("total_bytes_estimate")
            state = get_state(download_id)
            streams_done = state.streams_done if state else 0

            fraction = (downloaded / total) if total else None
            if streams_done == 0:
                overall = (fraction or 0.0) * 100.0
            else:
                # Merged download: video part finished, now audio (or vice versa).
                base = streams_done / 2.0
                overall = (base + (fraction or 0.0) / 2.0) * 100.0

            _update(
                download_id,
                status="downloading",
                downloaded_bytes=downloaded,
                total_bytes=total,
                speed=d.get("speed"),
                eta=d.get("eta"),
                progress=min(overall, 99.5),
            )
        elif d.get("status") == "finished":
            state = get_state(download_id)
            done = (state.streams_done if state else 0) + 1
            _update(
                download_id,
                streams_done=done,
                status="processing",
                status_message="Processing stream…",
            )
    return hook


def _pp_hook(download_id: str):
    def hook(d: dict) -> None:
        if d.get("status") == "started":
            pp = d.get("postprocessor") or ""
            _update(download_id, status="processing", status_message=f"Processing: {pp}")
    return hook


def _video_format_selector(height: int | None) -> str:
    """yt-dlp format selector for a target height, mp4-friendly, with audio."""
    if height is None:
        return "bestvideo*+bestaudio/best"
    return (
        f"bestvideo[height<={height}][ext=mp4]+bestaudio[ext=m4a]/"
        f"bestvideo[height<={height}]+bestaudio/"
        f"best[height<={height}]/best"
    )


def _find_final_file(expected: Path | None, work_dir: Path) -> Path | None:
    """After merge/conversion the extension can change; locate the final file."""
    if expected is not None:
        candidates = [expected]
        for ext in (".mp4", ".mp3", ".m4a", ".webm", ".mkv", ".opus"):
            candidates.append(expected.with_suffix(ext))
        for cand in candidates:
            if cand.exists():
                return cand

    # Fallback: the newest completed file inside this download's temp dir.
    try:
        newest = max(
            (
                p
                for p in work_dir.iterdir()
                if p.is_file()
                and not p.name.endswith((".part", ".ytdl", ".temp"))
            ),
            key=lambda p: p.stat().st_mtime,
            default=None,
        )
        return newest
    except OSError:
        return None


def _content_type_for(path: Path) -> str:
    ext = path.suffix.lower().lstrip(".")
    return {
        "mp4": "video/mp4",
        "m4a": "audio/mp4",
        "mp3": "audio/mpeg",
        "webm": "video/webm",
        "mkv": "video/x-matroska",
        "opus": "audio/opus",
    }.get(ext, "application/octet-stream")


def sanitize_filename(name: str, fallback: str = "download") -> str:
    """Strip characters/metadata that upset HTTP headers or Windows paths."""
    cleaned = name.replace("\r", " ").replace("\n", " ").replace("\t", " ")
    cleaned = cleaned.replace('"', "'")
    # Windows-illegal: < > : " / \ | ? *
    for ch in '<>:"/\\|?*':
        cleaned = cleaned.replace(ch, "_")
    cleaned = "".join(ch for ch in cleaned if ord(ch) >= 32).strip(" .")
    cleaned = cleaned[:180] or fallback
    return cleaned


def _friendly_error(message: str) -> str:
    """Translate raw yt-dlp errors into short, user-facing messages."""
    msg = (message or "").strip()
    lower = msg.lower()

    if "ffmpeg" in lower and ("not found" in lower or "not installed" in lower):
        return "FFmpeg is not installed or not on PATH. It is required to merge video/audio and convert audio."
    if "video unavailable" in lower:
        return "This video is unavailable."
    if "private video" in lower:
        return "This video is private."
    if "sign in to confirm your age" in lower or ("age" in lower and "restrict" in lower):
        return "This video is age-restricted and requires sign-in; the downloader cannot fetch it."
    if "confirm you're not a bot" in lower or "confirm you are not a bot" in lower:
        return (
            "YouTube asked for sign-in/bot verification. Try again, or pass cookies "
            "from your browser to yt-dlp for gated videos."
        )
    if "unsupported url" in lower:
        return "This URL is not supported."
    if "http error 429" in lower or "too many requests" in lower:
        return "YouTube is rate-limiting requests (HTTP 429). Wait a bit and try again."
    if "unable to download webpage" in lower or "timed out" in lower or "getaddrinfo failed" in lower:
        return "Network error while contacting YouTube. Check your internet connection and try again."
    if "is not a valid url" in lower:
        return "The provided URL is not valid."

    # Fall back to the last meaningful line of the yt-dlp error.
    tail = msg.splitlines()[-1] if msg else "Unknown download error."
    return tail[:300]
