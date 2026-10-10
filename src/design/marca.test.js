import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { color, tamano } from './tokens.js'
import { APP_SHELL_MAX_WIDTH, BOTTOM_NAV_HEIGHT } from '../components/ui.jsx'

/**
 * El verde de marca (D1) es uno solo: lo que el navegador y la tienda leen
 * antes de que cargue la app (favicon, `theme-color`, manifest) lo repite a
 * mano, y este test lo ata a `tokens.js` (ESTADO.md, «Cumplimiento», 5c).
 * El logo sigue en D12 (abierta).
 */
const leer = (ruta) => readFileSync(new URL(`../../${ruta}`, import.meta.url), 'utf8')

describe('el color de marca', () => {
  it('es el de los tokens en el favicon', () => {
    const svg = leer('public/favicon.svg')
    expect(svg).toMatch(new RegExp(`<rect[^>]*fill="${color.marca}"`, 'i'))
  })

  it('es el de los tokens en el theme-color de index.html', () => {
    const html = leer('index.html')
    const m = html.match(/<meta name="theme-color" content="([^"]+)"/)
    expect(m?.[1].toLowerCase()).toBe(color.marca)
  })

  it('es el de los tokens en el manifest, que lo lee de tokens.js', () => {
    const vite = leer('vite.config.js')
    expect(vite).toContain("from './src/design/tokens.js'")
    expect(vite).toContain('theme_color: color.marca')
  })
})

describe('las constantes de layout de ui.jsx', () => {
  it('coinciden con los tokens (420 y 80)', () => {
    expect(APP_SHELL_MAX_WIDTH).toBe(tamano['tam-columna'])
    expect(BOTTOM_NAV_HEIGHT).toBe(tamano['tam-nav'])
    expect([APP_SHELL_MAX_WIDTH, BOTTOM_NAV_HEIGHT]).toEqual([420, 80])
  })
})
