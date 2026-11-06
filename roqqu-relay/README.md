# roqqu-relay

A small Cloudflare Worker that relays the TakeFlow API's calls to Roqqu.

## Why it exists

On 5 Nov 2026, Roqqu's Cloudflare answered every request from the hosted TakeFlow API (Vercel, United States) with a "Just a moment..." browser check (HTTP 403), including calls that carried the API key. A server cannot pass that check. Calls that reached Roqqu from Africa were answered normally.

The relay hands each call to a Durable Object pinned to Africa (location hint `afr`), which makes the call to `https://service.roqqu.com`. With the relay in place, the hosted API gets real rates and prices from Roqqu.

## How it is locked down

- Only requests carrying the shared secret in the `x-relay-secret` header are relayed. Everything else gets 403.
- Only paths under `/v1/` are relayed, plus `/relay-trace`, which reports where the relay runs.
- Only the headers Roqqu needs are passed on: `content-type`, `accept`, `user-agent`, `x-staging-api-key` and `x-api-key`.

## Deploy

```bash
cd roqqu-relay
npx wrangler deploy
node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))" > relay-secret.txt
npx wrangler secret put RELAY_SECRET < relay-secret.txt
```

Keep `relay-secret.txt` out of git and delete it once the secret is also set on the API.

## Point the API at it

Set these on the API (`backend/`):

| Variable | Value |
| --- | --- |
| `ROQQU_BASE_URL` | `https://<worker-name>.<account>.workers.dev/v1` |
| `ROQQU_RELAY_SECRET` | the same value as the Worker's `RELAY_SECRET` |

To call Roqqu directly again, set `ROQQU_BASE_URL` back to `https://service.roqqu.com/v1` and clear `ROQQU_RELAY_SECRET`.

## Check it

```bash
curl -H "x-relay-secret: $SECRET" https://<worker-name>.<account>.workers.dev/relay-trace
curl -H "x-relay-secret: $SECRET" https://<worker-name>.<account>.workers.dev/v1/rates
```
