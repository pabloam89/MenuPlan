import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { generarCss } from '../../scripts/diseno/generar-tokens-css.mjs'
import { valoresPlanos } from './tokens.js'

/**
 * Sincronía: `tokens.css` es una proyección generada de `tokens.js`. Si alguien
 * cambia un token y no regenera (o edita el CSS a mano), este test falla.
 */
describe('tokens.css', () => {
  const versionado = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')

  it('coincide con lo que generan los tokens', () => {
    expect(versionado).toBe(generarCss())
  })

  it('define una variable por cada uno de los 77 valores', () => {
    for (const v of valoresPlanos()) expect(versionado, v.variable).toContain(`${v.variable}: ${v.css};`)
  })

  it('respeta prefers-reduced-motion', () => {
    expect(versionado).toContain('prefers-reduced-motion: reduce')
  })

  it('src/main.jsx carga el CSS de los tokens', () => {
    const main = readFileSync(new URL('../main.jsx', import.meta.url), 'utf8')
    expect(main).toContain("import './design/tokens.css'")
  })
})
