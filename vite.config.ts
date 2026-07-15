/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Subster is served as static files; base '' keeps asset URLs relative so it
// can be hosted at any path (e.g. behind the same reverse proxy as Subsonic).
export default defineConfig({
  base: '',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // App shell only — audio streaming and API calls always need the network.
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'] },
      manifest: {
        name: 'Subster',
        short_name: 'Subster',
        description: 'A backend-free Hitster clone for your Subsonic library.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
  },
})
