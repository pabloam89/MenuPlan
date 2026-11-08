import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { color } from './tokens.js'
import { UMBRALES, componer, contraste, leerColor } from './contraste.js'

/**
 * L05 de docs/diseno/META-DISENO.md hecha test: cada pareja texto/fondo que una
 * instancia declara en `ops/diseno/contraste.json` llega al mínimo de WCAG 2.2
 * (4,5:1 de texto, 3:1 de gráfico), medida con los colores reales de sus
 * tokens. Lo que hoy no llega está en `excepciones`, con su motivo, y esa lista
 * solo baja: una pareja que ya llega obliga a quitarla de la lista.
 */
const datos = JSON.parse(readFileSync(new URL('../../ops/diseno/contraste.json', import.meta.url), 'utf8'))

/** Los colores (rol → hex o rgba) de una instancia: sus tokens, o los suyos en línea. */
function coloresDe(nombre, inst) {
  if (inst.fuente === 'src/design/tokens.js') return color
  if (inst.colores) return inst.colores
  throw new Error(`contraste: la instancia «${nombre}» no tiene colores que medir (fuente ${inst.fuente})`)
}

/** Mide una pareja: razón de contraste y mínimo que le toca. */
export function medir(par, colores) {
  for (const rol of [par.texto, par.fondo]) {
    if (!(rol in colores)) throw new Error(`contraste: el rol «${rol}» (pareja ${par.id}) no existe en los colores`)
  }
  if (!(par.uso in UMBRALES)) throw new Error(`contraste: uso «${par.uso}» (pareja ${par.id}) no es de ${Object.keys(UMBRALES)}`)
  const base = par.sobre ? colores[par.sobre] : '#ffffff'
  const fondo = componer(colores[par.fondo], base)
  const texto = componer(colores[par.texto], fondo)
  return { razon: contraste(texto, fondo), minimo: UMBRALES[par.uso] }
}

/** Parejas que no llegan y que no están en la lista, y las de la lista que ya llegan. */
export function veredicto(inst, colores) {
  const excepcion = new Set(inst.excepciones.map((e) => e.par))
  const rotas = []
  const sobran = []
  for (const par of inst.pares) {
    const { razon, minimo } = medir(par, colores)
    const llega = razon >= minimo
    if (!llega && !excepcion.has(par.id)) rotas.push(`${par.id}: ${razon.toFixed(2)}:1, pide ${minimo}:1`)
    if (llega && excepcion.has(par.id)) sobran.push(`${par.id}: ya llega (${razon.toFixed(2)}:1), quítala de excepciones`)
  }
  return { rotas, sobran }
}

describe('la cuenta de contraste (WCAG)', () => {
  it('da 21:1 entre negro y blanco y 1:1 entre iguales', () => {
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contraste('#336699', '#336699')).toBeCloseTo(1, 5)
  })

  it('coincide con un valor conocido: #767676 sobre blanco es 4,54:1', () => {
    expect(contraste('#767676', '#ffffff')).toBeCloseTo(4.54, 2)
  })

  it('lee hex corto, hex largo y rgba, y compone el alfa sobre el fondo', () => {
    expect(leerColor('#fff')).toEqual([255, 255, 255, 1])
    expect(leerColor('rgba(47,109,138,.1)')).toEqual([47, 109, 138, 0.1])
    expect(componer('rgba(0,0,0,.5)', '#ffffff')).toBe('#808080')
  })

  it('rechaza un color que no entiende', () => {
    expect(() => leerColor('verde')).toThrow(/no entiendo/)
  })
})

describe('los contrastes declarados en ops/diseno/contraste.json', () => {
  it('cada instancia dice su perfil, su tema y una fuente de colores o por qué no la tiene', () => {
    for (const [nombre, inst] of Object.entries(datos.instancias)) {
      expect(inst.perfil, nombre).toMatch(/^P[1-6]$/)
      expect(inst.tema, nombre).toBe('claro')
      if (inst.estado === 'sin-tokens') {
        expect(inst.motivo, `${nombre}: «sin-tokens» lleva su motivo`).toBeTruthy()
        expect(inst.pares, `${nombre}: sin tokens no hay parejas que medir`).toEqual([])
      } else {
        expect(inst.fuente || inst.colores, `${nombre}: sin fuente ni colores`).toBeTruthy()
        expect(inst.pares.length, nombre).toBeGreaterThan(0)
      }
    }
  })

  it('cada pareja y cada excepción están bien formadas y sin repetir', () => {
    for (const [nombre, inst] of Object.entries(datos.instancias)) {
      const ids = inst.pares.map((p) => p.id)
      expect(new Set(ids).size, `${nombre}: ids repetidos`).toBe(ids.length)
      for (const p of inst.pares) expect(Object.keys(datos.usos), `${nombre}/${p.id}`).toContain(p.uso)
      for (const e of inst.excepciones) {
        expect(ids, `${nombre}: excepción de una pareja que no existe`).toContain(e.par)
        expect(e.motivo?.length ?? 0, `${nombre}/${e.par}: sin motivo`).toBeGreaterThan(20)
      }
    }
  })

  for (const [nombre, inst] of Object.entries(datos.instancias)) {
    if (inst.estado === 'sin-tokens') continue
    it(`en «${nombre}» toda pareja llega a WCAG 2.2 AA o está declarada como excepción, y ninguna excepción sobra`, () => {
      const { rotas, sobran } = veredicto(inst, coloresDe(nombre, inst))
      expect(rotas, 'parejas que no llegan y no están en excepciones').toEqual([])
      expect(sobran, 'excepciones que ya llegan').toEqual([])
    })
  }
})

describe('el test de contraste se ve fallar', () => {
  const homenu = datos.instancias.homenu

  it('una pareja que no llega y no está declarada se marca rota', () => {
    const roja = { ...homenu, pares: [...homenu.pares, { id: 'palida-sobre-fondo', texto: 'tinta-palida', fondo: 'fondo-pantalla', uso: 'texto', donde: 'prueba' }] }
    expect(veredicto(roja, color).rotas.join('\n')).toMatch(/palida-sobre-fondo: 2\.17:1, pide 4\.5:1/)
  })

  it('un rol oscurecido a mano cambia el veredicto: la medida usa los colores reales', () => {
    const palido = { ...color, 'tinta-media': '#c8d3cb' }
    expect(veredicto(homenu, palido).rotas.join('\n')).toMatch(/tinta-media-sobre-superficie/)
  })

  it('una excepción que ya llega obliga a quitarla de la lista', () => {
    const clara = { ...color, 'tinta-tenue': '#42594c' }
    expect(veredicto(homenu, clara).sobran.join('\n')).toMatch(/tinta-tenue-sobre-superficie: ya llega/)
  })

  it('un rol que no existe es un error, no un aprobado por omisión', () => {
    expect(() => medir({ id: 'x', texto: 'no-existe', fondo: 'superficie', uso: 'texto' }, color)).toThrow(/no existe/)
  })

  it('el alfa se compone: info sobre su fondo translúcido mide menos que sobre blanco', () => {
    const par = homenu.pares.find((p) => p.id === 'info-sobre-info-fondo')
    const plano = medir({ ...par, fondo: 'superficie' }, color).razon
    expect(medir(par, color).razon).toBeLessThan(plano)
  })
})
