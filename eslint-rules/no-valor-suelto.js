/**
 * Regla local: ningún valor visual fuera de los tokens (`src/design/tokens.js`).
 *
 * Marca, en los `.jsx` de `src` y en los `.js` con hex que lista
 * `eslint.config.js`:
 *
 *   · color      cualquier hex, `rgb()/rgba()/hsl()/hsla()` escrito a mano
 *   · tamano-letra `fontSize` numérico
 *   · peso       `fontWeight` numérico
 *   · radio      `borderRadius` (y sus esquinas), por cada número
 *   · espaciado  `padding*`, `margin*`, `gap`, `rowGap`, `columnGap`
 *   · capa       `zIndex`
 *   · sombra     `boxShadow` entero
 *   · movimiento duraciones y `cubic-bezier()` de `transition` y `animation`
 *
 * Va en `warn`: hoy hay miles (ver `lint-tokens-base.json`) y se migran pantalla
 * a pantalla. `scripts/lint-base.mjs` la compara con la línea base por LISTA
 * `fichero | tipo | valor`, que solo puede bajar.
 *
 * Lista blanca (ESTADO.md, «Cumplimiento»): 0, 1, ±1, `100%`, `50%`, `none`,
 * `auto`, `transparent`, `currentColor`, `inherit`. Un `var(--…)`, `calc()` o
 * `env()` es justo lo que se quiere y no se marca.
 *
 * El mensaje tiene una forma fija que `lint-base.mjs` parsea:
 *   `Valor suelto [tipo] valor: usa un token (src/design/tokens.js)`
 */

const COLOR_RE = /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b|\b(?:rgba?|hsla?)\([^)]*\)/g

// propiedad de estilo → tipo
const TIPO_POR_PROPIEDAD = {
  fontSize: 'tamano-letra',
  fontWeight: 'peso',
  borderRadius: 'radio',
  borderTopLeftRadius: 'radio',
  borderTopRightRadius: 'radio',
  borderBottomLeftRadius: 'radio',
  borderBottomRightRadius: 'radio',
  zIndex: 'capa',
  boxShadow: 'sombra',
  transition: 'movimiento',
  transitionDuration: 'movimiento',
  animation: 'movimiento',
  animationDuration: 'movimiento',
}
for (const lado of ['', 'Top', 'Right', 'Bottom', 'Left', 'Inline', 'Block']) {
  TIPO_POR_PROPIEDAD[`padding${lado}`] = 'espaciado'
  TIPO_POR_PROPIEDAD[`margin${lado}`] = 'espaciado'
}
for (const p of ['gap', 'rowGap', 'columnGap']) TIPO_POR_PROPIEDAD[p] = 'espaciado'

const PALABRAS_BLANCAS = new Set(['none', 'auto', 'transparent', 'currentcolor', 'inherit', 'initial', 'unset', 'normal'])
const TOKEN_FUNC_RE = /\b(?:var|calc|env|min|max|clamp)\(/

/** Un mismo color se cuenta igual escrito de cualquier forma: #fff = #ffffff. */
const normalizarColor = (c) => {
  const t = c.toLowerCase().replace(/\s+/g, '')
  return /^#[0-9a-f]{3,4}$/.test(t) ? '#' + [...t.slice(1)].map((h) => h + h).join('') : t
}

/** Un mismo tiempo se cuenta igual: .15s = 0.15s = 150ms. */
function normalizarTiempo(numero, unidad) {
  const segundos = unidad === 'ms' ? Number(numero) / 1000 : Number(numero)
  return `${Number(segundos.toFixed(3))}s`
}
const normalizarCurva = (c) => c.replace(/\s+/g, '').replace(/(?<!\d)0\./g, '.')

/**
 * Los tipos de valor suelto que cuenta la regla y la familia de token a la que
 * pertenecen (claves de `familias` en src/design/tokens.js). La base de
 * `lint-tokens-base.json` solo admite estos.
 */
export const TIPOS_SUELTO = {
  color: 'color',
  'tamano-letra': 'tipografia',
  peso: 'tipografia',
  radio: 'radio',
  espaciado: 'espaciado',
  capa: 'capa',
  sombra: 'sombra',
  movimiento: 'movimiento',
}

/** Números sueltos de un texto («14px 16px» → ['14','16']), sin la lista blanca. */
function numerosDeTexto(texto) {
  const sueltos = []
  for (const m of texto.matchAll(/(-?\d*\.?\d+)(px|rem|em|%)?/g)) {
    const n = Number(m[1])
    const unidad = m[2] ?? ''
    if (unidad === '%') {
      if (n === 100 || n === 50 || n === 0) continue
      sueltos.push(`${m[1]}%`)
      continue
    }
    if (n === 0 || Math.abs(n) === 1) continue
    sueltos.push(unidad && unidad !== 'px' ? `${m[1]}${unidad}` : String(n))
  }
  return sueltos
}

/** Duraciones y curvas de `transition`/`animation`. */
function movimientoDeTexto(texto) {
  const sueltos = []
  const sinCurvas = texto.replace(/cubic-bezier\([^)]*\)/g, (c) => {
    sueltos.push(normalizarCurva(c))
    return ' '
  })
  for (const m of sinCurvas.matchAll(/(?<![\w.-])(\d*\.?\d+)(ms|s)\b/g)) {
    if (Number(m[1]) === 0) continue
    sueltos.push(normalizarTiempo(m[1], m[2]))
  }
  return sueltos
}

/** Texto estático de un nodo valor, o null si es dinámico. */
function textoEstatico(nodo) {
  if (nodo.type === 'Literal') return typeof nodo.value === 'string' || typeof nodo.value === 'number' ? String(nodo.value) : null
  if (nodo.type === 'TemplateLiteral' && nodo.expressions.length === 0) return nodo.quasis.map((q) => q.value.cooked).join('')
  if (nodo.type === 'UnaryExpression' && nodo.operator === '-' && nodo.argument.type === 'Literal' && typeof nodo.argument.value === 'number') {
    return String(-nodo.argument.value)
  }
  return null
}

/** Los nodos hoja de un valor, entrando en ternarios y `||`/`&&`/`??`. */
function hojas(nodo, acumulado = []) {
  if (nodo.type === 'ConditionalExpression') {
    hojas(nodo.consequent, acumulado)
    hojas(nodo.alternate, acumulado)
  } else if (nodo.type === 'LogicalExpression') {
    hojas(nodo.left, acumulado)
    hojas(nodo.right, acumulado)
  } else {
    acumulado.push(nodo)
  }
  return acumulado
}

export const noValorSuelto = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prohíbe colores, tamaños, radios, sombras, capas y tiempos escritos a mano: van en src/design/tokens.js',
    },
    schema: [],
    messages: {
      suelto: 'Valor suelto [{{tipo}}] {{valor}}: usa un token (src/design/tokens.js)',
    },
  },
  create(context) {
    const manejados = new WeakSet()
    const informar = (node, tipo, valor) => context.report({ node, messageId: 'suelto', data: { tipo, valor } })

    function marcarArbol(nodo) {
      manejados.add(nodo)
      for (const q of nodo.quasis ?? []) manejados.add(q)
    }

    // Valores sueltos de un texto, según el tipo de propiedad.
    function valoresDe(tipo, t) {
      if (tipo === 'movimiento') return movimientoDeTexto(t)
      if (tipo === 'peso' || tipo === 'capa' || tipo === 'tamano-letra') {
        const n = Number(t.replace(/px$/, ''))
        if (Number.isNaN(n)) return numerosDeTexto(t)
        return n !== 0 && Math.abs(n) !== 1 ? [String(n)] : []
      }
      return numerosDeTexto(t)
    }

    function revisarPropiedad(node, tipo) {
      for (const hoja of hojas(node.value)) {
        marcarArbol(hoja)
        const texto = textoEstatico(hoja)
        if (texto == null) {
          // Plantilla con expresiones: se miran solo los trozos de texto
          // literal (`${n}px 13px` → el 13); lo que dependa de la expresión no
          // se marca. Un calc()/var()/env() en cualquier trozo la deja pasar
          // entera, y una sombra con partes dinámicas no es un valor estático.
          if (hoja.type !== 'TemplateLiteral' || tipo === 'sombra') continue
          const trozos = hoja.quasis.map((q) => q.value.cooked ?? '')
          if (trozos.some((t) => TOKEN_FUNC_RE.test(t))) continue
          hoja.quasis.forEach((q, i) => {
            const t = trozos[i].trim()
            if (PALABRAS_BLANCAS.has(t.toLowerCase())) return
            for (const v of valoresDe(tipo, t)) informar(q, tipo, v)
          })
          continue
        }
        const t = texto.trim()
        if (PALABRAS_BLANCAS.has(t.toLowerCase()) || TOKEN_FUNC_RE.test(t)) continue
        if (tipo === 'sombra') {
          // La sombra entera es el valor; sus colores van dentro y no se cuentan aparte.
          informar(hoja, tipo, t.replace(/\s+/g, ' '))
        } else {
          for (const v of valoresDe(tipo, t)) informar(hoja, tipo, v)
        }
      }
    }

    function revisarColores(node, texto) {
      if (typeof texto !== 'string') return
      for (const m of texto.matchAll(COLOR_RE)) informar(node, 'color', normalizarColor(m[0]))
    }

    return {
      Property(node) {
        const clave = node.key.type === 'Identifier' && !node.computed ? node.key.name : node.key.type === 'Literal' ? String(node.key.value) : null
        const tipo = clave && Object.hasOwn(TIPO_POR_PROPIEDAD, clave) ? TIPO_POR_PROPIEDAD[clave] : null
        if (tipo) revisarPropiedad(node, tipo)
      },
      Literal(node) {
        if (manejados.has(node) || typeof node.value !== 'string') return
        revisarColores(node, node.value)
      },
      TemplateElement(node) {
        if (manejados.has(node)) return
        revisarColores(node, node.value.cooked)
      },
    }
  },
}
