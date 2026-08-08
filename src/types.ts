export type Platform = 'twitter' | 'linkedin' | 'instagram' | 'blog'

export type DraftStatus = 'draft' | 'published'

export interface Draft {
  id: string
  platform: Platform
  topic: string
  tone: string
  text: string
  status: DraftStatus
  needsReview: boolean
  reviewReasons: string[]
  source: 'mock' | 'anthropic'
  createdAt: string
  editedAt?: string
  publishedAt: string | null
  publishResult: PublishResult | null
}

export interface PublishResult {
  mode: 'dry-run' | 'real'
  platform: string
  message: string
  externalId: string | null
}

export interface Status {
  mockMode: boolean
  model: string
  publishEnabled: boolean
  platforms: Platform[]
}

export interface HistoryEntry {
  id: string
  at: string
  type: string
  platform?: string
  topic?: string
  count?: number
  source?: string
  mode?: string
  draftId?: string
  error?: string
}
