# PowerliftingAI (v2)

Port of the original React Router 7 app to a two-service architecture:

```
┌──────────────┐  Supabase JWT   ┌──────────────────┐  X-Internal-Api-Key  ┌────────────────────┐
│   Browser    │ ──────────────► │  web/ (Next.js)  │ ───────────────────► │ orchestrator/      │
│  chat UI     │ ◄────────────── │  auth gateway    │ ◄─────────────────── │ (FastAPI, Python)  │
│              │   text stream   │  + persistence   │    NDJSON events     │ AI runtime          │
└──────────────┘                 └──────────────────┘                      └────────────────────┘
                                        │                                          │
                                        ▼                                          ▼
                                  Supabase (Postgres + Auth, RLS)    Supabase pgvector · OPL Postgres · LLMs
```

**Division of responsibility**

- `web/` (Next.js 16, App Router) — Google sign-in via Supabase, session
  handling (`src/proxy.ts`), input validation (zod), quota + chat-ownership
  authorization, encrypted persistence of chats/messages, and streaming the
  orchestrator's token stream to the browser. It does **no** AI work.
- `orchestrator/` (FastAPI) — the AI runtime. Every request runs the same
  flow: context build → planner (which capabilities does this query need?)
  → knowledge retrieval (pgvector hybrid search) → generation via an
  agentic tool loop (OpenPowerlifting SQL tools) → verify → summary refresh
  → metrics. No modes, no routes — the planner replaced the old
  general/program/analytics handler routing.

**Deliberately dropped from v1 of this port** (existed in the old app):
Stripe billing, Redis rate limiting, LangChain-in-Node. The free-tier quota
(15 requests/month, `web/src/lib/quota.ts`) still applies.

## Running locally

### 1. Orchestrator

```bash
cd orchestrator
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
copy .env.example .env         # set INTERNAL_API_KEY
uvicorn app.main:app --reload --port 8000
```

### 2. Web

```bash
cd web
npm install
copy .env.example .env.local   # fill in Supabase keys + ENCRYPTION_KEY
npm run dev
```

Visit http://localhost:3000, sign in with Google, and send a message. With
`OPENROUTER_API_KEY` set in `orchestrator/.env` you get real answers (plus
retrieval/OPL tools if their stores are configured); with no LLM key the
runtime streams a stub so the flow is still testable end-to-end.

## Key contracts

- `POST orchestrator /v1/chat/stream` — the one AI endpoint. Body mirrors
  `web/src/lib/orchestrator.ts` ↔ `orchestrator/app/models.py`
  (`user_id`, `chat_id`, `messages` window, `summary`,
  `total_message_count`, `user_context.subscription`, `request_context`).
  Returns an NDJSON event stream: `token` lines while generating, then
  `citations`, optional `summary` (the runtime refreshes the rolling
  summary on its own cadence; the gateway just stores it), `metrics`,
  `end`. The gateway forwards token text to the browser and persists the
  rest. There is no `/v1/summarize` — summaries are AI and live in the
  runtime.
- Context policy (how much history each subscription tier gets) lives in
  `orchestrator/app/runtime/context_builder.py`, not in the gateway.
- Chat content and summaries are AES-256-GCM encrypted at rest with
  `ENCRYPTION_KEY` — same format as the old app, so the existing database
  remains readable.
- The OpenPowerlifting meet-results Postgres (schema + loader:
  `infra/opl/init.sql`) is reached read-only via
  `OPL_DATABASE_URL`; the model fills typed tool parameters, never SQL.

## Porting backlog

- [x] Port retrieval pipeline (query rewrite + embeddings +
      `hybrid_match_markdown_chunks_v2`) → `orchestrator/app/tools/retrieval.py`
- [x] Port program design (planner capability + templates in the generator
      prompt) — replaces the old program handler
- [x] Port OpenPowerlifting analytics (SQL tools in the agentic generator
      loop) → `orchestrator/app/tools/opl.py`
- [x] Real summarizer LLM call (now in-stream via the `summary` event;
      `/v1/summarize` removed)
- [x] LangGraph orchestration of the runtime stages
      (`orchestrator/app/runtime/graph.py`)
- [x] Dockerfiles: `web/Dockerfile` (standalone output),
      `orchestrator/Dockerfile`; Caddy configs in `infra/caddy/`
- [ ] Docker compose in `infra/`: caddy + web + orchestrator +
      OpenPowerlifting Postgres (load with `infra/opl/init.sql`)
- [ ] Content-Security-Policy with per-request nonce (other security
      headers restored in `next.config.ts`; old app's CSP used a nonce)
- [ ] Confirm the Supabase trigger that increments `request_counts` on
      message insert (neither app increments it in code)
- [ ] Evaluation harness on top of the `metrics` event (Ragas/DeepEval)
- [ ] Replace runtime orchestration with LangGraph once nodes are stable
- [ ] Surface `citations` in the chat UI
- [ ] Static content for about/terms/privacy pages
- [ ] Reintroduce Stripe billing + plan-aware quota (context policy already
      keys off subscription tier)
- [ ] Rate limiting (Redis or Postgres) when deploying multi-instance
