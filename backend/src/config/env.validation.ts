// Validates process.env at bootstrap. DATABASE_URL is required at runtime
// (PrismaService connects on module init); DATABASE_URL_UNPOOLED is used by
// the Prisma CLI via prisma7.config.ts.
export function validateEnv(config: Record<string, unknown>) {
  const rawPort = config.PORT ?? 3000;
  const port = typeof rawPort === 'number' ? rawPort : Number(rawPort);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('PORT must be a positive integer port number');
  }

  const databaseUrl = config.DATABASE_URL as string | undefined;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required (pooled Neon connection)');
  }

  const jwtSecret = config.JWT_SECRET as string | undefined;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is required');
  }

  const expiresIn = (config.JWT_EXPIRES_IN as string | undefined) ?? '7d';
  if (!/^\d+[smhdw]$/.test(expiresIn)) {
    throw new Error("JWT_EXPIRES_IN must be a duration like '3600s', '60m', '24h' or '7d'");
  }

  const roqquEnv = (config.ROQQU_ENV as string | undefined) ?? 'staging';
  if (roqquEnv !== 'staging' && roqquEnv !== 'live') {
    throw new Error("ROQQU_ENV must be 'staging' or 'live'");
  }

  const frontendOrigins = parseOrigins(config.FRONTEND_ORIGINS);

  const rawHops = config.TRUST_PROXY_HOPS ?? 0;
  const trustProxyHops = typeof rawHops === 'number' ? rawHops : Number(rawHops);
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 10) {
    throw new Error('TRUST_PROXY_HOPS must be a whole number from 0 to 10');
  }

  return {
    PORT: port,
    // Canonical Neon names: pooled runtime URL + direct CLI/migration URL.
    DATABASE_URL: databaseUrl,
    DATABASE_URL_UNPOOLED:
      (config.DATABASE_URL_UNPOOLED as string | undefined) || undefined,
    JWT_SECRET: jwtSecret,
    JWT_EXPIRES_IN: (config.JWT_EXPIRES_IN as string | undefined) ?? '7d',
    ROQQU_BASE_URL:
      (config.ROQQU_BASE_URL as string | undefined) ?? 'https://service.roqqu.com/v1',
    // Header/key selection follows the supplied Roqqu docs: documented live
    // calls use x-api-key; staging calls use x-staging-api-key. ROQQU_ENV
    // picks which pair is active — never mixes them.
    ROQQU_ENV: (config.ROQQU_ENV as string | undefined) ?? 'staging',
    ROQQU_STAGING_API_KEY:
      (config.ROQQU_STAGING_API_KEY as string | undefined) || undefined,
    ROQQU_API_KEY: (config.ROQQU_API_KEY as string | undefined) || undefined,
    // Key used ONLY to decrypt incoming webhook bodies (first 32 chars).
    // Set to the staging key to process staging events, live key for
    // production. Never the same concern as request authentication.
    ROQQU_WEBHOOK_API_KEY:
      (config.ROQQU_WEBHOOK_API_KEY as string | undefined) || undefined,
    // Shared secret for the roqqu-relay Worker. When ROQQU_BASE_URL points at
    // the relay, every Roqqu call carries it in the x-relay-secret header.
    ROQQU_RELAY_SECRET:
      (config.ROQQU_RELAY_SECRET as string | undefined) || undefined,
    // Demo mode for when no working Roqqu key is available: receiving
    // addresses are simulated and the payment page can send simulated
    // deposits through the real matching code. Off unless set to true.
    DEMO_PAYMENTS: ['true', '1', 'yes'].includes(
      String(config.DEMO_PAYMENTS ?? '').trim().toLowerCase(),
    ),
    // Browser origins allowed by CORS, e.g. the frontend's URL. Empty means
    // CORS stays off and only same-origin browser calls work.
    FRONTEND_ORIGINS: frontendOrigins,
    // Number of reverse proxies in front of the app (1 on Render). Lets the
    // public rate limiter see the real client address. Keep 0 when the app
    // is reached directly, or clients could fake their address.
    TRUST_PROXY_HOPS: trustProxyHops,
  };
}

// Comma separated list of origins such as
// "https://takeflow.app,http://localhost:3001". Each entry must be a bare
// origin: scheme, host and optional port, no path.
function parseOrigins(raw: unknown): string[] {
  if (raw === undefined || raw === null || raw === '') return [];
  if (typeof raw !== 'string') {
    throw new Error('FRONTEND_ORIGINS must be a comma separated list of origins');
  }
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      let url: URL;
      try {
        url = new URL(entry);
      } catch {
        throw new Error(`FRONTEND_ORIGINS entry "${entry}" is not a valid origin`);
      }
      const bare = entry.replace(/\/+$/, '');
      if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.origin !== bare) {
        throw new Error(
          `FRONTEND_ORIGINS entry "${entry}" must look like https://example.com with no path`,
        );
      }
      return url.origin;
    });
}
