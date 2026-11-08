import type { DownloadProgress, DownloadStartResponse, VideoInfo } from './types'

// Absolute backend URL when deployed (e.g. https://<backend>.onrender.com),
// otherwise the local Vite dev-server proxy is used.
export const API_BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/+$/, '')

const BASE = API_BASE

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    })
  } catch {
    throw new Error('Cannot reach the backend. Is the Python server running on port 8000?')
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const body = await response.json()
      // FastAPI validation errors come back as a list under `detail`
      const detail = body?.detail
      if (typeof detail === 'string') message = detail
      else if (Array.isArray(detail) && detail[0]?.msg) message = detail[0].msg
    } catch {
      /* keep default message */
    }
    throw new Error(message)
  }
  return response.json() as Promise<T>
}

export function analyzeUrl(url: string): Promise<VideoInfo> {
  return request<VideoInfo>('/analyze', {
    method: 'POST',
    body: JSON.stringify({ url }),
  })
}

export function startDownload(
  url: string,
  type: 'video' | 'audio',
  quality: string,
  outputFormat: string,
): Promise<DownloadStartResponse> {
  return request<DownloadStartResponse>('/download', {
    method: 'POST',
    body: JSON.stringify({ url, type, quality, output_format: outputFormat }),
  })
}

export function getProgress(downloadId: string): Promise<DownloadProgress> {
  return request<DownloadProgress>(`/download-progress/${encodeURIComponent(downloadId)}`)
}

export function getHealth(): Promise<{ status: string; ffmpeg_available: boolean }> {
  return request('/health')
}
