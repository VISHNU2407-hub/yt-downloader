export interface VideoOption {
  quality: string // "best" | "1080p" | ...
  label: string
  height: number | null
  ext: string
  available: boolean
  note: string | null
}

export interface AudioOption {
  quality: string // "best" | "320kbps" | ...
  label: string
  abr: number | null
  ext: string
  available: boolean
  note: string | null
}

export interface VideoInfo {
  id: string
  title: string
  uploader: string
  duration: number | null
  duration_string: string | null
  thumbnail: string | null
  webpage_url: string
  view_count: number | null
  upload_date: string | null
  is_live: boolean
  options: {
    video: VideoOption[]
    audio: AudioOption[]
  }
  capabilities: {
    ffmpeg_available: boolean
  }
}

export interface DownloadStartResponse {
  download_id: string
  status: string
  message: string
}

export interface DownloadProgress {
  download_id: string
  status: 'starting' | 'downloading' | 'processing' | 'finished' | 'error'
  status_message: string
  progress: number
  downloaded_bytes: number
  total_bytes: number | null
  speed: number | null
  eta: number | null
  filename: string | null
  error: string | null
}
