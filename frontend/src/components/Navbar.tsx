interface Props {
  backendOk: boolean | null
}

export default function Navbar({ backendOk }: Props) {
  return (
    <header className="w-full border-b border-white/[0.06] backdrop-blur-md sticky top-0 z-10 bg-[#0a0a0f]/80">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-rose-600 flex items-center justify-center shadow-lg shadow-rose-600/30">
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="white" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
          <div>
            <div className="font-bold text-sm leading-tight">YT Downloader</div>
            <div className="text-[10px] text-zinc-500 leading-tight">Personal YouTube Downloader</div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span
            className={`w-2 h-2 rounded-full ${
              backendOk === null
                ? 'bg-amber-400 animate-pulse-soft'
                : backendOk
                  ? 'bg-emerald-400'
                  : 'bg-rose-500'
            }`}
          />
          <span>{backendOk === null ? 'Connecting…' : backendOk ? 'Backend online' : 'Backend offline'}</span>
        </div>
    </div>
    </header>
  )
}
