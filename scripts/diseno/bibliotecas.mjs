// Las cifras del pool de bibliotecas de interfaz (#780): fichas por rol y por elemento del alcance, y los problemas del test.
//
//   node scripts/diseno/bibliotecas.mjs           las cifras, una línea `campo: valor` por cifra
//   node scripts/diseno/bibliotecas.mjs --json    lo mismo en JSON
//
// El dato es ops/diseno/bibliotecas.json y lo vigila ops/diseno/pool.test.js. Solo lee.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { agentesDe } from '../lib/agentes.mjs'
import { cifrasDeBibliotecas, leerBibliotecas, problemasDeBibliotecas } from '../lib/bibliotecasDiseno.mjs'
import { leerTaxonomia } from '../lib/taxonomiaDiseno.mjs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const datos = leerBibliotecas(RAIZ)
const cifras = cifrasDeBibliotecas(datos)
const problemas = problemasDeBibliotecas(datos, leerTaxonomia(RAIZ), Object.keys(agentesDe(RAIZ)))

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
  console.log(`react_compatibles: ${cifras.react_compatibles}`)
  console.log(`neutrales_de_framework: ${cifras.neutrales_de_framework}`)
  console.log(`caducadas: ${cifras.caducadas}`)
  console.log(`problemas: ${problemas.length}`)
  for (const p of problemas) console.log(`  ${p}`)
}
process.exit(problemas.length ? 1 : 0)
