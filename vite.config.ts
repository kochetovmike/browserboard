import preact from '@preact/preset-vite';
import { defineConfig } from 'vitest/config';

// base './' keeps asset URLs relative, so the same build works under
// https://<user>.github.io/browserboard/ and on a custom domain root.
export default defineConfig({
  base: './',
  plugins: [preact()],
  worker: { format: 'es' },
  build: { target: 'es2022' },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
