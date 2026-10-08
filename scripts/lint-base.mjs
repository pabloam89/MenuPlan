// Lint con línea base: falla solo si aparece un error NUEVO.
//
// Hoy el repo arrastra errores de lint viejos, así que `eslint .` a secas no
// puede bloquear el CI. Este script compara la LISTA de errores con
// `lint-base.json`, por fichero + regla + mensaje (sin línea, que se mueve
// con cualquier edición), y no el recuento total: un error nuevo que coincide
// con otro que desaparece no se cuela (CLAUDE.md, «Antes de commitear»).
//
//   node scripts/lint-base.mjs              compara; sale con 1 si hay nuevos
//   node scripts/lint-base.mjs --actualizar reescribe la línea base, que solo
//                                           puede bajar
//
// Solo cuenta errores (severity 2), no avisos.

import { ESLint } from 'eslint'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { relative, resolve } from 'node:path'

const RAIZ = resolve(import.meta.dirname, '..')
const BASE = resolve(RAIZ, 'lint-base.json')
const actualizar = process.argv.includes('--actualizar')

// Solo la primera línea del mensaje: los de react-hooks traen debajo un trozo
// de código con números de línea, que cambian con cualquier edición.
const clave = (fichero, m) => `${fichero} | ${m.ruleId ?? 'sintaxis'} | ${m.message.split('\n')[0]}`

async function erroresActuales() {
  const eslint = new ESLint({ cwd: RAIZ })
  const resultados = await eslint.lintFiles(['.'])
  const cuenta = {}
  for (const r of resultados) {
    const fichero = relative(RAIZ, r.filePath).split('\\').join('/')
    for (const m of r.messages) {
      if (m.severity !== 2) continue
      const k = clave(fichero, m)
      cuenta[k] = (cuenta[k] ?? 0) + 1
    }
  }
  return cuenta
}

const ordenar = (obj) => Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)))
const total = (obj) => Object.values(obj).reduce((s, n) => s + n, 0)

const actual = await erroresActuales()
const base = existsSync(BASE) ? JSON.parse(readFileSync(BASE, 'utf8')) : {}

const nuevos = Object.entries(actual)
  .filter(([k, n]) => n > (base[k] ?? 0))
  .map(([k, n]) => `  + ${k}${n - (base[k] ?? 0) > 1 ? ` (×${n - (base[k] ?? 0)})` : ''}`)

if (actualizar) {
  if (nuevos.length && existsSync(BASE)) {
    console.error('La línea base solo puede bajar. Arregla antes estos errores nuevos:')
    console.error(nuevos.join('\n'))
    process.exit(1)
  }
  writeFileSync(BASE, JSON.stringify(ordenar(actual), null, 2) + '\n')
  console.log(`lint-base.json: ${total(actual)} errores (antes ${total(base)}).`)
  process.exit(0)
}

if (nuevos.length) {
  console.error(`Errores de lint nuevos respecto a lint-base.json (${nuevos.length}):`)
  console.error(nuevos.join('\n'))
  console.error('\nArréglalos. Si son falsos positivos, coméntalo en el PR; la base no se sube.')
  process.exit(1)
}

const arreglados = total(base) - total(actual)
console.log(`Lint: sin errores nuevos (${total(actual)} en la base).` +
  (arreglados > 0 ? ` Has arreglado ${arreglados}: baja la base con --actualizar.` : ''))
