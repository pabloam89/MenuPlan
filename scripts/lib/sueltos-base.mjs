// Línea base de valores sueltos (regla `local/no-valor-suelto`), por LISTA.
//
// Cada entrada es `fichero | tipo | valor literal` → cuenta. No es un recuento
// total porque ese se deja engañar: extraer `const GAP = 13` baja el contador
// sin tocar ningún token. Aquí cada valor sigue contando en su fichero.
//
// Renombrar o mover un fichero no es «empeorar»: lo que aparece en la ruta
// nueva se descuenta de lo que desapareció de rutas que YA NO EXISTEN con el
// mismo tipo y valor. Un valor suelto añadido de verdad sigue saliendo como
// nuevo.

export const RUTA_BASE = 'lint-tokens-base.json'
export const ID_REGLA = 'local/no-valor-suelto'

const MENSAJE_RE = /^Valor suelto \[([^\]]+)\] (.*): usa un token/s

/** `{ tipo, valor }` de un mensaje de la regla, o null si no es suyo. */
export function leerMensaje(mensaje) {
  const m = MENSAJE_RE.exec(mensaje)
  return m ? { tipo: m[1], valor: m[2] } : null
}

export const claveSuelto = (fichero, tipo, valor) => `${fichero} | ${tipo} | ${valor}`
const sinFichero = (clave) => clave.slice(clave.indexOf(' | ') + 3)
const ficheroDe = (clave) => clave.slice(0, clave.indexOf(' | '))

export const totalDe = (lista) => Object.values(lista).reduce((s, n) => s + n, 0)

/**
 * Compara lo medido con la base.
 * @param {Record<string, number>} actual
 * @param {Record<string, number>} base
 * @param {(fichero: string) => boolean} existe  si el fichero sigue en el repo
 * @returns {{ nuevos: [string, number][], bajados: number }}
 */
export function compararSueltos(actual, base, existe) {
  // Lo que desapareció de ficheros que ya no existen: crédito por tipo+valor.
  const credito = new Map()
  for (const [k, n] of Object.entries(base)) {
    if (existe(ficheroDe(k))) continue
    const resto = n - (actual[k] ?? 0)
    if (resto > 0) credito.set(sinFichero(k), (credito.get(sinFichero(k)) ?? 0) + resto)
  }
  const nuevos = []
  for (const [k, n] of Object.entries(actual)) {
    let exceso = n - (base[k] ?? 0)
    if (exceso <= 0) continue
    const tv = sinFichero(k)
    const usado = Math.min(exceso, credito.get(tv) ?? 0)
    if (usado) {
      credito.set(tv, credito.get(tv) - usado)
      exceso -= usado
    }
    if (exceso > 0) nuevos.push([k, exceso])
  }
  return { nuevos, bajados: Math.max(0, totalDe(base) - totalDe(actual)) }
}
