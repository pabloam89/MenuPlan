// El agrupado de los valores base de HoMenu (#825, tanda 1). Liga el dato con la
// medida que ya vigila el lint (`lint-tokens-base.json`) y con los tokens de
// `src/design/tokens.js`: si cambia la base, la regla o los tokens, esto lo ve.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { TIPOS_SUELTO } from '../../eslint-rules/no-valor-suelto.js'
import { valoresPlanos } from '../../src/design/tokens.js'
import {
  TIPOS,
  UMBRALES,
  leerBase,
  agruparBase,
  colorALab,
  deltaE,
  parsearColor,
  distancia,
} from './comparadorFundamentos.mjs'

const base = JSON.parse(readFileSync(fileURLToPath(new URL('../../lint-tokens-base.json', import.meta.url)), 'utf8'))
const filasTokens = valoresPlanos()

describe('vocabulario y umbrales', () => {
  it('los tipos son los mismos que cuenta la regla no-valor-suelto', () => {
    expect([...TIPOS].sort()).toEqual(Object.keys(TIPOS_SUELTO).sort())
  })
  it('cada tipo declara su umbral, con número y con qué mide', () => {
    for (const t of TIPOS) {
      expect(UMBRALES[t], t).toBeDefined()
      expect(typeof UMBRALES[t].medida, t).toBe('string')
      expect(UMBRALES[t].umbral, t).toBeGreaterThan(0)
    }
  })
})

describe('color perceptual', () => {
  it('blanco y negro caen donde dice Lab', () => {
    const blanco = colorALab(parsearColor('#ffffff'))
    const negro = colorALab(parsearColor('#000000'))
    expect(blanco.L).toBeCloseTo(100, 1)
    expect(negro.L).toBeCloseTo(0, 1)
    expect(deltaE(parsearColor('#ffffff'), parsearColor('#000000'))).toBeCloseTo(100, 0)
  })
  it('lee hex de 6 y 8 cifras y rgba', () => {
    expect(parsearColor('#2d5a3d14')).toMatchObject({ r: 45, g: 90, b: 61 })
    expect(parsearColor('#2d5a3d14').a).toBeCloseTo(0x14 / 255, 3)
    expect(parsearColor('rgba(20,47,29,.4)')).toMatchObject({ r: 20, g: 47, b: 29, a: 0.4 })
    expect(parsearColor('rgb(1, 2, 3)')).toMatchObject({ r: 1, g: 2, b: 3, a: 1 })
  })
  it('el mismo color con otra transparencia no es el mismo', () => {
    expect(distancia('color', 'rgba(0,0,0,.2)', 'rgba(0,0,0,.5)')).toBeGreaterThan(1)
    expect(distancia('color', '#2d5a3d', '#2d5a3e')).toBeLessThan(1)
  })
})

describe('agrupado con datos de juguete', () => {
  const juguete = {
    sueltos: {
      'a.jsx | tamano-letra | 13': 10,
      'b.jsx | tamano-letra | 13': 5,
      'a.jsx | tamano-letra | 13.5': 4,
      'a.jsx | tamano-letra | 40': 1,
      'a.jsx | color | #2d5a3d': 8,
      'a.jsx | color | #2e5b3e': 2,
      'a.jsx | color | #ff00ff': 1,
      'a.jsx | espaciado | -8': 3,
      'a.jsx | espaciado | 8': 3,
    },
  }
  const r = agruparBase(leerBase(juguete), filasTokens)

  it('suma los usos de cada valor en todos sus ficheros', () => {
    const v13 = r.porTipo['tamano-letra'].valores.find((v) => v.valor === '13')
    expect(v13.usos).toBe(15)
    expect(v13.ficheros).toEqual([{ fichero: 'a.jsx', usos: 10 }, { fichero: 'b.jsx', usos: 5 }])
  })
  it('junta los casi iguales y propone el token más cercano', () => {
    const t = r.porTipo['tamano-letra']
    expect(t.familias).toHaveLength(2)
    expect(t.familias[0].valores.map((v) => v.valor)).toEqual(['13', '13.5'])
    expect(t.familias[0].token.nombre).toBe('paso-13')
    expect(t.familias[1].token).toBeNull()
    const c = r.porTipo.color
    expect(c.familias[0].valores.map((v) => v.valor)).toEqual(['#2d5a3d', '#2e5b3e'])
    expect(c.familias[0].token.nombre).toBe('marca')
    expect(c.valores.find((v) => v.valor === '#ff00ff').token).toBeNull()
  })
  it('un margen negativo no se junta con el positivo', () => {
    const e = r.porTipo.espaciado
    expect(e.familias).toHaveLength(2)
    expect(e.valores.find((v) => v.valor === '-8').token).toBeNull()
    expect(e.valores.find((v) => v.valor === '8').token.nombre).toBe('esp-8')
  })
  it('fuera del umbral no hay «pasa a», aunque haya un token cerca', () => {
    // radio 14: a un 14 % de 16 y a un 17 % de 12; el umbral es 12 %.
    const radio = agruparBase(leerBase({ sueltos: { 'a.jsx | radio | 14': 1, 'a.jsx | radio | 13': 1 } }), filasTokens)
    expect(radio.porTipo.radio.valores.find((v) => v.valor === '14').token).toBeNull()
    expect(radio.porTipo.radio.valores.find((v) => v.valor === '13').token.nombre).toBe('radio-control')
  })
  it('las cifras cuadran con el detalle', () => {
    expect(r.cifras['tamano-letra']).toMatchObject({ distintos: 3, usos: 20, familias: 2, sinToken: 1, usosSinToken: 1 })
  })
})

describe('con la base real (lint-tokens-base.json)', () => {
  const entradas = leerBase(base)
  const r = agruparBase(entradas, filasTokens)

  it('cada entrada de la base cae en un valor y cada valor en una sola familia', () => {
    for (const t of TIPOS) {
      const enBase = entradas.filter((e) => e.tipo === t)
      const usosBase = enBase.reduce((s, e) => s + e.usos, 0)
      const distintosBase = new Set(enBase.map((e) => e.valor)).size
      const { valores, familias } = r.porTipo[t]
      expect(valores.length, t).toBe(distintosBase)
      expect(valores.reduce((s, v) => s + v.usos, 0), t).toBe(usosBase)
      const enFamilias = familias.flatMap((f) => f.valores.map((v) => v.valor))
      expect(enFamilias.length, t).toBe(valores.length)
      expect(new Set(enFamilias).size, t).toBe(valores.length)
      expect(familias.reduce((s, f) => s + f.usos, 0), t).toBe(usosBase)
    }
  })
  it('las familias van de más a menos usos', () => {
    for (const t of TIPOS) {
      const usos = r.porTipo[t].familias.map((f) => f.usos)
      expect(usos, t).toEqual([...usos].sort((a, b) => b - a))
    }
  })
  it('todo valor de la familia queda dentro del umbral de su representante', () => {
    for (const t of TIPOS) {
      for (const f of r.porTipo[t].familias) {
        for (const v of f.valores) expect(distancia(t, f.representante, v.valor), `${t} ${v.valor}`).toBeLessThanOrEqual(1)
      }
    }
  })
  it('cada token es el más cercano de sí mismo (ningún token queda tapado por otro)', () => {
    const sueltos = {}
    for (const t of TIPOS) for (const fila of tokensDe(t)) sueltos[`x.jsx | ${t} | ${fila.valorBase}`] = 1
    const propio = agruparBase(leerBase({ sueltos }), filasTokens)
    for (const t of TIPOS) {
      for (const fila of tokensDe(t)) {
        const v = propio.porTipo[t].valores.find((x) => x.valor === fila.valorBase)
        expect(v.token?.nombre, `${t} ${fila.nombre}`).toBe(fila.nombre)
        expect(v.token.distancia, `${t} ${fila.nombre}`).toBe(0)
      }
    }
  })
})

/** Los tokens de un tipo, escritos como los escribe la base del lint. */
function tokensDe(tipo) {
  const r = agruparBase([], filasTokens)
  return r.tokens[tipo].map((t) => ({ nombre: t.nombre, valorBase: t.valorBase }))
}
