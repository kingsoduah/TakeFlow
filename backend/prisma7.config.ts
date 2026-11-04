import { config as loadEnv } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// Load backend/.env first (local overrides), then the repo-root .env.local
// managed by `neon env pull`. dotenv never overrides real environment vars.
loadEnv();
loadEnv({ path: '../.env.local' });

// Prisma 7.10+ CLI configuration (this file takes precedence; keep only one
// Prisma config file). CLI commands (migrate, db push/pull, db execute) use
// the DIRECT (unpooled) Neon connection. Runtime application queries use the
// pooled DATABASE_URL via @prisma/adapter-neon (wired in Phase 2/3).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL_UNPOOLED'),
  },
});
