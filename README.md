# Tashkeel · تشكيل

The digital home for Arab experts, consultants and knowledge creators: one link they own for their identity, consultations, digital products, courses, writing and clients. **Tashkeel Pay** collects the money and pays it out.

## Monorepo

| Path | What |
|---|---|
| `apps/web` | Next.js 15: marketing site, public expert homes `/[slug]`, product pages, sandbox checkout, expert dashboard, admin |
| `apps/api` | NestJS REST API `/v1` (auth, RBAC, idempotency, workspaces, digital home, Tashkeel Pay) plus `src/worker.ts`, the BullMQ worker that runs the same domain services without HTTP |
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

## Tashkeel Pay

Money moves only through the double-entry ledger (`packages/core/src/ledger.ts`). The database rejects any unbalanced or edited ledger row.

- **Checkout** `POST /v1/checkout/sessions` (requires `Idempotency-Key`). The server sets the price, snapshots the plan fee, and opens a Stripe Checkout session keyed by `checkout:v1:<orderId>`.
- **Webhooks** `POST /v1/webhooks/stripe`. The handler verifies the signature, stores the event once (unique provider + event id), queues it and returns 200. The processor locks the order row, so redelivered or concurrent events are applied once: order paid, ledger posting, entitlements, CRM contact, outbox emails. Refunds are applied by cumulative total. Lost disputes unwind like refunds.
- **Balances** `GET /v1/workspaces/:id/balance`. Earnings stay pending for `FUNDS_HOLD_DAYS` (default 7), then the `release-funds` job moves them to available.
- **Payouts**: profiles are encrypted with AES-256-GCM, and the API only ever returns a masked hint. A payout request locks the balance row, so concurrent requests can't overdraw. Al Baraka, Sham Cash, wallet and wire payouts go to the staff queue (`/v1/admin/payouts`): approve (compliance check), then mark paid with the transfer reference. Rails can also push signed status updates to `POST /v1/webhooks/payouts/:rail` (`x-tashkeel-signature: t=…,v1=HMAC-SHA256("t.body")`).
- **Plans**: the Stripe subscription is re-read from Stripe on every event, so events that arrive out of order still end in the right state. The plan's fee applies to new orders; past orders keep their snapshot.

### Gateways: Sandbox now, Stripe later

`PaymentGatewayAdapter` (`apps/api/src/modules/pay/gateway.ts`) has two implementations. The adapter is chosen when the API starts:

| `STRIPE_SECRET_KEY` | Gateway | What happens at checkout |
|---|---|---|
| empty or `mock` | **SandboxGatewayAdapter** | The buyer lands on `/pay/sandbox/:id`, a local approval screen. Approving or declining emits Stripe-shaped events (`checkout.session.completed`, `.expired`, `charge.refunded`, `customer.subscription.updated`) into the same intake, queue and processor that real webhooks use, so the ledger, access, CRM, emails and payouts all run for real. The card fee is simulated at 2.9% + 30¢. |
| `sk_test_…` / `sk_live_…` | **StripeGatewayAdapter** | Stripe-hosted Checkout plus signed webhooks |

In sandbox mode, `POST /v1/webhooks/stripe` answers 404, and staff can simulate a refund with `POST /v1/sandbox/orders/:id/refund`. Production refuses to start without real Stripe keys, so the sandbox can never take real orders.

### Connecting Stripe

The same checklist, with live status, is on **Admin → Payment settings** (`/admin/settings/payments`, SUPERADMIN only):

```bash
# .env
STRIPE_SECRET_KEY=sk_live_...            # sk_test_... while testing
STRIPE_WEBHOOK_SECRET=whsec_...          # from the webhook endpoint below
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...   # optional: hosted Checkout works without it
```

1. In Stripe → Developers → Webhooks, add the endpoint `https://<your-api-host>/v1/webhooks/stripe` and subscribe it to: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.closed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
2. Create monthly prices for the PRO and BUSINESS plans and store their `price_…` ids in `Plan.stripePriceId`.
3. Restart the API. The settings page then shows the mode as Stripe.

To test Stripe locally before going live, use test keys and forward events with the Stripe CLI: `stripe listen --forward-to localhost:4000/v1/webhooks/stripe`.

### Dashboards

- `/login`, `/signup` (claims the link and creates the workspace). The API token lives in an httpOnly cookie.
- `/dashboard/:workspaceId`: overview, sales, clients, bookings, products, earnings and payouts (add payout methods, request and cancel payouts), and the plan page. Every view reads real data and has a designed empty state. Nothing is ever filled with sample rows.
- `/admin`: the staff payout queue and payout detail (approve, then mark paid with the transfer reference, or mark failed). `/admin/settings/payments` is SUPERADMIN only.

Set `QUEUE_DRIVER=bullmq` (with Redis) and run `pnpm --filter @tashkeel/api worker` to process jobs outside the API.

## Tests

```bash
pnpm test        # every package
```

- `packages/core`: fee math, a balanced ledger (property tests), the slot engine across DST and timezone pairs, state machines, RBAC
- `packages/db`: applies the real migration SQL to an in-process Postgres and proves that overlapping bookings are rejected, unbalanced or edited ledger rows are rejected, and emails/slugs are unique regardless of case
- `apps/api`: boots the real Nest app on in-process Postgres and covers auth, 422 validation shape, 404 for other users' workspaces, Idempotency-Key replay/reuse/missing, and the draft→publish flow
- `apps/api/test/sandbox.test.ts`: runs the real Sandbox adapter. Covers approve and decline, the event pipeline, simulated refunds, a plan upgrade, Super Admin settings (no secret values) and the list endpoints
- `apps/api/test/pay.test.ts`: uses a fake Stripe client with real signature checks. Covers server-side pricing, idempotent checkout, forged and duplicate webhooks, partial and full refunds, lost disputes, funds release, encrypted payout profiles, concurrent payout requests that must not overdraw, the staff payout flow, signed rail callbacks, plan sync and the email outbox

## API conventions

- Every error has this shape: `{ error: { code, message, messageAr?, details? } }`. Status codes: 400/401/403/404/409/422/429/500.
- Input is validated only at the boundary, with `@ValidBody(Schema)` using a schema from `@tashkeel/contracts`.
- State-changing money routes need `@Idempotent()` and the `Idempotency-Key` header. The key is claimed with an atomic insert. Reusing a key with a different body returns 422, a key whose request is still running returns 409, and a finished key replays its stored response. Keys are kept for 30 days.
- Money is BigInt in minor units, sent over the wire as a string.
- Workspace routes use `@RequirePermission(...)` (see `packages/core/src/rbac.ts`). Only the owner can move money.

## Build phases

1. **Foundation**: done. Monorepo, full schema, integrity constraints, contracts, core logic, auth + RBAC, idempotency, error/validation/rate limits, design system, RTL shell, landing page, public homes.
2. **Tashkeel Pay**: done. Gateway adapters (Sandbox and Stripe), ledger, checkout, webhooks, balances, payouts and the staff queue, plans, worker, dashboard and admin screens. Stripe Connect onboarding is not built yet.
3. **Digital Home builder**: dashboard editor (dnd-kit), theme picker, custom domains.
4. **Consultations**: availability API, slots endpoint (`computeSlots`), hold → pay → confirm, reminders.
5. **Assets & LMS**: presigned uploads, signed downloads, courses, Mux playback, progress.
6. **Editorial**: Tiptap CMS, scheduled publishing, OG images, RSS/sitemap, newsletter.
7. **CRM & Analytics**: contact unification, timeline, rollups, dashboards.
8. **Hardening**: Redis-backed throttling, observability, CI, deployment.
