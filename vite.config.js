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

// Same idea as devRecipeStepsApi, for the main /api/generate endpoint.
//
// This used to be a straight vite proxy to api.anthropic.com, which meant dev
// never exercised api/generate.js at all. That stopped being viable once the
// endpoint began owning the system prompts: the client now sends `task` and
// expects the server to resolve it, so proxying the body untouched to Anthropic
// would send an unknown `task` field and no system prompt. Mounting the real
// handler keeps dev and production on the same code path.
function devGenerateApi(env) {
  return {
    name: 'dev-generate-api',
    configureServer(server) {
      process.env.ANTHROPIC_API_KEY =
        process.env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY || env.VITE_ANTHROPIC_API_KEY || ''

      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/generate')) return next()
        // /api/generate-dish-photo has its own middleware below
        if (req.url.startsWith('/api/generate-dish-photo')) return next()
        if (req.method !== 'POST') return next()
        try {
          const { default: handler } = await import('./api/generate.js')
          req.body = await readJsonBody(req)
          res.status = (code) => { res.statusCode = code; return res }
          res.json = (obj) => {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(obj))
          }
          res.setHeader = res.setHeader.bind(res)
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

// Same idea as devRecipeStepsApi, for the expense tracker's invoice extraction
// (apps/expense-tracker, served at /admin/expenses in production). That app is
// its own Vite project with its own node_modules (no @upstash/redis etc.), so
// its dev server proxies /api to this one instead of importing the handler
// itself — see apps/expense-tracker/vite.config.ts.
function devExpenseExtractApi(env) {
  return {
    name: 'dev-expense-extract-api',
    configureServer(server) {
      process.env.ANTHROPIC_API_KEY =
        process.env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY || env.VITE_ANTHROPIC_API_KEY || ''
      if (!process.env.ADMIN_EXPENSES_TOKEN && env.ADMIN_EXPENSES_TOKEN) {
        process.env.ADMIN_EXPENSES_TOKEN = env.ADMIN_EXPENSES_TOKEN
      }

      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/expense-extract')) return next()
        if (req.method !== 'POST') return next()
        try {
          const { default: handler } = await import('./api/expense-extract.js')
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
    plugins: [
      react(),
      devGenerateApi(env),
      devRecipeStepsApi(env),
      devDishPhotoApi(env),
      devExpenseExtractApi(env),
    ],
    server: {
      port: 5175,
      // Falla en vez de saltar a otro puerto: así la URL local es siempre
      // http://localhost:5175 y coincide con la redirect URL de Supabase OAuth
      // (evita acabar rebotado al deploy de producción tras el login).
      strictPort: true,
      host: true,
    },
  }
})
