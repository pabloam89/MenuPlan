import { describe, expect, it } from 'vitest'
import {
  alias,
  capa,
  color,
  espaciado,
  familias,
  primitivos,
  rolesEspaciado,
  textos,
  tipografia,
  valoresPlanos,
  variablesDeRoles,
} from './tokens.js'

/**
 * Las reglas del sistema (ESTADO.md, «Arquitectura del sistema») hechas test:
 * 77 valores, un hex en un solo rol, sin primitivos huérfanos, espaciado en
 * múltiplos de 4 salvo 2 y 6, el toast por encima de toda hoja.
 */
describe('los tokens', () => {
  it('son 77 valores, con el reparto del documento', () => {
    const cuenta = Object.fromEntries(Object.entries(familias).map(([f, t]) => [f, Object.keys(t).length]))
    expect(cuenta).toEqual({
      color: 25,
      tipografia: 12,
      espaciado: 9,
      radio: 7,
      sombra: 4,
      capa: 8,
      movimiento: 4,
      tamano: 8,
    })
    expect(valoresPlanos()).toHaveLength(77)
  })

  it('no repiten nombre ni variable CSS', () => {
    const planos = valoresPlanos()
    expect(new Set(planos.map((p) => p.nombre)).size).toBe(planos.length)
    const vars = [...planos.map((p) => p.variable), ...variablesDeRoles().map(([v]) => v)]
    expect(new Set(vars).size).toBe(vars.length)
  })

  it('cada primitivo lo usa un rol y ningún valor está en dos roles', () => {
    const valores = Object.values(color)
    expect(new Set(valores).size).toBe(valores.length)
    for (const v of Object.values(primitivos)) expect(valores, `primitivo sin rol: ${v}`).toContain(v)
  })

  it('usan solo minúsculas en los hex y alfa en rgba', () => {
    for (const v of Object.values(primitivos)) expect(v).toMatch(/^(#[0-9a-f]{6}|rgba\([\d.,]+\))$/)
  })

  it('el espaciado va en múltiplos de 4 con las excepciones 2 y 6', () => {
    for (const v of Object.values(espaciado)) expect(v % 4 === 0 || v === 2 || v === 6, `espaciado ${v}`).toBe(true)
  })

  it('el toast va por encima de toda hoja y la nav por debajo', () => {
    expect(capa['capa-toast']).toBeGreaterThan(capa['capa-hoja-2'])
    expect(capa['capa-hoja-2']).toBeGreaterThan(capa['capa-hoja'])
    expect(capa['capa-nav']).toBeLessThan(capa['capa-hoja'])
  })

  it('los roles de texto y de espaciado y los alias apuntan a tokens que existen', () => {
    for (const t of Object.values(textos)) {
      expect(tipografia).toHaveProperty([t.tam])
      expect(tipografia).toHaveProperty([t.peso])
    }
    for (const e of Object.values(rolesEspaciado)) expect(espaciado).toHaveProperty([e])
    for (const d of Object.values(alias)) expect(color).toHaveProperty([d])
  })

  it('D1 y D14: verde de marca, teal de lo elegido, placeholder #9ab0a1', () => {
    expect(color.marca).toBe('#2d5a3d')
    expect(color.seleccionado).toBe('#0f766e')
    expect(color['tinta-palida']).toBe('#9ab0a1')
  })
})
