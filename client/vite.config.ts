import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icons/*.png'],
      manifest: {
        name: 'PhotoTransfer',
        short_name: 'PhotoTransfer',
        description: 'Transfert photos haute qualité — zéro compression',
        theme_color: '#020617',
        background_color: '#020617',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // Precache all static assets
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          // API photos list — NetworkFirst: essaie le réseau, fallback sur le cache
          // Comme ça, les photos s'affichent même si le serveur est temporairement off
          {
            urlPattern: /\/api\/photos(\?.*)?$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-photos-cache',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 1 },
              cacheableResponse: { statuses: [200] },
            },
          },
          // Upload + delete — NetworkOnly: jamais cacher les mutations
          {
            urlPattern: /\/api\//,
            handler: 'NetworkOnly',
          },
          // Thumbnails Cloudinary — NetworkFirst avec cache longue durée
          {
            urlPattern: /^https:\/\/res\.cloudinary\.com\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'cloudinary-thumbnails',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
});
