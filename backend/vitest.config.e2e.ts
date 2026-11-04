import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // TEST-ONLY webhook fixture key (not a credential). Must be present before
    // AppModule/ConfigModule load, hence config-level env injection. The
    // phase4 spec encrypts fixtures with this same value.
    env: {
      ROQQU_WEBHOOK_API_KEY: 'test-e2e-webhook-key-0123456789abcdef',
    },
    // E2E runs hit the live Neon database; allow headroom for network latency.
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
