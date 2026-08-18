// Publish adapters.
//
// SAFETY: These live server-side so real platform credentials never reach the
// browser. The DEFAULT adapter is the dry-run adapter, which only logs and
// NEVER contacts an external platform. Real adapters are stubs that stay
// disabled until PUBLISH_ENABLED=true AND the operator provides credentials.

/**
 * The dry-run adapter. Simulates a publish and logs it. No network call.
 */
export const dryRunAdapter = {
  id: 'dry-run',
  ready: true,
  async publish({ platform, idempotencyKey }) {
    console.log(`[DRY-RUN] Simulated one ${platform} publish (${idempotencyKey}). Content omitted from logs.`)
    return {
      mode: 'dry-run',
      platform,
      message: 'Simulated publish only. Nothing was sent to any external platform.',
      externalId: null,
    }
  },
}

// ---------------------------------------------------------------------------
// Real platform stubs. Each is DISABLED by default. They are intentionally not
// implemented against live APIs — implementing them is an explicit, deliberate
// act by the operator who owns the credentials and accepts responsibility.
// ---------------------------------------------------------------------------

function makeStub(id, requiredEnv) {
  return {
    id,
    get ready() { return false },
    requiredEnv,
    async publish() {
      const missing = requiredEnv.filter((k) => !process.env[k])
      if (missing.length) {
        throw new Error(
          `Real publishing to "${id}" is not configured. Missing credentials: ${missing.join(', ')}.`,
        )
      }
      // Credentials exist but the live integration is intentionally not wired
      // up. Refuse loudly rather than silently pretending to publish.
      throw new Error(
        `The "${id}" adapter is a stub. Implement the live API call in server/services/adapters.js before enabling real publishing. This is deliberately left to the operator who owns the account.`,
      )
    },
  }
}

export const realAdapters = {
  twitter: makeStub('twitter', [
    'TWITTER_API_KEY',
    'TWITTER_API_SECRET',
    'TWITTER_ACCESS_TOKEN',
    'TWITTER_ACCESS_SECRET',
  ]),
  linkedin: makeStub('linkedin', ['LINKEDIN_ACCESS_TOKEN', 'LINKEDIN_AUTHOR_URN']),
  instagram: makeStub('instagram', [
    'INSTAGRAM_ACCESS_TOKEN',
    'INSTAGRAM_BUSINESS_ACCOUNT_ID',
  ]),
  blog: makeStub('blog', ['BLOG_API_ENDPOINT', 'BLOG_API_TOKEN']),
}

/**
 * Choose the adapter for a publish request.
 *
 * @param {string} platform
 * @param {boolean} publishEnabled
 */
export function selectAdapter(platform, publishEnabled) {
  if (!publishEnabled) return dryRunAdapter
  const adapter = realAdapters[platform]
  if (!adapter) throw new Error(`No adapter exists for "${platform}".`)
  return adapter
}

export function adapterCapabilities(publishEnabled) {
  return Object.fromEntries(Object.entries(realAdapters).map(([platform, adapter]) => [platform, {
    mode: publishEnabled ? 'real' : 'dry-run',
    ready: publishEnabled ? adapter.ready : true,
  }]))
}
