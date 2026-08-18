import { useState } from 'react'
import type { Platform } from '../types'
import { PLATFORMS } from '../constants'

interface Props {
  busy: boolean
  onGenerate: (payload: { platform: Platform; topic: string; tone: string }) => void
}

export function Compose({ busy, onGenerate }: Props) {
  const [platform, setPlatform] = useState<Platform>('twitter')
  const [topic, setTopic] = useState('')
  const [tone, setTone] = useState('')

  const active = PLATFORMS.find((p) => p.value === platform)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!topic.trim() || busy) return
    onGenerate({ platform, topic: topic.trim(), tone: tone.trim() })
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">Compose</h2>
      <p className="mt-1 text-sm text-slate-500">Describe what you want. DraftDeck returns 1–3 draft variants to review.</p>

      <form onSubmit={submit} className="mt-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Platform</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PLATFORMS.map((p) => (
              <button
                type="button"
                key={p.value}
                onClick={() => setPlatform(p.value)}
                aria-pressed={platform === p.value}
                className={`rounded-lg border px-3 py-2 text-sm text-left transition ${
                  platform === p.value
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {active && <p className="mt-1 text-xs text-slate-400">{active.hint}</p>}
        </div>

        <div>
          <label htmlFor="topic" className="block text-sm font-medium text-slate-700 mb-1">
            Topic / description
          </label>
          <textarea
            id="topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={3}
            maxLength={4000}
            placeholder="e.g. Announce our new open-source library and invite early feedback"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label htmlFor="tone" className="block text-sm font-medium text-slate-700 mb-1">
            Tone <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <input
            id="tone"
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            placeholder="e.g. friendly, professional, playful"
            maxLength={120}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <button
          type="submit"
          disabled={busy || !topic.trim()}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {busy ? 'Drafting…' : 'Generate drafts'}
        </button>
      </form>
    </section>
  )
}
