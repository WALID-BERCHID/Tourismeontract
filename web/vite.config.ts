import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [react(), nodePolyfills({ include: ["buffer", "process", "crypto", "stream", "util"], globals: { Buffer: true, process: true } })],
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": "http://localhost:4000",
      "/uploads": "http://localhost:4000",
    },
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom", "@tanstack/react-query"],
          ethers: ["ethers"],
          map: ["leaflet", "react-leaflet"],
        },
      },
    },
  },
});
