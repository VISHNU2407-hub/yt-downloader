export default function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="glass-card mt-8 p-8 text-center animate-fade-in border-rose-500/25">
      <div className="w-14 h-14 mx-auto rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center">
        <svg viewBox="0 0 24 24" className="w-7 h-7 text-rose-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 8v5m0 3.5h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
        </svg>
      </div>
      <h2 className="mt-4 text-lg font-bold">Something went wrong</h2>
      <p className="mt-2 text-sm text-zinc-400 max-w-md mx-auto break-words">{message}</p>
      <button
        onClick={onRetry}
        className="mt-6 px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 font-semibold text-sm transition-colors shadow-lg shadow-rose-600/25"
      >
        Try again
      </button>
    </div>
  )
}
