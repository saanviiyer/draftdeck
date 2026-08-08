import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
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
    api.status().then(setStatus).catch(() => setStatus(null))
    refresh()
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
    async (id: string, text: string) => {
      setError(null)
      try {
        await api.editDraft(id, text)
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
    async (id: string) => {
      setError(null)
      try {
        await api.publish(id)
        await refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Publish failed')
        await refresh()
      }
    },
    [refresh],
  )

  return (
    <div className="min-h-screen">
      <Header status={status} />

      <main className="mx-auto max-w-5xl px-4 py-6">
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
          <ReviewQueue drafts={drafts} status={status} onEdit={onEdit} onReject={onReject} onPublish={onPublish} />
        </div>
      </main>

      <footer className="mx-auto max-w-5xl px-4 py-6 text-center text-xs text-slate-400">
        DraftDeck drafts content. A human reviews, edits, and approves every publish. No auto-posting, no bulk publishing.
      </footer>
    </div>
  )
}
