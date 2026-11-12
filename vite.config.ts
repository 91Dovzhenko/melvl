import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

// Адрес на GitHub Pages: https://91dovzhenko.github.io/melvl/
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  base: '/melvl/',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { port: 5173, strictPort: true },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'ME:LVL',
        short_name: 'ME:LVL',
        description: 'Задачи на день и рост навыков',
        lang: 'ru',
        start_url: '/melvl/',
        scope: '/melvl/',
        display: 'standalone',
        background_color: '#EEF0EB',
        theme_color: '#EEF0EB',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // Этап 0: кэшируем только оболочку. Данные Supabase не кэшируются (офлайн — этап 3).
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/melvl/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
