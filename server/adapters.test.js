import { describe, expect, it } from 'vitest'
import { adapterCapabilities, dryRunAdapter, selectAdapter } from './services/adapters.js'

describe('publish adapters', () => {
  it('is explicit about dry-run and bundled real adapter readiness', async () => {
    expect((await dryRunAdapter.publish({ platform: 'twitter', text: 'secret', idempotencyKey: 'test-key' })).mode).toBe('dry-run')
    expect(Object.values(adapterCapabilities(true)).every((capability) => capability.ready === false)).toBe(true)
    await expect(selectAdapter('twitter', true).publish({})).rejects.toThrow(/not configured|stub/)
  })
})
