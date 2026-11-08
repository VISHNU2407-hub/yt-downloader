import type { VideoInfo } from '../types'

function formatViews(n: number | null): string | null {
  if (n === null || n === undefined) return null
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B views`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K views`
  return `${n} views`
}

export default function VideoCard({ info }: { info: VideoInfo }) {
  const views = formatViews(info.view_count ?? null)
  return (
    <div className="glass-card mt-8 overflow-hidden animate-slide-up">
      <div className="flex flex-col sm:flex-row">
        <div className="sm:w-64 flex-shrink-0 bg-black/40">
          {info.thumbnail ? (
            <img
              src={info.thumbnail}
              alt={info.title}
              className="w-full aspect-video object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-full aspect-video flex items-center justify-center text-zinc-600 text-sm">
              No thumbnail
            </div>
          )}
        </div>
        <div className="p-5 flex-1 min-w-0">
          <h2 className="font-bold text-lg leading-snug line-clamp-2">{info.title}</h2>
          <p className="mt-1.5 text-sm text-zinc-400">{info.uploader}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
            {info.duration_string && (
              <span className="inline-flex items-center gap-1">
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 3" />
                </svg>
                {info.duration_string}
              </span>
            )}
            {views && <span>{views}</span>}
            {info.is_live && (
              <span className="px-1.5 py-0.5 rounded bg-rose-600/20 text-rose-400 font-medium">LIVE</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
