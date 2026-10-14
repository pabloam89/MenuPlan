// Las cifras del pool de bibliotecas de interfaz (#780): fichas por rol y por elemento del alcance, y los problemas del test.
//
//   node scripts/diseno/bibliotecas.mjs           las cifras, una línea `campo: valor` por cifra
//   node scripts/diseno/bibliotecas.mjs --json    lo mismo en JSON
//   node scripts/diseno/bibliotecas.mjs --react 19.2   compatibles con esa versión de React (por defecto, la de package.json);
//                                                       sin valor o con otra forma que x.y, error y salida 2
//
// El dato es ops/diseno/bibliotecas.json y lo vigila ops/diseno/pool.test.js. Solo lee.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { agentesDe } from '../lib/agentes.mjs'
import { cifrasDeBibliotecas, leerBibliotecas, leerBloques, problemasDeBibliotecas, reactDePackage, validarReact } from '../lib/bibliotecasDiseno.mjs'
import { leerTaxonomia } from '../lib/taxonomiaDiseno.mjs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const datos = leerBibliotecas(RAIZ)
const i = process.argv.indexOf('--react')
let react
try {
  react = i > 0 ? validarReact(process.argv[i + 1]) : reactDePackage(RAIZ)
} catch (e) {
  console.error(`error: ${e.message}`)
  process.exit(2)
}
const cifras = cifrasDeBibliotecas(datos, new Date(), react)
const problemas = problemasDeBibliotecas(datos, leerTaxonomia(RAIZ), Object.keys(agentesDe(RAIZ)), leerBloques(RAIZ))

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ...cifras, problemas }, null, 2))
} else {
  console.log(`lectura: ${datos.lectura.fecha}`)
  console.log(`fichas: ${cifras.total}`)
  for (const [k, n] of Object.entries(cifras.por_rol)) console.log(`rol: ${k} fichas: ${n}`)
  for (const [k, n] of Object.entries(cifras.por_vinculo)) console.log(`vinculo: ${k} fichas: ${n}`)
  for (const [k, n] of Object.entries(cifras.por_mantenimiento)) console.log(`mantenimiento: ${k} fichas: ${n}`)
  for (const [e, c] of Object.entries(cifras.por_elemento)) console.log(`elemento: ${e} candidatas: ${c.candidatas} comprobadas: ${c.comprobadas} juicio: ${c.juicio}`)
  for (const [k, n] of Object.entries(cifras.por_requisito)) console.log(`requisito: ${k} fichas_vivas: ${n}`)
  console.log(`react: ${cifras.react ?? 'ninguna'} compatibles_con_ese_react: ${cifras.react_compatibles ?? 'n/a'}`)
  console.log(`neutrales_de_framework: ${cifras.neutrales_de_framework}`)
  console.log(`caducadas: ${cifras.caducadas}`)
  console.log(`problemas: ${problemas.length}`)
  for (const p of problemas) console.log(`  ${p}`)
}
process.exit(problemas.length ? 1 : 0)
