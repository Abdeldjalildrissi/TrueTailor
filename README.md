# TrueTailor

**Resume tailoring that never invents a word.**

TrueTailor rewrites a job seeker's resume for each job description —
emphasizing relevant experience, adopting the role's vocabulary, and surfacing
honest gaps — while structurally guaranteeing that no employer, date, skill,
certification, achievement, or credential is fabricated.

## Why it exists

Generic resumes get filtered out by applicant tracking systems; manual
tailoring is slow and repetitive; and AI tools that "improve" resumes by
inventing experience destroy the user's credibility. TrueTailor's position:
tailoring is a _selection and emphasis_ problem over verified facts, never a
generation problem over plausible fiction.

## The anti-fabrication architecture

1. **Structured profile as single source of truth.** Imported resumes are
   converted into a structured profile where every entry (job, bullet, skill,
   degree, certification) has a stable unique ID. Information absent from the
   profile does not exist.
2. **Grounded generation.** Every generated statement must cite the profile
   IDs that support it. Prompts strictly separate profile data from job
   description data. Requirements the profile cannot support become explicit,
   user-visible gaps.
3. **Deterministic server-side verification.** Before anything is shown or
   exported, a validator confirms that every referenced ID exists and every
   claim is supported by its cited entries. Unsupported claims are blocked
   from export and flagged in the UI. This is enforced in code, not in
   prompts.

## Stack

| Concern    | Choice                                                             |
| ---------- | ------------------------------------------------------------------ |
| Framework  | Next.js 15 (App Router), React 19, TypeScript (strict)             |
| Styling    | Tailwind CSS v4, self-hosted Inter Variable                        |
| Database   | SQLite (@libsql/client) + Drizzle ORM, versioned migrations        |
| Auth       | First-party email/password, argon2id, hashed session tokens        |
| Runtime AI | Provider-agnostic adapter — Anthropic (default), OpenAI, or Gemini |
| Testing    | Vitest (unit/integration), Playwright + axe (e2e/a11y)             |
| Deploy     | Docker (standalone Next build), any container host + volume        |
| CI         | GitHub Actions: lint, typecheck, format, tests, clean scan, build  |

Every significant decision, with rationale, lives in [DECISIONS.md](./DECISIONS.md).

## Getting started

Requirements: Node.js ≥ 20.

```bash
npm install
cp .env.example .env   # fill in values; see below
npm run dev            # http://localhost:3000
```

Environment variables (see `.env.example`):

| Variable            | Purpose                                                     |
| ------------------- | ----------------------------------------------------------- |
| `APP_URL`           | Canonical base URL; drives secure cookies and origin checks |
| `DATABASE_PATH`     | SQLite file path (persistent volume in production)          |
| `AI_PROVIDER`       | `anthropic`, `openai`, or `google` (Gemini)                 |
| `ANTHROPIC_API_KEY` | Runtime AI key (only if provider is anthropic)              |
| `OPENAI_API_KEY`    | Runtime AI key (only if provider is openai)                 |
| `GEMINI_API_KEY`    | Runtime AI key (only if provider is google)                 |

The database schema is created automatically on first run (migrations in
`drizzle/` are applied at connection time).

## Scripts

| Command                | What it does                                     |
| ---------------------- | ------------------------------------------------ |
| `npm run dev`          | Development server                               |
| `npm run build`        | Production build (standalone output)             |
| `npm start`            | Serve the production build                       |
| `npm test`             | Vitest in watch mode                             |
| `npm run test:run`     | Full test suite once                             |
| `npm run lint`         | ESLint                                           |
| `npm run typecheck`    | TypeScript, no emit                              |
| `npm run format:check` | Prettier verification                            |
| `npm run verify:clean` | Deferred-work marker scan over all tracked files |
| `npm run verify`       | Everything CI runs, in the same order            |
| `npm run test:e2e`     | Playwright e2e + WCAG audit (Chromium)           |
| `npm run test:e2e:all` | Full browser matrix (Chromium/Firefox/WebKit)    |
| `npm run db:generate`  | Generate a new SQL migration from schema changes |

## Deployment

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for step-by-step Fly.io, Render,
Railway, and generic Docker instructions (a ready `fly.toml` is included).
The repository ships a multi-stage `Dockerfile` (Node 22-slim, non-root,
`/data` volume for SQLite).

```bash
docker build -t truetailor .
docker run -p 3000:3000 -v truetailor-data:/data \
  -e APP_URL=https://your-domain \
  -e AI_PROVIDER=anthropic -e ANTHROPIC_API_KEY=... \
  truetailor
```

Operational notes:

- The app emits its own security headers (CSP, HSTS, frame-ancestors, etc.);
  the platform edge only needs to terminate TLS.
- Back up the volume (`/data`) — it contains all user data.
- One instance per environment; see DECISIONS.md D-0004/D-0007 for the
  scaling posture and migration path.

## Security posture

- argon2id password hashing (OWASP parameters); session tokens stored only as
  SHA-256 hashes; HttpOnly SameSite=Lax cookies, Secure over HTTPS.
- Origin/Host agreement enforced on every mutating request (CSRF).
- Per-IP and per-account rate limits on authentication endpoints, with
  uniform errors and equal-cost hashing to prevent account enumeration.
- Nonce-based CSP (no inline scripts in production), HSTS, nosniff,
  frame-ancestors 'none', restrictive Permissions-Policy on every response.
- Expired sessions purged automatically; WCAG 2.2 AA verified with axe-core.
- All secrets via environment variables only; `.env` is gitignored.

## Project status

- **Phase 0 — foundation**: complete and verified (auth, security, database,
  CI, Docker).
- **Phase 1 — ingestion**: complete and verified. PDF/DOCX/Markdown/text
  import, chunked structured extraction, deterministic merge, grounding
  verification with user-visible exclusion warnings, versioned profile with
  stable entry ids, and a full profile editor.
- **Phase 2 — tailoring engine**: complete and verified. Grounded job
  analysis, deterministic requirement coverage and gap detection, generation
  that can only cite profile ids (identity fields render from the profile,
  never from the model), and a deterministic Layer-3 verifier that blocks
  every unsupported line.
- **Phase 3 — review & export**: complete and verified. Line-by-line review
  with source comparison, accept/reject/rewrite decisions (rewrites take user
  authorship), and Markdown/DOCX/PDF exports behind the verification gate —
  blocked lines can never export as generated. Round-trip fidelity of all
  three formats is test-verified through the app's own importers.
- **Phase 4 — learning**: complete and verified. Review history (rewrites,
  rejections) deterministically becomes style guidance in future tailoring
  prompts — edit pairs as voice exemplars, rejections as negative examples,
  computed length hints — always subordinate to the verification rules, which
  never relax.
- **Phase 5 — hardening**: complete and verified. Nonce-based CSP, WCAG 2.2
  AA audit with zero axe violations across all key pages, e2e journey suite
  against the production build, session hygiene, deployment docs + fly.toml,
  and the full Definition of Done audit (DECISIONS.md D-0021).

All five build phases are complete. The one remaining credential-gated step
is executing a cloud deploy with your hosting account (everything for it is
in this repository — see DEPLOYMENT.md).
