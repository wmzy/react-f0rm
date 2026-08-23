import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['test/**/*.test.{ts,tsx,js,jsx}', 'src/**/*.test.{ts,tsx,js,jsx}'],
    exclude: ['node_modules', 'dist'],
    passWithNoTests: true,
    // 冷缓存下默认 worker 数（=CPU 线程数）同时启动 forks + jsdom，
    // 会争用 CPU 导致超出 worker 启动超时（vitest 4 START_TIMEOUT=60s）。
    // 实测：16 workers 冷启动 70s 且间歇性失败，4 workers 仅 4.8s。
    maxWorkers: 4
  }
});
