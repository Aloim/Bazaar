// ============================================================
// If this file reaches more than 500 lines, split it into
// 2 or more files to prevent bloating. Code belongs BELOW.
// ============================================================

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  base: "/notribe/",
  resolve: {
    alias: {
      // Phase 6a fix: Vite cannot resolve CSS files through the package.json
      // "exports" map for @bazaar/shared — alias bypasses that limitation.
      "@bazaar/shared/css": resolve(
        dirname(fileURLToPath(import.meta.url)),
        "../../packages/shared/css"
      ),
    },
  },
  define: {
    // Required for @mysten/sui in browser environments (process.env polyfill).
    "process.env": {},
  },
  server: {
    // Disable Vite's error overlay — it uses Shadow DOM which renders as a black
    // screen in the Frontier game client's embedded CEF browser.
    hmr: { overlay: false },
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
  build: {
    target: "es2022",
    outDir: "dist",
    cssCodeSplit: true,
    chunkSizeWarningLimit: 300,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react":  ["react", "react-dom"],
          "vendor-sui-tx": ["@mysten/sui/transactions"],
          "vendor-rq":     ["@tanstack/react-query"],
        },
      },
    },
  },
});

// ============================================================
// Code belongs ABOVE this comment. If this file reaches more
// than 500 lines, split it into 2 or more files.
// ============================================================
