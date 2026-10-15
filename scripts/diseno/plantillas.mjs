// Las cifras de las plantillas de componente (#842): plantillas frente a elementos de la taxonomía, partes y atributos de
// cada tipo, y los problemas del test.
//
//   node scripts/diseno/plantillas.mjs           las cifras, una línea `campo: valor` por cifra
//   node scripts/diseno/plantillas.mjs --json    lo mismo en JSON
//
// El dato es ops/diseno/plantillas-componente.json y lo vigila ops/diseno/plantillas-componente.test.js. Solo lee.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { leerBibliotecas, leerBloques } from '../lib/bibliotecasDiseno.mjs'
import { cifrasDePlantillas, leerPlantillas, problemasDePlantillas } from '../lib/plantillasComponente.mjs'
import { leerTaxonomia } from '../lib/taxonomiaDiseno.mjs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const datos = leerPlantillas(RAIZ)
const taxonomia = leerTaxonomia(RAIZ)
const cifras = cifrasDePlantillas(datos, taxonomia)
const problemas = problemasDePlantillas(datos, taxonomia, leerBloques(RAIZ), leerBibliotecas(RAIZ))

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ...cifras, problemas }, null, 2))
} else {
  console.log(`plantillas: ${cifras.plantillas} elementos_de_la_taxonomia: ${cifras.elementos}`)
  console.log(`firmas_distintas: ${cifras.firmas_distintas}`)
  console.log(`atributos_de_forma: ${cifras.atributos_de_forma} partes_del_vocabulario: ${cifras.partes_del_vocabulario}`)
  for (const [k, n] of Object.entries(cifras.por_interaccion)) console.log(`interaccion: ${k} plantillas: ${n}`)
  for (const [k, n] of Object.entries(cifras.por_categoria)) console.log(`categoria: ${k} plantillas: ${n}`)
  for (const [e, c] of Object.entries(cifras.por_plantilla)) console.log(`elemento: ${e} partes: ${c.partes} obligatorias: ${c.obligatorias} atributos: ${c.atributos} visuales: ${c.visuales} estados: ${c.estados}`)
  console.log(`problemas: ${problemas.length}`)
  for (const p of problemas) console.log(`  ${p}`)
}
process.exit(problemas.length ? 1 : 0)
