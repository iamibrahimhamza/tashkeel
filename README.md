# Tashkeel · تشكيل

The digital home for Arab experts, consultants and knowledge creators: one link they own for their identity, consultations, digital products, courses, writing and clients. **Tashkeel Pay** collects the money and pays it out.

## Monorepo

| Path | What |
|---|---|
| `apps/web` | Next.js 15: marketing site, public expert homes `/[slug]` |
| `apps/api` | NestJS REST API `/v1` (auth, RBAC, idempotency, workspaces, digital home) |
| `packages/db` | Prisma schema for **all** modules, SQL integrity migrations, seed, zero-install local Postgres |
| `packages/contracts` | Zod schemas: the API contract that both api and web use |
| `packages/core` | Pure domain logic: money, fees, double-entry ledger, timezone slot engine, state machines, RBAC, access gates |
| `packages/ui` | Design system ("Warm Editorial Luxury" tokens) + page-block renderers |
| `packages/i18n` | Arabic (default, RTL) + English dictionaries |

## Run it locally

You need Node 22+. Docker is optional.

```bash
corepack enable pnpm          # or prefix commands with: corepack pnpm@9.15.4
pnpm install
cp .env.example .env
pnpm build
```

**Database: pick one option**

- No Docker: run `pnpm db:local`. It starts Postgres (PGlite) on `127.0.0.1:5432`, persisted in `packages/db/.pglite`. Then set this in `.env`:
  `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres?connection_limit=1&sslmode=disable&pgbouncer=true`
- Docker: run `pnpm services:up` (Postgres, Redis, MinIO, Mailpit), then `pnpm --filter @tashkeel/db migrate:deploy`

```bash
pnpm db:seed                                  # plans, ledger accounts, founder account
node --env-file=.env apps/api/dist/main.js    # API on :4000
pnpm --filter @tashkeel/web dev               # web on :3000
```

The seed creates **no invented data**: only the theme presets, the fee plans, the platform ledger accounts and, when `FOUNDER_EMAIL` is set in `.env`, the founder's SUPERADMIN account. That account owns an empty workspace at `/ibrahim` with 0 orders, 0 clients and 0 revenue. If `FOUNDER_PASSWORD` is empty, the seed generates a password and prints it once.

## Tests

```bash
pnpm test        # every package
```

- `packages/core`: fee math, a balanced ledger (property tests), the slot engine across DST and timezone pairs, state machines, RBAC
- `packages/db`: applies the real migration SQL to an in-process Postgres and proves that overlapping bookings are rejected, unbalanced or edited ledger rows are rejected, and emails/slugs are unique regardless of case
- `apps/api`: boots the real Nest app on in-process Postgres and covers auth, 422 validation shape, 404 for other users' workspaces, Idempotency-Key replay/reuse/missing, and the draft→publish flow

## API conventions

- Every error has this shape: `{ error: { code, message, messageAr?, details? } }`. Status codes: 400/401/403/404/409/422/429/500.
- Input is validated only at the boundary, with `@ValidBody(Schema)` using a schema from `@tashkeel/contracts`.
- State-changing money routes need `@Idempotent()` and the `Idempotency-Key` header. The key is claimed with an atomic insert. Reusing a key with a different body returns 422, a key whose request is still running returns 409, and a finished key replays its stored response. Keys are kept for 30 days.
- Money is BigInt in minor units, sent over the wire as a string.
- Workspace routes use `@RequirePermission(...)` (see `packages/core/src/rbac.ts`). Only the owner can move money.

## Build phases

1. **Foundation**: done. Monorepo, full schema, integrity constraints, contracts, core logic, auth + RBAC, idempotency, error/validation/rate limits, design system, RTL shell, landing page, public homes.
2. **Tashkeel Pay**: Stripe Checkout, webhook pipeline (on top of `WebhookEvent`), ledger posting service, balances, payouts with the manual-ops admin flow, subscriptions.
3. **Digital Home builder**: dashboard editor (dnd-kit), theme picker, custom domains.
4. **Consultations**: availability API, slots endpoint (`computeSlots`), hold → pay → confirm, reminders.
5. **Assets & LMS**: presigned uploads, signed downloads, courses, Mux playback, progress.
6. **Editorial**: Tiptap CMS, scheduled publishing, OG images, RSS/sitemap, newsletter.
7. **CRM & Analytics**: contact unification, timeline, rollups, dashboards.
8. **Hardening**: Redis-backed throttling, observability, CI, deployment.
