// vite.config.js
import { defineConfig } from "file:///sessions/brave-epic-gates/mnt/bazaarinfrastructure/bazaar-frontend/node_modules/vite/dist/node/index.js";
import react from "file:///sessions/brave-epic-gates/mnt/bazaarinfrastructure/bazaar-frontend/node_modules/@vitejs/plugin-react/dist/index.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
var __vite_injected_original_import_meta_url = "file:///sessions/brave-epic-gates/mnt/bazaarinfrastructure/bazaar-frontend/apps/dapphub/vite.config.js";
var vite_config_default = defineConfig({
  plugins: [react()],
  base: "/dapphub/",
  resolve: {
    alias: {
      "@bazaar/shared/css": resolve(dirname(fileURLToPath(__vite_injected_original_import_meta_url)), "../../packages/shared/css")
    }
  },
  define: {
    // Required for @mysten/sui in browser environments
    "process.env": {}
  },
  server: {
    // Disable Vite's error overlay — it uses Shadow DOM which can render
    // as a black screen in the Frontier game client's embedded browser.
    hmr: { overlay: false },
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin"
    }
  },
  preview: {
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin"
    }
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
          "vendor-rq": ["@tanstack/react-query"]
        }
      }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvc2Vzc2lvbnMvYnJhdmUtZXBpYy1nYXRlcy9tbnQvYmF6YWFyaW5mcmFzdHJ1Y3R1cmUvYmF6YWFyLWZyb250ZW5kL2FwcHMvZGFwcGh1YlwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL3Nlc3Npb25zL2JyYXZlLWVwaWMtZ2F0ZXMvbW50L2JhemFhcmluZnJhc3RydWN0dXJlL2JhemFhci1mcm9udGVuZC9hcHBzL2RhcHBodWIvdml0ZS5jb25maWcuanNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL3Nlc3Npb25zL2JyYXZlLWVwaWMtZ2F0ZXMvbW50L2JhemFhcmluZnJhc3RydWN0dXJlL2JhemFhci1mcm9udGVuZC9hcHBzL2RhcHBodWIvdml0ZS5jb25maWcuanNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tIFwidml0ZVwiO1xuaW1wb3J0IHJlYWN0IGZyb20gXCJAdml0ZWpzL3BsdWdpbi1yZWFjdFwiO1xuaW1wb3J0IHsgZmlsZVVSTFRvUGF0aCB9IGZyb20gXCJub2RlOnVybFwiO1xuaW1wb3J0IHsgZGlybmFtZSwgcmVzb2x2ZSB9IGZyb20gXCJub2RlOnBhdGhcIjtcbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gICAgcGx1Z2luczogW3JlYWN0KCldLFxuICAgIGJhc2U6IFwiL2RhcHBodWIvXCIsXG4gICAgcmVzb2x2ZToge1xuICAgICAgICBhbGlhczoge1xuICAgICAgICAgICAgXCJAYmF6YWFyL3NoYXJlZC9jc3NcIjogcmVzb2x2ZShkaXJuYW1lKGZpbGVVUkxUb1BhdGgoaW1wb3J0Lm1ldGEudXJsKSksIFwiLi4vLi4vcGFja2FnZXMvc2hhcmVkL2Nzc1wiKSxcbiAgICAgICAgfSxcbiAgICB9LFxuICAgIGRlZmluZToge1xuICAgICAgICAvLyBSZXF1aXJlZCBmb3IgQG15c3Rlbi9zdWkgaW4gYnJvd3NlciBlbnZpcm9ubWVudHNcbiAgICAgICAgXCJwcm9jZXNzLmVudlwiOiB7fSxcbiAgICB9LFxuICAgIHNlcnZlcjoge1xuICAgICAgICAvLyBEaXNhYmxlIFZpdGUncyBlcnJvciBvdmVybGF5IFx1MjAxNCBpdCB1c2VzIFNoYWRvdyBET00gd2hpY2ggY2FuIHJlbmRlclxuICAgICAgICAvLyBhcyBhIGJsYWNrIHNjcmVlbiBpbiB0aGUgRnJvbnRpZXIgZ2FtZSBjbGllbnQncyBlbWJlZGRlZCBicm93c2VyLlxuICAgICAgICBobXI6IHsgb3ZlcmxheTogZmFsc2UgfSxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICAgXCJDcm9zcy1PcmlnaW4tRW1iZWRkZXItUG9saWN5XCI6IFwicmVxdWlyZS1jb3JwXCIsXG4gICAgICAgICAgICBcIkNyb3NzLU9yaWdpbi1PcGVuZXItUG9saWN5XCI6IFwic2FtZS1vcmlnaW5cIixcbiAgICAgICAgfSxcbiAgICB9LFxuICAgIHByZXZpZXc6IHtcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICAgXCJDcm9zcy1PcmlnaW4tRW1iZWRkZXItUG9saWN5XCI6IFwicmVxdWlyZS1jb3JwXCIsXG4gICAgICAgICAgICBcIkNyb3NzLU9yaWdpbi1PcGVuZXItUG9saWN5XCI6IFwic2FtZS1vcmlnaW5cIixcbiAgICAgICAgfSxcbiAgICB9LFxuICAgIGJ1aWxkOiB7XG4gICAgICAgIHRhcmdldDogXCJlczIwMjJcIixcbiAgICAgICAgY3NzQ29kZVNwbGl0OiB0cnVlLFxuICAgICAgICBjaHVua1NpemVXYXJuaW5nTGltaXQ6IDMwMCxcbiAgICAgICAgcm9sbHVwT3B0aW9uczoge1xuICAgICAgICAgICAgb3V0cHV0OiB7XG4gICAgICAgICAgICAgICAgbWFudWFsQ2h1bmtzOiB7XG4gICAgICAgICAgICAgICAgICAgIFwidmVuZG9yLXJlYWN0XCI6IFtcInJlYWN0XCIsIFwicmVhY3QtZG9tXCJdLFxuICAgICAgICAgICAgICAgICAgICBcInZlbmRvci1zdWktdHhcIjogW1wiQG15c3Rlbi9zdWkvdHJhbnNhY3Rpb25zXCJdLFxuICAgICAgICAgICAgICAgICAgICBcInZlbmRvci1ycVwiOiBbXCJAdGFuc3RhY2svcmVhY3QtcXVlcnlcIl0sXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgfSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFrYSxTQUFTLG9CQUFvQjtBQUMvYixPQUFPLFdBQVc7QUFDbEIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxTQUFTLGVBQWU7QUFIdU8sSUFBTSwyQ0FBMkM7QUFJelQsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDeEIsU0FBUyxDQUFDLE1BQU0sQ0FBQztBQUFBLEVBQ2pCLE1BQU07QUFBQSxFQUNOLFNBQVM7QUFBQSxJQUNMLE9BQU87QUFBQSxNQUNILHNCQUFzQixRQUFRLFFBQVEsY0FBYyx3Q0FBZSxDQUFDLEdBQUcsMkJBQTJCO0FBQUEsSUFDdEc7QUFBQSxFQUNKO0FBQUEsRUFDQSxRQUFRO0FBQUE7QUFBQSxJQUVKLGVBQWUsQ0FBQztBQUFBLEVBQ3BCO0FBQUEsRUFDQSxRQUFRO0FBQUE7QUFBQTtBQUFBLElBR0osS0FBSyxFQUFFLFNBQVMsTUFBTTtBQUFBLElBQ3RCLFNBQVM7QUFBQSxNQUNMLGdDQUFnQztBQUFBLE1BQ2hDLDhCQUE4QjtBQUFBLElBQ2xDO0FBQUEsRUFDSjtBQUFBLEVBQ0EsU0FBUztBQUFBLElBQ0wsU0FBUztBQUFBLE1BQ0wsZ0NBQWdDO0FBQUEsTUFDaEMsOEJBQThCO0FBQUEsSUFDbEM7QUFBQSxFQUNKO0FBQUEsRUFDQSxPQUFPO0FBQUEsSUFDSCxRQUFRO0FBQUEsSUFDUixjQUFjO0FBQUEsSUFDZCx1QkFBdUI7QUFBQSxJQUN2QixlQUFlO0FBQUEsTUFDWCxRQUFRO0FBQUEsUUFDSixjQUFjO0FBQUEsVUFDVixnQkFBZ0IsQ0FBQyxTQUFTLFdBQVc7QUFBQSxVQUNyQyxpQkFBaUIsQ0FBQywwQkFBMEI7QUFBQSxVQUM1QyxhQUFhLENBQUMsdUJBQXVCO0FBQUEsUUFDekM7QUFBQSxNQUNKO0FBQUEsSUFDSjtBQUFBLEVBQ0o7QUFDSixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
