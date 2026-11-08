export default function CompletePanel({ filename, onReset }: { filename: string; onReset: () => void }) {
  return (
    <div className="glass-card mt-8 p-8 text-center animate-slide-up border-emerald-500/20">
      <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
        <svg viewBox="0 0 24 24" className="w-7 h-7 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </div>
      <h2 className="mt-4 text-lg font-bold">Download Complete</h2>
      <p className="mt-2 text-sm text-zinc-400 break-all">{filename}</p>
      <p className="mt-1 text-xs text-zinc-600">Handled by your browser's download manager</p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          onClick={onReset}
          className="px-6 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-sm font-medium transition-colors"
        >
          Download another
        </button>
      </div>
    </div>
  )
}
