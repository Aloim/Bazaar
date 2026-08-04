import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  base: "/dapphub/",
  resolve: {
    alias: {
      "@bazaar/shared/css": resolve(
        dirname(fileURLToPath(import.meta.url)),
        "../../packages/shared/css"
      ),
    },
  },
  define: {
    // Required for @mysten/sui in browser environments
    "process.env": {},
  },
  server: {
    // Disable Vite's error overlay — it uses Shadow DOM which can render
    // as a black screen in the Frontier game client's embedded browser.
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
    cssCodeSplit: true,
    chunkSizeWarningLimit: 300,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom"],
          "vendor-sui-tx": ["@mysten/sui/transactions"],
          "vendor-rq": ["@tanstack/react-query"],
        },
      },
    },
  },
});
