import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    host: true,
    proxy: {
      '/census-geocoder': {
        target: 'https://geocoding.geo.census.gov',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/census-geocoder/, ''),
      },
      '/census-acs': {
        target: 'https://api.census.gov',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/census-acs/, ''),
      },
      '/ffiec-api': {
        target: 'https://ffiec.cfpb.gov',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/ffiec-api/, ''),
      },
      '/hud-api': {
        target: 'https://www.huduser.gov',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/hud-api/, ''),
      },
    },
  },
})
