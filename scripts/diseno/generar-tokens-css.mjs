// Genera `src/design/tokens.css` a partir de `src/design/tokens.js`.
//
// Los tokens son la fuente; el CSS es su proyección. Un test
// (`src/design/tokensCss.test.js`) falla si el fichero versionado no coincide
// con lo que sale de aquí.
//
//   node scripts/diseno/generar-tokens-css.mjs            escribe el fichero
//   node scripts/diseno/generar-tokens-css.mjs --comprobar  sale con 1 si difiere
//
// Nadie usa todavía estas variables: definirlas no cambia ningún píxel.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { movimientoReducido, valoresPlanos, variablesDeRoles } from '../../src/design/tokens.js'

const SALIDA = resolve(import.meta.dirname, '../../src/design/tokens.css')

export function generarCss() {
  const lineas = []
  let familia = null
  for (const v of valoresPlanos()) {
    if (v.familia !== familia) {
      if (familia) lineas.push('')
      lineas.push(`  /* ${v.familia} */`)
      familia = v.familia
    }
    lineas.push(`  ${v.variable}: ${v.css};`)
  }
  lineas.push('', '  /* roles de texto y de espaciado, y alias */')
  for (const [variable, css] of variablesDeRoles()) lineas.push(`  ${variable}: ${css};`)

  const reducido = valoresPlanos()
    .filter((v) => v.familia === 'movimiento' && v.nombre !== 'mov-curva')
    .map((v) => `    ${v.variable}: ${movimientoReducido};`)

  return `/* GENERADO por scripts/diseno/generar-tokens-css.mjs desde src/design/tokens.js.
   No se edita a mano: cambia el token y ejecuta \`npm run tokens:css\`.
   Las --pz-* de la pizarra (index.css) son una excepción declarada. */
:root {
${lineas.join('\n')}
}

/* prefers-reduced-motion respetado por defecto: las duraciones caen a un fade. */
@media (prefers-reduced-motion: reduce) {
  :root {
${reducido.join('\n')}
  }
}
`
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const css = generarCss()
  if (process.argv.includes('--comprobar')) {
    const actual = existsSync(SALIDA) ? readFileSync(SALIDA, 'utf8') : ''
    if (actual !== css) {
      console.error('src/design/tokens.css no coincide con los tokens. Ejecuta: npm run tokens:css')
      process.exit(1)
    }
    console.log('tokens.css al día.')
  } else {
    writeFileSync(SALIDA, css)
    console.log(`tokens.css escrito (${css.split('\n').length} líneas).`)
  }
}
