import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
import { noTdzInBody } from './eslint-rules/no-tdz-in-body.js'

export default defineConfig([
  globalIgnores(['**/dist/**', '**/dist']),
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
    plugins: { local: { rules: { 'no-tdz-in-body': noTdzInBody } } },
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
