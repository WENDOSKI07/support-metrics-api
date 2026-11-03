import { readFileSync } from 'node:fs';
import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';

const runtime = JSON.parse(readFileSync(new URL('./.e2e/runtime.json', import.meta.url), 'utf8'));

export default {
  tests: 'e2e/**/*.e2e.ts',
  targets: [{
    name: 'chromium-local',
    engine: web({ connect: { cdpEndpoint: () => runtime.browserEndpoint } }),
    app: { url: 'http://127.0.0.1:3000', environment: 'test' },
  }],
  credentials: {
    requester: { username: 'e2e-requester', password: runtime.password },
    support: { username: 'e2e-support', password: runtime.password },
  },
  workers: 1,
  retries: 0,
  timeout: 90_000,
  trace: 'retain-on-failure',
  video: 'off',
} satisfies E2EConfig;
