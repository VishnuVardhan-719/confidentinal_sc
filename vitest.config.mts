import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    // jsdom component suites import the full UI kit; the first test in a file can exceed 5 s under load.
    testTimeout: 20_000,
    // next-intl's ESM imports "next/navigation" without an extension; inlining lets Vite resolve it
    // so components using the locale-aware <Link> can be rendered in jsdom tests.
    server: { deps: { inline: ["next-intl"] } },
  },
});
