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
  
VitePWA({
  registerType: 'autoUpdate',
  manifest: {
    name: 'TrashTalk',
    short_name: 'TrashTalk',
    description: 'Smart Waste Bin Monitoring',
    theme_color: '#24382B',
    background_color: '#24382B',
    display: 'standalone',
    start_url: '/TeamTrashTalk/',
    scope: '/TeamTrashTalk/',
    icons: [
      {
        src: 'icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: 'icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: 'icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
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
