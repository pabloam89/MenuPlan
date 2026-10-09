import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { familias } from './tokens.js'

/**
 * DESIGN_SYSTEM.md contra los tokens (ESTADO.md, «Cumplimiento», 5b).
 *
 * Formato fijo de cada tabla de valores: una línea `<!-- tokens:FAMILIA -->`,
 * una línea en blanco o no, y una tabla de markdown cuya primera columna es el
 * nombre del token entre acentos graves y la segunda su valor, también entre
 * acentos graves. Termina en la primera línea que no es fila de tabla. La
 * tabla debe tener TODOS los tokens de su familia y ninguno más. Las tablas no
 * se generan: se escriben a mano y este test las vigila.
 */
const doc = readFileSync(new URL('../../DESIGN_SYSTEM.md', import.meta.url), 'utf8')

function tablaDe(familia) {
  const lineas = doc.split('\n')
  const i = lineas.findIndex((l) => l.trim() === `<!-- tokens:${familia} -->`)
  if (i < 0) return null
  const filas = {}
  for (const linea of lineas.slice(i + 1)) {
    if (linea.trim() === '' && Object.keys(filas).length === 0) continue
    if (!linea.startsWith('|')) break
    const m = linea.match(/^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|/)
    if (m) filas[m[1]] = m[2]
  }
  return filas
}

describe('DESIGN_SYSTEM.md contra los tokens', () => {
  for (const [familia, tokens] of Object.entries(familias)) {
    it(`la tabla «${familia}» coincide con los tokens`, () => {
      const tabla = tablaDe(familia)
      expect(tabla, `falta la tabla marcada <!-- tokens:${familia} --> en DESIGN_SYSTEM.md`).not.toBeNull()
      const esperado = Object.fromEntries(Object.entries(tokens).map(([n, v]) => [n, String(v)]))
      expect(tabla).toEqual(esperado)
    })
  }

  it('cada familia tiene una sola tabla marcada', () => {
    for (const familia of Object.keys(familias)) {
      const veces = doc.split(`<!-- tokens:${familia} -->`).length - 1
      expect(veces, familia).toBe(1)
    }
  })

  it('no dice lo que las decisiones ya corrigieron', () => {
    expect(doc.startsWith('# HoMenu ·')).toBe(true) // D2
    expect(doc).not.toMatch(/uniforme `#9aa8a0`/) // D14: el placeholder es #9ab0a1
    expect(doc).not.toMatch(/toast `200`/) // el toast va en capa-toast
    expect(doc).not.toMatch(/pesos[^\n]*600–900/) // pesos: 700/800/900
    expect(doc).not.toMatch(/\*\*subcopy\*\* una frase explicativa/) // D5
  })
})
