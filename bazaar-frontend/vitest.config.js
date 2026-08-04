// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================
/**
 * Vitest configuration — bazaar-frontend workspace root.
 *
 * Single-project config covering packages/shared tests.
 * Per-app test suites may graduate to vitest.workspace.ts later.
 *
 * Environment: jsdom (DOM APIs required for React hooks + components).
 * Coverage: V8 provider (native ESM, no Babel transforms).
 *
 * Alias: @bazaar/shared → ./packages/shared/index.ts
 *   Needed because the package uses TypeScript source (not built dist)
 *   and hooks import @bazaar/shared/hooks, @bazaar/shared/constants, etc.
 *
 * File limit: 500 lines | Constitution Article XIV.4
 */
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
export default defineConfig({
    plugins: [
        // react() plugin handles JSX/TSX transformation via @vitejs/plugin-react
        react(),
    ],
    test: {
        environment: "jsdom",
        globals: true,
        setupFiles: ["./test-setup.ts"],
        // Phase 8 A5: test-mode env vars (world package id etc.) live in .env.test —
        // import.meta.env.VITE_* is statically replaced at transform time, so the
        // file-based mode env is the reliable injection point.
        typecheck: {
            tsconfig: "./tsconfig.test.json",
        },
        include: [
            "packages/**/*.test.{ts,tsx}",
        ],
        exclude: [
            "**/node_modules/**",
            "**/dist/**",
        ],
        coverage: {
            provider: "v8",
            include: [
                "packages/shared/hooks/bazaarcore/governance-resolution-hooks.ts",
            ],
            reporter: ["text", "lcov"],
            thresholds: {
                lines: 70,
                functions: 80,
            },
        },
    },
    resolve: {
        alias: [
            // Order matters: deeper paths first so prefix match doesn't shadow
            { find: /^@bazaar\/shared\/hooks\/(.*)$/, replacement: resolve(__dirname, "packages/shared/hooks/$1") },
            { find: "@bazaar/shared/hooks", replacement: resolve(__dirname, "packages/shared/hooks/index.ts") },
            { find: "@bazaar/shared/constants", replacement: resolve(__dirname, "packages/shared/constants/index.ts") },
            { find: /^@bazaar\/shared\/tx\/(.*)$/, replacement: resolve(__dirname, "packages/shared/tx/$1") },
            { find: /^@bazaar\/shared\/utils\/(.*)$/, replacement: resolve(__dirname, "packages/shared/utils/$1") },
            { find: /^@bazaar\/shared\/components\/(.*)$/, replacement: resolve(__dirname, "packages/shared/components/$1") },
            { find: "@bazaar/shared", replacement: resolve(__dirname, "packages/shared/index.ts") },
        ],
    },
});
// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
