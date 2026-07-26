# java-orchestrator

The AI runtime for Powerlifting AI, on Java 25 + Spring Boot 4 + Spring AI 2.

This is a trusted **internal** service. The Next.js gateway (`../web`) owns user
authentication, chat ownership and quota; this service owns everything AI —
planning, knowledge retrieval, competition-data tools, answer generation, and
conversation summaries — and trusts any caller holding the shared secret. It is
never exposed to browsers directly.

It is a functional re-implementation of the Python `../orchestrator`, built the
Spring way rather than as a line-by-line port. Design decisions and the trickier
findings live in [`PORT_PLAN.md`](PORT_PLAN.md).

---

## Quickstart

You need **JDK 25** and Docker (for the OpenPowerlifting database). Everything
else the Gradle wrapper fetches.

### 1. Start the OpenPowerlifting database

Lifter and leaderboard questions query a local Postgres. Start it from the repo
root's `infra/` (first boot loads a ~300 MB CSV and takes a few minutes):

```bash
cd ../infra
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d opl-db
```

It publishes `127.0.0.1:5433`. Skip this only if you don't need competition-data
answers — everything else still works, those tool calls just return an error the
model reports gracefully.

### 2. Configure local secrets

Copy the template and fill it in (the real file is gitignored):

```bash
cp src/main/resources/application-dev.properties.example \
   src/main/resources/application-dev.properties
```

You need, at minimum:

| Property | What |
|---|---|
| `powerlifting.internal-api-key` | any string; must match the gateway's `ORCHESTRATOR_API_KEY` |
| `spring.ai.openai.api-key` | an OpenRouter key (`sk-or-...`) — powers planner, generator, summarizer, embeddings |
| `powerlifting.supabase.url` / `.secret-key` | Supabase project + **service_role** key, for the knowledge base |
| `spring.datasource.{url,username,password}` | the opl-db from step 1 (template has the right values) |

The `dev` profile is active by default, so `application-dev.properties` is picked
up with no extra flags.

### 3. Run

```bash
./gradlew bootRun
```

Listens on **http://localhost:8080**. Confirm it's up:

```bash
curl localhost:8080/actuator/health      # {"status":"UP"}
```

---

## Trying it out

### Swagger UI

Interactive docs at **http://localhost:8080/swagger-ui.html** (raw spec at
`/v3/api-docs`). Click **Authorize**, paste your `internal-api-key`, and the
`X-Internal-Api-Key` header is attached to requests.

Caveat: the endpoint streams NDJSON, and Swagger UI shows the response as one
block *after* it finishes — it does not render tokens live. For that, use curl.

### curl (see the live token stream)

`-N` disables curl's buffering so you watch tokens arrive:

```bash
curl -N -X POST http://localhost:8080/v1/chat/stream \
  -H 'Content-Type: application/json' \
  -H 'X-Internal-Api-Key: <your-key>' \
  -H 'X-Request-Id: local-test' \
  -d '{
        "user_id": "u1",
        "chat_id": "c1",
        "messages": [{"role": "User", "content": "How should I brace for a heavy squat?"}],
        "total_message_count": 0,
        "user_context": {"subscription": "pro"}
      }'
```

You get a stream of newline-delimited JSON — `token` lines, then `citations`,
maybe `summary`, then `metrics` and `end`. Try a lifter question
(`"What is Jesus Olivares' best total?"`) to exercise the SQL tools, or ask for
a program to see the planner route differently.

Only `user_id`, `chat_id` and a non-empty `messages` are required; the rest
default (`subscription` → free, `total_message_count` → 0).

### Tests

```bash
./gradlew test        # unit + HTTP contract tests; no network, no LLM calls
./gradlew build       # compile, test, assemble the jar
```

The test suite mocks the LLM and stubs the pipeline, so it never makes a billable
call or needs the database.

---

## What it does — the shape of one request

`POST /v1/chat/stream` → an NDJSON event stream. Internally:

```
ChatController ─▶ ChatService.streamTurn()
                     │
                     ├─ ContextBuilder   trim history / decide summary cadence (per subscription)
                     ├─ Planner          cheap LLM: which capabilities does this need?
                     ├─ KnowledgeRetrievalService   (if planned) rewrite → embed → Supabase RRF search
                     ├─ Generator        streaming agentic loop; OPL SQL tools when granted
                     ├─ Verifier         cheap invariants → metrics
                     └─ Summarizer       (on cadence) refresh the rolling summary
```

Every stage is timed into a per-request `RequestMetrics`. Output events, in
order on the wire: `token`* (live, during generation) → `citations` → `summary`?
→ `metrics` → `end`. A failure anywhere becomes an `error` event, never a broken
HTTP response.

### Key design points

- **Virtual threads, not WebFlux.** `spring.threads.virtual.enabled=true`. The
  code is straight-line blocking; Spring AI's streaming `Flux` is consumed with
  one `.toStream()` bridge that parks the virtual thread instead of blocking a
  platform one. No reactive colouring anywhere else.
- **The tool loop is driven by `Generator`**, not Spring AI's tool advisor,
  because the round policy (force a tool on round 0, withhold on the last round)
  isn't expressible through the advisor, and advisor hooks run on the wrong
  scheduler. See `PORT_PLAN.md` §2.2 / §2.4.
- **NDJSON via `EventSink`/`NdjsonSink`**: one JSON object per line, flushed as
  written, so the caller sees tokens in real time.
- **Structured output**: the planner and query-rewriter use Spring AI's
  `.entity(...)`, so the JSON schema is derived from the record and can't drift.

---

## Configuration model

Three layers, standard Spring:

| Layer | File | In git? | Holds |
|---|---|---|---|
| Non-secret defaults | `application.properties` | yes | model ids, pool + Hikari settings, timeouts, springdoc paths |
| Local secrets | `application-dev.properties` | **no** | your keys + datasource creds (dev profile) |
| Production | environment variables | n/a | secrets, injected by compose; `SPRING_PROFILES_ACTIVE=prod` |

App config binds to `OrchestratorProperties` under the `powerlifting.*` prefix
(nested records: `models`, `supabase`, `runtime`). The LLM provider is Spring
AI's own `spring.ai.openai.*` (base URL points at OpenRouter). The OPL database
is stock `spring.datasource.*` — read-only, pooled by Hikari.

In production, relaxed binding maps env vars automatically, e.g.
`POWERLIFTING_INTERNAL_API_KEY` → `powerlifting.internal-api-key`,
`SPRING_AI_OPENAI_API_KEY` → `spring.ai.openai.api-key`,
`SPRING_DATASOURCE_PASSWORD` → `spring.datasource.password`.

---

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/v1/chat/stream` | `X-Internal-Api-Key` | the one AI endpoint (NDJSON stream) |
| GET | `/actuator/health` | open | liveness/readiness |
| GET | `/actuator/prometheus` | open | metrics scrape |
| GET | `/swagger-ui.html`, `/v3/api-docs` | open | API docs |

Only `/v1/**` is gated. The rest is infrastructure that must stay reachable on
the internal network — acceptable because the service is unpublished (only Caddy
exposes ports in `infra/`).

---

## Package layout

```
chat/            ChatController, ChatService
  model/         request DTOs (ChatStreamRequest, ChatMessage, ...)
  runtime/       the pipeline stages (Planner, Generator, Verifier, Summarizer, ContextBuilder)
retrieval/       KnowledgeRetrievalService, SupabaseKnowledgeClient, CanonicalTopics
tools/           OplTools (@Tool methods), CountryNormalizer, ToolRegistry
stream/          StreamEvent (sealed), EventSink, NdjsonSink
filter/          InternalApiKeyFilter, RequestIdFilter
observability/   RequestMetrics
config/          OrchestratorProperties, ChatModelConfig, OpenApiConfig
```

Read them in this order the first time: `ChatStreamRequest` (what comes in) →
`ChatController` (entry) → `ChatService` (the whole flow on one screen) → then
each stage the service calls.

---

## Status vs. the Python service

At parity and verified live: the full chat pipeline — context policy, planner
(with heuristic fallback), retrieval, citations, the agentic tool loop against
real OpenPowerlifting data, verification, rolling summary, per-request metrics,
NDJSON streaming, API-key auth, request-id correlation.

Not yet built: the **programs** feature (`/v1/programs/*`), custom **Prometheus
meters** (so Grafana dashboards render), JSON log format, and **deployment**
(Dockerfile, compose service, CI). See `PORT_PLAN.md` for the phase plan.
