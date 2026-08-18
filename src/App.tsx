import { useCallback, useEffect, useState } from 'react'
import { api, clearOwnerKey, getOwnerKey, setOwnerKey } from './api'
import type { Draft, HistoryEntry, Platform, Status } from './types'
import { Header } from './components/Header'
import { Compose } from './components/Compose'
import { ReviewQueue } from './components/ReviewQueue'
import { History } from './components/History'

export default function App() {
  const [status, setStatus] = useState<Status | null>(null)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [authed, setAuthed] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const [d, h] = await Promise.all([api.drafts(), api.history()])
      setDrafts(d.drafts)
      setHistory(h.history)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data')
    }
  }, [])

  useEffect(() => {
    api.status().then(async (value) => {
      setStatus(value)
      if (!value.ownerProtected) { setAuthed(true); await refresh(); return }
      const key = getOwnerKey()
      if (key) {
        try { await api.verifyOwner(key); setAuthed(true); await refresh() }
        catch { clearOwnerKey() }
      }
    }).catch(() => setStatus(null))
  }, [refresh])

  async function onGenerate(payload: { platform: Platform; topic: string; tone: string }) {
    setBusy(true)
    setError(null)
    try {
      await api.createDrafts(payload)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Draft generation failed')
    } finally {
      setBusy(false)
    }
  }

  const onEdit = useCallback(
    async (id: string, text: string, revision: number) => {
      setError(null)
      try {
        await api.editDraft(id, text, revision)
        await refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Edit failed')
      }
    },
    [refresh],
  )

  const onReject = useCallback(
    async (id: string) => {
      setError(null)
      try {
        await api.deleteDraft(id)
        await refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Reject failed')
      }
    },
    [refresh],
  )

  const onPublish = useCallback(
    async (draft: Draft) => {
      setError(null)
      try {
        await api.publish(draft)
        await refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Publish failed')
        await refresh()
      }
    },
    [refresh],
  )

  const onRestore = useCallback(async (id: string, revision: number, expectedRevision: number) => {
    setError(null)
    try { await api.restoreDraft(id, revision, expectedRevision); await refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'Restore failed'); await refresh() }
  }, [refresh])

  const onReopen = useCallback(async (id: string) => {
    setError(null)
    try { await api.reopenDraft(id); await refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'Reopen failed') }
  }, [refresh])

  return (
    <div className="min-h-screen">
      <Header status={status} />

      <main className="mx-auto max-w-5xl px-4 py-6">
        {status?.ownerProtected && !authed ? (
          <OwnerGate onAuthenticated={async () => { setAuthed(true); await refresh() }} />
        ) : authed ? (
          <>
        {status && !status.publishEnabled && (
          <div className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            <span className="font-medium text-slate-800">Safe by default.</span> Publishing is disabled — approving a
            post only simulates it and logs the action. Nothing is sent to any external platform. See the README to
            enable real publishing.
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <Compose busy={busy} onGenerate={onGenerate} />
            <History history={history} />
          </div>
          <ReviewQueue drafts={drafts} status={status} onEdit={onEdit} onReject={onReject} onPublish={onPublish} onRestore={onRestore} onReopen={onReopen} />
        </div>
          </>
        ) : <p className="text-sm text-slate-500">Loading DraftDeck…</p>}
      </main>

      <footer className="mx-auto max-w-5xl px-4 py-6 text-center text-xs text-slate-400">
        DraftDeck drafts content. A human reviews, edits, and approves every publish. No auto-posting, no bulk publishing.
      </footer>
    </div>
  )
}

function OwnerGate({ onAuthenticated }: { onAuthenticated: () => Promise<void> }) {
  const [key, setKey] = useState('')
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState('')
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setChecking(true); setMessage('')
    try { await api.verifyOwner(key); setOwnerKey(key); await onAuthenticated() }
    catch (error) { clearOwnerKey(); setMessage((error as Error).message) }
    finally { setChecking(false) }
  }
  return (
    <form onSubmit={submit} className="mx-auto max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Owner access</h2>
      <p className="mt-1 text-sm text-slate-500">Unlock this tab to manage drafts and approve individual publishes.</p>
      <label htmlFor="owner-key" className="mt-4 block text-sm font-medium">Owner passphrase</label>
      <input id="owner-key" type="password" autoComplete="current-password" value={key} onChange={(event) => setKey(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
      {message && <p className="mt-2 text-sm text-red-600" role="alert">{message}</p>}
      <button disabled={checking || !key} className="mt-4 w-full rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white disabled:opacity-50">{checking ? 'Checking…' : 'Unlock'}</button>
    </form>
  )
}
