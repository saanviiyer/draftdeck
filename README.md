# DraftDeck

An AI content-drafting assistant that automates the painful part of the social
workflow — **drafting** — while keeping a human firmly in control of publishing.

You pick a platform and describe what you want. The AI returns 1–3 draft
variants. You review, edit in place, and must **explicitly approve each post**
before anything is ever published. There is **no auto-posting, no bulk publish,
and no fake-news generation.**

---

## Safety model

DraftDeck is built so the risky part — sending content to the outside world — is
gated, explicit, and off by default. These are enforced in code, not just docs:

1. **Publishing is off by default (dry-run).** The server reads `PUBLISH_ENABLED`
   and defaults to `false`. While disabled, "Approve & Publish" runs the
   **dry-run adapter**, which only logs and simulates. **No external platform is
   ever contacted.** (`server/services/adapters.js`, `server/index.js`)

2. **Two-step, per-post human gate.** Nothing is published without a per-post
   "Approve & Publish" click. Server-side, `POST /api/publish/:id` requires an
   explicit `{ "confirm": true }` body and targets exactly one post by id.
   **There is deliberately no batch / "approve all" endpoint** anywhere in the
   server. Approval is one post at a time.

3. **Credentials stay server-side.** All AI calls and all publish adapters run
   on the small Node/Express backend. The browser never sees API keys or
   platform tokens. (This is why the publish adapters live in
   `server/services/` rather than `src/services/` — they must never ship to the
   client.)

4. **Content policy at generation time.** The drafting system prompt
   (`server/prompt.js`) instructs the model to refuse disinformation,
   impersonation, and fabricated claims presented as news, and to avoid
   inventing specific facts/numbers/quotes.

5. **Claims flagging.** A lightweight heuristic (`server/claims.js`) flags
   drafts that appear to make factual or news-style claims (statistics, dates,
   "according to", superlatives, etc.) with a **"needs review"** badge, reminding
   the human to verify before publishing.

6. **No unattended mass generation.** Drafting is interactive: one topic → 1–3
   reviewed variants. There is no endpoint or UI for generating hundreds of
   posts unattended.

---

## How it works

- **Frontend:** Vite + React + TypeScript + Tailwind (`src/`).
- **Backend:** Node + Express (`server/`) — handles AI drafting and the publish
  gate so credentials never touch the browser.
- **AI:** `@anthropic-ai/sdk`, model `claude-sonnet-5`, key from
  `ANTHROPIC_API_KEY`. **If the key is unset, the server runs in MOCK MODE** and
  returns realistic draft variants locally — the app is fully usable with zero
  setup.

State (drafts + history) lives in the server's memory for the session.

---

## Run it

Requires Node 18+.

```bash
npm install
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:8787 (the client proxies `/api` to it)

Out of the box this runs in **mock mode** (no API key needed) and **dry-run**
(publishing disabled). You can draft, edit, reject, and "publish" — publishing
will only simulate and log.

To use the real Anthropic API for drafting, copy `.env.example` to `.env` and set
`ANTHROPIC_API_KEY`. Drafting still works identically; only the source of the
variants changes.

### Build (type-checked)

```bash
npm run build
```

Runs `tsc` (no TS errors) then `vite build` to produce `dist/`.

---

## Deploy

This ships as a **single service**: the Express server serves the built client (`dist/`) as static
files and also hosts `/api` on one port. `/api` takes precedence; every other path falls back to
`index.html` so client routing works. **The publish gate is unchanged** — every publish still requires
`{confirm:true}` per post, there is no batch route, and `PUBLISH_ENABLED` still defaults to `false`
(dry-run only).

### Single-service flow (any Node host)

```bash
npm install        # install deps
npm run build      # typecheck + build the client to dist/
npm start          # NODE_ENV=production, serves API + client on PORT (default 8787)
```

With no `ANTHROPIC_API_KEY`, drafting runs in **mock mode**. `PUBLISH_ENABLED` stays `false` unless you
explicitly set it to `true` (and even then, per-post approval is still required).

### Docker

A multi-stage `Dockerfile` builds the client in stage 1 and runs a slim Node runtime in stage 2, serving
API + static client on `$PORT` (default 8787, `EXPOSE`d). With no env keys it runs in mock mode; pass
`ANTHROPIC_API_KEY` to draft with Claude. `PUBLISH_ENABLED` is intentionally **not** set in the image, so
publishing stays disabled (dry-run) by default.

```bash
docker build -t draftdeck .
docker run -p 8787:8787 draftdeck                        # mock drafting, publishing disabled
docker run -p 8787:8787 -e ANTHROPIC_API_KEY=sk-ant-... draftdeck   # live drafting
```

### Render (Blueprint)

`render.yaml` defines a Node web service — build `npm install && npm run build`, start `npm start`, with
`ANTHROPIC_API_KEY` as a dashboard-set secret (`sync:false`) and `PUBLISH_ENABLED=false` pinned in the
Blueprint. Render injects `PORT` automatically.

---

## Enabling real publishing (and the responsibility that entails)

Real publishing is intentionally hard to turn on. To enable it you must, on your
own machine and under your own accounts:

1. Set `PUBLISH_ENABLED=true` in `.env`.
2. Provide your own platform credentials (see `.env.example`).
3. **Implement the live API call** for the platform in
   `server/services/adapters.js`. The real adapters ship as **stubs** that
   refuse to publish until you do this — even with credentials present. This is
   deliberate: wiring a live integration is an explicit act by the operator who
   owns the account.

When enabled, every post still requires an individual "Approve & Publish" click.
There is no way to bypass the per-post gate.

**Responsibility:** if you enable real publishing, you are responsible for
everything sent from your accounts — accuracy, compliance with each platform's
terms, and the consequences of posting. Verify every draft (especially ones
flagged "needs review") before approving. DraftDeck is a drafting aid, not a
source of truth.

---

## Project layout

```
draftdeck/
├─ server/
│  ├─ index.js            # Express app + the per-post publish gate
│  ├─ prompt.js           # drafting system prompt, content policy, mock generator
│  ├─ claims.js           # heuristic "needs review" claims detector
│  └─ services/
│     └─ adapters.js      # dry-run adapter (default) + disabled real stubs
├─ src/
│  ├─ App.tsx             # app shell + state
│  ├─ api.ts              # typed client for /api
│  ├─ components/         # Compose, ReviewQueue, DraftCard, History, Header
│  ├─ types.ts, constants.ts
│  └─ index.css
├─ .env.example
└─ ...config (vite, tailwind, tsconfig)
```

---

## API (server)

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/status` | mock/live + publish-enabled flags |
| POST | `/api/draft` | generate 1–3 variants for `{platform, topic, tone}` |
| PATCH | `/api/draft/:id` | edit a draft in place (re-runs claims check) |
| DELETE | `/api/draft/:id` | reject a draft |
| GET | `/api/drafts` | list drafts |
| GET | `/api/history` | session history |
| POST | `/api/publish/:id` | **the gate** — requires `{confirm:true}`, one post only |

There is no batch publish route by design.
