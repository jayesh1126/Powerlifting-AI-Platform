# web — PowerliftingAI gateway (Next.js 16)

The user-facing app and API gateway. Owns authentication (Supabase),
authorization (quota + chat ownership), encrypted persistence, and streaming
responses from the Python orchestrator to the browser. Does **no** AI work.

See the [root README](../README.md) for the full architecture and setup.

```bash
npm install
copy .env.example .env.local   # fill in Supabase keys + ENCRYPTION_KEY
npm run dev                    # http://localhost:3000
```

Layout highlights:

- `src/proxy.ts` — session refresh + route protection (Next 16's rename of middleware)
- `src/app/api/chat/route.ts` — the chat gateway (auth → validate → authorize → proxy → persist)
- `src/lib/supabase/` — browser / server / admin clients
- `src/lib/db.ts` — all database access, with at-rest encryption handled inside
- `src/lib/orchestrator.ts` — typed client for the Python service
