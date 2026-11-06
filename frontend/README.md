# TakeFlow app

Next.js frontend for TakeFlow: the landing page, the business dashboard, invoices, checkout links, transactions, settings, and the public payment page clients use to pay. See the [main README](../README.md) for the full picture.

Live: https://takeflow-sandy.vercel.app

## Commands

```bash
npm ci
cp .env.example .env.local
npm run dev        # http://localhost:3100
npm run lint
npm run build
npm start          # serves the production build on port 3100
```

## Sample data or the real API

- `NEXT_PUBLIC_USE_MOCKS=true` runs every screen on built-in sample data with no API calls. Any email and password signs in, and the payment page shows sample-only buttons to send a part or full payment.
- `NEXT_PUBLIC_USE_MOCKS=false` with `NEXT_PUBLIC_API_URL` set (for example `https://takeflow-api.vercel.app/api/v1`) uses the real API. The API's `FRONTEND_ORIGINS` must include this app's address.
- When the API runs in demo mode (`DEMO_PAYMENTS=true`), the payment page shows "Simulate a part payment" and "Simulate the full payment". These go through the API's real matching code, so the dashboard updates for real. Simulated payments (hash `sim_…`) get no explorer link.

## Pages

| Path | Page |
| --- | --- |
| `/` | Landing page |
| `/sign-in`, `/sign-up`, `/onboarding` | Accounts and first-run business setup |
| `/dashboard` | Money bar (paid, partly paid, waiting, overdue), trends, chart, items needing attention |
| `/invoices`, `/invoices/new`, `/invoices/[id]` | Invoices, the create form and invoice detail with payments |
| `/checkout-links`, `/checkout-links/new` | One-order checkout links and reusable product links |
| `/transactions` | Payments with matched and unmatched filters, explorer links and CSV download |
| `/clients`, `/settings` | Clients, display currency, payment settings and API keys |
| `/pay/[reference]` | Public payment page: amount, QR code, address, price countdown, live status, receipt |
| `/pay/links/[reference]` | Public product link page that starts a buyer's own checkout |

## Code map

- `lib/api.ts`: typed client for every API route, with a matching sample-data layer in `lib/mock-api.ts`.
- `lib/types.ts`: shared response types.
- `components/views/PayView.tsx`: the payment page.
- `components/landing/LandingView.tsx`: the landing page.
- `app/globals.css`: brand tokens (Deep Navy, Emerald Teal, Soft Mint, Cloud White, Slate Grey; Manrope and Inter).
