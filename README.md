# PowerliftingAI (v2)

Port of the original React Router 7 app to a two-service architecture:

```
┌──────────────┐  Supabase JWT   ┌──────────────────┐  X-Internal-Api-Key  ┌────────────────────┐
│   Browser    │ ──────────────► │  web/ (Next.js)  │ ───────────────────► │ orchestrator/      │
│  chat UI     │ ◄────────────── │  auth gateway    │ ◄─────────────────── │ (FastAPI, Python)  │
│              │   text stream   │  + persistence   │     text stream      │ RAG / LLM pipelines │
└──────────────┘                 └──────────────────┘                      └────────────────────┘
                                        │
                                        ▼
                                  Supabase (Postgres + Auth, RLS)
```

**Division of responsibility**

- `web/` (Next.js 16, App Router) — Google sign-in via Supabase, session
  handling (`src/proxy.ts`), input validation (zod), quota + chat-ownership
  authorization, encrypted persistence of chats/messages, and streaming the
  orchestrator's response to the browser. It does **no** AI work.
- `orchestrator/` (FastAPI) — trusted internal service that will own all the
  heavy lifting: RAG over markdown knowledge, Neo4j graph expansion,
  program design, and the OpenPowerlifting analytics agent. Currently a
  skeleton that streams stub responses so the whole flow works end-to-end.

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

Visit http://localhost:3000, sign in with Google, and send a message — you
should see the stub response stream back from the Python service.

## Key contracts

- `POST orchestrator /v1/chat/stream` — body mirrors
  `web/src/lib/orchestrator.ts` (`user_id`, `chat_id`, `message`, `mode`,
  `summary`, `last_messages`); returns a plain-text token stream.
- `POST orchestrator /v1/summarize` — returns `{ summary }`; called
  fire-and-forget after persistence to refresh the rolling chat summary.
- Chat content and summaries are AES-256-GCM encrypted at rest with
  `ENCRYPTION_KEY` — same format as the old app, so the existing database
  remains readable.

## Porting backlog

- [ ] Port retrieval pipeline (embeddings + `hybrid_match_markdown_chunks`
      + Neo4j expansion) into `orchestrator/app/handlers/retrieval.py`
- [ ] Port program handler
- [ ] Port OpenPowerlifting analytics agent (SQL tools)
- [ ] Real summarizer LLM call in `/v1/summarize`
- [ ] Static content for about/terms/privacy pages
- [ ] Reintroduce Stripe billing + plan-aware quota
- [ ] Rate limiting (Redis or Postgres) when deploying multi-instance
- [ ] Docker compose for the two services
