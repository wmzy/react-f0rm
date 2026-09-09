import { defineConfig } from 'vitest/config';

export default defineConfig({
  // src uses the __DEV__ flag rollup replaces at build time (see
  // rollup.config.js); tests run with it on so the DEV-only warnings are
  // exercised.
  define: {
    __DEV__: true
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // vmThreads keeps per-file jsdom isolation while reusing worker
    // threads instead of forking a process per file — cold start and
    // env teardown drop from ~16s (41 jsdom instances × fork) to a
    // fraction; measured 7.3s → ~3s on this machine.
    pool: 'vmThreads',
    // One exception: devtools' SSR guard test stubs the `document` global
    // undefined, and vmThreads' jsdom exposes it as a non-configurable
    // getter — stubGlobal throws there. Forks gives the test a stub-able
    // global again.
    poolMatchGlobs: [['test/devtools/**', 'forks']],
    include: ['test/**/*.test.{ts,tsx,js,jsx}', 'src/**/*.test.{ts,tsx,js,jsx}'],
    exclude: ['node_modules', 'dist'],
    passWithNoTests: true,
    // 冷缓存下默认 worker 数（=CPU 线程数）同时启动 forks + jsdom，
    // 会争用 CPU 导致超出 worker 启动超时（vitest 4 START_TIMEOUT=60s）。
    // 实测：16 workers 冷启动 70s 且间歇性失败，4 workers 仅 4.8s。
    maxWorkers: 4,
    // CI 门禁：`npm run coverage`（ci.yml test job）强制执行这些阈值。
    // 当前实测远高于此（97.77% statements / 98.71% lines / 94.61%
    // branches / 98.55% functions，2026-09），阈值只拦回归、不制造噪音。
    coverage: {
      thresholds: {
        statements: 95,
        branches: 90,
        functions: 95,
        lines: 95
      }
    }
  }
});
