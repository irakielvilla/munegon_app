// ══════════════════════════════════════════════════════════════
// MUÑEGON POS — Configuración de Astro
// Output: static (HTML puro que Tauri sirve directamente)
// ══════════════════════════════════════════════════════════════

import { defineConfig } from 'astro/config';

import preact from '@astrojs/preact';

export default defineConfig({
  output: 'static',
  outDir: 'dist',

  // Puerto del servidor de desarrollo — Tauri espera el frontend en :1420
  server: {
    port: 1420,
    host: true,
  },

  // Tauri espera los assets en la raíz de dist/
  build: {
    assets: '_assets',
  },

  vite: {
    // Integración con la config de Tauri dev server
    clearScreen: false,
    server: {
      port: 1420,
      strictPort: true,
    },
    envPrefix: ['VITE_', 'TAURI_', 'PUBLIC_'],
    // Excluir módulos Node.js del bundle del browser.
    // prisma.ts y sus deps (node:url, node:path) solo se usan
    // en scripts CLI (seed, migrate) — nunca en el frontend.
    optimizeDeps: {
      exclude: ['@prisma/client', '@prisma/adapter-libsql', '@libsql/client'],
    },
    build: {
      rollupOptions: {
        external: [
          '@prisma/client',
          '@prisma/adapter-libsql',
          '@libsql/client',
          'node:url',
          'node:path',
          'node:fs',
        ],
      },
    },
  },

  integrations: [preact()],
});