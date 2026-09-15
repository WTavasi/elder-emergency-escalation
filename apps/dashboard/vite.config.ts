/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The API is proxied rather than called cross-origin, so the browser sends the
    // same-origin requests the production deployment will send and a CORS
    // misconfiguration cannot hide behind a permissive development setting.
    proxy: {
      // No path rewriting: the API mounts everything under api/v1 already, so the
      // dashboard asks for exactly the path the deployed build will ask for and a
      // versioned route cannot work here while failing in production.
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      // Socket.IO negotiates on /socket.io and names the /realtime namespace inside
      // the handshake, so it is this path that has to be proxied, not the namespace.
      '/socket.io': { target: 'http://localhost:3000', ws: true },
      // Health is deliberately outside the version prefix, so it is proxied by name.
      '/health': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
    css: false,
  },
});
