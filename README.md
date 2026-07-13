# PowerliftingAI

An AI coaching and analytics platform for powerlifters:

- **Technique & training Q&A** grounded in a curated powerlifting knowledge
  base (RAG over pgvector hybrid search).
- **Program design** — generate or modify full training programs from
  evidence-based templates.
- **Competition analytics** — the AI queries the OpenPowerlifting dataset
  live: lifter histories, PRs, progressions, leaderboards, comparisons.

One conversation does all of it. There are no modes — a planner decides per
query which capabilities to use, and the model calls typed tools (never raw
SQL) to fetch what it needs.

## Architecture

```
┌──────────────┐        ┌───────┐        ┌──────────────────┐  internal key  ┌────────────────────┐
│   Browser    │ ─────► │ Caddy │ ─────► │  web/ (Next.js)  │ ─────────────► │ orchestrator/      │
│   chat UI    │ ◄───── │  TLS  │ ◄───── │  auth gateway    │ ◄───────────── │ (FastAPI)          │
└──────────────┘        └───────┘  text  │  + persistence   │ NDJSON events  │ AI runtime          │
                                         └──────────────────┘                └────────────────────┘
                                                 │                                     │
                                                 ▼                                     ▼
                                      Supabase (Postgres + Auth,          Supabase pgvector · LLMs ·
                                       RLS, encrypted chats)              OpenPowerlifting Postgres
```

- **`web/`** — Next.js 16 gateway: Google sign-in (Supabase), authorization,
  quota, AES-256-GCM encrypted chat persistence, streaming. Does no AI work.
- **`orchestrator/`** — the AI runtime (LangGraph): context policy → planner
  → retrieval → agentic generation with tools → verification → summary →
  per-request metrics.
- **`infra/`** — docker compose, Caddy reverse proxy, OpenPowerlifting
  database schema/loader. Only Caddy is publicly exposed; the orchestrator
  and databases exist solely on the internal network.

**Stack**: Next.js 16 · React 19 · Tailwind 4 · Supabase (Postgres, Auth,
pgvector) · FastAPI · LangGraph · OpenRouter/OpenAI · asyncpg · Caddy · Docker.

## Local development

```bash
# 1. AI runtime
cd orchestrator
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env         # keys: see comments inside
uvicorn app.main:app --reload --port 8000

# 2. Web gateway
cd web
npm install
copy .env.example .env.local
npm run dev                    # http://localhost:3000
```

Without LLM keys the runtime streams a stub answer, so the full flow is
testable with nothing but `INTERNAL_API_KEY` set.

## Production

```bash
cd infra
cp .env.example .env           # fill in values
docker compose up -d --build

# one-shot OpenPowerlifting data load (openipf-latest.csv in OPL_IMPORT_DIR):
docker compose exec opl-db psql -U opl -d openpowerlifting -f /init/init.sql
```

Engineering/porting notes live in `CLAUDE.md`.

---

© 2026 Powerlifting AI Ltd. All rights reserved. This is proprietary
software — see [LICENSE](LICENSE).
