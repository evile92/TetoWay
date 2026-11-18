import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        id: '/',
        name: 'TetoWay - Tetouan Public Transit',
        short_name: 'TetoWay',
        description:
          'Interactive public transit map & trip planner for Tetouan, Martil, Mdiq, Fnideq, Oued Laou and surrounding towns.',
        theme_color: '#081828',
        background_color: '#05101C',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        lang: 'en',
        categories: ['navigation', 'travel', 'utilities'],
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,png,svg,json,webmanifest}'],
        globIgnores: ['tiles/**', 'fonts/**', 'og-preview.png', 'google*.html'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [
          /^\/robots\.txt$/,
          /^\/sitemap\.xml$/,
          /^\/google[a-z0-9]+\.html$/i,
        ],
        runtimeCaching: [
          {
            urlPattern: /\/tiles\/.*\.pmtiles$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tetoway-offline-map-v1',
              rangeRequests: true,
              cacheableResponse: {
                statuses: [200],
              },
            },
          },
          {
            urlPattern: /\/(?:fonts|sprites)\/.*\.(?:pbf|json|png)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tetoway-offline-map-v1',
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/router\.project-osrm\.org\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
