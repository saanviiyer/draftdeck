# draftdeck

DraftDeck uses AI to draft social media posts. You pick a platform and describe the post. The AI returns 1 to 3 draft variants, and you edit them in place. Nothing publishes until you approve each post one at a time. DraftDeck has no auto-posting and no bulk publish, and it does not generate fake news.

## Safety model

The code enforces these rules.

1. **Publishing is off by default.** The server reads `PUBLISH_ENABLED`, which defaults to `false`. While it is off, "Approve & Publish" runs the dry-run adapter. That adapter only logs and simulates. It never contacts an external platform. (`server/services/adapters.js`, `server/index.js`)
2. **Per-post human approval.** `POST /api/publish/:id` requires a `{ "confirm": true }` body and acts on one post by id. The server has no batch or "approve all" endpoint.
3. **Credentials stay on the server.** All AI calls and publish adapters run in the Express backend. The browser never sees API keys or platform tokens. For this reason the adapters live in `server/services/`.
4. **Content policy.** The drafting system prompt (`server/prompt.js`) tells the model to refuse disinformation, impersonation and fabricated claims presented as news. It also tells the model to avoid invented facts, numbers and quotes.
5. **Claims flagging.** A heuristic in `server/claims.js` marks drafts that seem to make factual or news-style claims (statistics, dates, "according to", superlatives and similar). These drafts get a "needs review" badge so you check them before you publish.
6. **No unattended mass generation.** Drafting is interactive. One topic gives 1 to 3 variants for review. No endpoint or UI generates hundreds of posts without a person.

## Draft lifecycle

- Edits use optimistic concurrency (`expectedRevision`). The server keeps up to 50 full revisions. You can restore an older version as a new revision.
- Reject is reversible. You can reopen rejected, simulated and failed items with their audit trail intact.
- An approval names the reviewed revision and sends a unique `Idempotency-Key`. A change to the text cancels the approval. Drafts with a claims flag also need an explicit verification acknowledgement.
- States go `draft -> publishing -> published | simulated | publish_failed`. A dry run is never labeled published and never gets a `publishedAt` timestamp.
- The server saves the `publishing` state before it calls an adapter. It rejects concurrent attempts. A repeated key returns the original result. An interrupted send never retries on its own. The owner checks the platform and resolves that attempt by hand.

Drafts, revisions, publish attempts and audit history live in an atomic snapshot file on the server. The previous snapshot stays as `store.json.bak`. If the data is corrupt, the server stops at startup. It does not overwrite the file.

## Run it

You need Node 20 or later.

```bash
git clone https://github.com/saanviiyer/draftdeck
cd draftdeck
npm install
npm run dev        # client http://localhost:5173, server http://localhost:8787
npm test
npm run build      # tsc, then vite build to dist/
```

The client proxies `/api` to the server. With no keys, the app runs in mock mode and dry-run mode. You can draft, edit, reject and "publish", but publishing only simulates and logs.

### Deploy

In production, one Express process serves the built client from `dist/` and the `/api` routes on one port. Other paths fall back to `index.html`. The publish gate is the same in production.

```bash
npm install
npm run build
OWNER_KEY='use-a-long-secret' npm start
```

Docker:

```bash
docker build -t draftdeck .
docker run -p 8787:8787 -e OWNER_KEY='use-a-long-secret' \
  -v draftdeck-data:/app/server/data draftdeck
```

Add `-e ANTHROPIC_API_KEY=...` to draft with Claude. The image does not set `PUBLISH_ENABLED`, so publishing stays in dry-run mode.

Render: `render.yaml` defines a Node web service. It pins `PUBLISH_ENABLED=false`, reads `ANTHROPIC_API_KEY` and `OWNER_KEY` as dashboard secrets and mounts a persistent disk at `/var/data`. Render sets `PORT`.

## Environment variables

Copy `.env.example` to `.env`. The app runs with no keys in mock and dry-run mode.

| Name | Required | Purpose |
|---|---|---|
| `OWNER_KEY` | Required in production | Owner password, at least 12 characters. Protects all draft, history and publish APIs. |
| `ANTHROPIC_API_KEY` | Optional | Claude drafting. Without it, the server returns local mock drafts. |
| `ANTHROPIC_MODEL` | Optional | Drafting model (default `claude-sonnet-5`) |
| `UPSTREAM_TIMEOUT_MS` | Optional | AI request timeout (default 30000) |
| `PORT` | Optional | Server port (default 8787) |
| `DATA_DIR` | Optional | Folder for the snapshot file (default `server/data`) |
| `TRUST_PROXY` | Optional | Set to `1` behind a reverse proxy |
| `PUBLISH_ENABLED` | Optional | `true` allows real publishing. Default `false` (dry run). |
| `TWITTER_API_KEY`, `TWITTER_API_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_SECRET` | Optional | Twitter/X credentials for a real adapter |
| `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_AUTHOR_URN` | Optional | LinkedIn credentials |
| `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_BUSINESS_ACCOUNT_ID` | Optional | Instagram Graph API credentials |
| `BLOG_API_ENDPOINT`, `BLOG_API_TOKEN` | Optional | Generic blog or CMS webhook |

The browser keeps `OWNER_KEY` only in tab-scoped `sessionStorage` and sends it as a Bearer token.

## Real publishing

Real publishing is hard to turn on by design. You must do all of these steps on your own machine and accounts:

1. Set `PUBLISH_ENABLED=true`.
2. Add your own platform credentials.
3. Write the live API call for the platform in `server/services/adapters.js`.

The bundled real adapters are stubs. They refuse to publish, even with credentials, and each reports `ready: false`. Only the dry-run adapter is ready. With publishing on, each post still needs its own "Approve & Publish" click.

If you turn on real publishing, you are responsible for all content sent from your accounts. This includes accuracy, compliance with each platform's terms and the effects of each post. Check every draft, most of all the ones marked "needs review". DraftDeck helps you draft. It is not a source of truth.

## Security limits

The API sets CSP, clickjacking, MIME and referrer headers. It applies strict body and prompt limits, AI timeouts and retries, constant-time owner checks and production-safe errors. Login, generation and publishing each have a separate rate limit. Dry-run logs leave out draft content.

The file store supports one instance only. Horizontal scaling or more than one owner would need Postgres transactions, organization-scoped authorization, a shared rate limiter and encrypted credential storage.

## API

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/status` | Mock or live mode, and publish flag |
| POST | `/api/draft` | Make 1 to 3 variants for `{platform, topic, tone}` |
| PATCH | `/api/draft/:id` | Revision-checked edit (runs the claims check again) |
| POST | `/api/draft/:id/restore` | Restore a kept revision as a new one |
| DELETE | `/api/draft/:id` | Soft-reject a draft |
| POST | `/api/draft/:id/reopen` | Reopen a rejected, simulated or failed item |
| GET | `/api/drafts` | List drafts |
| GET | `/api/history` | Audit history |
| POST | `/api/publish/:id` | The publish gate. Needs confirmation, the reviewed revision, claims acknowledgement and an idempotency key. |
| POST | `/api/publish/:id/resolve` | Resolve one interrupted attempt after you check the platform |

The server has no batch publish route.

## Layout

```
server/index.js              Express app and the per-post publish gate
server/prompt.js             drafting prompt, content policy, mock generator
server/claims.js             "needs review" claims detector
server/store.js              snapshot file store
server/security.js           headers, limits, owner checks
server/services/adapters.js  dry-run adapter and disabled real stubs
src/App.tsx                  app shell and state
src/api.ts                   typed client for /api
src/components/              Compose, ReviewQueue, DraftCard, History, Header
```

Frontend: Vite, React, TypeScript and Tailwind. Backend: Node and Express with `@anthropic-ai/sdk`.
