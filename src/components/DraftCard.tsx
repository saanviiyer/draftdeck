import { useState } from 'react'
import type { Draft, Status } from '../types'
import { PLATFORM_LABEL } from '../constants'

interface Props {
  draft: Draft
  status: Status | null
  onEdit: (id: string, text: string) => Promise<void>
  onReject: (id: string) => Promise<void>
  onPublish: (id: string) => Promise<void>
}

export function DraftCard({ draft, status, onEdit, onReject, onPublish }: Props) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(draft.text)
  const [busy, setBusy] = useState(false)
  const published = draft.status === 'published'

  async function save() {
    setBusy(true)
    try {
      await onEdit(draft.id, text)
      setEditing(false)
    } finally {
      setBusy(false)
    }
  }

  async function publish() {
    const label = status?.publishEnabled
      ? 'Publishing is ENABLED. This will attempt to send this post to the real platform. Continue?'
      : 'Publishing is in dry-run mode. This will only SIMULATE publishing (nothing is sent externally). Continue?'
    if (!window.confirm(label)) return
    setBusy(true)
    try {
      await onPublish(draft.id)
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
        ) : (
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">Draft</span>
        )}
      </div>

      {editing ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
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

      {published && draft.publishResult && (
        <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-800">{draft.publishResult.message}</p>
      )}

      {!published && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {editing ? (
            <>
              <button
                onClick={save}
                disabled={busy || !text.trim()}
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
            onClick={() => onReject(draft.id)}
            disabled={busy || editing}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Reject
          </button>
          {/* The per-post approval gate. There is deliberately no "approve all". */}
          <button
            onClick={publish}
            disabled={busy || editing}
            className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700 disabled:bg-slate-300"
          >
            {busy ? 'Working…' : 'Approve & Publish'}
          </button>
        </div>
      )}
    </div>
  )
}
