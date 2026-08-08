import type { HistoryEntry } from '../types'

const LABELS: Record<string, string> = {
  drafted: 'Drafted',
  edited: 'Edited',
  rejected: 'Rejected',
  published: 'Published',
  publish_failed: 'Publish failed',
}

const TONES: Record<string, string> = {
  drafted: 'text-slate-600',
  edited: 'text-slate-600',
  rejected: 'text-slate-400',
  published: 'text-green-700',
  publish_failed: 'text-red-600',
}

export function History({ history }: { history: HistoryEntry[] }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">History</h2>
      <p className="mt-1 text-xs text-slate-500">Everything drafted, edited, approved, and published this session.</p>
      <ul className="mt-3 space-y-2 max-h-80 overflow-auto">
        {history.length === 0 && <li className="text-sm text-slate-400">Nothing yet.</li>}
        {history.map((h) => (
          <li key={h.id} className="flex items-center justify-between gap-2 text-sm">
            <span className={TONES[h.type] || 'text-slate-600'}>
              <span className="font-medium">{LABELS[h.type] || h.type}</span>
              {h.platform && <span className="text-slate-400"> · {h.platform}</span>}
              {h.mode && <span className="text-slate-400"> · {h.mode}</span>}
              {typeof h.count === 'number' && <span className="text-slate-400"> · {h.count} variants</span>}
              {h.topic && <span className="text-slate-400"> · “{truncate(h.topic, 40)}”</span>}
              {h.error && <span className="text-red-500"> · {truncate(h.error, 60)}</span>}
            </span>
            <span className="shrink-0 text-xs text-slate-400">{new Date(h.at).toLocaleTimeString()}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s
}
