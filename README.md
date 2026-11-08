# YT Downloader

A local, personal-use YouTube downloader with a modern web UI.

- **Frontend:** React + Vite + TypeScript + Tailwind CSS
- **Backend:** Python + FastAPI + yt-dlp
- No YouTube Data API. Metadata and downloads come straight from yt-dlp.

## Prerequisites

1. **Python 3.10+** — `python --version`
2. **Node.js 18+** — `node --version`
3. **FFmpeg** — **required** and must be available on your `PATH`.

   FFmpeg is used by yt-dlp to merge separate video+audio streams into a single
   MP4 and to convert/extract MP3 or M4A audio. Without it:

   - video downloads (merged formats) will fail
   - audio conversion to MP3/M4A will fail

   Install FFmpeg:

   - **Windows:** `winget install Gyan.FFmpeg` (then reopen your terminal), or
     download from <https://www.gyan.dev/ffmpeg/builds/> and add the `bin`
     folder to your PATH.
   - **macOS:** `brew install ffmpeg`
   - **Ubuntu/Debian:** `sudo apt install ffmpeg`

   Verify: `ffmpeg -version`

## Backend setup

From the `backend/` folder:

```bash
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS / Linux
pip install -r requirements.txt
python main.py
```

The API starts on **http://127.0.0.1:8000**.

> On some Windows systems `python` opens the Microsoft Store. Use `py -m venv venv`
> and `venv\Scripts\python.exe main.py` instead.

## Frontend setup

From the `frontend/` folder:

```bash
npm install
npm run dev
```

Open **http://localhost:5173**.

The dev server proxies `/api/*` to `http://127.0.0.1:8000`, so no CORS issues
arise during normal use (CORS is also enabled on the backend as a fallback).

## Browser extension (`chrome_extension/`)

A Manifest V3 extension that injects a **Download** button below the YouTube
player. Clicking it opens a panel with **Video / Audio tabs**, quality options,
format pills (MP3/M4A), and a small **download icon**. Files are saved by
Chrome's own download manager to your normal Downloads folder. It works with
either the local backend or a deployed one (Render).

**Load it (unpacked):**

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right)
3. Click **Load unpacked** and select the `chrome_extension/` folder

**Use it:**

1. Open any YouTube video
2. Click **Download** below the player
3. Pick Video or Audio → choose quality → click the download icon
4. The file lands in your Downloads folder via Chrome

**Backend URL:** defaults to `http://127.0.0.1:8000`. Change it via the gear
icon in the panel (e.g. to your Render backend); Chrome asks for host access
to that domain the first time.

> Architecture: the content script only draws the UI. The background service
> worker talks to the backend (no CORS issues) and uses `chrome.downloads` to
> save each finished file.

## Deploy to Render

The repo ships a `render.yaml` blueprint that deploys both services:

| Service | Render type | What it runs |
|---|---|---|
| `yt-downloader-backend` | Web service (Python) | FastAPI + yt-dlp, FFmpeg installed via `apt-get` at build |
| `yt-downloader-frontend` | Static site | Vite build output (`dist/`), calls the backend via `VITE_API_BASE` |

Steps:

1. Push this folder to a GitHub repo.
2. In Render: **New + → Blueprint**, pick the repo, click **Apply**.
3. Render creates both services and wires the env vars (`VITE_API_BASE` and
   `CORS_ORIGINS`) automatically from `render.yaml`.

> If you rename the services, also update the URL in `render.yaml`:
> `CORS_ORIGINS` (backend) and `VITE_API_BASE` (frontend) must point at the
> actual `*.onrender.com` URLs.

Notes for the deployed app:

- The backend keeps **one gunicorn worker** deliberately — download state lives
  in memory, so a single worker must serve the whole download session.
- Multiple concurrent downloads share one process and in-memory state; fine for
  personal use.
- `yt-dlp` is the download engine, so the same YouTube restrictions apply
  (age-gated/sign-in videos fail with a clear message).
- For **personal use only**. Respect YouTube's Terms of Service and creators'
  rights.

## Usage

1. Paste a YouTube URL (`youtube.com/watch?v=…`, `youtu.be/…`, `youtube.com/shorts/…`)
2. Click **Analyze** — real metadata is fetched via yt-dlp (no download yet)
3. Choose **Video** (Best/1080p/720p/480p/360p — only what's actually available)
   or **Audio** (Best/320/256/128 kbps — tiers above the source bitrate are hidden)
5. Watch live progress (%, size, speed, ETA) — when the file is ready the
   browser's own download manager saves it to your normal Downloads folder
   (e.g. `C:\Users\<you>\Downloads`). No files are stored in the project.

## API endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/health` | GET | Backend status + FFmpeg availability |
| `/api/analyze` | POST | Extract metadata + real format options (no download) |
| `/api/download` | POST | Start a background download, returns `download_id` |
| `/api/download-progress/{id}` | GET | Poll status/progress for a download |
| `/api/download-file/{id}` | GET | Stream the finished file as an attachment |

## Verified on this machine

- Backend started with `python main.py` and answered `/api/health`
- `/api/analyze` returned real metadata (title, channel, duration, dynamic format list)
- `/api/download` + progress polling completed a **real .m4a download**; the
  file is served with `Content-Disposition: attachment` and Chrome handles saving
- Vite dev server proxied `/api/*` to FastAPI successfully

## Notes & limitations

- **Age-restricted / sign-in-gated videos** cannot be downloaded — YouTube
  requires verification. The backend returns a clear error.
- Downloads are tracked in memory; server-side temp copies are deleted right
  after the browser receives the file (plus a 10-minute safety net).
- For personal use only. Respect YouTube's Terms of Service and content
  creators' rights.
