import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Deployed as a static subroute of the main MenuPlan Vercel project
// (menuplan.vercel.app/admin/expenses), not as its own Vercel project — see
// ../../vercel.json for the rewrites and the root package.json "build:expenses"
// script that builds this app straight into dist/admin/expenses.
export default defineConfig({
  base: '/admin/expenses/',
  plugins: [react()],
  server: {
    port: 5176,
    strictPort: true,
    host: true,
    // /api/expense-extract.js is served by the root Vite dev server (see the
    // devExpenseExtractApi middleware in ../../vite.config.js) — this app's own
    // node_modules deliberately doesn't carry @upstash/redis etc., so it can't
    // host the handler itself. Run `npm run dev` at the repo root alongside
    // `npm run dev:expenses` for extraction to work locally.
    proxy: {
      '/api': 'http://localhost:5175',
    },
  },
  build: {
    outDir: '../../dist/admin/expenses',
    emptyOutDir: true,
  },
})
