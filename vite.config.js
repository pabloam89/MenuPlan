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

  // El commit del que sale este build, para sellar cada evento de analítica
  // (ver APP_VERSION en src/lib/analytics.js). Vercel expone
  // VERCEL_GIT_COMMIT_SHA en el entorno de build; en local no existe y queda
  // "dev", que es exactamente lo que se quiere — así los eventos de un `npm run
  // dev` no se mezclan con los de un deploy real.
  //
  // Sin esto, `import.meta.env.VITE_APP_VERSION` era siempre undefined y todos
  // los eventos del histórico quedaron sellados con la misma constante: no hay
  // forma de saber qué build produjo cuál, ni por tanto de medir si un cambio
  // de motor mejoró algo.
  const appVersion =
    (process.env.VERCEL_GIT_COMMIT_SHA || env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) ||
    env.VITE_APP_VERSION ||
    'dev'

  // Qué motor asigna los platos (ver solverActivo en src/lib/solver.js). En
  // los builds de la rama `staging` el solver va encendido por defecto; en
  // producción y en local sigue el modelo, salvo que VITE_MOTOR diga otra
  // cosa. Así staging prueba el solver con casas reales sin tocar prod, y un
  // navegador concreto puede volver al modelo con localStorage.mp_motor.
  const gitRef = process.env.VERCEL_GIT_COMMIT_REF || env.VERCEL_GIT_COMMIT_REF || ''
  const motor =
    process.env.VITE_MOTOR || env.VITE_MOTOR || (gitRef === 'staging' ? 'solver' : 'modelo')

  // La pizarra: empezar un menú vacío y rellenarlo a mano (ver pizarraActiva
  // en src/lib/pizarra.js). Mismo trato que el motor —encendida en `staging`,
  // apagada en producción y en local— porque es lo mismo: una puerta nueva en
  // Inicio que queremos probar con casas reales antes de abrírsela a todos.
  const pizarra =
    process.env.VITE_PIZARRA || env.VITE_PIZARRA || (gitRef === 'staging' ? 'on' : 'off')

  return {
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
      'import.meta.env.VITE_MOTOR': JSON.stringify(motor),
      'import.meta.env.VITE_PIZARRA': JSON.stringify(pizarra),
    },
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
          description: 'El menú familiar de la semana, resuelto.',
          theme_color: '#2d5a3d',
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
          // /r/<id> es la preview de un enlace a receta (api/share-recipe):
          // tiene que llegar al servidor, no al index.html cacheado.
          navigateFallbackDenylist: [/^\/api\//, /^\/r\//],
          cleanupOutdatedCaches: true,
          // El catálogo de recetas enriquecido (fixedDishes) supera el límite
          // por defecto de 2 MiB de workbox — sin esto, el build falla al
          // generar el service worker en vez de simplemente dejar ese chunk
          // fuera del precache.
          //
          // SEGUNDA SUBIDA, y conviene que la tercera no exista. Estaba en 6
          // MiB y el chunk llegó a 6,45 MB al completar `methods[]` en las 747
          // recetas estrella: el build dejó de pasar por 0,16 MB. Subirlo otra
          // vez es la tirita, no la cura — cada subida hace que la primera
          // visita descargue más.
          //
          // Lo que pesa, medido: el catálogo serializado son 4,18 MB, de los
          // que `methods[]` es 0,59 MB (14 %), y aparte va
          // `recipeStepsByAppliance.json`, que son 1,7 MB él solo. Ese último
          // es el candidato obvio a salir del precache: solo hace falta cuando
          // el usuario ELIGE un método, así que no tiene por qué viajar en la
          // primera carga ni ocupar cuota de caché de quien nunca lo abre.
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    test: {
      // Tope de workers, y no es una manía de rendimiento: sin él la suite
      // PIERDE TESTS. Medido el 21 sep 2026 en un portátil de 8 hilos, tres
      // ejecuciones seguidas de `vitest run`:
      //
      //   1742 tests ejecutados, 3 "fallos"
      //   1721 tests ejecutados, los mismos 3 "fallos"
      //   1751 tests ejecutados, 0 fallos   ← con --no-file-parallelism
      //
      // Que el TOTAL cambie entre ejecuciones es el síntoma: no son
      // aserciones fallando, son workers muriéndose y llevándose por delante
      // los ficheros que tenían asignados. Los tres que "fallaban" pasan
      // aislados, y eran distintos cada día según cómo repartiera vitest.
      //
      // La causa es memoria: cada worker carga el catálogo entero (recetas,
      // ingredientes, alimentos, las tablas derivadas), y esos ficheros han
      // crecido bastante al cerrar la nutrición. Con la mitad de workers cabe.
      //
      // Un porcentaje y no un número fijo para que una máquina de CI con más
      // núcleos siga aprovechándolos.
      maxWorkers: "50%",
    },
    server: {
      port: 5176,
      // Falla en vez de saltar a otro puerto: así la URL local es siempre
      // http://localhost:5176 y coincide con la redirect URL de Supabase OAuth
      // (evita acabar rebotado al deploy de producción tras el login).
      strictPort: true,
      host: true,
    },
  }
})
