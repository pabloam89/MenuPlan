// Refresca los datos medibles del pool de bibliotecas (#792) leyendo GitHub y npm.
//
//   node scripts/diseno/bibliotecas-refresco.mjs             ensayo: muestra el diff, no escribe
//   node scripts/diseno/bibliotecas-refresco.mjs --escribir  guarda en ops/diseno/bibliotecas.json
//   --raiz <carpeta>                                         lee y escribe el pool de otra carpeta (el test, una copia)
//
// Qué mide y qué nunca pisa: scripts/lib/bibliotecasRefresco.mjs. Usa GH_TOKEN o GITHUB_TOKEN si existen (sube el cupo de
// la API de GitHub; sin él son 60 lecturas por hora). Salida: líneas `campo: valor`. Cada lectura tiene un tope de tiempo;
// si GitHub da el límite de tasa, no se le vuelve a leer en esta pasada. Sale con 1 si hubo algún error de lectura, escriba
// o no (#814): lo que sí se leyó se guarda igual con --escribir.
import { writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { RUTA_BIBLIOTECAS, leerBibliotecas } from '../lib/bibliotecasDiseno.mjs'
import { errorDeLectura, lineasDeInforme, refrescarPool } from '../lib/bibliotecasRefresco.mjs'

const TOPE_MS = 15_000
const i = process.argv.indexOf('--raiz')
const RAIZ = i > 0 ? resolve(process.argv[i + 1] ?? '') : join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const escribir = process.argv.includes('--escribir')
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
let githubAgotado = false

async function leer(url) {
  const deGithub = url.startsWith('https://api.github.com/')
  if (deGithub && githubAgotado) throw new Error('límite de tasa agotado, no se lee')
  const cabeceras = { accept: 'application/json', 'user-agent': 'menuplan-bibliotecas-refresco' }
  if (token && deGithub) cabeceras.authorization = `Bearer ${token}`
  const pide = () => fetch(url, { headers: cabeceras, signal: AbortSignal.timeout(TOPE_MS) })
  let r = await pide()
  // Un token caducado da 401 aunque la lectura sea pública: se reintenta sin él.
  if (r.status === 401 && cabeceras.authorization) {
    delete cabeceras.authorization
    r = await pide()
  }
  if (!r.ok) {
    const e = errorDeLectura(r.status, r.statusText, r.headers)
    if (e.limite && deGithub) githubAgotado = true
    throw new Error(e.mensaje)
  }
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
process.exitCode = informe.some((e) => e.errores.length) ? 1 : 0
