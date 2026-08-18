import { afterEach, describe, expect, it } from 'vitest'
import { createApp, parseVariants } from './index.js'
import { MemoryStore } from './store.js'

const original = { owner: process.env.OWNER_KEY, publish: process.env.PUBLISH_ENABLED, node: process.env.NODE_ENV }
afterEach(() => {
  for (const [key, value] of [['OWNER_KEY', original.owner], ['PUBLISH_ENABLED', original.publish], ['NODE_ENV', original.node]]) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value
  }
})

async function running(options = {}) {
  process.env.OWNER_KEY = 'strong-draftdeck-test-key'
  process.env.PUBLISH_ENABLED = options.publishEnabled ? 'true' : 'false'
  const store = new MemoryStore()
  const app = createApp({ store, adapterSelector: options.adapterSelector })
  const server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  const address = server.address()
  return { store, server, base: `http://127.0.0.1:${address.port}`, headers: { authorization: 'Bearer strong-draftdeck-test-key', 'content-type': 'application/json' } }
}
const close = (server) => new Promise((resolve) => server.close(resolve))

async function generate(base, headers) {
  const response = await fetch(`${base}/api/draft`, { method: 'POST', headers, body: JSON.stringify({ platform: 'twitter', topic: 'careful product shipping', tone: 'clear' }) })
  expect(response.status).toBe(201)
  return (await response.json()).drafts[0]
}

describe('draft lifecycle and publish gate', () => {
  it('protects owner data, versions edits, preserves rejects, and restores revisions', async () => {
    const { server, base, headers } = await running()
    try {
      expect((await fetch(`${base}/api/drafts`)).status).toBe(401)
      const draft = await generate(base, headers)
      let response = await fetch(`${base}/api/draft/${draft.id}`, { method: 'PATCH', headers, body: JSON.stringify({ text: 'Edited copy', expectedRevision: 1 }) })
      expect(response.status).toBe(200)
      const edited = (await response.json()).draft
      expect(edited.revision).toBe(2)
      response = await fetch(`${base}/api/draft/${draft.id}`, { method: 'PATCH', headers, body: JSON.stringify({ text: 'Stale overwrite', expectedRevision: 1 }) })
      expect(response.status).toBe(409)
      response = await fetch(`${base}/api/draft/${draft.id}/restore`, { method: 'POST', headers, body: JSON.stringify({ revision: 1, expectedRevision: 2 }) })
      const restored = (await response.json()).draft
      expect(restored.revision).toBe(3)
      expect(restored.text).toBe(draft.text)
      await fetch(`${base}/api/draft/${draft.id}`, { method: 'DELETE', headers })
      const values = await (await fetch(`${base}/api/drafts`, { headers })).json()
      expect(values.drafts[0].status).toBe('rejected')
      expect(values.drafts[0].revisions).toHaveLength(3)
    } finally { await close(server) }
  })

  it('binds approval to a revision, requires claim acknowledgement, and records dry-run as simulated', async () => {
    const { server, base, headers } = await running()
    try {
      let draft = await generate(base, headers)
      let response = await fetch(`${base}/api/draft/${draft.id}`, { method: 'PATCH', headers, body: JSON.stringify({ text: 'According to a study, results improved 50%.', expectedRevision: 1 }) })
      draft = (await response.json()).draft
      const key = 'publish-test-idempotency-key-0001'
      const publish = (body) => fetch(`${base}/api/publish/${draft.id}`, { method: 'POST', headers: { ...headers, 'idempotency-key': key }, body: JSON.stringify(body) })
      expect((await publish({ confirm: true, approvalRevision: 1, claimsAcknowledged: true })).status).toBe(409)
      expect((await publish({ confirm: true, approvalRevision: 2 })).status).toBe(400)
      response = await publish({ confirm: true, approvalRevision: 2, claimsAcknowledged: true })
      expect(response.status).toBe(200)
      const result = await response.json()
      expect(result.draft.status).toBe('simulated')
      expect(result.draft.publishedAt).toBeNull()
      response = await publish({ confirm: true, approvalRevision: 2, claimsAcknowledged: true })
      expect((await response.json()).idempotent).toBe(true)
    } finally { await close(server) }
  })

  it('blocks concurrent publish attempts and never marks an adapter failure published', async () => {
    let release
    const waiting = new Promise((resolve) => { release = resolve })
    const adapter = { publish: async () => { await waiting; return { mode: 'real', platform: 'twitter', message: 'sent', externalId: '1' } } }
    const { server, base, headers } = await running({ publishEnabled: true, adapterSelector: () => adapter })
    try {
      const draft = await generate(base, headers)
      const body = JSON.stringify({ confirm: true, approvalRevision: 1, claimsAcknowledged: true })
      const first = fetch(`${base}/api/publish/${draft.id}`, { method: 'POST', headers: { ...headers, 'idempotency-key': 'concurrent-key-000000000001' }, body })
      await new Promise((resolve) => setTimeout(resolve, 20))
      const second = await fetch(`${base}/api/publish/${draft.id}`, { method: 'POST', headers: { ...headers, 'idempotency-key': 'concurrent-key-000000000002' }, body })
      expect(second.status).toBe(409)
      release()
      expect((await first).status).toBe(200)
    } finally { await close(server) }
  })

  it('keeps adapter failures retryable and enforces platform limits before any attempt', async () => {
    const failing = { publish: async () => { throw new Error('upstream refused') } }
    const { server, base, headers } = await running({ publishEnabled: true, adapterSelector: () => failing })
    try {
      let draft = await generate(base, headers)
      const failedOptions = { method: 'POST', headers: { ...headers, 'idempotency-key': 'failure-key-000000000000001' }, body: JSON.stringify({ confirm: true, approvalRevision: 1, claimsAcknowledged: true }) }
      let response = await fetch(`${base}/api/publish/${draft.id}`, failedOptions)
      expect(response.status).toBe(502)
      response = await fetch(`${base}/api/publish/${draft.id}`, failedOptions)
      expect(response.status).toBe(502)
      expect((await response.json()).idempotent).toBe(true)
      draft = (await (await fetch(`${base}/api/drafts`, { headers })).json()).drafts[0]
      expect(draft.status).toBe('publish_failed')
      expect(draft.publishedAt).toBeNull()
      expect((await fetch(`${base}/api/draft/${draft.id}/reopen`, { method: 'POST', headers, body: '{}' })).status).toBe(200)
      response = await fetch(`${base}/api/draft/${draft.id}`, { method: 'PATCH', headers, body: JSON.stringify({ text: 'x'.repeat(281), expectedRevision: 1 }) })
      draft = (await response.json()).draft
      response = await fetch(`${base}/api/publish/${draft.id}`, { method: 'POST', headers: { ...headers, 'idempotency-key': 'too-long-key-0000000000001' }, body: JSON.stringify({ confirm: true, approvalRevision: 2, claimsAcknowledged: true }) })
      expect(response.status).toBe(400)
      expect((await (await fetch(`${base}/api/drafts`, { headers })).json()).drafts[0].publishAttempts).toHaveLength(1)
    } finally { await close(server) }
  })
})

describe('generation parsing and production safety', () => {
  it('bounds variants and rejects production without owner auth', () => {
    expect(parseVariants('{"variants":[" one ","two","three","four"]}', 'twitter')).toEqual(['one', 'two', 'three'])
    process.env.NODE_ENV = 'production'; delete process.env.OWNER_KEY
    expect(() => createApp({ store: new MemoryStore() })).toThrow(/OWNER_KEY/)
  })
})
