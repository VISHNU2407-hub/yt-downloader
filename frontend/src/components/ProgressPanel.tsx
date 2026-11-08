import type { VideoInfo, DownloadProgress } from '../types'

function fmtBytes(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i += 1
  }
  return `${value.toFixed(value >= 100 || i === 0 ? 0 : 1)} ${units[i]}`
}

function fmtEta(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function ProgressPanel({ info, progress }: { info: VideoInfo; progress: DownloadProgress }) {
  const pct = Math.min(100, Math.max(0, progress.progress))
  return (
    <div className="glass-card mt-8 p-6 animate-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full border-2 border-zinc-700 border-t-rose-500 animate-spin flex-shrink-0" />
          <div className="min-w-0">
            <div className="font-semibold text-sm truncate">
              {progress.status === 'processing' ? 'Processing…' : 'Downloading…'}
            </div>
            <div className="text-xs text-zinc-500 truncate">{info.title}</div>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-2xl font-bold tabular-nums">{pct.toFixed(0)}%</div>
        </div>
      </div>

      <div className="mt-5 h-3 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-rose-600 to-rose-400 transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500 tabular-nums">
        <span>{fmtBytes(progress.downloaded_bytes)}{progress.total_bytes ? ` / ${fmtBytes(progress.total_bytes)}` : ''}</span>
        <div className="flex gap-4">
          {progress.speed !== null && <span>{fmtBytes(progress.speed)}/s</span>}
          <span>ETA {fmtEta(progress.eta)}</span>
        </div>
      </div>

      {progress.status_message && progress.status === 'processing' && (
        <p className="mt-3 text-xs text-zinc-500">{progress.status_message}</p>
      )}
    </div>
  )
}
