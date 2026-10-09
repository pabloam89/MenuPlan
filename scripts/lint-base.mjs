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
// Solo cuenta errores (severity 2) en `lint-base.json`. Los avisos de la regla
// `local/no-valor-suelto` (valores visuales fuera de los tokens) van aparte, en
// `lint-tokens-base.json`, por LISTA `fichero | tipo | valor` → cuenta (ver
// scripts/lib/sueltos-base.mjs). Es el MISMO recorrido de ESLint, no otro.
// Esa base solo puede bajar: `--actualizar` se niega a subirla. Por ahora un
// valor suelto nuevo se AVISA y no rompe el CI; `--estricto` lo hace fallar
// (se activa en el CI cuando se migre la primera pantalla). También se cuentan
// los `eslint-disable` de esa regla, que esconden valores sin dejar rastro.

import { ESLint } from 'eslint'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { ID_REGLA, RUTA_BASE, claveSuelto, compararSueltos, leerMensaje, totalDe } from './lib/sueltos-base.mjs'

const RAIZ = resolve(import.meta.dirname, '..')
const BASE = resolve(RAIZ, 'lint-base.json')
const BASE_TOKENS = resolve(RAIZ, RUTA_BASE)
const actualizar = process.argv.includes('--actualizar')
const estricto = process.argv.includes('--estricto')

// Solo la primera línea del mensaje: los de react-hooks traen debajo un trozo
// de código con números de línea, que cambian con cualquier edición.
const clave = (fichero, m) => `${fichero} | ${m.ruleId ?? 'sintaxis'} | ${m.message.split('\n')[0]}`

async function erroresActuales() {
  const eslint = new ESLint({ cwd: RAIZ })
  const resultados = await eslint.lintFiles(['.'])
  const cuenta = {}
  const sueltos = {}
  let disables = 0
  for (const r of resultados) {
    const fichero = relative(RAIZ, r.filePath).split('\\').join('/')
    disables += (r.suppressedMessages ?? []).filter((m) => m.ruleId === ID_REGLA).length
    for (const m of r.messages) {
      if (m.ruleId === ID_REGLA) {
        const v = leerMensaje(m.message)
        if (v) {
          const k = claveSuelto(fichero, v.tipo, v.valor)
          sueltos[k] = (sueltos[k] ?? 0) + 1
        }
        continue
      }
      if (m.severity !== 2) continue
      const k = clave(fichero, m)
      cuenta[k] = (cuenta[k] ?? 0) + 1
    }
  }
  return { cuenta, sueltos, disables }
}

const ordenar = (obj) => Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)))
const total = (obj) => Object.values(obj).reduce((s, n) => s + n, 0)

const { cuenta: actual, sueltos, disables } = await erroresActuales()
const base = existsSync(BASE) ? JSON.parse(readFileSync(BASE, 'utf8')) : {}

// ── Valores sueltos (regla local/no-valor-suelto) ──
const baseTokens = existsSync(BASE_TOKENS)
  ? JSON.parse(readFileSync(BASE_TOKENS, 'utf8'))
  : { eslintDisable: 0, sueltos: {} }
const comparacion = compararSueltos(sueltos, baseTokens.sueltos, (f) => existsSync(resolve(RAIZ, f)))
const disablesNuevos = disables > baseTokens.eslintDisable
const resumenTokens = () => {
  const lineas = [
    `Valores sueltos: ${totalDe(sueltos)} (base ${totalDe(baseTokens.sueltos)}), ` +
      `eslint-disable de la regla: ${disables} (base ${baseTokens.eslintDisable}).`,
  ]
  if (comparacion.nuevos.length || disablesNuevos) {
    lineas.push(`AVISO: la base de valores sueltos solo puede bajar${estricto ? '' : ' (aún no rompe el CI; --estricto sí)'}.`)
    lineas.push(...comparacion.nuevos.slice(0, 40).map(([k, n]) => `  + ${k}${n > 1 ? ` (×${n})` : ''}`))
    if (comparacion.nuevos.length > 40) lineas.push(`  … y ${comparacion.nuevos.length - 40} más`)
    if (disablesNuevos) lineas.push(`  + ${disables - baseTokens.eslintDisable} eslint-disable de ${ID_REGLA} nuevos`)
  } else if (comparacion.bajados > 0) {
    lineas.push(`Has bajado ${comparacion.bajados}: baja la base con --actualizar.`)
  }
  return lineas.join('\n')
}
const fallaTokens = estricto && (comparacion.nuevos.length > 0 || disablesNuevos)

const nuevos = Object.entries(actual)
  .filter(([k, n]) => n > (base[k] ?? 0))
  .map(([k, n]) => `  + ${k}${n - (base[k] ?? 0) > 1 ? ` (×${n - (base[k] ?? 0)})` : ''}`)

if (actualizar) {
  if (nuevos.length && existsSync(BASE)) {
    console.error('La línea base solo puede bajar. Arregla antes estos errores nuevos:')
    console.error(nuevos.join('\n'))
    process.exit(1)
  }
  if ((comparacion.nuevos.length || disablesNuevos) && existsSync(BASE_TOKENS)) {
    console.error('La línea base de valores sueltos solo puede bajar. Quita antes estos:')
    console.error(resumenTokens())
    process.exit(1)
  }
  writeFileSync(BASE, JSON.stringify(ordenar(actual), null, 2) + '\n')
  console.log(`lint-base.json: ${total(actual)} errores (antes ${total(base)}).`)
  writeFileSync(
    BASE_TOKENS,
    JSON.stringify({ eslintDisable: disables, sueltos: ordenar(sueltos) }, null, 2) + '\n',
  )
  console.log(`${RUTA_BASE}: ${totalDe(sueltos)} valores sueltos (antes ${totalDe(baseTokens.sueltos)}).`)
  process.exit(0)
}

console.log(resumenTokens())

if (nuevos.length) {
  console.error(`Errores de lint nuevos respecto a lint-base.json (${nuevos.length}):`)
  console.error(nuevos.join('\n'))
  console.error('\nArréglalos. Si son falsos positivos, coméntalo en el PR; la base no se sube.')
  process.exit(1)
}

const arreglados = total(base) - total(actual)
console.log(`Lint: sin errores nuevos (${total(actual)} en la base).` +
  (arreglados > 0 ? ` Has arreglado ${arreglados}: baja la base con --actualizar.` : ''))
if (fallaTokens) process.exit(1)
