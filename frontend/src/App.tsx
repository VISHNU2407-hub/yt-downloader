import { useCallback, useEffect, useRef, useState } from 'react'
import type { DownloadProgress, VideoInfo } from './types'
import { API_BASE, analyzeUrl, getHealth, getProgress, startDownload } from './api'
import { isLikelyYouTubeUrl } from './components/UrlInput'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import UrlInput from './components/UrlInput'
import VideoCard from './components/VideoCard'
import DownloadPanel from './components/DownloadPanel'
import ProgressPanel from './components/ProgressPanel'
import CompletePanel from './components/CompletePanel'
import ErrorPanel from './components/ErrorPanel'

export type FlowState =
  | { phase: 'idle' }
  | { phase: 'analyzing' }
  | { phase: 'analyzed'; info: VideoInfo }
  | { phase: 'downloading'; info: VideoInfo; progress: DownloadProgress }
  | { phase: 'completed'; info: VideoInfo; filename: string }
  | { phase: 'error'; message: string; retryable: boolean }

// Trigger a real browser download (Chrome download manager, normal save
// location). The server answers with Content-Disposition: attachment, so the
// browser handles it natively — no fetch(), no Blob, no JS-side buffering.
function triggerBrowserDownload(downloadId: string, filename: string) {
  const a = document.createElement('a')
  a.href = `${API_BASE}/download-file/${encodeURIComponent(downloadId)}`
  a.download = filename // hint; server header wins for the saved name
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export default function App() {
  const [state, setState] = useState<FlowState>({ phase: 'idle' })
  const [backendOk, setBackendOk] = useState<boolean | null>(null)
  const [initialUrl, setInitialUrl] = useState('')
  const pollRef = useRef<number | null>(null)

  useEffect(() => {
    getHealth()
      .then(() => setBackendOk(true))
      .catch(() => setBackendOk(false))
  }, [])

  // Support being opened by the browser extension with ?url=<video>.
  // Pre-fill the input and kick off analysis automatically.
  const initialUrlRef = useRef(false)
  useEffect(() => {
    if (initialUrlRef.current) return
    initialUrlRef.current = true
    const url = new URLSearchParams(window.location.search).get('url')
    if (url && isLikelyYouTubeUrl(url)) {
      setInitialUrl(url.trim())
      handleAnalyze(url.trim())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(() => () => stopPolling(), [stopPolling])

  const poll = useCallback(
    (downloadId: string, info: VideoInfo) => {
      stopPolling()
      pollRef.current = window.setInterval(async () => {
        try {
          const progress = await getProgress(downloadId)
          if (progress.status === 'finished') {
            stopPolling()
            const filename = progress.filename ?? 'download'
            // Hand off to the browser: the file is ready server-side, the
            // response streams as an attachment and Chrome saves it normally.
            triggerBrowserDownload(downloadId, filename)
            setState({ phase: 'completed', info, filename })
          } else if (progress.status === 'error') {
            stopPolling()
            setState({ phase: 'error', message: progress.error ?? 'Download failed', retryable: true })
          } else {
            setState({ phase: 'downloading', info, progress })
          }
        } catch (err) {
          stopPolling()
          setState({
            phase: 'error',
            message: err instanceof Error ? err.message : 'Lost connection to the backend',
            retryable: true,
          })
        }
      }, 700)
    },
    [stopPolling],
  )

  const handleAnalyze = useCallback(
    async (url: string) => {
      stopPolling()
      setState({ phase: 'analyzing' })
      try {
        const info = await analyzeUrl(url)
        setState({ phase: 'analyzed', info })
      } catch (err) {
        setState({
          phase: 'error',
          message: err instanceof Error ? err.message : 'Failed to analyze video',
          retryable: true,
        })
      }
    },
    [stopPolling],
  )

  const handleDownload = useCallback(
    async (url: string, type: 'video' | 'audio', quality: string, outputFormat: string) => {
      setState({ phase: 'analyzing' }) // reuse spinner while starting
      try {
        const { download_id } = await startDownload(url, type, quality, outputFormat)
        const info = state.phase === 'analyzed' ? state.info : null
        if (!info) throw new Error('Please analyze a video first')
        poll(download_id, info)
      } catch (err) {
        setState({
          phase: 'error',
          message: err instanceof Error ? err.message : 'Failed to start download',
          retryable: true,
        })
      }
    },
    [poll, state],
  )

  const handleReset = useCallback(() => {
    stopPolling()
    setState({ phase: 'idle' })
  }, [])

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar backendOk={backendOk} />
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 pb-20">
        <Hero />
        <UrlInput
          disabled={state.phase === 'analyzing' || state.phase === 'downloading'}
          onSubmit={handleAnalyze}
          initialValue={initialUrl}
        />
        {state.phase === 'analyzing' && <AnalyzingSpinner label="Preparing download…" />}
        {state.phase === 'analyzed' && (
          <>
            <VideoCard info={state.info} />
            <DownloadPanel info={state.info} onDownload={handleDownload} ffmpegAvailable={state.info.capabilities.ffmpeg_available} />
          </>
        )}
        {state.phase === 'downloading' && (
          <ProgressPanel info={state.info} progress={state.progress} />
        )}
        {state.phase === 'completed' && (
          <CompletePanel filename={state.filename} onReset={handleReset} />
        )}
        {state.phase === 'error' && (
          <ErrorPanel message={state.message} onRetry={handleReset} />
        )}
      </main>
      <footer className="text-center text-xs text-zinc-600 pb-6">
        Local personal-use tool — files are delivered as a normal browser download
      </footer>
    </div>
  )
}

function AnalyzingSpinner({ label }: { label?: string }) {
  return (
    <div className="glass-card mt-8 p-8 flex flex-col items-center gap-4 animate-fade-in">
      <div className="w-10 h-10 border-3 border-zinc-700 border-t-rose-500 rounded-full animate-spin" />
      <p className="text-sm text-zinc-400">{label ?? 'Fetching video information…'}</p>
    </div>
  )
}
