import { useMemo, useState } from 'react'
import type { VideoInfo } from '../types'

type MediaTab = 'video' | 'audio'

interface Props {
  info: VideoInfo
  ffmpegAvailable: boolean
  onDownload: (url: string, type: 'video' | 'audio', quality: string, outputFormat: string) => void
}

export default function DownloadPanel({ info, ffmpegAvailable, onDownload }: Props) {
  const [tab, setTab] = useState<MediaTab>('video')
  const videoOptions = info.options.video
  const audioOptions = info.options.audio

  const [selectedVideo, setSelectedVideo] = useState<string>(() => videoOptions[0]?.quality ?? '')
  const [selectedAudio, setSelectedAudio] = useState<string>(() => audioOptions[0]?.quality ?? '')
  const [videoFormat, setVideoFormat] = useState<'mp4'>('mp4')
  const [audioFormat, setAudioFormat] = useState<'mp3' | 'm4a'>('mp3')

  const selectedOption = useMemo(() => {
    return tab === 'video'
      ? videoOptions.find((o) => o.quality === selectedVideo)
      : audioOptions.find((o) => o.quality === selectedAudio)
  }, [tab, selectedVideo, selectedAudio, videoOptions, audioOptions])

  const canDownload =
    !!selectedOption?.available && (ffmpegAvailable || tab === 'video')

  const handleDownload = () => {
    if (tab === 'video') {
      onDownload(info.webpage_url, 'video', selectedVideo, videoFormat)
    } else {
      onDownload(info.webpage_url, 'audio', selectedAudio, audioFormat)
    }
  }

  return (
    <div className="glass-card mt-5 p-5 sm:p-6 animate-slide-up">
      <div className="flex gap-2 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06] w-fit">
        {(['video', 'audio'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-6 py-2 rounded-lg text-sm font-semibold capitalize transition-all ${
              tab === t
                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
        {tab === 'video' &&
          videoOptions.map((option) => (
            <OptionCard
              key={option.quality}
              selected={selectedVideo === option.quality}
              onSelect={() => setSelectedVideo(option.quality)}
              label={option.label}
              note={option.note}
              tag={option.ext.toUpperCase()}
              disabled={!option.available}
            />
          ))}
        {tab === 'audio' &&
          audioOptions.map((option) => (
            <OptionCard
              key={option.quality}
              selected={selectedAudio === option.quality}
              onSelect={() => setSelectedAudio(option.quality)}
              label={option.label}
              note={option.note}
              tag={option.ext.toUpperCase()}
              disabled={!option.available}
            />
          ))}
        {((tab === 'video' && videoOptions.length === 0) ||
          (tab === 'audio' && audioOptions.length === 0)) && (
          <p className="text-sm text-zinc-500 col-span-2 py-4 text-center">
            No {tab} streams were found for this video.
          </p>
        )}
      </div>

      <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 uppercase tracking-wide font-medium">Output</span>
          {tab === 'video' ? (
            <FormatPill label="MP4" active onClick={() => setVideoFormat('mp4')} disabled />
          ) : (
            (['mp3', 'm4a'] as const).map((f) => (
              <FormatPill
                key={f}
                label={f.toUpperCase()}
                active={audioFormat === f}
                onClick={() => setAudioFormat(f)}
              />
            ))
          )}
        </div>

        <div className="flex-1" />

        {!ffmpegAvailable && (
          <p className="text-xs text-amber-400/90 max-w-xs">
            FFmpeg not found — merging and audio conversion are disabled.
          </p>
        )}

        <button
          onClick={handleDownload}
          disabled={!canDownload}
          className="px-10 py-3.5 rounded-xl bg-rose-600 hover:bg-rose-500 active:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-white transition-all shadow-lg shadow-rose-600/25 hover:shadow-rose-500/40 inline-flex items-center justify-center gap-2"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" />
          </svg>
          Download
        </button>
      </div>
    </div>
  )
}

function OptionCard({
  selected,
  onSelect,
  label,
  note,
  tag,
  disabled,
}: {
  selected: boolean
  onSelect: () => void
  label: string
  note: string | null
  tag?: string
  disabled: boolean
}) {
  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className={`text-left p-4 rounded-xl border transition-all ${
        selected
          ? 'border-rose-500/70 bg-rose-600/10 shadow-md shadow-rose-900/20'
          : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.16] hover:bg-white/[0.04]'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-sm">{label}</div>
          {note && <div className="text-xs text-zinc-500 mt-0.5 truncate">{note}</div>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {tag && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-400">
              {tag}
            </span>
          )}
          <span
            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
              selected ? 'border-rose-500' : 'border-zinc-600'
            }`}
          >
            {selected && <span className="w-2 h-2 rounded-full bg-rose-500" />}
          </span>
        </div>
      </div>
    </button>
  )
}

function FormatPill({
  label,
  active,
  onClick,
  disabled,
}: {
  label: string
  active: boolean
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
        active ? 'bg-rose-600/20 text-rose-400 border border-rose-500/40' : 'text-zinc-500 border border-white/[0.08] hover:text-zinc-300'
      } ${disabled ? 'opacity-60 cursor-default' : 'cursor-pointer'}`}
    >
      {label}
    </button>
  )
}
