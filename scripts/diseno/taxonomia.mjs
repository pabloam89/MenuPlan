// Las cifras de la taxonomía de diseño (#776): tipos por vocabulario y por plataforma, y los problemas del test.
//
//   npm run taxonomia              las cifras, una línea `campo: valor` por cifra
//   npm run taxonomia -- --json    lo mismo en JSON
//
// El dato es ops/diseno/taxonomia.json y lo vigila ops/diseno/taxonomia.test.js. Solo lee.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { leerGlosario } from '../lib/glosario.mjs'
import { PLATAFORMAS, VOCABULARIOS_DE_TIPOS, cifrasDeTaxonomia, leerPerfiles, leerTaxonomia, problemasDeTaxonomia } from '../lib/taxonomiaDiseno.mjs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const datos = leerTaxonomia(RAIZ)
const cifras = cifrasDeTaxonomia(datos)
const problemas = problemasDeTaxonomia(datos, leerGlosario(RAIZ), leerPerfiles(RAIZ))

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ...cifras, problemas }, null, 2))
} else {
  console.log(`captura: ${datos.captura.fecha}`)
  console.log(`tipos: ${cifras.total}`)
  for (const v of Object.keys(VOCABULARIOS_DE_TIPOS)) console.log(`vocabulario: ${v} tipos: ${cifras.por_vocabulario[v]}`)
  for (const p of PLATAFORMAS) {
    const x = cifras.por_plataforma[p]
    console.log(`plataforma: ${p} tipos: ${x.total} pantallas: ${x.pantallas} elementos: ${x.elementos} flujos: ${x.flujos}`)
  }
  console.log(`fuera: ${cifras.fuera}`)
  console.log(`problemas: ${problemas.length}`)
  for (const p of problemas) console.log(`  ${p}`)
}
process.exit(problemas.length ? 1 : 0)
