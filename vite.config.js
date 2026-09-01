import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

function readJsonBody(req) {
  return new Promise((resolve) => {
    // Junta los Buffers crudos y decodifica UNA sola vez al final. Decodificar
    // cada chunk por separado (el `data += chunk` de antes, que llama a
    // toString() en cada trozo) corrompe cualquier tilde/ñ que caiga justo en
    // el borde entre dos chunks — algo raro por loopback (llega todo junto)
    // pero real por WiFi real, donde el body sí puede venir partido.
    const chunks = []
    req.on('data', (chunk) => { chunks.push(chunk) })
    req.on('end', () => {
      const data = Buffer.concat(chunks).toString('utf8')
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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      devGenerateApi(env),
      devRecipeStepsApi(env),
      devDishPhotoApi(env),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'pwa-icons/apple-touch-icon.png'],
        manifest: {
          id: '/',
          name: 'HoMenu',
          short_name: 'HoMenu',
          description: 'El menú familiar de la semana, resuelto con IA.',
          theme_color: '#7e14ff',
          background_color: '#ffffff',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          scope: '/',
          lang: 'es',
          categories: ['food', 'lifestyle', 'productivity'],
          icons: [
            { src: '/pwa-icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/pwa-icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/pwa-icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // Solo precachea el app shell (JS/CSS/imágenes estáticas). Las
          // llamadas a /api/* (IA, listas, etc.) y a Supabase nunca pasan
          // por el service worker: sin runtimeCaching para ellas, van
          // siempre directas a red, así nunca se sirve un menú o una
          // respuesta de IA cacheada y obsoleta.
          navigateFallbackDenylist: [/^\/api\//],
          cleanupOutdatedCaches: true,
          // El catálogo de recetas enriquecido (fixedDishes) supera el límite
          // por defecto de 2 MiB de workbox — sin esto, el build falla al
          // generar el service worker en vez de simplemente dejar ese chunk
          // fuera del precache.
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        },
        devOptions: {
          enabled: false,
        },
      }),
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
