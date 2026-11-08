"""yt-dlp based metadata extraction for the /api/analyze endpoint.

Extracts info WITHOUT downloading, and computes which download options are
actually available for this specific video so the UI never shows fake
qualities.
"""

from __future__ import annotations

import yt_dlp

from utils import is_ffmpeg_available, normalize_url

# Heights the UI can advertise, in descending order.
_VIDEO_HEIGHTS = [2160, 1440, 1080, 720, 480, 360]

_AUDIO_KBPS_TIERS = [320, 256, 128]


def _info(url: str) -> dict:
    opts = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "skip_download": True,
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)
        return info or {}


def _height_of(fmt: dict) -> int | None:
    return int(fmt["height"]) if fmt.get("height") else None


def _split_streams(fmts: list[dict]) -> tuple[list[dict], list[dict]]:
    """Separate video-only and audio-only streams."""
    videos: list[dict] = []
    audios: list[dict] = []
    for f in fmts:
        if not f.get("format_id"):
            continue
        vcodec = f.get("vcodec") or "none"
        acodec = f.get("acodec") or "none"
        if vcodec != "none" and acodec == "none":
            videos.append(f)
        elif vcodec == "none" and acodec != "none":
            audios.append(f)
    return videos, audios


def _build_video_options(videos: list[dict], audios: list[dict]) -> list[dict]:
    max_height = max((h for h in (_height_of(f) for f in videos) if h), default=0)

    options: list[dict] = []
    if videos or audios:
        options.append(
            {
                "quality": "best",
                "label": "Best quality",
                "height": max_height or None,
                "ext": "mp4",
                "available": True,
                "note": f"Up to {max_height}p" if max_height else "Highest available",
            }
        )

    for height in _VIDEO_HEIGHTS:
        if not max_height or height > max_height:
            continue
        matching = [f for f in videos if (_height_of(f) or 0) == height]
        exts = sorted({(f.get("ext") or "").lower() for f in matching if f.get("ext")})
        options.append(
            {
                "quality": f"{height}p",
                "label": f"{height}p",
                "height": height,
                "ext": "mp4",
                "available": True,
                "note": "/".join(exts[:2]) if exts else "video+audio",
            }
        )
    return options


def _build_audio_options(audios: list[dict], ffmpeg_available: bool) -> list[dict]:
    """Audio tiers are only offered when the source bitrate can support them.

    Re-encoding a ~128 kbps source to "320 kbps" MP3 would just inflate the
    file without adding quality, so tiers above the real source bitrate are
    hidden.
    """
    if not audios:
        return []

    best = max(audios, key=lambda f: f.get("abr") or f.get("tbr") or 0)
    best_abr = best.get("abr") or best.get("tbr")
    best_abr = int(round(best_abr)) if best_abr else None

    options: list[dict] = [
        {
            "quality": "best",
            "label": "Best audio",
            "abr": best_abr,
            "ext": "m4a",
            "available": True,
            "note": f"~{best_abr} kbps source" if best_abr else "Highest available bitrate",
        }
    ]

    for kbps in _AUDIO_KBPS_TIERS:
        # Allow ~10% tolerance around reported bitrates.
        supported = best_abr is not None and best_abr >= kbps * 0.9
        options.append(
            {
                "quality": f"{kbps}kbps",
                "label": f"{kbps} kbps",
                "abr": kbps,
                "ext": "mp3",
                "available": bool(supported and ffmpeg_available),
                "note": None if supported else f"Source is only ~{best_abr} kbps" if best_abr else None,
            }
        )
    return options


def analyze(url: str) -> dict:
    """Return video metadata plus genuinely available download options."""
    url = normalize_url(url)
    info = _info(url)

    ffmpeg_available = is_ffmpeg_available()

    video_id = info.get("id") or ""
    title = info.get("title") or "Unknown title"
    uploader = info.get("uploader") or info.get("channel") or "Unknown channel"
    duration = info.get("duration")  # seconds, or None for live
    thumbnail = info.get("thumbnail") or next(
        (t.get("url") for t in reversed(info.get("thumbnails") or []) if t.get("url")),
        None,
    )

    videos, audios = _split_streams(info.get("formats") or [])

    return {
        "id": video_id,
        "title": " ".join(str(title).split()),
        "uploader": uploader,
        "duration": int(duration) if duration else None,
        "duration_string": info.get("duration_string"),
        "thumbnail": thumbnail,
        "webpage_url": info.get("webpage_url") or url,
        "view_count": info.get("view_count"),
        "upload_date": info.get("upload_date"),
        "is_live": bool(info.get("is_live")),
        "options": {
            "video": _build_video_options(videos, audios),
            "audio": _build_audio_options(audios, ffmpeg_available),
        },
        "capabilities": {
            "ffmpeg_available": ffmpeg_available,
        },
    }
