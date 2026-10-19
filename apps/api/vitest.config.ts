import { resolve } from "node:path";
import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

const pkg = (name: string) => resolve(__dirname, `../../packages/${name}/src/index.ts`);

// SWC emits decorator metadata, which Nest's DI needs (esbuild does not).
// Workspace packages resolve to source so tests never run against stale builds.
export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  resolve: {
    alias: {
      "@tashkeel/contracts": pkg("contracts"),
      "@tashkeel/core": pkg("core"),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
