# Deploying TrueTailor

TrueTailor ships as a single Docker image (multi-stage, Node 22-slim,
non-root) with an embedded SQLite database on a persistent volume. Any
container platform that terminates TLS and offers a persistent disk works.
The app applies its own security headers (nonce-based CSP, HSTS, etc.) and
runs database migrations automatically on first connection.

## Requirements

| Requirement       | Why                                                        |
| ----------------- | ---------------------------------------------------------- |
| TLS termination   | Cookies are `Secure` when `APP_URL` starts with `https://` |
| Persistent volume | SQLite lives at `DATABASE_PATH` (default `/data/app.db`)   |
| One app instance  | Embedded database model — see DECISIONS.md D-0004/D-0007   |
| AI provider key   | One of Anthropic / OpenAI / Gemini / OpenRouter            |

## Environment variables

| Variable             | Required | Value                                          |
| -------------------- | -------- | ---------------------------------------------- |
| `APP_URL`            | yes      | Canonical base URL, e.g. `https://your-domain` |
| `DATABASE_PATH`      | yes      | `/data/app.db` (matches the mounted volume)    |
| `AI_PROVIDER`        | yes      | `anthropic`, `openai`, `google`, `openrouter`  |
| `ANTHROPIC_API_KEY`  | one-of   | If provider is `anthropic`                     |
| `OPENAI_API_KEY`     | one-of   | If provider is `openai`                        |
| `GEMINI_API_KEY`     | one-of   | If provider is `google`                        |
| `OPENROUTER_API_KEY` | one-of   | If provider is `openrouter`                    |
| `AI_MODEL`           | no       | Optional model override                        |

Set keys only in the platform's secret manager. Startup validation fails
fast with a clear message on malformed configuration; a missing provider key
does not crash the app — AI features return an explicit, actionable error
until the key is set.

## Fly.io (configuration included)

```bash
fly launch --no-deploy --copy-config   # uses the fly.toml in this repo
fly volumes create truetailor_data --size 1
fly secrets set ANTHROPIC_API_KEY=...  # or GEMINI_API_KEY / OPENAI_API_KEY
# edit fly.toml: set APP_URL to your hostname
fly deploy
```

The health check hits `/api/healthz` (also reports database connectivity).

## Render

1. New → Web Service → Docker; connect the repository.
2. Add a Disk (e.g. 1 GB) mounted at `/data`.
3. Set the environment variables above (Render provides TLS automatically).
4. Health check path: `/api/healthz`.

## Railway

1. New project from repo (Dockerfile is detected automatically).
2. Add a Volume mounted at `/data`.
3. Set the environment variables above; attach a domain (TLS included).

## Any Docker host

```bash
docker build -t truetailor .
docker run -d -p 3000:3000 \
  -v truetailor-data:/data \
  -e APP_URL=https://your-domain \
  -e DATABASE_PATH=/data/app.db \
  -e AI_PROVIDER=anthropic \
  -e ANTHROPIC_API_KEY=... \
  truetailor
```

Put a TLS-terminating proxy (Caddy, nginx, a cloud load balancer) in front;
the app emits HSTS and expects to be reached over HTTPS in production.

## Operations

- **Backups.** All user data lives in the volume. Snapshot it on the
  platform's schedule (Fly volumes support snapshots; Render disks have
  backups), or stream WAL changes off-host with a tool like Litestream.
- **Upgrades.** Deploy the new image; migrations in `drizzle/` apply
  automatically at first connection. Migrations are append-only.
- **Health.** `GET /api/healthz` returns `{ status: "ok", database: "ok" }`
  and 503 when the database is unreachable.
- **Scaling posture.** One instance per environment by design. If growth
  demands horizontal scale, the documented path (D-0004) is Drizzle's
  Postgres dialect plus a shared-store rate limiter — interfaces already
  isolate both.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every push: lint,
typecheck, format check, the full unit/integration suite, the deferred-work
scan, a production build, the Playwright end-to-end + WCAG 2.2 AA audit
across Chromium, Firefox, and WebKit, and a Docker image build.
