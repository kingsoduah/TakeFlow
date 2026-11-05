# TakeFlow API

NestJS backend for TakeFlow: invoices and checkouts priced in fiat, paid in stablecoins through Roqqu, verified and matched automatically. See the [main README](../README.md) for the full picture.

Live: https://takeflow-api.vercel.app/api/v1 (health at `/api/v1/health`, OpenAPI JSON at `/api/v1/docs-json`).

## Commands

```bash
npm ci                       # install (also runs prisma generate)
cp .env.example .env         # fill in DATABASE_URL, DATABASE_URL_UNPOOLED, JWT_SECRET, Roqqu keys
npx prisma migrate deploy    # apply migrations to the database
npm run start:dev            # http://localhost:3000/api/v1
npm test                     # unit tests
npm run test:e2e             # end-to-end tests against the database in DATABASE_URL
npm run lint
npm run build
```

## Where things live

| Folder | Responsibility |
| --- | --- |
| `src/roqqu` | The only HTTP boundary to Roqqu: wallets, deposits, requery, rates, prices, webhooks |
| `src/webhooks` | Decrypts Roqqu webhooks and verifies each deposit before anything counts |
| `src/reconciliation` | Matches verified deposits to invoices by receiving address and recalculates balances |
| `src/quotes` | Price quotes with a 2 to 5 minute window, and payment valuation |
| `src/rates` | Roqqu rates and prices, cached for 60 seconds, saved as snapshots, 30 minute fallback |
| `src/pricing` | Decimal money math, supported currencies and coin and network pairs |
| `src/payments` | Public payment page routes, rate limited per IP |
| `src/checkouts` | One-order checkouts and reusable product links |
| `src/api-keys` | API keys for shop websites (stored hashed, shown once) |
| `src/transactions` | Payment records and the dashboard summary |
| `src/auth`, `src/businesses`, `src/clients`, `src/invoices` | Accounts, businesses, clients and invoices |

## Rules the code follows

- Money is `Prisma.Decimal` everywhere. No JavaScript floats for amounts or rates.
- A webhook alone never marks an invoice paid. Each deposit is checked against Roqqu's deposit record and requery first.
- Each payment is valued once and stored. Balances are recalculated from stored values, so repeated webhooks never double count.
- Roqqu calls carry a named User-Agent, the API key when configured, and the relay secret when `ROQQU_BASE_URL` points at the [`roqqu-relay`](../roqqu-relay/README.md) Worker (used because Roqqu's Cloudflare challenges cloud servers).

## Deploying on Vercel

`vercel.json` sets the NestJS framework. Neon Postgres connected through the Vercel Marketplace provides `DATABASE_URL` and `DATABASE_URL_UNPOOLED`. Set `JWT_SECRET`, the Roqqu variables, `FRONTEND_ORIGINS` and `TRUST_PROXY_HOPS=1`, run `npx prisma migrate deploy` once, then deploy.
