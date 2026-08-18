import { useEffect, useState } from 'react'
import type { Draft, Status } from '../types'
import { PLATFORM_LABEL, PLATFORM_LIMIT } from '../constants'

interface Props {
  draft: Draft
  status: Status | null
  onEdit: (id: string, text: string, revision: number) => Promise<void>
  onReject: (id: string) => Promise<void>
  onPublish: (draft: Draft) => Promise<void>
  onRestore: (id: string, revision: number, expectedRevision: number) => Promise<void>
  onReopen: (id: string) => Promise<void>
}

export function DraftCard({ draft, status, onEdit, onReject, onPublish, onRestore, onReopen }: Props) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(draft.text)
  const [busy, setBusy] = useState(false)
  const [showVersions, setShowVersions] = useState(false)
  const published = draft.status === 'published'
  const active = draft.status === 'draft'
  const adapterReady = !status?.publishEnabled || status.adapterCapabilities[draft.platform]?.ready
  const overLimit = text.length > PLATFORM_LIMIT[draft.platform]

  useEffect(() => { if (!editing) setText(draft.text) }, [draft.text, editing])

  async function save() {
    setBusy(true)
    try {
      await onEdit(draft.id, text, draft.revision)
      setEditing(false)
    } finally {
      setBusy(false)
    }
  }

  async function publish() {
    const label = status?.publishEnabled
      ? 'Publishing is ENABLED. This will attempt to send this post to the real platform. Continue?'
      : 'Publishing is in dry-run mode. This will only SIMULATE publishing (nothing is sent externally). Continue?'
    const claims = draft.needsReview ? '\n\nThis draft contains flagged claims. Continue only if you verified them.' : ''
    if (!window.confirm(label + claims)) return
    setBusy(true)
    try {
      await onPublish(draft)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`rounded-xl border bg-white p-4 shadow-sm ${published ? 'border-green-200' : 'border-slate-200'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            {PLATFORM_LABEL[draft.platform]}
          </span>
          {draft.source === 'mock' && (
            <span className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-700">mock</span>
          )}
          {draft.needsReview && !published && (
            <span
              title={`Contains ${draft.reviewReasons.join(', ')}. Verify these before publishing.`}
              className="rounded bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800"
            >
              ⚠ needs review
            </span>
          )}
        </div>
        {published ? (
          <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">
            {draft.publishResult?.mode === 'real' ? 'Published' : 'Published (dry-run)'}
          </span>
        ) : draft.status === 'simulated' ? (
          <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">Simulated — not published</span>
        ) : draft.status === 'publish_failed' ? (
          <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">Publish failed</span>
        ) : draft.status === 'publishing' ? (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">Publishing / verify externally</span>
        ) : draft.status === 'rejected' ? (
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">Rejected</span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">Draft · revision {draft.revision}</span>
        )}
      </div>

      {editing ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          maxLength={20000}
          aria-label={`Edit ${PLATFORM_LABEL[draft.platform]} draft`}
          className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      ) : (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{draft.text}</p>
      )}

      {draft.needsReview && !published && (
        <p className="mt-2 text-xs text-yellow-700">
          Possible factual/news claims detected ({draft.reviewReasons.join(', ')}). Verify before publishing.
        </p>
      )}
      {active && (
        <p className={`mt-2 text-xs ${overLimit ? 'font-semibold text-red-600' : 'text-slate-400'}`}>
          {text.length.toLocaleString()} / {PLATFORM_LIMIT[draft.platform].toLocaleString()} characters
        </p>
      )}

      {published && draft.publishResult && (
        <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-800">{draft.publishResult.message}</p>
      )}

      <button onClick={() => setShowVersions((value) => !value)} className="mt-2 text-xs text-slate-500 underline">
        {showVersions ? 'Hide' : 'Show'} revision history ({draft.revisions.length})
      </button>
      {showVersions && (
        <ol className="mt-2 max-h-40 space-y-1 overflow-auto rounded-lg bg-slate-50 p-2 text-xs">
          {[...draft.revisions].reverse().map((version) => (
            <li key={version.revision} className="flex items-center justify-between gap-2">
              <span>Revision {version.revision} · {version.actor} · {new Date(version.at).toLocaleString()}</span>
              {active && version.revision !== draft.revision && (
                <button disabled={busy} onClick={async () => { setBusy(true); try { await onRestore(draft.id, version.revision, draft.revision) } finally { setBusy(false) } }} className="text-indigo-600 underline">Restore</button>
              )}
            </li>
          ))}
        </ol>
      )}

      {active && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {editing ? (
            <>
              <button
                onClick={save}
                disabled={busy || !text.trim() || overLimit}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:bg-slate-300"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setText(draft.text)
                  setEditing(false)
                }}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              Edit
            </button>
          )}

          <div className="grow" />

          <button
            onClick={() => { if (window.confirm('Reject this draft? It will remain in history and can be reopened.')) void onReject(draft.id) }}
            disabled={busy || editing}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Reject
          </button>
          {/* The per-post approval gate. There is deliberately no "approve all". */}
          <button
            onClick={publish}
            disabled={busy || editing || !adapterReady || overLimit}
            title={!adapterReady ? 'This real platform adapter is not implemented. Dry-run remains available when publishing is disabled.' : undefined}
            className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700 disabled:bg-slate-300"
          >
            {busy ? 'Working…' : 'Approve & Publish'}
          </button>
        </div>
      )}
      {['rejected', 'simulated', 'publish_failed'].includes(draft.status) && (
        <button disabled={busy} onClick={async () => { setBusy(true); try { await onReopen(draft.id) } finally { setBusy(false) } }} className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          Reopen as draft
        </button>
      )}
      {draft.status === 'publishing' && (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">The process stopped without a confirmed result. Check the platform, then use the protected reconciliation API; DraftDeck will not retry automatically.</p>
      )}
    </div>
  )
}
