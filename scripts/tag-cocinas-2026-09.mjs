#!/usr/bin/env node
/**
 * Pone el campo `cocina` a recetas que YA estaban en el catálogo sin él.
 *
 * De 980 recetas solo 159 tenían cocina, así que antes de escribir platos
 * nuevos había que mirar si el hueco era de recetas o de etiquetas. Era de
 * etiquetas en buena parte: la francesa tenía magrets, bullabesa, sopa de
 * cebolla, vichyssoise, croque monsieur, tatin y profiteroles sin marcar.
 *
 * Esto vale el doble que escribir recetas nuevas: estas ya son `estrella` y ya
 * tienen foto, así que entran en el generador el mismo día que se etiquetan.
 *
 * Se listan por NOMBRE EXACTO y no por palabra clave a propósito. Buscar por
 * palabra clave fue lo que encontró las candidatas, pero también dijo que
 * "croquetas de jamón" era croque monsieur, que "Ternera Stroganoff" era rogan
 * josh y que nueve tortitas de verdura eran pancakes. Una lista cerrada no
 * puede equivocarse sola cuando alguien añada recetas nuevas.
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RECIPES_DIR = join(ROOT, 'src', 'data', 'recipes')

const COCINAS = {
  francesa: [
    'Magret de pato con salsa de frutos rojos',
    'Magret de pato con puré de boniato y reducción de frutos rojos',
    'Bullabesa ligera de pescado',
    'Sopa de cebolla',
    'Sopa de cebolla gratinada',
    'Sopa de cebolla con queso gratinado y jamón',
    'Vichyssoise',
    'Vichyssoise de puerro y manzana',
    'Vichyssoise de coliflor',
    'Vichyssoise con crujiente de jamón',
    'Gratín dauphinois (patatas gratinadas con nata)',
    'Croque monsieur rápido',
    'Steak tartare de ternera',
    'Solomillo Café de París',
    'Tarta Tatin de manzana caramelizada',
    'Mousse de chocolate',
    'Profiteroles con chocolate caliente',
    'Crepes de pera en tiras',
  ],
  americana: [
    'Costillas BBQ con salsa casera ahumada',
    'Costillas glaseadas con puré de boniato y salsa barbacoa',
    'Pastel de carne con puré gratinado',
    'Tortitas americanas con sirope y frutos rojos',
    'Brownie de chocolate con nueces',
    'Cookies rellenas de chocolate fundente',
  ],
}

// Nombres que la búsqueda por palabra clave propuso y se descartan a mano, para
// que quede escrito POR QUÉ y nadie los "recupere" en la siguiente pasada.
const DESCARTADOS = {
  'Coliflor gratinada con bechamel': 'la bechamel es francesa, el plato es de casa española',
  'Endivias gratinadas con jamón y bechamel': 'igual que la anterior',
  'Huevos con jamón y bechamel gratinados': 'igual que la anterior',
  'Huevos a la Florentina con espinacas y bechamel': 'florentina es italiana, no francesa',
  Bechamel: 'salsa base, no plato de una cocina',
  'Salsa holandesa': 'salsa base; sus platos (benedictinos) ya están etiquetados',
  'Mini quiche sin masa de brócoli': 'variante ligera, no receta francesa canónica',
  'Mini hamburguesa de merluza y guisantes': 'hamburguesa infantil, no cocina americana',
  'Mini hamburguesa de pollo y calabacín': 'idem',
  'Hamburguesa de garbanzos y zanahoria': 'hamburguesa vegetal, no cocina americana',
  'Tortitas de brócoli y requesón': 'tortita de verdura, no pancake',
  'Tortitas de guisantes y aguacate': 'idem',
  'Tortitas de avena y plátano': 'idem',
  'Tortitas de calabacín y queso fresco': 'idem',
  'Tortitas de calabaza y canela': 'idem',
  'Tortitas de maíz y pavo': 'idem',
  'Tortitas de lenteja roja y zanahoria': 'idem',
  'Tortitas saladas de calabacín rallado': 'idem',
  'Muffins de patata y champiñón': 'muffin salado de verdura',
  'Muffins de plátano y avena': 'bizcocho de desayuno, no repostería americana',
  'Tortilla wrap de atún': 'wrap genérico',
  'Tortilla wrap de atún y maíz': 'idem',
  'Wrap de pollo': 'idem',
}

const buscados = new Map()
for (const [cocina, nombres] of Object.entries(COCINAS)) {
  for (const nombre of nombres) buscados.set(nombre, cocina)
}

const aplicados = []
const yaTenian = []

for (const file of readdirSync(RECIPES_DIR)) {
  if (!file.endsWith('.json')) continue
  const path = join(RECIPES_DIR, file)
  const recetas = JSON.parse(readFileSync(path, 'utf8'))
  let tocado = false

  for (const receta of recetas) {
    const cocina = buscados.get(receta.name)
    if (!cocina) continue
    if (receta.cocina) {
      yaTenian.push(`${receta.name} (ya era ${receta.cocina})`)
      continue
    }
    receta.cocina = cocina
    aplicados.push(`${cocina.padEnd(10)} ${receta.name}${receta.estrella ? ' ★' : ''}`)
    tocado = true
  }

  if (tocado) writeFileSync(path, `${JSON.stringify(recetas, null, 2)}\n`, 'utf8')
}

const noEncontrados = [...buscados.keys()].filter(
  (n) => !aplicados.some((a) => a.endsWith(n) || a.endsWith(`${n} ★`)) && !yaTenian.some((y) => y.startsWith(n)),
)

console.log(`Etiquetadas ${aplicados.length} recetas:`)
aplicados.forEach((a) => console.log('  ', a))
if (yaTenian.length) {
  console.log(`\nYa tenían cocina (${yaTenian.length}):`)
  yaTenian.forEach((y) => console.log('  ', y))
}
if (noEncontrados.length) {
  console.log(`\n⚠ No encontradas por nombre exacto (${noEncontrados.length}) — revisar:`)
  noEncontrados.forEach((n) => console.log('  ', n))
}
console.log(`\nDescartadas a mano: ${Object.keys(DESCARTADOS).length} (ver DESCARTADOS en este fichero).`)
