import type { Status } from '../types'

export function Header({ status }: { status: Status | null }) {
  const readyAdapters = status ? Object.values(status.adapterCapabilities).filter((adapter) => adapter.ready).length : 0
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">DraftDeck</h1>
          <p className="text-sm text-slate-500">AI drafts the post. You review, edit, and approve every publish.</p>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          {status && (
            <>
              <Badge
                tone={status.mockMode ? 'amber' : 'green'}
                label={status.mockMode ? 'Mock mode' : `Live: ${status.model}`}
                title={status.mockMode ? 'No ANTHROPIC_API_KEY set — drafts are generated locally.' : 'Using the Anthropic API for drafting.'}
              />
              <Badge
                tone={status.publishEnabled ? (readyAdapters ? 'red' : 'amber') : 'slate'}
                label={status.publishEnabled ? (readyAdapters ? 'Real publishing enabled' : 'Real adapters unavailable') : 'Dry-run (safe)'}
                title={
                  status.publishEnabled
                    ? readyAdapters ? 'PUBLISH_ENABLED=true — implemented adapters may send approved posts.' : 'PUBLISH_ENABLED=true, but every bundled real adapter is an honest non-publishing stub.'
                    : 'PUBLISH_ENABLED=false — publishing only simulates and logs. Nothing is sent externally.'
                }
              />
            </>
          )}
        </div>
      </div>
    </header>
  )
}

function Badge({ tone, label, title }: { tone: 'green' | 'amber' | 'red' | 'slate'; label: string; title: string }) {
  const tones: Record<string, string> = {
    green: 'bg-green-100 text-green-800 border-green-200',
    amber: 'bg-amber-100 text-amber-800 border-amber-200',
    red: 'bg-red-100 text-red-800 border-red-200',
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
  }
  return (
    <span title={title} className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${tones[tone]}`}>
      {label}
    </span>
  )
}
