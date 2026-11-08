import { useState, type FormEvent } from 'react'

const YT_ID = '([A-Za-z0-9_-]{11})'

/** Accepts watch?v=, youtu.be, /shorts/, /live/, /embed/ and bare 11-char IDs. */
export function isLikelyYouTubeUrl(url: string): boolean {
  const value = url.trim()
  if (!value) return false
  const patterns = [
    new RegExp(`^(https?:\\/\\/)?(www\\.|m\\.|music\\.)?youtube\\.com\\/watch\\?v=${YT_ID}(&.*)?$`, 'i'),
    new RegExp(`^(https?:\\/\\/)?youtu\\.be\\/${YT_ID}(\\?.*)?$`, 'i'),
    new RegExp(`^(https?:\\/\\/)?(www\\.|m\\.)?youtube\\.com\\/shorts\\/${YT_ID}(\\?.*)?$`, 'i'),
    new RegExp(`^(https?:\\/\\/)?(www\\.)?youtube\\.com\\/(live|embed|v)\\/${YT_ID}`, 'i'),
  ]
  if (patterns.some((p) => p.test(value))) return true
  // Bare video ID
  return new RegExp(`^${YT_ID}$`).test(value)
}

interface Props {
  disabled: boolean
  onSubmit: (url: string) => void
  initialValue?: string
}

export default function UrlInput({ disabled, onSubmit, initialValue = '' }: Props) {
  const [value, setValue] = useState(initialValue)
  const [touched, setTouched] = useState(false)

  const valid = isLikelyYouTubeUrl(value)
  const showError = touched && value.length > 0 && !valid

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!valid || disabled) return
    onSubmit(value.trim())
  }

  return (
    <form onSubmit={handleSubmit} className="animate-slide-up" noValidate>
      <div
        className={`glass-card p-2 flex flex-col sm:flex-row gap-2 transition-colors ${
          showError ? 'border-rose-500/60' : 'focus-within:border-rose-500/50'
        }`}
      >
        <input
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="Paste YouTube video URL..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => setTouched(true)}
          disabled={disabled}
          className="flex-1 bg-transparent px-4 py-3.5 text-base outline-none placeholder:text-zinc-600 disabled:opacity-50"
          aria-label="YouTube URL"
        />
        <button
          type="submit"
          disabled={disabled || !valid}
          className="px-8 py-3.5 rounded-xl bg-rose-600 hover:bg-rose-500 active:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-white transition-all shadow-lg shadow-rose-600/25 hover:shadow-rose-500/40"
        >
          Analyze
        </button>
      </div>
      {showError && (
        <p className="mt-2 text-xs text-rose-400 px-2">
          That doesn't look like a YouTube URL. Try e.g. https://www.youtube.com/watch?v=dQw4w9WgXcQ
        </p>
      )}
    </form>
  )
}
