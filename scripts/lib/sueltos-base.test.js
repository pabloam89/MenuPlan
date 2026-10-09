import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { RUTA_BASE, claveSuelto, compararSueltos, leerMensaje, totalDe } from './sueltos-base.mjs'

/**
 * La línea base de valores sueltos (lint-tokens-base.json) es un trinquete:
 * solo puede bajar. Este test lo cierra por dos lados:
 *
 *   · la lógica de comparar (nuevo = fallo, renombrar un fichero = no);
 *   · la cifra de la base commiteada es IGUAL al tope de aquí: ni por encima
 *     (se subió la base) ni por debajo (se bajó sin bajar el tope, y el tope
 *     sobrante dejaría subir luego). Quien baja la base con
 *     `npm run lint:base -- --actualizar` baja también el tope; subirlo
 *     tiene que verse en el diff de este fichero, junto a su porqué.
 */

// Medido el 9 oct 2026 con la regla local/no-valor-suelto (ver ESTADO.md).
// 12.768 → 12.793 el mismo día: la regla empezó a mirar los trozos literales
// de las plantillas con expresiones (`${n}px 13px`); es detección, no deriva.
const TOPE_VALORES_SUELTOS = 12793
const TOPE_ESLINT_DISABLE = 0

const siempre = () => true
const vacio = () => false

describe('la regla y su mensaje', () => {
  it('lee tipo y valor del mensaje', () => {
    expect(leerMensaje('Valor suelto [color] #2d5a3d: usa un token (src/design/tokens.js)')).toEqual({ tipo: 'color', valor: '#2d5a3d' })
    expect(leerMensaje('Valor suelto [sombra] 0 1px 3px rgba(0,0,0,.1): usa un token (src/design/tokens.js)')).toEqual({
      tipo: 'sombra',
      valor: '0 1px 3px rgba(0,0,0,.1)',
    })
    expect(leerMensaje('otra cosa')).toBeNull()
  })
})

describe('comparar con la base', () => {
  const base = { [claveSuelto('src/A.jsx', 'color', '#fff')]: 3, [claveSuelto('src/A.jsx', 'radio', '16')]: 1 }

  it('igual o menos que la base no es nuevo', () => {
    const menos = { [claveSuelto('src/A.jsx', 'color', '#fff')]: 2 }
    expect(compararSueltos(base, base, siempre).nuevos).toEqual([])
    const r = compararSueltos(menos, base, siempre)
    expect(r.nuevos).toEqual([])
    expect(r.bajados).toBe(2)
  })

  it('un valor suelto de más es nuevo, aunque otro desaparezca', () => {
    const actual = {
      [claveSuelto('src/A.jsx', 'color', '#fff')]: 3,
      [claveSuelto('src/A.jsx', 'color', '#000')]: 1, // nuevo
      // el radio 16 ya no está: no compensa el color nuevo
    }
    expect(compararSueltos(actual, base, siempre).nuevos).toEqual([[claveSuelto('src/A.jsx', 'color', '#000'), 1]])
  })

  it('extraer una constante no engaña: el valor sigue contando en su fichero', () => {
    const actual = { ...base, [claveSuelto('src/A.jsx', 'color', '#fff')]: 4 }
    expect(compararSueltos(actual, base, siempre).nuevos).toHaveLength(1)
  })

  it('renombrar o mover el fichero no cuenta como nuevo', () => {
    const movido = {
      [claveSuelto('src/B.jsx', 'color', '#fff')]: 3,
      [claveSuelto('src/B.jsx', 'radio', '16')]: 1,
    }
    // src/A.jsx ya no existe
    expect(compararSueltos(movido, base, vacio).nuevos).toEqual([])
  })

  it('renombrar y añadir uno sí cuenta lo añadido', () => {
    const movido = {
      [claveSuelto('src/B.jsx', 'color', '#fff')]: 4,
      [claveSuelto('src/B.jsx', 'radio', '16')]: 1,
    }
    expect(compararSueltos(movido, base, vacio).nuevos).toEqual([[claveSuelto('src/B.jsx', 'color', '#fff'), 1]])
  })

  it('el crédito de un fichero que sigue existiendo no se presta a otro', () => {
    const actual = { [claveSuelto('src/C.jsx', 'color', '#fff')]: 3 }
    // A existe (bajó a 0 valores pero sigue ahí): C no hereda su crédito
    expect(compararSueltos(actual, base, siempre).nuevos).toEqual([[claveSuelto('src/C.jsx', 'color', '#fff'), 3]])
  })
})

describe('la base commiteada', () => {
  const base = JSON.parse(readFileSync(new URL(`../../${RUTA_BASE}`, import.meta.url), 'utf8'))

  it('tiene la forma fichero | tipo | valor → cuenta', () => {
    expect(Object.keys(base)).toEqual(['eslintDisable', 'sueltos'])
    for (const [k, n] of Object.entries(base.sueltos)) {
      expect(k.split(' | ').length, k).toBeGreaterThanOrEqual(3)
      expect(Number.isInteger(n) && n > 0, k).toBe(true)
    }
  })

  it('solo baja: el tope es la base, ni más ni menos', () => {
    expect(totalDe(base.sueltos)).toBe(TOPE_VALORES_SUELTOS)
    expect(base.eslintDisable).toBeLessThanOrEqual(TOPE_ESLINT_DISABLE)
  })
})
