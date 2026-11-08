/**
 * Comparador de diseño, tanda 1 (#825): los valores base de HoMenu agrupados.
 *
 * Lee la medida que ya existe, `lint-tokens-base.json` (salida de la regla
 * `local/no-valor-suelto`: claves `fichero | tipo | valor` con su recuento), y
 * por cada tipo de valor (color, espaciado, tamaño de letra, peso, radio,
 * sombra, capa, movimiento) devuelve:
 *
 *   · cada valor distinto con sus usos y sus ficheros;
 *   · las FAMILIAS: los valores casi iguales juntos, con un umbral declarado
 *     (`UMBRALES`); el representante es el más usado;
 *   · para cada valor, el token de `src/design/tokens.js` más cercano como «pasa
 *     a» propuesto, o `null` («sin token») si ninguno queda dentro del umbral.
 *
 * Cómo se juntan: por líder. Se recorren los valores de más a menos usos; cada
 * uno entra en la familia del representante más cercano que quede dentro del
 * umbral, o abre una nueva. Así no hay cadenas (12 → 12,5 → 13 → 13,5…): todo
 * valor queda cerca de SU representante, y el test lo comprueba.
 *
 * Distancia normalizada: `distancia(tipo, a, b)` vale 0 si son iguales y 1 justo
 * en el umbral; > 1 es «no se parecen». Infinity si no se pueden comparar
 * (distinto signo, una curva frente a una duración, sombras con otras capas).
 *
 * Puro y sin dependencias de Node: lo usan a la vez su test y la página de
 * desarrollo `src/dev/ComparadorDiseno.jsx` (que lo importa solo en desarrollo).
 * No escribe nada.
 */

/** Los tipos que cuenta la regla (el test lo liga con `TIPOS_SUELTO`). */
export const TIPOS = ['color', 'espaciado', 'tamano-letra', 'peso', 'radio', 'sombra', 'capa', 'movimiento']

/**
 * Umbral de cada tipo y qué mide. Para los números, la diferencia relativa al
 * menor (|a − b| / min): las escalas de diseño son geométricas, y 2 frente a 3
 * no se parecen tanto como 300 frente a 310.
 */
export const UMBRALES = {
  color: {
    medida: 'ΔE76 en Lab (D65) sumado en cuadratura con la diferencia de transparencia ×100',
    umbral: 5,
    porque: 'por debajo de ~2 no se distinguen; a 5 son el mismo color a simple vista en una pantalla de móvil',
  },
  espaciado: { medida: 'diferencia relativa, mismo signo', umbral: 0.12, porque: '8 y 9 se juntan; 8 y 10 no' },
  'tamano-letra': { medida: 'diferencia relativa', umbral: 0.05, porque: '13 y 13,5 se juntan; 12 y 13 no' },
  peso: { medida: 'diferencia relativa', umbral: 0.07, porque: '750 cae con 700 u 800; 600 y 700 no se juntan' },
  radio: { medida: 'diferencia relativa', umbral: 0.12, porque: '12 y 13 se juntan; 12 y 14 no' },
  sombra: {
    medida: 'mismas capas e inset; tamaño (desplazamiento vertical + desenfoque) a ≤ 25 % y color de la primera capa a ≤ 10 de ΔE con transparencia',
    umbral: 1,
    porque: 'una sombra se ve por su altura y su oscuridad; dos sombras con 2 px de diferencia de desenfoque son la misma',
  },
  capa: { medida: 'diferencia relativa', umbral: 0.1, porque: '300 y 310 se juntan (hoja); 2 y 3 no' },
  movimiento: {
    medida: 'duraciones: diferencia relativa ≤ 15 %; curvas: distancia entre los puntos de control ≤ 0,15',
    umbral: 1,
    porque: '0,15 s y 0,16 s no se distinguen; una curva y una duración no se comparan',
  },
}

const UMBRAL_SOMBRA = { tamano: 0.25, color: 10 }
const UMBRAL_MOVIMIENTO = { duracion: 0.15, curva: 0.15 }

/** Qué tokens de `valoresPlanos()` sirven a cada tipo (familia y prefijo). */
const TOKENS_DEL_TIPO = {
  color: (f) => f.familia === 'color',
  espaciado: (f) => f.familia === 'espaciado',
  'tamano-letra': (f) => f.familia === 'tipografia' && f.nombre.startsWith('paso-'),
  peso: (f) => f.familia === 'tipografia' && f.nombre.startsWith('peso-'),
  radio: (f) => f.familia === 'radio',
  sombra: (f) => f.familia === 'sombra',
  capa: (f) => f.familia === 'capa',
  movimiento: (f) => f.familia === 'movimiento',
}

// ── Lectura de la base ───────────────────────────────────────────────────────

/** `{ sueltos: { 'fichero | tipo | valor': n } }` → `[{ fichero, tipo, valor, usos }]`. */
export function leerBase(base) {
  const out = []
  for (const [clave, usos] of Object.entries(base?.sueltos ?? {})) {
    const [fichero, tipo, ...resto] = clave.split(' | ')
    if (!TIPOS.includes(tipo)) throw new Error(`comparadorFundamentos: tipo desconocido «${tipo}» en «${clave}»`)
    out.push({ fichero, tipo, valor: resto.join(' | '), usos })
  }
  return out
}

/** Un valor de token escrito como lo escribe la base del lint (`.15s` → `0.15s`). */
function valorComoBase(tipo, valor) {
  const t = String(valor).replace(/\s+(?![^(]*\))/g, ' ')
  if (tipo === 'movimiento' && /^\d*\.?\d+s$/.test(t)) return `${Number(t.slice(0, -1))}s`
  if (tipo === 'color') return t.toLowerCase().replace(/\s+/g, '')
  return t
}

// ── Color ────────────────────────────────────────────────────────────────────

/** `#rrggbb`, `#rrggbbaa`, `#rgb`, `rgb()` o `rgba()` → `{ r, g, b, a }`, o null. */
export function parsearColor(texto) {
  const t = String(texto).trim().toLowerCase()
  let m = t.match(/^#([0-9a-f]{3,8})$/)
  if (m) {
    let h = m[1]
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('')
    if (h.length !== 6 && h.length !== 8) return null
    const n = (i) => parseInt(h.slice(i, i + 2), 16)
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 }
  }
  m = t.match(/^rgba?\(([^)]*)\)$/)
  if (m) {
    // La transparencia puede ir en tanto por uno (.5) o en porcentaje (50%).
    const partes = m[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map((p, i) => (i === 3 && p.endsWith('%') ? Number(p.slice(0, -1)) / 100 : Number(p)))
    if (partes.length < 3 || partes.some(Number.isNaN)) return null
    return { r: partes[0], g: partes[1], b: partes[2], a: partes.length > 3 ? partes[3] : 1 }
  }
  return null
}

/** sRGB → CIE Lab con blanco D65. */
export function colorALab({ r, g, b }) {
  const lineal = (c) => {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const [R, G, B] = [lineal(r), lineal(g), lineal(b)]
  const X = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047
  const Y = R * 0.2126729 + G * 0.7151522 + B * 0.072175
  const Z = (R * 0.0193339 + G * 0.119192 + B * 0.9503041) / 1.08883
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116)
  return { L: 116 * f(Y) - 16, a: 500 * (f(X) - f(Y)), b: 200 * (f(Y) - f(Z)) }
}

/** ΔE76 entre dos colores ya leídos, sumando en cuadratura la transparencia ×100. */
export function deltaE(c1, c2) {
  const l1 = colorALab(c1)
  const l2 = colorALab(c2)
  const de = Math.hypot(l1.L - l2.L, l1.a - l2.a, l1.b - l2.b)
  return Math.hypot(de, 100 * ((c1.a ?? 1) - (c2.a ?? 1)))
}

// ── Sombra ───────────────────────────────────────────────────────────────────

/** Parte por comas fuera de paréntesis. */
const capas = (texto) => {
  const out = []
  let nivel = 0
  let actual = ''
  for (const ch of texto) {
    if (ch === '(') nivel++
    if (ch === ')') nivel--
    if (ch === ',' && nivel === 0) {
      out.push(actual.trim())
      actual = ''
    } else actual += ch
  }
  if (actual.trim()) out.push(actual.trim())
  return out
}

/**
 * `boxShadow` → `{ firma, tamano, color, extension }`, o null. `tamano` y
 * `color` son los de la primera capa; `extension` es la mayor extensión
 * (cuarto número) de todas las capas: las de miles de px son un velo que tapa
 * la pantalla, no una sombra.
 */
export function parsearSombra(texto) {
  const lista = capas(String(texto))
  if (!lista.length) return null
  const leidas = lista.map((capa) => {
    const inset = /\binset\b/.test(capa)
    const colorTxt = capa.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/)?.[0]
    const sinColor = capa.replace(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/, ' ').replace(/\binset\b/, ' ')
    const nums = [...sinColor.matchAll(/-?\d*\.?\d+/g)].map((m) => Number(m[0]))
    return { inset, color: colorTxt ? parsearColor(colorTxt) : null, nums }
  })
  if (leidas.some((c) => c.nums.length < 2 || !c.color)) return null
  const p = leidas[0]
  return {
    firma: leidas.map((c) => `${c.inset ? 'i' : 'e'}${c.nums.length}`).join(','),
    tamano: Math.abs(p.nums[1]) + Math.abs(p.nums[2] ?? 0),
    color: p.color,
    extension: Math.max(...leidas.map((c) => Math.abs(c.nums[3] ?? 0))),
  }
}

// ── Movimiento ───────────────────────────────────────────────────────────────

const curva = (t) => {
  const m = String(t).match(/^cubic-bezier\(([^)]*)\)$/)
  return m ? m[1].split(',').map(Number) : null
}
const duracion = (t) => {
  const m = String(t).match(/^(\d*\.?\d+)(ms|s)$/)
  return m ? (m[2] === 'ms' ? Number(m[1]) / 1000 : Number(m[1])) : null
}

// ── Distancia ────────────────────────────────────────────────────────────────

const relativa = (a, b) => (a === b ? 0 : Math.abs(a - b) / Math.min(Math.abs(a), Math.abs(b)))

/** Distancia normalizada entre dos valores del mismo tipo (1 = en el umbral). */
export function distancia(tipo, a, b) {
  if (a === b) return 0
  if (tipo === 'color') {
    const c1 = parsearColor(a)
    const c2 = parsearColor(b)
    return c1 && c2 ? deltaE(c1, c2) / UMBRALES.color.umbral : Infinity
  }
  if (tipo === 'sombra') {
    const s1 = parsearSombra(a)
    const s2 = parsearSombra(b)
    if (!s1 || !s2 || s1.firma !== s2.firma) return Infinity
    const dt = s1.tamano === s2.tamano ? 0 : Math.abs(s1.tamano - s2.tamano) / Math.max(1, Math.min(s1.tamano, s2.tamano))
    return Math.max(dt / UMBRAL_SOMBRA.tamano, deltaE(s1.color, s2.color) / UMBRAL_SOMBRA.color)
  }
  if (tipo === 'movimiento') {
    const k1 = curva(a)
    const k2 = curva(b)
    if (k1 && k2) {
      if (k1.length !== 4 || k2.length !== 4) return Infinity
      return Math.hypot(...k1.map((v, i) => v - k2[i])) / UMBRAL_MOVIMIENTO.curva
    }
    const d1 = duracion(a)
    const d2 = duracion(b)
    if (d1 == null || d2 == null) return Infinity
    return relativa(d1, d2) / UMBRAL_MOVIMIENTO.duracion
  }
  const n1 = Number(a)
  const n2 = Number(b)
  if (Number.isNaN(n1) || Number.isNaN(n2) || Math.sign(n1) !== Math.sign(n2)) return Infinity
  return relativa(n1, n2) / UMBRALES[tipo].umbral
}

// ── Orden y marcas para la página ────────────────────────────────────────────

/** Los tipos que son un número y se pueden ordenar por valor. */
export const ES_NUMERICO = Object.fromEntries(TIPOS.map((t) => [t, ['espaciado', 'tamano-letra', 'peso', 'radio', 'capa'].includes(t)]))

/**
 * Las familias por `usos` (como vienen de `agruparBase`) o por `valor` del
 * representante, de menor a mayor, para ver la escala. Solo los tipos
 * numéricos se ordenan por valor; los demás vuelven como vienen.
 */
export function ordenarFamilias(familias, tipo, criterio) {
  if (criterio !== 'valor' || !ES_NUMERICO[tipo]) return familias
  return [...familias].sort((x, y) => Number(x.representante) - Number(y.representante))
}

/** Las versiones de una familia cuyo token propuesto no es el de la familia (o no tienen). */
export function versionesConOtroToken(familia) {
  const propio = familia.token?.nombre ?? null
  return familia.valores.filter((v) => (v.token?.nombre ?? null) !== propio)
}

// ── Agrupado ─────────────────────────────────────────────────────────────────

/** Orden estable: más usos primero; a igualdad, por el texto del valor. */
const porUsos = (x, y) => y.usos - x.usos || (x.valor < y.valor ? -1 : x.valor > y.valor ? 1 : 0)

/** El token más cercano dentro del umbral, o null. */
function tokenCercano(tipo, valor, tokens) {
  let mejor = null
  for (const t of tokens) {
    const d = distancia(tipo, valor, t.valorBase)
    if (d <= 1 && (!mejor || d < mejor.distancia)) mejor = { nombre: t.nombre, variable: t.variable, valor: t.valorBase, distancia: d }
  }
  return mejor
}

/**
 * Agrupa las entradas de `leerBase()` frente a los tokens (`valoresPlanos()` de
 * `src/design/tokens.js`). Devuelve `{ porTipo, cifras, tokens, umbrales }`.
 */
export function agruparBase(entradas, filasTokens) {
  const tokens = Object.fromEntries(
    TIPOS.map((tipo) => [
      tipo,
      filasTokens.filter(TOKENS_DEL_TIPO[tipo]).map((f) => ({ nombre: f.nombre, variable: f.variable, valorBase: valorComoBase(tipo, f.valor) })),
    ]),
  )

  const porTipo = {}
  const cifras = {}
  for (const tipo of TIPOS) {
    const mapa = new Map()
    for (const e of entradas) {
      if (e.tipo !== tipo) continue
      const v = mapa.get(e.valor) ?? { valor: e.valor, usos: 0, ficheros: [] }
      v.usos += e.usos
      v.ficheros.push({ fichero: e.fichero, usos: e.usos })
      mapa.set(e.valor, v)
    }
    const valores = [...mapa.values()].sort(porUsos)
    for (const v of valores) {
      v.ficheros.sort((x, y) => y.usos - x.usos || (x.fichero < y.fichero ? -1 : 1))
      v.token = tokenCercano(tipo, v.valor, tokens[tipo])
    }

    const familias = []
    for (const v of valores) {
      let destino = null
      let dMin = Infinity
      for (const f of familias) {
        const d = distancia(tipo, f.representante, v.valor)
        if (d <= 1 && d < dMin) {
          destino = f
          dMin = d
        }
      }
      if (destino) destino.valores.push(v)
      else familias.push({ representante: v.valor, token: v.token, valores: [v] })
    }
    for (const f of familias) {
      f.usos = f.valores.reduce((s, v) => s + v.usos, 0)
      f.ficheros = new Set(f.valores.flatMap((v) => v.ficheros.map((x) => x.fichero))).size
    }
    familias.sort((x, y) => y.usos - x.usos || (x.representante < y.representante ? -1 : 1))

    const sinToken = valores.filter((v) => !v.token)
    porTipo[tipo] = { valores, familias }
    cifras[tipo] = {
      distintos: valores.length,
      usos: valores.reduce((s, v) => s + v.usos, 0),
      familias: familias.length,
      sinToken: sinToken.length,
      usosSinToken: sinToken.reduce((s, v) => s + v.usos, 0),
      tokens: tokens[tipo].length,
    }
  }
  return { porTipo, cifras, tokens, umbrales: UMBRALES }
}
