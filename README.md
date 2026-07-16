# PowerliftingAI

An AI coaching and analytics platform for powerlifters — built as a production
system to be *operated*, not demoed: one VPS, containerised, continuously
deployed, and instrumented end to end.

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
└──────────────┘        └───────┘  text  │  + persistence   │ NDJSON events  │ AI runtime         │
                                         └──────────────────┘                └────────────────────┘
                                                 │                                     │
                                                 ▼                                     ▼
                                      Supabase (Postgres + Auth,          Supabase pgvector · LLMs ·
                                       RLS, encrypted chats)              OpenPowerlifting Postgres
```

- **`web/`** — Next.js 16 gateway: Google sign-in (Supabase), authorization,
  quota, AES-256-GCM encrypted chat persistence, streaming. Does no AI work —
  no prompts, no retrieval, no model calls.
- **`orchestrator/`** — the AI runtime (LangGraph). Every request runs one
  flow: context policy → planner → retrieval → agentic generation with tools
  → verification → summary → per-request metrics. Streams NDJSON back to the
  gateway.
- **`infra/`** — docker compose, Caddy, the OpenPowerlifting database, and the
  observability stack. Only Caddy publishes ports; everything else exists
  solely on the internal network.

**Stack**: Next.js 16 · React 19 · Tailwind 4 · Supabase (Postgres, Auth,
pgvector) · FastAPI · LangGraph · OpenRouter/OpenAI · asyncpg · Caddy · Docker
· GitHub Actions · GHCR · Prometheus · Grafana.

### The AI runtime

The planner is a cheap LLM that grants *capabilities* per query (`retrieve`,
`lifter_data`, `program_design`) — it never answers and never picks tool
arguments; the generator's native tool-calling loop does that. Tools implement
a single ABC and expose typed pydantic params as OpenAI function schemas, so
the model fills **parameters, never SQL**. "Compare my squat progression to
Russel Orhii" earns multiple capabilities in one pass.

A verifier runs cheap invariants after generation (empty answer, retrieval
planned but no docs, tools planned but never called, all tool calls failed)
and records them — the seam where real evaluation plugs in next.

## Deployment

Push to `main` → GitHub Actions checks → build + push both images to GHCR
under `:latest` and `:<git-sha>` → SSH deploy → health checks → prune old
images. The SHA tag is the deployable artifact; `:latest` is never deployed
to directly. One `IMAGE_TAG` in `infra/.env` drives both services, so "what
commit is live" has a single unambiguous answer. Rollback is a manual
workflow that repoints `IMAGE_TAG` to an older SHA.

The deploy job `git reset --hard`s the VPS to the pushed SHA before touching
Docker, so compose files, Caddyfiles and Prometheus config ship with a normal
push — no manual SSH for infra changes.

## Observability

Self-hosted on the same VPS: the orchestrator exports Prometheus metrics →
Prometheus scrapes five targets → Grafana renders dashboards provisioned from
git.

- **Instrumentation** — aggregate counters/histograms folded from the
  per-request `RequestMetrics` once at end of request: requests by outcome,
  per-stage latency, tokens by model and kind (the cost meter), tool calls by
  tool and status, verifier issues, docs retrieved.
- **Exporters** — node-exporter (host), cAdvisor (per-container), Caddy (edge
  status codes and latency, on an internal-only listener so the admin API
  stays unexposed).
- **Dashboards as code** — built in the UI, exported to JSON, committed, and
  provisioned to production. Git is the source of truth; dashboards are
  read-only in prod by design.
- **External uptime ping** — because self-hosted monitoring cannot report its
  own death.

## Engineering notes

A few decisions and the reasoning behind them:

- **The gateway does no AI work.** Prompts, retrieval and model calls live
  only in the orchestrator, which is unreachable from the internet and gated
  by a shared internal key. The wire contract is pinned on both sides
  (`app/models.py` ↔ `web/src/lib/orchestrator.ts`).
- **Chat content is encrypted at rest** (AES-256-GCM), including titles, and
  logs are content-free at INFO and above — user messages, rewritten queries,
  tool arguments and generated text are DEBUG only. Every request carries an
  `X-Request-Id` stamped onto every orchestrator log line.
- **Metric labels are bounded by rule** — stage, tool, model, outcome, issue.
  Never user/chat/request ids: each unique label value is a new time series,
  and unbounded cardinality is how a metrics pipeline dies.
- **Config is directory-mounted, never file-mounted.** A single-file bind
  mount pins the inode at container creation, so `git reset`'s
  replace-by-rename left Caddy serving a 27-hour-old config after a *green*
  deploy. Mount the directory; reload the process.
- **The deploy gate checks the origin, not the internet.** Health-checking the
  public URL from the VPS hairpins out through the CDN and back, putting
  infrastructure the deploy doesn't own into its critical path — a transient
  edge reset failed a perfectly good deploy. Public reachability is the uptime
  monitor's job.
- **Deliberately not built**: Stripe billing (built once already, no users to
  bill), Redis rate limiting (premature at this traffic), Loki (log
  aggregation solves a problem two services don't have), most alerting (a
  ratio alert at three requests a day is noise, and alerts that cry wolf train
  you to ignore them). Neo4j was dropped permanently.

Known gap, stated plainly: CI runs lint/compile/import checks but **no
behavioural tests** — currently a deployment pipeline rather than a quality
gate.

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

Full stack in Docker, including the observability services (the dev overlay
publishes Prometheus/Grafana/the OPL database on loopback):

```bash
cd infra
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
# web https://localhost · prometheus :9090 · grafana :3001
```

## Production

```bash
cd infra
cp .env.example .env           # fill in values
docker compose up -d --build

# one-shot OpenPowerlifting data load (openipf-latest.csv in OPL_IMPORT_DIR):
docker compose exec opl-db psql -U opl -d openpowerlifting -f /docker-entrypoint-initdb.d/init.sql
```

---

© 2026 Powerlifting AI Ltd. All rights reserved. This is proprietary
software — see [LICENSE](LICENSE).
