import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import { noTdzInBody } from './eslint-rules/no-tdz-in-body.js'

/**
 * Config mínima con las reglas que TUMBAN UNA PANTALLA, para poder ejecutarla
 * en `prebuild`.
 *
 * `npm run lint` arrastra 158 problemas previos, así que una regla nueva ahí
 * dentro queda enterrada y nadie la ve. Esta pasa limpia hoy, así que puede
 * bloquear el build: si algún día falla, es que hay un fallo de verdad — de
 * los que tumban una pantalla entera en producción.
 */
export default defineConfig([
  globalIgnores(['**/dist/**', '**/node_modules/**']),
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      // no-undef necesita saber qué existe de serie; sin esto marcaría
      // `window`, `console` o `setTimeout` como si fueran errores.
      globals: { ...globals.browser, ...globals.node },
    },
    // react-hooks se registra pero sin activar ninguna de sus reglas: el
    // codigo tiene comentarios eslint-disable que la nombran, y sin el plugin
    // cargado ESLint falla con "Definition for rule not found".
    plugins: {
      'react-hooks': reactHooks,
      local: { rules: { 'no-tdz-in-body': noTdzInBody } },
    },
    rules: {
      'local/no-tdz-in-body': 'error',
      // Usar algo que no está importado. El build NO lo ve -es JavaScript
      // válido- y revienta en cuanto se ejecuta esa línea, con la pantalla ya
      // pintada. Van tres veces que llega así a producción: `FeedScreen`,
      // `loadPublicRecipe` y `ensureSocialProfile`, las tres por un import que
      // se quedó fuera al mover código de sitio.
      'no-undef': 'error',
    },
  },
])
