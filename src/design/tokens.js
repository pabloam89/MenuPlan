/**
 * Tokens de HoMenu: la FUENTE ÚNICA de los valores visuales.
 *
 * JS puro y sin dependencias, para que lo lean a la vez la app (React), el
 * script que genera las variables CSS (`scripts/diseno/generar-tokens-css.mjs`),
 * el HTML exportado (`menuExport.js`, que no tiene CSS de la app) y los tests.
 *
 *   · `src/design/tokens.css` es una PROYECCIÓN generada de este fichero; un
 *     test falla si no coinciden. No se edita a mano.
 *   · Las tablas de valores de `DESIGN_SYSTEM.md` se COMPRUEBAN contra este
 *     fichero (`src/design/disenoDoc.test.js`); la prosa de criterio es a mano.
 *   · Los componentes usan solo ROLES (`marca`, `radio-control`…); los
 *     primitivos (valores crudos) no se importan fuera de aquí.
 *
 * Los 77 valores salen de `docs/diseno/ESTADO.md` («Tokens propuestos»), medidos
 * del código el 9 oct 2026: color 25 + tipografía 12 + espaciado 9 + radios 7 +
 * sombras 4 + capas 8 + movimiento 4 + tamaños 8. Los alias y los roles de
 * texto no suman: no añaden valor. Un token sin uso se borra; entra solo lo que
 * usan ≥ 3 sitios.
 *
 * Marcado PROVISIONAL = el documento lo dejaba «a decidir»; el valor sale de
 * lo más usado en el código y se confirma al migrar la primera pantalla.
 *
 * EXCEPCIÓN DECLARADA: las 8 `--pz-*` de `src/index.css` (tema oscuro de la
 * pizarra) NO se absorben. Son un tema con otro juego de colores, no roles del
 * tema claro; ESTADO.md dice que el modo oscuro no se construye ahora, y
 * moverlas cambiaría la pizarra sin ganar nada. Siguen donde están, con su
 * comentario.
 */

// ── Capa 1: primitivos (valores crudos; solo existen aquí) ───────────────────
export const primitivos = {
  'verde-700': '#2d5a3d',
  'verde-400': '#4cba6e',
  'verde-50': '#eaf6ee',
  'teal-700': '#0f766e',
  'teal-50': '#eef6f4',
  'salvia-950': '#142f1d',
  'salvia-700': '#42594c',
  'salvia-600': '#5a7066',
  'salvia-500': '#7a9485',
  'salvia-400': '#9ab0a1',
  'salvia-200': '#cdd8d0',
  'salvia-150': '#e0eae3',
  'salvia-100': '#eef3f0',
  'salvia-75': '#f0f4f1',
  'salvia-25': '#f5f9f6',
  blanco: '#ffffff',
  'rojo-700': '#c0392b',
  'rojo-50': '#fdecea',
  'rosa-600': '#e0405a',
  'ambar-700': '#b45309',
  'ambar-50': '#fff8e7',
  'azul-700': '#2f6d8a',
  // Derivado de `azul-700` con alfa .10: sin evidencia de un hex propio en el
  // código, no se inventa uno (ESTADO.md, «Color»).
  'azul-700-alfa10': 'rgba(47,109,138,.1)',
  'negro-alfa45': 'rgba(0,0,0,.45)',
  'blanco-alfa92': 'rgba(255,255,255,.92)',
}

// ── Capa 2: roles (lo único que usan los componentes) ────────────────────────
// rol → primitivo. Un hex pertenece a un solo rol.
const rolesColor = {
  marca: 'verde-700', // D1; favicon, theme-color y manifest ya lo usan
  'marca-viva': 'verde-400', // fin de degradado, «hecho»
  'marca-fondo': 'verde-50', // tinte verde: badge, nav seleccionado, éxito
  seleccionado: 'teal-700', // D1: SOLO lo elegido en lista, tesela u hoja
  'seleccionado-fondo': 'teal-50', // el tinte de lo elegido (uno solo)
  tinta: 'salvia-950', // título y texto de máximo contraste
  'tinta-media': 'salvia-700', // texto secundario oscuro
  'tinta-suave': 'salvia-600', // texto terciario
  'tinta-tenue': 'salvia-500', // metadatos
  'tinta-palida': 'salvia-400', // placeholder (D14) e icono inactivo
  superficie: 'blanco', // tarjetas, texto sobre marca
  'fondo-pantalla': 'salvia-25', // fondo de pantalla (unifica 4 casi idénticos)
  'fondo-suave': 'salvia-75', // pista de segmented, botón ghost
  'linea-suave': 'salvia-100', // separadores
  linea: 'salvia-150', // bordes de tarjeta
  'linea-fuerte': 'salvia-200', // checkbox, chevrons
  peligro: 'rojo-700', // acción destructiva y estado de error
  'peligro-fondo': 'rojo-50',
  favorito: 'rosa-600', // corazón activo
  aviso: 'ambar-700',
  'aviso-fondo': 'ambar-50',
  info: 'azul-700',
  'info-fondo': 'azul-700-alfa10',
  scrim: 'negro-alfa45', // modal
  velo: 'blanco-alfa92', // cristal sobre imagen
}

/** Alias sin valor propio (no suman a los 77). */
export const alias = {
  // Zona social: el teal como acento (D11, opción A). Mismo primitivo.
  acento: 'seleccionado',
}

/** `exito` no es un color: es texto `marca` sobre `marca-fondo`. */
export const exito = { texto: 'marca', fondo: 'marca-fondo' }

export const color = Object.fromEntries(
  Object.entries(rolesColor).map(([rol, prim]) => {
    if (!(prim in primitivos)) throw new Error(`tokens: el rol «${rol}» apunta a un primitivo que no existe: ${prim}`)
    return [rol, primitivos[prim]]
  }),
)

// ── Tipografía (12 valores: familia + 8 pasos + 3 pesos) ─────────────────────
export const tipografia = {
  familia: "'DM Sans', 'Helvetica Neue', sans-serif", // Playfair Display (×5) sale o se decide
  'paso-10': 10,
  'paso-11': 11,
  'paso-12': 12,
  'paso-13': 13,
  'paso-14': 14,
  'paso-16': 16,
  'paso-20': 20,
  'paso-26': 26,
  'peso-700': 700,
  'peso-800': 800,
  'peso-900': 900,
}

/**
 * Roles de texto (no suman a los 77): combinan los valores anteriores.
 * PROVISIONAL el interlineado: elegido entre los más usados en el código
 * (`lineHeight` 1.45 ×38, 1 ×37, 1.25 ×35, 1.2 ×34, medido el 9 oct 2026); el
 * peso y el tamaño salen de `DESIGN_SYSTEM.md` §2.1. Se confirma al migrar.
 */
export const textos = {
  titulo: { tam: 'paso-26', peso: 'peso-900', interlineado: 1.2 },
  cuerpo: { tam: 'paso-14', peso: 'peso-700', interlineado: 1.45 },
  etiqueta: { tam: 'paso-11', peso: 'peso-800', interlineado: 1.25 },
  mini: { tam: 'paso-10', peso: 'peso-800', interlineado: 1 },
}

// ── Espaciado (9 valores) ────────────────────────────────────────────────────
// Múltiplos de 4 con dos excepciones declaradas: 2 y 6 (467 usos de gap y
// padding/margin hoy).
export const espaciado = {
  'esp-2': 2,
  'esp-4': 4,
  'esp-6': 6,
  'esp-8': 8,
  'esp-12': 12,
  'esp-16': 16,
  'esp-20': 20,
  'esp-24': 24,
  'esp-32': 32,
}

/**
 * Roles de espaciado (no suman). PROVISIONAL: ESTADO.md los dejaba sin medir.
 *  · margen-pantalla = 16: el padding horizontal más repetido de tarjetas y
 *    listas es 14 o 16 (`padding: "12px 14px"` ×15, `"12px 16px"` ×10); se
 *    elige 16 por estar en la escala.
 *  · separacion-lista = 8: `gap: 8` es el más usado (×235).
 */
export const rolesEspaciado = {
  'margen-pantalla': 'esp-16',
  'separacion-lista': 'esp-8',
}

// ── Radios (7 valores) ───────────────────────────────────────────────────────
export const radio = {
  'radio-mini': 4,
  'radio-chico': 8,
  'radio-control': 12, // botones e inputs
  'radio-tarjeta': 16,
  'radio-panel': 20, // esquinas altas de hoja (20 20 0 0)
  'radio-modal': 26, // tarjeta de WizardSheet
  'radio-pildora': 999, // toggles, avatares, dots, pills
}

// ── Sombras (4 valores): niveles 0–3 ─────────────────────────────────────────
// Las de DESIGN_SYSTEM.md §4. Las dos primeras van tintadas de verde; las
// flotantes y modales, en negro (overlays).
export const sombra = {
  'sombra-0': '0 1px 3px rgba(20,47,29,.05)',
  'sombra-1': '0 6px 16px -12px rgba(20,47,29,.3)',
  'sombra-2': '0 6px 20px rgba(0,0,0,.12)',
  'sombra-3': '0 24px 60px rgba(0,0,0,.25)',
}

// ── Capas (8 valores) ────────────────────────────────────────────────────────
// Regla: el toast va por encima de toda hoja (≥ capa-hoja-2). `capa-local` es
// el tope del 1–5 de contenido (cabeceras pegajosas dentro de una hoja).
export const capa = {
  'capa-local': 5,
  'capa-nav': 100,
  'capa-flotante': 150,
  'capa-hoja': 300,
  'capa-hoja-2': 320, // hoja sobre hoja (FollowListSheet, ReportSheet…)
  'capa-toast': 330,
  'capa-emergente': 1000,
  'capa-tutorial': 1200,
}

// ── Movimiento (4 valores) ───────────────────────────────────────────────────
// `prefers-reduced-motion` se respeta por defecto (ver el CSS generado).
export const movimiento = {
  'mov-rapida': '.15s',
  'mov-media': '.22s',
  'mov-lenta': '.35s',
  'mov-curva': 'cubic-bezier(.4,0,.2,1)',
}

/** Duración a la que caen las tres duraciones con `prefers-reduced-motion`. */
export const movimientoReducido = '.01s'

// ── Tamaños (8 valores) ──────────────────────────────────────────────────────
export const tamano = {
  'tam-tactil': 40, // área táctil mínima, independiente del tamaño visual
  'tam-icono-14': 14,
  'tam-icono-16': 16,
  'tam-icono-18': 18,
  'tam-icono-20': 20,
  'tam-icono-24': 24,
  'tam-columna': 420, // APP_SHELL_MAX_WIDTH
  'tam-nav': 80, // BOTTOM_NAV_HEIGHT (más safe-area, que es env() y no un valor)
}

/** Todas las familias de valores, en el orden del documento. */
export const familias = { color, tipografia, espaciado, radio, sombra, capa, movimiento, tamano }

// Cómo se nombra y escribe cada familia en CSS.
const CSS = {
  color: { nombre: (n) => `color-${n}`, valor: (v) => v },
  tipografia: {
    nombre: (n) => `tipo-${n}`,
    valor: (v, n) => (n.startsWith('paso-') ? `${v}px` : String(v)),
  },
  espaciado: { nombre: (n) => n, valor: (v) => `${v}px` },
  radio: { nombre: (n) => n, valor: (v) => `${v}px` },
  sombra: { nombre: (n) => n, valor: (v) => v },
  capa: { nombre: (n) => n, valor: (v) => String(v) },
  movimiento: { nombre: (n) => n, valor: (v) => v },
  tamano: { nombre: (n) => n, valor: (v) => `${v}px` },
}

/**
 * Los 77 valores en plano: `{ familia, nombre, valor, variable, css }`.
 * `valor` es el texto que lleva la tabla de DESIGN_SYSTEM.md.
 */
export function valoresPlanos() {
  const filas = []
  for (const [fam, tabla] of Object.entries(familias)) {
    for (const [nombre, valor] of Object.entries(tabla)) {
      filas.push({
        familia: fam,
        nombre,
        valor: String(valor),
        variable: `--${CSS[fam].nombre(nombre)}`,
        css: CSS[fam].valor(valor, nombre),
      })
    }
  }
  return filas
}

/**
 * Las variables de los roles de texto y de espaciado y los alias (no suman a
 * los 77): `[variable, css]`.
 */
export function variablesDeRoles() {
  const out = []
  for (const [rol, t] of Object.entries(textos)) {
    out.push([`--texto-${rol}-tam`, `${tipografia[t.tam]}px`])
    out.push([`--texto-${rol}-peso`, String(tipografia[t.peso])])
    out.push([`--texto-${rol}-interlineado`, String(t.interlineado)])
  }
  for (const [rol, esp] of Object.entries(rolesEspaciado)) out.push([`--${rol}`, `${espaciado[esp]}px`])
  for (const [a, destino] of Object.entries(alias)) out.push([`--color-${a}`, `var(--color-${destino})`])
  return out
}
