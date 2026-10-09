import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
import { noTdzInBody } from './eslint-rules/no-tdz-in-body.js'
import { noValorSuelto } from './eslint-rules/no-valor-suelto.js'

// Los .js de `src` con colores escritos a mano (medido el 9 oct 2026, sin
// `src/data/` ni los tests). Un .js nuevo con hex no entra solo: se añade aquí.
// `src/lib/menuExport.js` queda fuera POR ESCRITO: genera HTML exportado sin el
// CSS de la app y, al migrar, importará los ROLES (`color`) de `src/design/tokens.js`
// en lugar de `var(--…)`; los primitivos no se importan fuera de tokens.js
// (ESTADO.md, «Cumplimiento»).
const JS_CON_COLORES = [
  'src/assets/dishes/dishVisuals.js',
  'src/components/wizard/pistaMotion.js',
  'src/lib/alergias.js',
  'src/lib/alergiasBase.js',
  'src/lib/allergensCore.js',
  'src/lib/applianceMethods.js',
  'src/lib/consumptionInsights.js',
  'src/lib/cookings.js',
  'src/lib/groups.js',
  'src/lib/healthProfileMatch.js',
  'src/lib/mealTimes.js',
  'src/lib/panelSuggestions.js',
  'src/lib/recipeSteps.js',
  'src/lib/stages.js',
  'src/lib/vigia.js',
  'src/lib/vocabularios.js',
  'src/lib/wizardRegistry.js',
]

export default defineConfig([
  globalIgnores(['**/dist/**', '**/dist', 'api/_bot/core.mjs']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    // Regla local: ver eslint-rules/no-tdz-in-body.js. Caza el fallo que en
    // un solo dia llego cuatro veces a produccion — usar una variable antes
    // de declararla, que el build no puede detectar porque es sintacticamente
    // correcto y solo revienta al ejecutar.
    plugins: { local: { rules: { 'no-tdz-in-body': noTdzInBody, 'no-valor-suelto': noValorSuelto } } },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'local/no-tdz-in-body': 'error',
      'no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^[A-Z_]',
          argsIgnorePattern: '^[A-Z_]|^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  // Valores visuales fuera de los tokens: en AVISO. `scripts/lint-base.mjs` los
  // compara con `lint-tokens-base.json` (por lista, solo puede bajar).
  {
    files: ['src/**/*.jsx', ...JS_CON_COLORES],
    ignores: ['src/design/**', 'src/data/**', '**/*.test.{js,jsx}', 'src/lib/menuExport.js'],
    rules: { 'local/no-valor-suelto': 'warn' },
  },
  // Node context: build config + serverless API handlers
  {
    files: ['vite.config.js', '*.config.js', 'api/**/*.js', 'scripts/**/*.{js,mjs}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  // Test files run under Node/Vitest
  {
    files: ['**/*.test.{js,jsx}', '**/*.spec.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
])
