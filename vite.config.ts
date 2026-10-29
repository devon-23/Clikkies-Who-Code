import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';

// `vite` runs the React app and the Worker together in Cloudflare's local
// runtime, so /api/* behaves the same as it will when deployed.
export default defineConfig({
  plugins: [react(), cloudflare()],
});
