# TakeFlow: Fiat Pricing and Shop Checkout

Design document. Draft for team review, 5 November 2026.

Items marked **Agreed** were decided by the team. Items marked **Proposed** are suggestions waiting for a yes. Everything else is detail left to whoever builds it.

---

## 1. Why

Today an invoice's `amount` is compared one to one with the crypto received (`backend/src/reconciliation/reconciliation.service.ts`). That only gives correct balances when the invoice is in USD and the client pays in a dollar stablecoin. A GBP invoice paid in USDT, or an NGN invoice paid in USDT, shows the wrong balance. The dashboard summary also adds amounts in different currencies together (`businessSummary` in `backend/src/transactions/transactions.service.ts`).

Businesses bill clients in the client's own currency, and shops selling to the public price in local money. Roqqu's API has no way to take fiat payments. Its only fiat feature is exchange rates (`GET /rates`), plus crypto prices (`GET /prices`). So payments stay in crypto, and TakeFlow converts the prices.

## 2. What the team decided

1. **Agreed:** both invoices and shop checkout get fiat pricing.
2. **Agreed:** both are in the hackathon demo.
3. **Agreed:** shops create checkout links by hand in the dashboard and through website API keys.
4. **Agreed:** payers always pay in crypto.
5. **Agreed:** the crypto amount on the payment page is held for a short window of 2 to 5 minutes, 5 at most. A payment made inside the window counts at the quoted rate.
6. **Agreed:** amounts on the dashboard show in one currency at a time. Each person picks that currency for themselves as a display setting, and it changes only what they see.
7. **Agreed:** checkout supports both one-order links and reusable product links that many buyers can pay through.
8. **Agreed:** the hackathon deadline is 11:59 pm on 5 November 2026.

## 3. Goals, non-goals, anti-goals

Goals:
- A business can price an invoice or a checkout in NGN, USD, GBP, EUR or GHS.
- The payer sees the exact crypto amount to send, with a countdown.
- Every payment gets a stored value in the price currency, along with the rate used, where the rate came from and when.
- Balances, statuses and dashboard totals are correct in each price currency and in the home currency.
- A shop's website can create a checkout for an order and find out when it is paid.

Non-goals for this round:
- Taking naira or any other fiat directly. Roqqu's API has no fiat payment calls.
- Converting received crypto to fiat, or paying money out to businesses. The PRD keeps both out of the MVP.
- BTC, ETH or other coins whose price swings, as payment options.
- Card or bank payments.

Anti-goals (a failure even if everything else works):
- A payer sends exactly the quoted amount inside the window and still ends up owing money.
- A payment is counted twice, or valued with a rate we cannot show.
- Money stored or calculated as JavaScript floats. Plan section 13.5: use precise decimal arithmetic.
- Behaviour assumed from Roqqu that its docs do not state. Plan section 13.3: never invent external API behaviour.

## 4. Constraints and facts

Roqqu feeds, checked live on 5 Nov 2026 at 14:28 UTC:
- `GET /rates` needs no key. It returns a list of fiat currencies, each with `symbol` and `rate` per 1 US dollar. Values that day: ngn 1375, usd 1, gbp 0.75, eur 0.92, ghs 12.3. Those five are the only currencies it returns. Each entry also has a `status` (1 = on).
- `GET /prices` needs no key. It returns 163 tokens keyed by symbol, each with a USD `price` as a decimal string. Values that day: usdt 1.000000000000000, usdc 0.999862311183132.
- The docs say both feeds update every minute. No endpoint for past rates is documented.
- `GET /tokens` needs a key (it returned 401 without one).

Payment coins:
- USDT on TRC20, USDT on BEP20, and USDC on Base. These are the stablecoin networks in Roqqu's network table.
- USDT on ERC20 stays out until Roqqu confirms it. Their network table lists only ETH on ERC20, but their webhook sample shows USDT on ERC20.

Other Roqqu facts this design relies on:
- `POST /wallets/generate-wallet` requires a customer email, first name and last name.
- Webhooks "are queued asynchronously and may have short delays". The docs do not say whether Roqqu retries failed deliveries.
- The deposit record from `GET /transaction/deposit/:tx_hash` includes `created_at`. The webhook `datetime` is the "timestamp of the related queue/deposit record".

Things this feature depends on, which are not built yet:
- A public payment page route.
- CORS for the frontend.
- A deployed backend, with its webhook URL set in the RAS console.
- One real Roqqu test payment going through end to end.

The hackathon deadline is 11:59 pm on 5 November 2026.

## 5. How it works

### 5.1 Rates

A `RatesService` sits next to `RoqquService`. It reads `/rates` and `/prices` and keeps the result for 60 seconds, because the feeds update every minute.

Each fetch is saved as a rate snapshot holding:
- the time
- the fiat rates per USD
- the USD prices of the coins TakeFlow accepts

Conversion: fiat per 1 coin = coin's USD price × fiat rate per USD.

Examples with the 5 Nov figures:
- 1 USDT = 1.0 × 1375 = ₦1,375. A ₦500,000 invoice is 363.64 USDT.
- 1 USDT = 1.0 × 0.75 = £0.75. A £1,000 invoice is 1,333.34 USDT.
- 1 USDC = 0.99986 × 0.75 = £0.74990. A £1,000 invoice is 1,333.52 USDC.

**Proposed:** crypto amounts are rounded up to the coin's display precision (2 decimal places for these stablecoins), so the business never receives less than the price.

**Agreed:** quotes use a fresh snapshot whenever Roqqu's feeds respond. If they fail (Roqqu's rates feed returned error 502 on 5 Nov), the last good snapshot can be used for up to 30 minutes, and the payment page shows the time of the rate it used.

**Proposed:** if there is no good snapshot from the last 30 minutes, a currency is missing, or its `status` is not 1, no new quotes are made and the payment page says the price is unavailable. A rate is never guessed.

### 5.2 Quotes (the countdown)

A quote is created when the payer opens the payment page, and again each time an old one runs out. It fixes:
- the amount still owed, in the price currency
- the coin and network
- the crypto amount
- the rate used and the snapshot it came from
- when it was created and when it expires

**Agreed:** the window is 2 to 5 minutes, 5 at most.
**Proposed:** each business picks a window from 2 to 5 minutes, with 5 as the default.

Only one quote per invoice or checkout is active at a time.

**Proposed:** for both B2B invoices and B2C checkout, the business picks the coin and network when it creates the invoice, checkout or product link. Letting payers choose comes later.

### 5.3 Valuing a payment

The existing check stays exactly as it is: decrypt the webhook, look up the deposit and compare it field by field, then requery. After that, the deposit is matched by address, as today. Then:

1. Deposit time is the `created_at` of Roqqu's deposit record. If that is missing, the webhook `datetime` is used. (**Proposed.** The webhook itself can reach us late, so the time it arrives is not used.)
2. If a quote for that invoice or checkout was active at the deposit time, value = crypto received × the quote's rate. (**Agreed:** inside the window the quoted rate counts.)
3. Otherwise, value = crypto received × the latest rate when TakeFlow processes the payment. (**Proposed.** Roqqu documents no past rates, so this is the closest available to "rate on arrival".)
4. The transaction stores:
   - the price currency
   - the value in that currency
   - the rate used
   - the rate snapshot
   - the quote, if one applied
   - whether it was valued by quote or on arrival
   - when it was valued

   The value is worked out once, when the payment is first matched. Repeat webhooks never value it again. Plan section 13.6: make webhook processing idempotent.
5. Amount received = the sum of stored values over matched transactions. Amount owed = price minus amount received, never below zero. This keeps today's "recompute from the sum" approach, which is safe to run any number of times.

Known edge case: a payer who sends near the end of the window might have the deposit recorded by Roqqu just after it. That payment is then valued at the rate on arrival. The only exposure is how far Roqqu's rate moves in those extra seconds.

**Proposed:** a shortfall smaller than 0.5% of the price counts as paid. Each business can change this setting, including to zero. It covers rounding and the edge case above.

**Proposed:** an excess smaller than one minor unit of the currency (₦1, £0.01) is not reported as an overpayment.

### 5.4 Invoices

These work as they do today, with three changes:
- `currency` must be one of the currencies Roqqu's `/rates` returns with status 1.
- The coin and network pair must be one of the three accepted pairs.
- Partial payments stay. Each payment comes off the balance at its stored value. For example:
  1. On a £1,000 invoice, a first payment of 600 USDT at 0.75 is worth £450.
  2. That leaves £550 owed.
  3. The next quote asks for 733.34 USDT.

### 5.5 Shop checkout

A checkout is a payment request for one order. It holds:
- the price and currency
- the coin and network
- the buyer's name and email, if known
- the shop's own order ID, if it has one
- a return URL, if it has one
- an expiry for the link

**Proposed:** links expire after 24 hours by default.

Reusable product links (**Agreed**):
- A product link holds a price, a currency, a coin and a network, and the shop can share it anywhere.
- Each buyer who opens it starts their own checkout, with its own address, countdown and status.
- **Proposed:** the Roqqu address is made only when the buyer taps Pay. That way, people who only look at the page do not use up addresses.
- **Proposed:** the buyer is asked for a name and email before paying, because Roqqu needs them to make the address. If the buyer skips this, the shop's details are used.
- **Proposed:** a product link stays open until the shop turns it off.

How a checkout gets created:
- By hand in the dashboard. The shop copies the link into WhatsApp, Instagram or email. (**Agreed**)
- By the shop's website, through the API with an API key. (**Agreed**, see 5.6)

The payer's side:
1. The payer opens the link and sees the price, the crypto amount and a countdown.
2. The payer sends the payment.
3. The page changes to paid and shows a receipt.
4. If the shop gave a return URL, a "back to shop" button appears.

Checkouts need the full amount, within the shortfall setting in 5.3.

**Proposed:** if a payment falls short, the checkout shows as partly paid. The shop sees how much is missing, and the payer page offers a new quote for the rest. The order is not failed.

Each checkout gets its own new Roqqu address. Roqqu needs a customer name and email for this. TakeFlow uses the buyer's details if they were given, and otherwise the shop's details. That fallback already exists in `backend/src/wallets/wallets.service.ts`.

**Proposed:** checkouts live in the same table as invoices, with a `kind` field set to INVOICE or CHECKOUT. Reconciliation, transactions and the payment page then stay one code path. Plan section 13.10: avoid unnecessary architecture.

### 5.6 Website API keys

- A business creates keys in settings. Each key is shown once, stored only as a hash, and can be revoked.
- With a key, a shop's server can:
  - create a checkout
  - read a checkout's status
  - look a checkout up by the shop's own order ID
- **Proposed:** sending the same order ID twice returns the same checkout, so a retry never makes two.
- The shop learns that an order is paid by calling the status endpoint. The redirect to the return URL is for the buyer only, and the shop should not trust it as proof of payment.
- **Proposed:** signed notifications from TakeFlow to the shop's server come after the demo. The status endpoint is enough for a website to confirm an order.

### 5.7 Public payment page

This is a public route by the invoice's existing `paymentReference` (`pay_` plus 32 hex characters). It needs no login.

It returns:
- the business name
- what is being paid for
- the price and currency
- the amount still owed
- the coin and network
- the address
- the active quote with its expiry time
- the status
- the payments received so far

It also has a way to ask for a fresh quote.

It never returns internal IDs or anything belonging to another business.

**Proposed:** limit how often each visitor can call the public routes.

The page's look gets designed with the frontend developer before any code is written.

### 5.8 Dashboard and display currency

- The display currency is a personal control. Each person picks one of the five currencies for themselves, and it changes only what they see. (**Agreed**)
- **Proposed:** the choice is saved per user. It starts as the currency of the business's first invoice, or USD if there are none.
- Each invoice and checkout still shows its own price currency. (**Agreed**)
- **Proposed:** when converting for display, money already received uses the rate snapshot closest to when each payment arrived. Amounts invoiced and still owed use today's rate.
- **Proposed:** the payment page gives payers the same control, for display only. What they owe stays in the price currency.
- The current summary, which adds different currencies together, is replaced.

### 5.9 Build order for the demo (Proposed)

0. Prerequisites:
   - one real Roqqu test payment end to end
   - backend deployed, with the webhook URL set
   - CORS
   - the public payment page route
1. Rates service and snapshots.
2. Quotes and payment valuation for invoices, plus the summary fix.
3. Display currency on the dashboard.
4. Checkout created by hand (one-order links), then reusable product links.
5. API keys and the checkout API.

The frontend screens for the demo run alongside steps 1 to 5: sign-in, the dashboard, the invoice and checkout forms, and the payment page.

The deadline is tonight (11:59 pm, 5 Nov). If time runs short, cut from the bottom of the list.

## 6. Questions for Roqqu

1. How do we send a test deposit in Test mode?
2. Does the Test key decrypt Test-mode webhooks? The decrypt page only mentions the Live key.
3. Does Roqqu retry a webhook that fails, and what response does it expect?
4. Is USDT on ERC20 supported?
5. Must API calls come from a whitelisted IP?
6. Are the `/rates` values the rates Roqqu actually trades at? On 5 Nov they looked rounded (gbp 0.75, eur 0.92).

## 7. Left to the builder

- Table and column names, and the migrations.
- How rates are cached.
- How rounding is implemented.
- Error messages.
- The exact rate limits on public routes.
- The screen layouts, which get designed with the frontend developer first.

## 8. Sources

Roqqu docs, read 5 Nov 2026:
- [Introduction (network table)](https://roqqu-api-services.gitbook.io/ras/introduction.md)
- [Get Fiat Rates](https://roqqu-api-services.gitbook.io/ras/market-data/get-fiat-rates.md)
- [Get Crypto Prices](https://roqqu-api-services.gitbook.io/ras/market-data/get-crypto-prices.md)
- [Generate Wallet](https://roqqu-api-services.gitbook.io/ras/wallets/generate-wallet.md)
- [Coin Webhook Events](https://roqqu-api-services.gitbook.io/ras/webhooks/coin-webhook-events.md)
- [Decrypt Webhook Body](https://roqqu-api-services.gitbook.io/ras/webhooks/decrypt-webhook-body.md)
- [Get Transaction by Transaction Hash](https://roqqu-api-services.gitbook.io/ras/transaction/get-transaction-by-transaction-hash.md)
- [Token Deposits](https://roqqu-api-services.gitbook.io/ras/transaction/token-deposits.md)

Live feeds: `https://service.roqqu.com/v1/rates` and `https://service.roqqu.com/v1/prices`, fetched 5 Nov 2026 at 14:28 UTC.

This repo:
- `TAKEFLOW_PRD.md` (scope, out of scope)
- `BACKEND_IMPLEMENTATION_PLAN.md` section 13 (engineering principles)
- the source files named above
