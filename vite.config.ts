import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { version } from './package.json';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'application-version',
      transformIndexHtml: () => [{ tag: 'meta', attrs: { name: 'application-version', content: version } }],
    },
  ],
  base: './',
  test: { include: ['tests/**/*.test.ts'] },
});
