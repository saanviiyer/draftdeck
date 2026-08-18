export type Platform = 'twitter' | 'linkedin' | 'instagram' | 'blog'

export type DraftStatus = 'draft' | 'rejected' | 'publishing' | 'published' | 'simulated' | 'publish_failed'

export interface DraftRevision { revision: number; text: string; at: string; actor: string }
export interface PublishAttempt { idempotencyKey: string; revision: number; startedAt: string; completedAt?: string; outcome: string; mode: string; error?: string }

export interface Draft {
  id: string
  platform: Platform
  topic: string
  tone: string
  text: string
  status: DraftStatus
  revision: number
  revisions: DraftRevision[]
  needsReview: boolean
  reviewReasons: string[]
  source: 'mock' | 'anthropic'
  createdAt: string
  editedAt?: string
  publishedAt: string | null
  publishResult: PublishResult | null
  publishAttempts: PublishAttempt[]
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
  ownerProtected: boolean
  platforms: Platform[]
  adapterCapabilities: Record<Platform, { mode: 'real' | 'dry-run'; ready: boolean }>
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
  revision?: number
  restoredFrom?: number
  outcome?: string
}
