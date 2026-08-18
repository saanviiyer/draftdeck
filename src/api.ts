import type { Draft, HistoryEntry, Platform, PublishResult, Status } from './types'

const OWNER_KEY = 'draftdeck_owner_key'
export const getOwnerKey = () => sessionStorage.getItem(OWNER_KEY) || ''
export const setOwnerKey = (value: string) => sessionStorage.setItem(OWNER_KEY, value)
export const clearOwnerKey = () => sessionStorage.removeItem(OWNER_KEY)

async function req<T>(url: string, init?: RequestInit, owner = true, explicitKey?: string): Promise<T> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 30_000)
  let res: Response
  try { res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(owner ? { Authorization: `Bearer ${explicitKey ?? getOwnerKey()}` } : {}) },
    signal: controller.signal,
    ...init,
  }) } catch (error) {
    if ((error as Error).name === 'AbortError') throw new Error('The request timed out. Please try again.')
    throw new Error('Could not reach DraftDeck. Check your connection and try again.')
  } finally { window.clearTimeout(timer) }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`)
  return data as T
}

export const api = {
  status: () => req<Status>('/api/status', undefined, false),
  verifyOwner: (key: string) => req<{ ok: boolean }>('/api/owner/verify', { method: 'POST', body: '{}' }, true, key),

  drafts: () => req<{ drafts: Draft[] }>('/api/drafts'),

  history: () => req<{ history: HistoryEntry[] }>('/api/history'),

  createDrafts: (payload: { platform: Platform; topic: string; tone: string }) =>
    req<{ drafts: Draft[]; source: string }>('/api/draft', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  editDraft: (id: string, text: string, expectedRevision: number) =>
    req<{ draft: Draft }>(`/api/draft/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ text, expectedRevision }),
    }),

  deleteDraft: (id: string) =>
    req<{ draft: Draft }>(`/api/draft/${id}`, { method: 'DELETE' }),

  restoreDraft: (id: string, revision: number, expectedRevision: number) =>
    req<{ draft: Draft }>(`/api/draft/${id}/restore`, { method: 'POST', body: JSON.stringify({ revision, expectedRevision }) }),

  reopenDraft: (id: string) => req<{ draft: Draft }>(`/api/draft/${id}/reopen`, { method: 'POST', body: '{}' }),

  // Per-post approval gate. `confirm: true` is the explicit human approval.
  publish: (draft: Draft) =>
    req<{ draft: Draft; result: PublishResult }>(`/api/publish/${draft.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getOwnerKey()}`, 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({ confirm: true, approvalRevision: draft.revision, claimsAcknowledged: true }),
    }),
}
