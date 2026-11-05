# TakeFlow

**Every payment. Accounted for.**

TakeFlow is a receivables and payment reconciliation app for digital businesses (software agencies, Web3 studios, freelancers) and shops that get paid in crypto. A business prices an invoice or a checkout link in its own currency, the client pays in a stablecoin, and TakeFlow verifies each deposit with Roqqu and matches it to the right invoice. The business always knows what is paid and what is still owed.

Built for the **Anambra Web3 Hackathon 2026** (DeFi track) on **Roqqu API Services (RAS)**.

| | Link |
| --- | --- |
| App | https://takeflow-sandy.vercel.app |
| API | https://takeflow-api.vercel.app/api/v1 |
| API health | https://takeflow-api.vercel.app/api/v1/health |
| OpenAPI document (JSON) | https://takeflow-api.vercel.app/api/v1/docs-json |

---

## Contents

1. [What TakeFlow does](#what-takeflow-does)
2. [How a payment flows](#how-a-payment-flows)
3. [Pricing in fiat](#pricing-in-fiat)
4. [Tech stack](#tech-stack)
5. [Repository layout](#repository-layout)
6. [Running locally](#running-locally)
7. [Environment variables](#environment-variables)
8. [API overview](#api-overview)
9. [Testing](#testing)
10. [Deployment](#deployment)
11. [Status and known issues](#status-and-known-issues)
12. [Project documents](#project-documents)
13. [Team](#team)

---

## What TakeFlow does

- **Invoices in your currency.** Price an invoice in NGN, USD, GBP, EUR or GHS. Clients pay in USDT on TRC20, USDT on BEP20, or USDC on Base.
- **A payment page with a price lock.** The client sees the exact crypto amount at a live Roqqu rate, held for up to 5 minutes with a countdown (each business can set 2 to 5 minutes). The page also shows a QR code, the address, and the time of the rate it used.
- **One address per invoice.** Every invoice and checkout gets its own Roqqu address, so each deposit lands on the right invoice. No spreadsheet matching.
- **Verified before it counts.** A deposit only counts after TakeFlow checks it with Roqqu. A webhook on its own never marks an invoice paid.
- **Part payments, overpayments and a review list.** Part payments are recorded and the rest stays owed. Overpayments are recorded. Deposits that match no invoice wait in a review list.
- **Checkout for shops.** One-order checkout links, reusable product links to share on WhatsApp or Instagram, and API keys so a shop's website can create checkouts.
- **A dashboard that answers "what is paid and what is owed".** Totals show in a display currency each person picks for themselves, with a money bar split into paid, partly paid, waiting and overdue.

---

## How a payment flows

1. The business creates an invoice (price, currency, coin and network, due date) and shares the link `/pay/<paymentReference>`.
2. The client opens the payment page. On the first price request, TakeFlow asks Roqqu for a receiving address (`POST /wallets/generate-wallet`) and makes a quote from Roqqu's `GET /rates` and `GET /prices`.
3. The client sends the stablecoin. Roqqu sends an encrypted `token_received` webhook to `POST /api/v1/webhooks/roqqu`.
4. TakeFlow decrypts the body (`aes-256-ctr`, key = first 32 characters of the Roqqu API key, IV = hex value of the `x-api-key` request header) and stores the event once per `event_id`, so repeated deliveries are safe.
5. TakeFlow verifies the deposit with Roqqu:
   - `GET /transaction/deposit/:tx_hash`: hash, address, network, token and amount must all match the webhook.
   - `POST /transaction/requery/:network`: the transaction must be confirmed ("Transaction confirmed in Block." or "Transaction already credited.").
6. The deposit is matched by its receiving address and valued once in the invoice's currency:
   - If it was recorded by Roqqu while a quote was active, it counts at the quoted rate.
   - Otherwise it counts at the latest rate when TakeFlow processes it.
7. The invoice balance is recalculated from the stored values. A shortfall under 0.5% of the price counts as paid (configurable per business, including zero). Anything above the price is recorded as an overpayment.

Every money value uses precise decimal arithmetic (`Prisma.Decimal`), never JavaScript floats. The same transaction hash can never be credited twice.

---

## Pricing in fiat

Roqqu's rates feed gives each currency per 1 US dollar, and its prices feed gives each coin's price in US dollars:

```
fiat per 1 coin = coin's USD price x currency units per USD
crypto to send  = amount owed / fiat per 1 coin   (rounded up to 2 decimals)
```

Example with the rates seen on 5 Nov 2026 (1 USD = 0.75 GBP, 1 USDT = 1.00 USD): a GBP 1,000 invoice asks for 1,333.34 USDT. Rounding up means the business never receives less than the price.

If Roqqu's feeds are unavailable, TakeFlow uses the last good rates for up to 30 minutes and shows their time on the payment page. With nothing newer than 30 minutes, it shows "price unavailable". A rate is never guessed.

---

## Tech stack

| Part | Stack |
| --- | --- |
| Backend (`backend/`) | NestJS 12, TypeScript, Prisma 7 with the Neon serverless adapter, PostgreSQL on Neon, class-validator, OpenAPI document, Vitest |
| Frontend (`frontend/`) | Next.js 16 (App Router), React 19, Tailwind CSS 4, qrcode.react |
| Payments | Roqqu API Services: wallets, deposit lookup, requery, rates, prices, webhooks |
| Hosting | Vercel (one project for the API, one for the app), Neon Postgres through the Vercel Marketplace, a Cloudflare Worker relay for Roqqu calls |

---

## Repository layout

```
TakeFlow/
├── backend/                     NestJS API
│   ├── prisma/                  schema and migrations
│   ├── src/
│   │   ├── auth/                register, login, current user, display currency
│   │   ├── businesses/          businesses and their payment settings
│   │   ├── clients/             clients
│   │   ├── invoices/            invoices and payment instructions
│   │   ├── checkouts/           one-order checkouts and product links
│   │   ├── payments/            public payment page routes
│   │   ├── quotes/              price quotes and payment valuation
│   │   ├── rates/               Roqqu rates, prices and rate snapshots
│   │   ├── pricing/             money math, currencies and coins
│   │   ├── reconciliation/      matching deposits to invoices
│   │   ├── webhooks/            Roqqu webhook decryption and verification
│   │   ├── wallets/             Roqqu receiving addresses
│   │   ├── transactions/        payment records and the dashboard summary
│   │   ├── api-keys/            API keys for shop websites
│   │   └── roqqu/               the only HTTP boundary to Roqqu
│   └── test/                    end-to-end tests
├── roqqu-relay/                 Cloudflare Worker that relays Roqqu calls from Africa
├── frontend/                    Next.js app
│   ├── app/                     pages: landing, auth, dashboard, invoices, checkout links, transactions, settings, pay
│   ├── components/              UI, landing page and payment page views
│   └── lib/                     API client, types, sample data
├── FIAT_PRICING_AND_CHECKOUT_DESIGN.md
├── TAKEFLOW_PRD.md
├── BACKEND_IMPLEMENTATION_PLAN.md
├── ROQQU_API_REFERENCE.md
└── ROQQU_INTEGRATION_MAP.md
```

---

## Running locally

Requirements: Node.js 22.22+ (or 24.15+ / 26+), npm, and a PostgreSQL database on Neon.

### Backend

```bash
cd backend
npm ci                       # also generates the Prisma client
cp .env.example .env         # then fill in the values (see Environment variables)
npx prisma migrate deploy    # creates the tables
npm run start:dev            # http://localhost:3000/api/v1
```

### Frontend

```bash
cd frontend
npm ci
cp .env.example .env.local
npm run dev                  # http://localhost:3100
```

With `NEXT_PUBLIC_USE_MOCKS=true` every screen runs on built-in sample data and makes no API calls. In sample mode any email and password signs in, and the payment page shows sample-only buttons to send a part or full payment. Set it to `false` and point `NEXT_PUBLIC_API_URL` at the API to use real data.

---

## Environment variables

### Backend (`backend/.env`)

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Pooled Neon connection, used by the app |
| `DATABASE_URL_UNPOOLED` | Yes | Direct Neon connection, used by Prisma CLI commands such as migrations |
| `JWT_SECRET` | Yes | Secret for signing login tokens |
| `JWT_EXPIRES_IN` | No | Token lifetime, default `7d` |
| `ROQQU_BASE_URL` | No | Default `https://service.roqqu.com/v1` |
| `ROQQU_ENV` | No | `staging` (Test mode, header `x-staging-api-key`) or `live` (header `x-api-key`). Default `staging` |
| `ROQQU_STAGING_API_KEY` | For Test mode | Roqqu Test mode API key |
| `ROQQU_API_KEY` | For Live mode | Roqqu Live mode API key |
| `ROQQU_WEBHOOK_API_KEY` | For webhooks | Key used to decrypt Roqqu webhooks (first 32 characters). Use the key of the mode you run |
| `ROQQU_RELAY_SECRET` | With the relay | Shared secret for the `roqqu-relay` Worker. Set it together with `ROQQU_BASE_URL` pointing at the Worker's `/v1` |
| `FRONTEND_ORIGINS` | For the app | Comma-separated browser origins allowed by CORS, for example `https://takeflow-sandy.vercel.app,http://localhost:3100` |
| `TRUST_PROXY_HOPS` | No | Proxies in front of the API: `1` on Vercel, `0` locally. Lets the public rate limiter see the real client address |
| `PORT` | No | Default `3000` |

### Frontend (`frontend/.env.local`)

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | API base including `/api/v1`, for example `https://takeflow-api.vercel.app/api/v1` |
| `NEXT_PUBLIC_USE_MOCKS` | `true` for sample data, `false` for the real API |
| `NEXT_PUBLIC_APP_URL` | Optional base for shared pay links (defaults to the current site) |

Never commit `.env` files. Only the `.env.example` templates are in the repository.

---

## API overview

All routes sit under `/api/v1`. The full contract is in the OpenAPI document at `/api/v1/docs-json`.

**Public (no login, rate limited per IP)**

| Method and path | What it does |
| --- | --- |
| `GET /health` | Health check |
| `GET /pay/options` | Supported currencies and coin and network pairs |
| `GET /pay/:paymentReference` | Payment page data. Optional `?currency=` for a display conversion |
| `POST /pay/:paymentReference/quote` | Gets or refreshes the price quote. Creates the Roqqu address on first use |
| `GET /pay/links/:reference` | Product link details with an indicative crypto amount |
| `POST /pay/links/:reference/checkouts` | Starts a buyer's own checkout from a product link |
| `POST /webhooks/roqqu` | Roqqu webhook receiver (verified by decryption, not by login) |

**Logged in (JWT bearer token)**

| Area | Routes |
| --- | --- |
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `PATCH /auth/me` (display currency) |
| Businesses | `POST /businesses`, `GET /businesses`, `GET/PATCH/DELETE /businesses/:id` |
| Clients | `/businesses/:businessId/clients` |
| Invoices | `/businesses/:businessId/invoices`, plus `POST :id/address` and `GET :id/payment` |
| Checkouts | `/businesses/:businessId/checkouts` |
| Product links | `/businesses/:businessId/product-links` |
| Transactions | `GET /businesses/:businessId/transactions`, `GET .../transactions/:id`, `GET .../invoices/:id/payments` |
| Dashboard | `GET /businesses/:businessId/summary` (optional `?currency=` and `&kind=`) |
| API keys | `POST/GET /businesses/:businessId/api-keys`, `DELETE /businesses/:businessId/api-keys/:id` |
| Roqqu | `GET /roqqu/balances`, `GET /roqqu/webhooks` (merchant account reads) |

**Shop websites (header `X-Api-Key`)**

| Method and path | What it does |
| --- | --- |
| `POST /checkouts` | Creates a checkout. Repeating an `orderId` returns the same checkout |
| `GET /checkouts/:id` | Checkout status and payments |
| `GET /checkouts/by-order/:orderId` | Looks a checkout up by the shop's own order id |

Example from a shop's server:

```js
const res = await fetch(`${process.env.TAKEFLOW_API_URL}/api/v1/checkouts`, {
  method: "POST",
  headers: {
    "X-Api-Key": process.env.TAKEFLOW_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    amount: "343750.00",
    currency: "NGN",
    cryptoAsset: "USDT",
    network: "trc20",
    orderId: "A-2291",
    description: "Website starter kit",
    returnUrl: "https://yourshop.com/thanks",
  }),
});
const checkout = await res.json();
// Send your customer to /pay/<checkout.paymentReference>
```

---

## Testing

```bash
cd backend
npm test            # unit tests: 168 tests in 19 files
npm run test:e2e    # end-to-end tests: 39 tests in 4 files, needs DATABASE_URL
npm run lint
npm run build

cd ../frontend
npm run lint
npm run build
```

The end-to-end tests run against a real Neon database. They create their own test users and data and delete them afterwards. They run one file at a time: starting four app instances at once against a database that has just woken up made the first requests fail.

All of these passed on 5 Nov 2026, including the 39 end-to-end tests against the hosted Neon database.

---

## Deployment

Both parts run on Vercel.

| Project | Root | Notes |
| --- | --- | --- |
| `takeflow-api` | `backend/` | `vercel.json` sets the NestJS framework. `npm install` runs `prisma generate` (postinstall). Neon Postgres is connected through the Vercel Marketplace, which sets `DATABASE_URL` and `DATABASE_URL_UNPOOLED` |
| `takeflow` | `frontend/` | Next.js. Set `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_USE_MOCKS=false` |

Steps for a new environment:

1. Create the Neon database and apply migrations: `npx prisma migrate deploy` (uses `DATABASE_URL_UNPOOLED`).
2. Set the backend variables listed above, including `FRONTEND_ORIGINS` with the app's address and `TRUST_PROXY_HOPS=1`.
3. Deploy the backend, then the frontend. If Roqqu's Cloudflare challenges the server, deploy [`roqqu-relay`](roqqu-relay/README.md) and point `ROQQU_BASE_URL` and `ROQQU_RELAY_SECRET` at it.
4. In the Roqqu RAS console (settings page, API Keys and Webhooks), set the webhook URL to `https://<api-domain>/api/v1/webhooks/roqqu` and turn on coin deposit events.

---

## Status and known issues

- **Roqqu's bot check and the relay.** On 5 Nov 2026, Roqqu's Cloudflare answered every request from the Vercel server with a "Just a moment..." browser check (HTTP 403), even calls carrying the API key. The hosted API now calls Roqqu through the [`roqqu-relay`](roqqu-relay/README.md) Worker, whose calls leave from Africa. With it, the live API gets real rates and prices. Asking Roqqu to let server traffic through is still the cleaner long-term fix.
- **A valid Roqqu Test key is needed.** The Test key tried on 5 Nov 2026 was rejected by Roqqu ("Invalid API Key") with both the `x-staging-api-key` and `x-api-key` headers. Until a valid key is set, the payment page cannot create receiving addresses, so live quotes fail.
- **Roqqu's service was unsteady on 5 Nov 2026.** Its feeds sometimes returned HTTP 502 or "rates data still syncing". TakeFlow falls back to the last good rates for up to 30 minutes.
- **Questions for Roqqu** (not answered by the docs):
  1. How to send a test deposit in Test mode.
  2. Whether the Test key decrypts Test mode webhooks (the docs only mention the Live key).
  3. Whether failed webhooks are retried, and which response is expected.
  4. Whether USDT on ERC20 is supported (the network table lists only ETH on ERC20).
  5. Whether API calls must come from a whitelisted IP.
  6. Whether the `/rates` values are trading rates. On 5 Nov 2026 they were round numbers 1 to 5% away from market rates.
- **Per-instance memory.** The public rate limiter and the rates cache live in memory, so each server instance keeps its own.
- **Frontend live mode gaps.** There is no rates route for the app yet, so the rate chips only show in sample mode. The dashboard summary covers all time rather than the last 30 days.

---

## Project documents

| Document | What it covers |
| --- | --- |
| [`TAKEFLOW_PRD.md`](TAKEFLOW_PRD.md) | Product requirements, user journeys, MVP scope |
| [`BACKEND_IMPLEMENTATION_PLAN.md`](BACKEND_IMPLEMENTATION_PLAN.md) | Backend phases and engineering principles |
| [`FIAT_PRICING_AND_CHECKOUT_DESIGN.md`](FIAT_PRICING_AND_CHECKOUT_DESIGN.md) | Design for fiat pricing, quotes, checkout links and API keys |
| [`ROQQU_API_REFERENCE.md`](ROQQU_API_REFERENCE.md) | Roqqu endpoints as used by TakeFlow |
| [`ROQQU_INTEGRATION_MAP.md`](ROQQU_INTEGRATION_MAP.md) | How TakeFlow uses Roqqu, step by step |

Roqqu's own documentation: https://roqqu-api-services.gitbook.io/ras

---

## Team

- Kings Oduah
- Johnnie Modebe
