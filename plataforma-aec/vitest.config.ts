import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], exclude: ['tests/rules/**', 'node_modules/**'] },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
});
