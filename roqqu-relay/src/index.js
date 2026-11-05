// Relays TakeFlow's Roqqu API calls through Cloudflare, from Africa.
//
// Why: on 5 Nov 2026 Roqqu's Cloudflare answered requests from the hosted
// TakeFlow API (Vercel, United States) with a "Just a moment..." browser
// check (HTTP 403), even calls carrying the API key. The same calls passed
// when they left Cloudflare in Africa and were challenged when they left it
// in the United States. So the relay hands every call to a Durable Object
// pinned to Africa (location hint "afr"), which makes the call to Roqqu.
//
// Safety: only requests carrying the shared RELAY_SECRET are relayed, only
// paths under /v1/ are allowed, and only the headers Roqqu needs are passed on.

import { DurableObject } from 'cloudflare:workers';

const UPSTREAM = 'https://service.roqqu.com';
const FORWARDED_HEADERS = ['content-type', 'accept', 'user-agent', 'x-staging-api-key', 'x-api-key'];
const OBJECT_NAME = 'roqqu-relay-africa';

function sameSecret(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  if (x.byteLength !== y.byteLength) return false;
  return crypto.subtle.timingSafeEqual(x, y);
}

// Runs in an African Cloudflare location and makes the actual Roqqu call.
export class RoqquRelay extends DurableObject {
  async fetch(request) {
    const url = new URL(request.url);

    // Reports where this object runs, for checking the placement.
    if (url.pathname === '/relay-trace') {
      const trace = await fetch('https://www.cloudflare.com/cdn-cgi/trace');
      return new Response(await trace.text(), { headers: { 'content-type': 'text/plain' } });
    }

    const headers = new Headers();
    for (const name of FORWARDED_HEADERS) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
    const upstream = await fetch(UPSTREAM + url.pathname + url.search, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: 'manual',
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') || 'application/json',
        'x-relay-upstream-status': String(upstream.status),
      },
    });
  }
}

export default {
  async fetch(request, env) {
    const presented = request.headers.get('x-relay-secret') || '';
    if (!env.RELAY_SECRET || !sameSecret(presented, env.RELAY_SECRET)) {
      return new Response('Forbidden', { status: 403 });
    }

    const url = new URL(request.url);
    if (!url.pathname.startsWith('/v1/') && url.pathname !== '/relay-trace') {
      return new Response('Not found', { status: 404 });
    }

    const id = env.RELAY.idFromName(OBJECT_NAME);
    const stub = env.RELAY.get(id, { locationHint: 'afr' });
    return stub.fetch(request);
  },
};
