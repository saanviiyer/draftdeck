import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { detectClaims } from './claims.js'
import {
  buildSystemPrompt,
  buildUserPrompt,
  mockVariants,
  PLATFORM_LABELS,
} from './prompt.js'
import { selectAdapter } from './services/adapters.js'

const PORT = process.env.PORT || 8787
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5'
const HAS_KEY = Boolean(process.env.ANTHROPIC_API_KEY)
// Publishing is DISABLED by default. Only the exact string "true" enables it.
const PUBLISH_ENABLED = process.env.PUBLISH_ENABLED === 'true'
const VALID_PLATFORMS = Object.keys(PLATFORM_LABELS)

// ---------------------------------------------------------------------------
// In-memory store. Drafts start as 'draft' and can only become 'published'
// through the per-post publish gate below.
// ---------------------------------------------------------------------------
/** @type {Map<string, any>} */
const drafts = new Map()
/** @type {any[]} */
const history = []

function logHistory(entry) {
  history.unshift({ id: randomUUID(), at: new Date().toISOString(), ...entry })
  if (history.length > 500) history.length = 500
}

// ---------------------------------------------------------------------------
// Anthropic client (lazy — only constructed when a key is present).
// ---------------------------------------------------------------------------
let anthropic = null
async function getClient() {
  if (anthropic) return anthropic
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  anthropic = new Anthropic() // reads ANTHROPIC_API_KEY from env
  return anthropic
}

function parseVariants(rawText) {
  // Be forgiving: strip fences, find the JSON object, validate shape.
  let text = (rawText || '').trim()
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) text = fence[1].trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end !== -1) text = text.slice(start, end + 1)
  try {
    const obj = JSON.parse(text)
    if (Array.isArray(obj.variants)) {
      return obj.variants.map((v) => String(v)).filter(Boolean).slice(0, 3)
    }
  } catch {
    /* fall through */
  }
  // Last resort: treat the whole response as a single variant.
  return rawText ? [String(rawText).trim()] : []
}

async function generateVariants({ platform, topic, tone }) {
  if (!HAS_KEY) {
    return { variants: mockVariants({ platform, topic, tone }), source: 'mock' }
  }
  const client = await getClient()
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: buildSystemPrompt(),
    messages: [{ role: 'user', content: buildUserPrompt({ platform, topic, tone }) }],
  })
  const textBlock = message.content.find((b) => b.type === 'text')
  const variants = parseVariants(textBlock ? textBlock.text : '')
  return { variants, source: 'anthropic' }
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
const __dirname = path.dirname(fileURLToPath(import.meta.url))
// The built client (vite build) lands in <repo>/dist.
const CLIENT_DIST = path.resolve(__dirname, '../dist')

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))

// Serve the built client as static files. In dev the client is served by Vite
// on 5173; in production this is how the SPA is delivered. The /api routes below
// and the SPA catch-all at the end take precedence over static assets.
app.use(express.static(CLIENT_DIST))

app.get('/api/status', (_req, res) => {
  res.json({
    mockMode: !HAS_KEY,
    model: MODEL,
    publishEnabled: PUBLISH_ENABLED,
    platforms: VALID_PLATFORMS,
  })
})

// Draft: generate 1-3 variants and store each as a 'draft'.
app.post('/api/draft', async (req, res) => {
  const { platform, topic, tone } = req.body || {}
  if (!VALID_PLATFORMS.includes(platform)) {
    return res.status(400).json({ error: `platform must be one of: ${VALID_PLATFORMS.join(', ')}` })
  }
  if (!topic || !String(topic).trim()) {
    return res.status(400).json({ error: 'topic is required' })
  }
  try {
    const { variants, source } = await generateVariants({ platform, topic, tone })
    if (!variants.length) return res.status(502).json({ error: 'No draft variants were produced.' })

    const created = variants.map((text) => {
      const claims = detectClaims(text)
      const draft = {
        id: randomUUID(),
        platform,
        topic: String(topic),
        tone: tone ? String(tone) : '',
        text,
        status: 'draft', // 'draft' | 'published'
        needsReview: claims.hasClaims,
        reviewReasons: claims.reasons,
        source,
        createdAt: new Date().toISOString(),
        publishedAt: null,
        publishResult: null,
      }
      drafts.set(draft.id, draft)
      return draft
    })
    logHistory({ type: 'drafted', platform, topic: String(topic), count: created.length, source })
    res.json({ drafts: created, source })
  } catch (err) {
    console.error('Draft generation failed:', err)
    res.status(500).json({ error: 'Draft generation failed: ' + (err?.message || 'unknown error') })
  }
})

// Edit a draft in place (re-runs the claims check). Only 'draft' status.
app.patch('/api/draft/:id', (req, res) => {
  const draft = drafts.get(req.params.id)
  if (!draft) return res.status(404).json({ error: 'draft not found' })
  if (draft.status !== 'draft') {
    return res.status(409).json({ error: 'Only drafts can be edited.' })
  }
  const { text } = req.body || {}
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text is required' })
  }
  draft.text = text
  const claims = detectClaims(text)
  draft.needsReview = claims.hasClaims
  draft.reviewReasons = claims.reasons
  draft.editedAt = new Date().toISOString()
  logHistory({ type: 'edited', platform: draft.platform, draftId: draft.id })
  res.json({ draft })
})

app.delete('/api/draft/:id', (req, res) => {
  const draft = drafts.get(req.params.id)
  if (!draft) return res.status(404).json({ error: 'draft not found' })
  drafts.delete(req.params.id)
  logHistory({ type: 'rejected', platform: draft.platform, draftId: draft.id })
  res.json({ ok: true })
})

app.get('/api/drafts', (_req, res) => {
  res.json({ drafts: [...drafts.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) })
})

app.get('/api/history', (_req, res) => {
  res.json({ history })
})

// ---------------------------------------------------------------------------
// THE PUBLISH GATE (server-side enforced).
//
// - One post at a time: the id is in the URL. There is NO batch/approve-all
//   endpoint anywhere in this server.
// - Requires an explicit per-post confirmation flag in the body.
// - Honors PUBLISH_ENABLED: when false, only the dry-run adapter runs and no
//   external platform is ever contacted.
// ---------------------------------------------------------------------------
app.post('/api/publish/:id', async (req, res) => {
  const draft = drafts.get(req.params.id)
  if (!draft) return res.status(404).json({ error: 'draft not found' })
  if (draft.status === 'published') {
    return res.status(409).json({ error: 'This post was already published.' })
  }

  // Per-post human confirmation is mandatory. This is the "Approve & Publish"
  // click. Without it, nothing proceeds.
  if (!req.body || req.body.confirm !== true) {
    return res.status(400).json({
      error: 'Explicit per-post approval required. Send { "confirm": true }.',
    })
  }

  const adapter = selectAdapter(draft.platform, PUBLISH_ENABLED)
  try {
    const result = await adapter.publish({ platform: draft.platform, text: draft.text })
    draft.status = 'published'
    draft.publishedAt = new Date().toISOString()
    draft.publishResult = result
    logHistory({
      type: 'published',
      platform: draft.platform,
      draftId: draft.id,
      mode: result.mode || (PUBLISH_ENABLED ? 'real' : 'dry-run'),
    })
    res.json({ draft, result })
  } catch (err) {
    // Publishing failed (e.g. real adapter stub / missing creds). The draft
    // stays a draft — it is never marked published on failure.
    console.error('Publish failed:', err)
    logHistory({ type: 'publish_failed', platform: draft.platform, draftId: draft.id, error: err?.message })
    res.status(500).json({ error: err?.message || 'Publish failed.' })
  }
})

// SPA catch-all: any non-/api GET falls back to index.html so client routing
// works. All /api routes (including the publish gate) are declared above and
// take precedence.
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next()
  res.sendFile(path.join(CLIENT_DIST, 'index.html'), (err) => {
    if (err) next()
  })
})

app.listen(PORT, () => {
  console.log(`DraftDeck server listening on http://localhost:${PORT}`)
  console.log(`  Drafting mode : ${HAS_KEY ? `Anthropic (${MODEL})` : 'MOCK (no ANTHROPIC_API_KEY set)'}`)
  console.log(`  Publishing    : ${PUBLISH_ENABLED ? 'ENABLED (real adapters, credentials required)' : 'DISABLED — dry-run only (default)'}`)
})
