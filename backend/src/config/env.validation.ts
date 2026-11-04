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
  };
}
