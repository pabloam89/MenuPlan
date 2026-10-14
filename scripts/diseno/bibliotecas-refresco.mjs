// Refresca los datos medibles del pool de bibliotecas (#792) leyendo GitHub y npm.
//
//   node scripts/diseno/bibliotecas-refresco.mjs             ensayo: muestra el diff, no escribe
//   node scripts/diseno/bibliotecas-refresco.mjs --escribir  guarda en ops/diseno/bibliotecas.json
//
// Qué mide y qué nunca pisa: scripts/lib/bibliotecasRefresco.mjs. Usa GH_TOKEN o GITHUB_TOKEN si existen (sube el cupo de
// la API de GitHub; sin él son 60 lecturas por hora). Salida: líneas `campo: valor`.
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { RUTA_BIBLIOTECAS, leerBibliotecas } from '../lib/bibliotecasDiseno.mjs'
import { lineasDeInforme, refrescarPool } from '../lib/bibliotecasRefresco.mjs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const escribir = process.argv.includes('--escribir')
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN

async function leer(url) {
  const cabeceras = { accept: 'application/json', 'user-agent': 'menuplan-bibliotecas-refresco' }
  if (token && url.startsWith('https://api.github.com/')) cabeceras.authorization = `Bearer ${token}`
  let r = await fetch(url, { headers: cabeceras })
  // Un token caducado da 401 aunque la lectura sea pública: se reintenta sin él.
  if (r.status === 401 && cabeceras.authorization) {
    delete cabeceras.authorization
    r = await fetch(url, { headers: cabeceras })
  }
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json()
}

const datos = leerBibliotecas(RAIZ)
const { datos: nuevos, informe } = await refrescarPool(datos, leer)
for (const l of lineasDeInforme(informe)) console.log(l)
const hayCambios = informe.some((e) => e.cambios.length)
if (escribir && hayCambios) {
  writeFileSync(join(RAIZ, RUTA_BIBLIOTECAS), `${JSON.stringify(nuevos, null, 2)}\n`)
  console.log(`escrito: ${RUTA_BIBLIOTECAS}`)
} else {
  console.log(escribir ? 'escrito: nada (sin cambios)' : 'ensayo: no se ha escrito nada (--escribir para guardar)')
}
