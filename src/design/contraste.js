/**
 * Contraste WCAG 2.2 (L05 de docs/diseno/META-DISENO.md): la cuenta pura, sin
 * dependencias, para que la use el test de `ops/diseno/contraste.json`.
 *
 *   · Texto normal ≥ 4,5:1 y texto grande ≥ 3:1 (criterio 1.4.3).
 *   · Controles, iconos y gráficos ≥ 3:1 (criterio 1.4.11).
 *
 * Acepta `#rgb`, `#rrggbb` y `rgba(r,g,b,a)`; un color con alfa se compone sobre
 * el fondo que se le da antes de medir.
 */

/** Umbral mínimo por uso, de la norma. */
export const UMBRALES = { texto: 4.5, 'texto-grande': 3, grafico: 3 }

/** Un color a `[r, g, b, a]` (r, g, b en 0–255, a en 0–1). */
export function leerColor(texto) {
  const t = String(texto).trim().toLowerCase()
  let m = t.match(/^#([0-9a-f]{3})$/)
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16)).concat(1)
  m = t.match(/^#([0-9a-f]{6})$/)
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)).concat(1)
  m = t.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/)
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])]
  throw new Error(`contraste: no entiendo el color «${texto}»`)
}

/** Compone `frente` (con alfa) sobre `fondo` opaco; devuelve un hex opaco. */
export function componer(frente, fondo) {
  const [r, g, b, a] = leerColor(frente)
  const [R, G, B] = leerColor(fondo)
  const mezcla = (x, y) => Math.round(x * a + y * (1 - a))
  return `#${[mezcla(r, R), mezcla(g, G), mezcla(b, B)].map((n) => n.toString(16).padStart(2, '0')).join('')}`
}

/** Luminancia relativa de un color opaco (WCAG 2.x). */
export function luminancia(color) {
  const [r, g, b] = leerColor(color)
  const lineal = (c) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lineal(r) + 0.7152 * lineal(g) + 0.0722 * lineal(b)
}

/** Razón de contraste entre dos colores opacos, de 1 a 21. */
export function contraste(a, b) {
  const x = luminancia(a)
  const y = luminancia(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
