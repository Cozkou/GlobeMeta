import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

const API_PROXY_TARGET = process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:4000";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      "/api": { target: API_PROXY_TARGET, changeOrigin: true },
      "/webhook": { target: API_PROXY_TARGET, changeOrigin: true },
    },
  },
  // `vite preview` does not inherit `server.proxy` — without this, POST /api/* hits the preview app and Express returns "Cannot POST /api/..."
  preview: {
    host: "::",
    port: 4173,
    proxy: {
      "/api": { target: API_PROXY_TARGET, changeOrigin: true },
      "/webhook": { target: API_PROXY_TARGET, changeOrigin: true },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
