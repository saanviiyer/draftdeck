import type { Draft, Status } from '../types'
import { DraftCard } from './DraftCard'

interface Props {
  drafts: Draft[]
  status: Status | null
  onEdit: (id: string, text: string, revision: number) => Promise<void>
  onReject: (id: string) => Promise<void>
  onPublish: (draft: Draft) => Promise<void>
  onRestore: (id: string, revision: number, expectedRevision: number) => Promise<void>
  onReopen: (id: string) => Promise<void>
}

export function ReviewQueue({ drafts, status, onEdit, onReject, onPublish, onRestore, onReopen }: Props) {
  const pending = drafts.filter((d) => d.status === 'draft')
  const completed = drafts.filter((d) => d.status !== 'draft')

  return (
    <section className="space-y-6">
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Review queue</h2>
          <span className="text-xs text-slate-500">{pending.length} awaiting approval</span>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Approve one post at a time. There is no bulk publish — each post needs its own click.
        </p>

        <div className="mt-3 space-y-3">
          {pending.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-400">
              No drafts yet. Generate some from the Compose panel.
            </div>
          )}
          {pending.map((d) => (
            <DraftCard key={d.id} draft={d} status={status} onEdit={onEdit} onReject={onReject} onPublish={onPublish} onRestore={onRestore} onReopen={onReopen} />
          ))}
        </div>
      </div>

      {completed.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-slate-900">Activity</h2>
          <div className="mt-3 space-y-3">
            {completed.map((d) => (
              <DraftCard key={d.id} draft={d} status={status} onEdit={onEdit} onReject={onReject} onPublish={onPublish} onRestore={onRestore} onReopen={onReopen} />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
