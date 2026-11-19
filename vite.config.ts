import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// base must match the repo name so GitHub Pages resolves assets
export default defineConfig({
  base: '/TeamTrashTalk/',
  plugins: [
    react(),
    tailwindcss(),
    // installable app (add to home screen). icons are the bin logo on deep pine, made from src/BinLogo.tsx
    VitePWA({
      registerType: 'autoUpdate', // a new deploy reaches installed apps on their next open
      includeAssets: ['trash-talk-icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'TrashTalk',
        short_name: 'TrashTalk',
        description: 'Smart Waste Bin Monitoring',
        theme_color: '#F4F1DE', // warm ivory, the app's page color
        background_color: '#0F2E23', // deep pine splash screen behind the logo
        display: 'standalone',
        start_url: '/TeamTrashTalk/',
        scope: '/TeamTrashTalk/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        // never answer server requests with the cached app page
        navigateFallbackDenylist: [/\/api\//],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // send /api requests to the java backend while running locally
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
})
