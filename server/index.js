import 'dotenv/config'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { detectClaims } from './claims.js'
import { buildSystemPrompt, buildUserPrompt, mockVariants, PLATFORM_LABELS, PLATFORM_LIMITS } from './prompt.js'
import { adapterCapabilities, selectAdapter } from './services/adapters.js'
import { addHistory, FileStore } from './store.js'
import { rateLimit, secureEqual, securityHeaders } from './security.js'

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5'
const VALID_PLATFORMS = Object.keys(PLATFORM_LABELS)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLIENT_DIST = path.resolve(__dirname, '../dist')
let anthropic = null

async function getClient() {
  if (anthropic) return anthropic
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  anthropic = new Anthropic({ timeout: Number(process.env.UPSTREAM_TIMEOUT_MS) || 30_000, maxRetries: 2 })
  return anthropic
}

export function parseVariants(rawText, platform) {
  let text = String(rawText || '').trim()
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) text = fence[1].trim()
  const start = text.indexOf('{'); const end = text.lastIndexOf('}')
  if (start !== -1 && end !== -1) text = text.slice(start, end + 1)
  let values = []
  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed.variants)) values = parsed.variants
  } catch { if (rawText) values = [rawText] }
  const max = platform === 'blog' ? 20_000 : 5_000
  return values.map((value) => String(value).trim().slice(0, max)).filter(Boolean).slice(0, 3)
}

async function generateVariants({ platform, topic, tone, hasKey }) {
  if (!hasKey) return { variants: mockVariants({ platform, topic, tone }), source: 'mock' }
  const client = await getClient()
  const message = await client.messages.create({
    model: MODEL, max_tokens: 2_000, system: buildSystemPrompt(),
    messages: [{ role: 'user', content: buildUserPrompt({ platform, topic, tone }) }],
  })
  const text = message.content.filter((block) => block.type === 'text').map((block) => block.text).join('\n')
  return { variants: parseVariants(text, platform), source: 'anthropic' }
}

function validId(value) { return typeof value === 'string' && value.length <= 150 && /^[a-zA-Z0-9_-]+$/.test(value) }
function bearer(req) { const value = req.get('authorization') || ''; return value.startsWith('Bearer ') ? value.slice(7) : '' }
function cleanString(value, max) { return typeof value === 'string' ? value.trim().slice(0, max) : '' }
function publicError(error, fallback) { return process.env.NODE_ENV === 'production' ? fallback : error?.message || fallback }

export function createApp({ store = new FileStore(), adapterSelector = selectAdapter } = {}) {
  const ownerKey = process.env.OWNER_KEY || ''
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY)
  const publishEnabled = process.env.PUBLISH_ENABLED === 'true'
  if (process.env.NODE_ENV === 'production' && ownerKey.length < 12) {
    throw new Error('OWNER_KEY must be at least 12 characters in production.')
  }
  const ownerProtected = Boolean(ownerKey)
  const app = express()
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1)
  app.disable('x-powered-by')
  app.use(securityHeaders)
  app.use(express.json({ limit: '256kb', strict: true }))
  app.use('/api', rateLimit(60_000, 180))

  function requireOwner(req, res, next) {
    if (!ownerProtected && process.env.NODE_ENV !== 'production') return next()
    const provided = bearer(req)
    if (provided && secureEqual(provided, ownerKey)) return next()
    res.set('WWW-Authenticate', 'Bearer realm="draftdeck-owner"')
    return res.status(401).json({ error: 'Owner authentication required.' })
  }

  app.get('/api/status', (_req, res) => res.json({
    mockMode: !hasKey, model: MODEL, publishEnabled, ownerProtected,
    platforms: VALID_PLATFORMS, adapterCapabilities: adapterCapabilities(publishEnabled),
  }))
  app.post('/api/owner/verify', rateLimit(15 * 60_000, 10), requireOwner, (_req, res) => res.json({ ok: true }))

  app.use(['/api/draft', '/api/draft/*', '/api/drafts', '/api/history', '/api/publish/*'], requireOwner)

  app.post('/api/draft', rateLimit(60_000, 10), async (req, res) => {
    const platform = cleanString(req.body?.platform, 30)
    const topic = cleanString(req.body?.topic, 4_000)
    const tone = cleanString(req.body?.tone, 120)
    if (!VALID_PLATFORMS.includes(platform)) return res.status(400).json({ error: `platform must be one of: ${VALID_PLATFORMS.join(', ')}` })
    if (!topic) return res.status(400).json({ error: 'topic is required' })
    try {
      const { variants, source } = await generateVariants({ platform, topic, tone, hasKey })
      if (!variants.length) return res.status(502).json({ error: 'No valid draft variants were produced.' })
      const created = store.transaction((snapshot) => {
        const now = new Date().toISOString()
        const drafts = variants.map((text) => {
          const claims = detectClaims(text)
          return {
            id: randomUUID(), platform, topic, tone, text, status: 'draft', revision: 1,
            revisions: [{ revision: 1, text, at: now, actor: source }],
            needsReview: claims.hasClaims, reviewReasons: claims.reasons, source,
            createdAt: now, editedAt: null, rejectedAt: null, publishedAt: null,
            publishResult: null, publishAttempts: [],
          }
        })
        snapshot.drafts.unshift(...drafts)
        if (snapshot.drafts.length > 500) snapshot.drafts.length = 500
        addHistory(snapshot, { type: 'drafted', platform, topic, count: drafts.length, source })
        return drafts
      })
      res.status(201).json({ drafts: created, source })
    } catch (error) {
      console.error('Draft generation failed:', error)
      res.status(502).json({ error: publicError(error, 'Draft generation is temporarily unavailable.') })
    }
  })

  app.patch('/api/draft/:id', (req, res) => {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'draft not found' })
    const text = cleanString(req.body?.text, 20_000)
    const expectedRevision = Number(req.body?.expectedRevision)
    if (!text) return res.status(400).json({ error: 'text is required' })
    try {
      const draft = store.transaction((snapshot) => {
        const item = snapshot.drafts.find((value) => value.id === req.params.id)
        if (!item) throw Object.assign(new Error('draft not found'), { status: 404 })
        if (item.status !== 'draft') throw Object.assign(new Error('Only active drafts can be edited.'), { status: 409 })
        if (!Number.isInteger(expectedRevision) || expectedRevision !== item.revision) throw Object.assign(new Error('Draft changed since you opened it. Refresh before saving.'), { status: 409 })
        const now = new Date().toISOString(); const claims = detectClaims(text)
        item.text = text; item.revision += 1; item.editedAt = now
        item.revisions.push({ revision: item.revision, text, at: now, actor: 'human' })
        if (item.revisions.length > 50) item.revisions = item.revisions.slice(-50)
        item.needsReview = claims.hasClaims; item.reviewReasons = claims.reasons
        addHistory(snapshot, { type: 'edited', platform: item.platform, draftId: item.id, revision: item.revision })
        return item
      })
      res.json({ draft })
    } catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Edit failed.' }) }
  })

  app.post('/api/draft/:id/restore', (req, res) => {
    const target = Number(req.body?.revision); const expected = Number(req.body?.expectedRevision)
    try {
      const draft = store.transaction((snapshot) => {
        const item = snapshot.drafts.find((value) => value.id === req.params.id)
        if (!item) throw Object.assign(new Error('draft not found'), { status: 404 })
        if (item.status !== 'draft' || item.revision !== expected) throw Object.assign(new Error('Draft changed or is no longer editable.'), { status: 409 })
        const revision = item.revisions.find((value) => value.revision === target)
        if (!revision) throw Object.assign(new Error('Revision not found.'), { status: 404 })
        const now = new Date().toISOString(); item.revision += 1; item.text = revision.text; item.editedAt = now
        item.revisions.push({ revision: item.revision, text: item.text, at: now, actor: 'restore' })
        const claims = detectClaims(item.text); item.needsReview = claims.hasClaims; item.reviewReasons = claims.reasons
        addHistory(snapshot, { type: 'restored', platform: item.platform, draftId: item.id, revision: item.revision, restoredFrom: target })
        return item
      })
      res.json({ draft })
    } catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Restore failed.' }) }
  })

  app.delete('/api/draft/:id', (req, res) => {
    try {
      const draft = store.transaction((snapshot) => {
        const item = snapshot.drafts.find((value) => value.id === req.params.id)
        if (!item) throw Object.assign(new Error('draft not found'), { status: 404 })
        if (item.status !== 'draft') throw Object.assign(new Error('Only active drafts can be rejected.'), { status: 409 })
        item.status = 'rejected'; item.rejectedAt = new Date().toISOString()
        addHistory(snapshot, { type: 'rejected', platform: item.platform, draftId: item.id })
        return item
      })
      res.json({ draft })
    } catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Reject failed.' }) }
  })

  app.post('/api/draft/:id/reopen', (req, res) => {
    try {
      const draft = store.transaction((snapshot) => {
        const item = snapshot.drafts.find((value) => value.id === req.params.id)
        if (!item) throw Object.assign(new Error('draft not found'), { status: 404 })
        if (!['rejected', 'simulated', 'publish_failed'].includes(item.status)) throw Object.assign(new Error('This item cannot be reopened.'), { status: 409 })
        item.status = 'draft'; item.rejectedAt = null
        addHistory(snapshot, { type: 'reopened', platform: item.platform, draftId: item.id })
        return item
      })
      res.json({ draft })
    } catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Reopen failed.' }) }
  })

  app.get('/api/drafts', (_req, res) => res.json({ drafts: store.listDrafts() }))
  app.get('/api/history', (_req, res) => res.json({ history: store.listHistory() }))

  app.post('/api/publish/:id', rateLimit(60_000, 20), async (req, res) => {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'draft not found' })
    if (req.body?.confirm !== true) return res.status(400).json({ error: 'Explicit per-post approval required.' })
    const approvalRevision = Number(req.body?.approvalRevision)
    const idempotencyKey = cleanString(req.get('idempotency-key'), 200)
    if (idempotencyKey.length < 16) return res.status(400).json({ error: 'A unique Idempotency-Key is required.' })
    let prepared
    try {
      prepared = store.transaction((snapshot) => {
        const draft = snapshot.drafts.find((value) => value.id === req.params.id)
        if (!draft) throw Object.assign(new Error('draft not found'), { status: 404 })
        const prior = draft.publishAttempts.find((attempt) => attempt.idempotencyKey === idempotencyKey)
        if (prior) return { draft, prior }
        if (draft.status === 'publishing') throw Object.assign(new Error('A publish attempt is already in progress.'), { status: 409 })
        if (draft.status === 'published') throw Object.assign(new Error('This post is already published.'), { status: 409 })
        if (draft.status !== 'draft') throw Object.assign(new Error('Reopen this item before publishing it again.'), { status: 409 })
        if (!Number.isInteger(approvalRevision) || approvalRevision !== draft.revision) throw Object.assign(new Error('Approval does not match the current draft revision.'), { status: 409 })
        if (draft.text.length > PLATFORM_LIMITS[draft.platform]) throw Object.assign(new Error(`This ${draft.platform} draft exceeds the ${PLATFORM_LIMITS[draft.platform]} character limit.`), { status: 400 })
        if (draft.needsReview && req.body?.claimsAcknowledged !== true) throw Object.assign(new Error('Acknowledge that flagged claims were verified before publishing.'), { status: 400 })
        const attempt = { idempotencyKey, revision: draft.revision, startedAt: new Date().toISOString(), outcome: 'pending', mode: publishEnabled ? 'real' : 'dry-run' }
        draft.publishAttempts.push(attempt); if (draft.publishAttempts.length > 20) draft.publishAttempts = draft.publishAttempts.slice(-20)
        draft.status = 'publishing'
        addHistory(snapshot, { type: 'publish_started', platform: draft.platform, draftId: draft.id, revision: draft.revision, mode: attempt.mode })
        return { draft, attempt }
      })
    } catch (error) { return res.status(error.status || 500).json({ error: error.status ? error.message : 'Publish preparation failed.' }) }

    if (prepared.prior) {
      if (prepared.prior.outcome === 'failed') {
        return res.status(502).json({ error: prepared.prior.error || 'The original publish attempt failed.', draft: prepared.draft, idempotent: true })
      }
      const code = prepared.prior.outcome === 'pending' ? 202 : 200
      return res.status(code).json({ draft: prepared.draft, result: prepared.prior.result || null, idempotent: true })
    }
    try {
      const adapter = adapterSelector(prepared.draft.platform, publishEnabled)
      const result = await adapter.publish({ platform: prepared.draft.platform, text: prepared.draft.text, idempotencyKey })
      if (!result || !['real', 'dry-run'].includes(result.mode) || typeof result.message !== 'string') throw new Error('Platform adapter returned an invalid publish result.')
      const draft = store.transaction((snapshot) => {
        const item = snapshot.drafts.find((value) => value.id === req.params.id)
        const attempt = item?.publishAttempts.find((value) => value.idempotencyKey === idempotencyKey)
        if (!item || !attempt || item.status !== 'publishing') throw new Error('Publish state changed unexpectedly.')
        attempt.outcome = result.mode === 'dry-run' ? 'simulated' : 'published'; attempt.completedAt = new Date().toISOString(); attempt.result = result
        item.status = attempt.outcome; item.publishResult = result
        if (attempt.outcome === 'published') item.publishedAt = attempt.completedAt
        addHistory(snapshot, { type: attempt.outcome, platform: item.platform, draftId: item.id, revision: item.revision, mode: result.mode })
        return item
      })
      return res.json({ draft, result, idempotent: false })
    } catch (error) {
      console.error('Publish failed:', error)
      store.transaction((snapshot) => {
        const item = snapshot.drafts.find((value) => value.id === req.params.id)
        const attempt = item?.publishAttempts.find((value) => value.idempotencyKey === idempotencyKey)
        if (item && attempt && item.status === 'publishing') {
          attempt.outcome = 'failed'; attempt.completedAt = new Date().toISOString(); attempt.error = String(error?.message || 'Publish failed').slice(0, 500)
          item.status = 'publish_failed'
          addHistory(snapshot, { type: 'publish_failed', platform: item.platform, draftId: item.id, error: attempt.error })
        }
      })
      return res.status(502).json({ error: publicError(error, 'The platform adapter did not confirm publication. The draft was not marked published.') })
    }
  })

  app.post('/api/publish/:id/resolve', (req, res) => {
    if (req.body?.confirm !== true || !['published', 'not_published'].includes(req.body?.outcome)) return res.status(400).json({ error: 'Explicit resolution and valid outcome required.' })
    try {
      const draft = store.transaction((snapshot) => {
        const item = snapshot.drafts.find((value) => value.id === req.params.id)
        if (!item) throw Object.assign(new Error('draft not found'), { status: 404 })
        if (item.status !== 'publishing') throw Object.assign(new Error('Only an interrupted publishing state can be reconciled.'), { status: 409 })
        const attempt = [...item.publishAttempts].reverse().find((value) => value.outcome === 'pending')
        if (!attempt) throw Object.assign(new Error('No interrupted attempt found.'), { status: 409 })
        attempt.completedAt = new Date().toISOString(); attempt.outcome = req.body.outcome === 'published' ? 'published' : 'failed'
        item.status = req.body.outcome === 'published' ? 'published' : 'publish_failed'
        if (item.status === 'published') { item.publishedAt = attempt.completedAt; item.publishResult = { mode: 'real', platform: item.platform, message: 'Manually reconciled as published.', externalId: cleanString(req.body.externalId, 500) || null } }
        addHistory(snapshot, { type: 'publish_reconciled', platform: item.platform, draftId: item.id, outcome: req.body.outcome })
        return item
      })
      res.json({ draft })
    } catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Resolution failed.' }) }
  })

  app.use(express.static(CLIENT_DIST))
  app.get('*', (req, res, next) => req.path.startsWith('/api') ? next() : res.sendFile(path.join(CLIENT_DIST, 'index.html'), (error) => error ? next() : undefined))
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }))
  app.use((error, _req, res, _next) => {
    if (error instanceof SyntaxError) return res.status(400).json({ error: 'Malformed JSON request.' })
    console.error(error); res.status(500).json({ error: 'Internal server error.' })
  })
  return app
}

export function startServer(port = Number(process.env.PORT) || 8787, options) {
  const app = createApp(options); const server = app.listen(port, () => {
    const address = server.address(); const activePort = typeof address === 'object' && address ? address.port : port
    console.log(`DraftDeck server listening on http://localhost:${activePort}`)
  }); return server
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) startServer()
