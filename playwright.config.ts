import { defineConfig } from '@playwright/test';

const machineURL = 'http://127.0.0.1:5174';
const researchURL = 'http://127.0.0.1:5175';
const researchSpecs = '**/senoo-*.spec.ts';
const fixture = 'tests/fixtures/research';
const fixtureDist = '../../../.local-preview/test-research';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    viewport: { width: 1440, height: 1000 },
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'machine', testIgnore: researchSpecs, use: { baseURL: machineURL } },
    { name: 'research-components', testMatch: researchSpecs, use: { baseURL: researchURL } },
  ],
  webServer: [
    {
      command: 'npm run build && npm run preview -- --port 5174 --strictPort',
      url: machineURL,
      timeout: 180_000,
      stdout: 'pipe',
    },
    {
      command: `vite build ${fixture} --config vite.config.ts --outDir ${fixtureDist} && vite preview ${fixture} --outDir ${fixtureDist} --host 127.0.0.1 --port 5175 --strictPort`,
      url: researchURL,
      timeout: 180_000,
      stdout: 'pipe',
    },
  ],
});
