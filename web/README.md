# BBQ Temps — your own cook-tracking website

Next.js app that receives readings from `inkbird-logger` and shows them on
your own site: live temps, cook sessions, a temperature graph per session,
and timestamped comments pinned to the graph ("added more wood to fire").

Runs entirely on **Cloudflare's free tier**: Workers (via
[OpenNext](https://opennext.js.org/cloudflare)) + **D1** for storage, with
**tRPC** for the API and **Drizzle ORM** for queries.

```
smoker ──BLE──▶ Raspberry Pi / laptop          Cloudflare (free tier)
                inkbird-logger                 ┌──────────────────────┐
                  --upload-url ───HTTPS POST──▶│ /api/ingest → D1     │
                  (1 batched POST / 30 s)      │ Next.js UI ← tRPC    │◀── your phone
                                               └──────────────────────┘   (via CF Access)
```

## Deploy

Requires a free Cloudflare account and Node 20+.

```sh
cd web
npm install
npx wrangler login

# 1. Create the database, then paste the printed database_id into wrangler.jsonc
npx wrangler d1 create inkbird-db

# 2. Create the tables
npm run db:migrate:remote

# 3. Set the shared secret the logger will authenticate with
openssl rand -hex 24                # generate a token, keep it for step 5
npx wrangler secret put INKBIRD_UPLOAD_TOKEN

# 4. Build & deploy
npm run deploy                      # prints https://inkbird-web.<you>.workers.dev

# 5. On the machine near the smoker (Raspberry Pi — see ../README.md)
inkbird-logger \
  --upload-url https://inkbird-web.<you>.workers.dev/api/ingest \
  --upload-token <token-from-step-3>
```

Local development: `npm run db:migrate:local`, then `npm run dev` (uses a
local D1 copy via wrangler), or `npm run preview` for the real
workers-runtime build.

## Locking the site down with Cloudflare Access (Zero Trust)

The pages and tRPC API have no login of their own, so put Cloudflare Access
in front (free for up to 50 users):

1. Zero Trust dashboard → **Access → Applications → Add an application →
   Self-hosted**, application domain: `inkbird-web.<you>.workers.dev`.
2. Add an **Allow** policy with an include rule for your email — you'll get a
   one-time PIN by email when you visit (or wire up Google/GitHub login).
3. Add a **second application** for path `/api/ingest` on the same host with
   a single **Bypass → Everyone** policy. The Python uploader can't do a
   browser login; this endpoint stays protected by its own bearer token
   (requests without `Authorization: Bearer $INKBIRD_UPLOAD_TOKEN` get 401).

Order matters: Access evaluates the most specific application first, so the
`/api/ingest` bypass wins for uploads while everything else requires login.

## Free-tier budget (why an 8 h cook costs $0)

The logger records a reading every ~5 s but the uploader **batches**: one
POST every 30 s (configurable with `--upload-interval`), each carrying ~6
readings. Readings queue in the Pi's SQLite when offline, so nothing is lost
and batches stay cheap.

| Resource | 8 h cook uses | Free tier daily limit |
|---|---|---|
| Worker requests | ~960 uploads + your page views | 100,000 |
| D1 rows written | ~5,760 | 100,000 |
| D1 rows read | a few thousand per chart view | 5,000,000 |
| D1 storage | ~0.5 MB per cook | 5 GB total |

The Workers free plan has **no overage billing** — if a cap were somehow hit,
requests fail until the daily reset rather than charging you. Even logging
24/7 (not just during cooks) writes ~17k rows/day, still well inside the
free tier; one cook every weekend would take **decades** to fill 5 GB.

## Layout

- `src/db/schema.ts` — Drizzle schema (`readings`, `cooks`, `notes`);
  `migrations/0001_init.sql` is the matching D1 migration
- `src/app/api/ingest/route.ts` — bearer-token endpoint the logger POSTs to;
  idempotent (dedupes on reading timestamp) so retries are safe
- `src/server/router.ts` — tRPC router: live temps, cook sessions
  (start/end/list), downsampled chart series, graph comments
- `src/app/page.tsx` — live temps + cook list; `src/app/cook/[id]/page.tsx` —
  session graph (click the graph to pin a comment to that moment)
