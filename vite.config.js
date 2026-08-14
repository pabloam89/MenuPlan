import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function readJsonBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk) => { data += chunk })
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}) } catch { resolve({}) }
    })
  })
}

// Local dev only: `vite` no ejecuta las funciones de /api/, así que montamos
// el handler de /api/recipe-steps como middleware para poder probar los pasos
// por electrodoméstico con `npm run dev` (sin necesidad de `vercel dev`).
function devRecipeStepsApi(env) {
  return {
    name: 'dev-recipe-steps-api',
    configureServer(server) {
      process.env.ANTHROPIC_API_KEY =
        process.env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY || env.VITE_ANTHROPIC_API_KEY || ''
      for (const k of [
        'KV_REST_API_URL', 'KV_REST_API_TOKEN',
        'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN',
      ]) {
        if (!process.env[k] && env[k]) process.env[k] = env[k]
      }

      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/recipe-steps')) return next()
        if (req.method !== 'POST') return next()
        try {
          const { default: handler } = await import('./api/recipe-steps.js')
          req.body = await readJsonBody(req)
          res.status = (code) => { res.statusCode = code; return res }
          res.json = (obj) => {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(obj))
          }
          await handler(req, res)
        } catch (err) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err?.message || 'dev handler error' }))
        }
      })
    },
  }
}

// Same idea as devRecipeStepsApi, for the recipe-planner's AI dish photo
// generation (fixed catalog style formula + Gemini image model).
function devDishPhotoApi(env) {
  return {
    name: 'dev-dish-photo-api',
    configureServer(server) {
      process.env.GEMINI_AI_STUDIO_KEY =
        process.env.GEMINI_AI_STUDIO_KEY || env.GEMINI_AI_STUDIO_KEY || env.VITE_GEMINI_AI_STUDIO_KEY || ''

      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/generate-dish-photo')) return next()
        if (req.method !== 'POST') return next()
        try {
          const { default: handler } = await import('./api/generate-dish-photo.js')
          req.body = await readJsonBody(req)
          res.status = (code) => { res.statusCode = code; return res }
          res.json = (obj) => {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(obj))
          }
          await handler(req, res)
        } catch (err) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err?.message || 'dev handler error' }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), devRecipeStepsApi(env), devDishPhotoApi(env)],
    server: {
      port: 5175,
      // Falla en vez de saltar a otro puerto: así la URL local es siempre
      // http://localhost:5175 y coincide con la redirect URL de Supabase OAuth
      // (evita acabar rebotado al deploy de producción tras el login).
      strictPort: true,
      host: true,
      proxy: {
        '/api/generate': {
          target: 'https://api.anthropic.com',
          changeOrigin: true,
          secure: false,
          rewrite: () => '/v1/messages',
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('anthropic-dangerous-direct-browser-access', 'true');
              proxyReq.setHeader('anthropic-version', '2023-06-01');
              proxyReq.setHeader('anthropic-beta', 'pdfs-2024-09-25');
              const apiKey = env.VITE_ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY || '';
              if (apiKey) proxyReq.setHeader('x-api-key', apiKey);
            });
            proxy.on('error', (err) => console.error('Proxy error:', err.message));
          },
        },
      },
    },
  }
})
