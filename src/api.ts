import type { Draft, HistoryEntry, Platform, PublishResult, Status } from './types'

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`)
  return data as T
}

export const api = {
  status: () => req<Status>('/api/status'),

  drafts: () => req<{ drafts: Draft[] }>('/api/drafts'),

  history: () => req<{ history: HistoryEntry[] }>('/api/history'),

  createDrafts: (payload: { platform: Platform; topic: string; tone: string }) =>
    req<{ drafts: Draft[]; source: string }>('/api/draft', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  editDraft: (id: string, text: string) =>
    req<{ draft: Draft }>(`/api/draft/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ text }),
    }),

  deleteDraft: (id: string) =>
    req<{ ok: boolean }>(`/api/draft/${id}`, { method: 'DELETE' }),

  // Per-post approval gate. `confirm: true` is the explicit human approval.
  publish: (id: string) =>
    req<{ draft: Draft; result: PublishResult }>(`/api/publish/${id}`, {
      method: 'POST',
      body: JSON.stringify({ confirm: true }),
    }),
}
