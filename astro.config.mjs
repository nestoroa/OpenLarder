import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** Astro integration: generate sw.js after client bundle is written */
function workboxSWIntegration() {
  return {
    name: 'workbox-sw-generator',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        // In Astro SSR, dir points to the client output directory (dist/client/)
        const clientDir = fileURLToPath(dir);
        const swDest = path.join(clientDir, 'sw.js');

        const { generateSW } = await import('workbox-build');
        const result = await generateSW({
          swDest,
          globDirectory: clientDir,
          globIgnores: ['sw.js', 'sw.js.map', 'workbox-*.js', 'workbox-*.js.map'],
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^\/api\//,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-cache',
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 100, maxAgeSeconds: 86400 },
              },
            },
          ],
          navigateFallback: null,
          cleanupOutdatedCaches: true,
          offlineGoogleAnalytics: false,
          mode: 'production',
        });
        console.log(`[pwa] Generated sw.js — ${result.count} files precached (${Math.round(result.size / 1024)} KB)`);
      },
    },
  };
}

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'middleware' }),
  integrations: [react(), workboxSWIntegration()],
  vite: {
    plugins: [
      tailwindcss(),
      VitePWA({
        strategies: 'generateSW',
        registerType: 'autoUpdate',
        manifest: false,
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-cache',
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 100, maxAgeSeconds: 24 * 60 * 60 },
              },
            },
          ],
          navigateFallback: null,
        },
        devOptions: { enabled: false },
      }),
    ],
  },
});
