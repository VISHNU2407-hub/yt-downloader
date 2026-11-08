"""Shared backend helpers."""

from __future__ import annotations

import re
import shutil
from urllib.parse import parse_qs, urlparse

# YouTube video IDs are 11 characters from this alphabet.
_YOUTUBE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")

_ALLOWED_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    music_host := "music.youtube.com",
    "youtu.be",
    "www.youtu.be",
    "youtube-nocookie.com",
    "www.youtube-nocookie.com",
}

_YOUTU_BE_HOSTS = {"youtu.be", "www.youtu.be"}

_SHORT_PATH_RE = re.compile(r"^/(?:shorts|live|embed|v)/([^/?#]+)")


def is_youtube_url(url: str) -> bool:
    """Return True if `url` is a syntactically valid YouTube URL."""
    if not url or not isinstance(url, str):
        return False

    url = url.strip()
    if "://" not in url:
        url = "https://" + url

    try:
        parsed = urlparse(url)
    except ValueError:
        return False

    if parsed.scheme not in ("http", "https"):
        return False

    host = (parsed.hostname or "").lower()
    if host not in _ALLOWED_HOSTS:
        return False

    if host in _YOUTU_BE_HOSTS:
        video_id = (parsed.path or "").strip("/")
        return bool(_YOUTUBE_ID_RE.match(video_id))

    path = parsed.path or ""

    short = _SHORT_PATH_RE.match(path)
    if short:
        return bool(_YOUTUBE_ID_RE.match(short.group(1)))

    if path == "/watch" or path.startswith("/watch/"):
        video_id = (parse_qs(parsed.query).get("v") or [None])[0]
        return bool(video_id and _YOUTUBE_ID_RE.match(video_id))

    return False


def normalize_url(url: str) -> str:
    """Return a cleaned canonical https URL with tracking params stripped."""
    if not url or not isinstance(url, str):
        return url

    url = url.strip()
    if "://" not in url:
        url = "https://" + url

    try:
        parsed = urlparse(url)
    except ValueError:
        return url

    if parsed.scheme not in ("http", "https"):
        return url

    host = (parsed.hostname or "").lower()

    if host in _YOUTU_BE_HOSTS:
        video_id = (parsed.path or "").strip("/")
        return f"https://youtu.be/{video_id}" if video_id else url

    path = parsed.path or ""
    short = _SHORT_PATH_RE.match(path)
    if short:
        return f"https://www.youtube.com/watch?v={short.group(1)}"

    if path == "/watch" or path.startswith("/watch/"):
        video_id = (parse_qs(parsed.query).get("v") or [None])[0]
        if video_id:
            return f"https://www.youtube.com/watch?v={video_id}"

    return url


def resolve_ffmpeg() -> str | None:
    """Return an ffmpeg executable path yt-dlp can use, if one exists."""
    return shutil.which("ffmpeg")


def is_ffmpeg_available() -> bool:
    return resolve_ffmpeg() is not None
