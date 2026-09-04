// Genera el logo de HoMenu en un color concreto y en los tres formatos que
// suelen pedir fuera del código (ficha de tienda, prensa, presentaciones).
//
// Sale a brand/ y NO a public/ a propósito: todo lo que vive en public acaba
// en el precache del service worker, o sea que cada usuario se descargaría un
// PNG de 1024px que no va a ver nunca.
//
//   node scripts/generate-logo.mjs [color] [nombre]
//   node scripts/generate-logo.mjs "#0f766e" homenu-teal
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(import.meta.dirname, '..')
const SIZE = 1024

const color = process.argv[2] ?? '#0f766e'   // TEAL de la app (src/**: const TEAL)
const name = process.argv[3] ?? 'homenu-teal'

const src = fs.readFileSync(path.join(ROOT, 'public/logo-homenu.svg'), 'utf8')
// El logo es un único <path> con su fill; recolorear es cambiar ese fill.
const svg = src.replace(/fill="rgb\(\d+,\s*\d+,\s*\d+\)"/, `fill="${color}"`)
if (svg === src) throw new Error('No se encontró el fill del logo — ¿cambió public/logo-homenu.svg?')

const outDir = path.join(ROOT, 'brand')
fs.mkdirSync(outDir, { recursive: true })

const svgPath = path.join(outDir, `${name}.svg`)
fs.writeFileSync(svgPath, svg)
console.log('generado', path.relative(ROOT, svgPath))

const buf = Buffer.from(svg)

// PNG con fondo transparente: es el que sirve para casi todo.
await sharp(buf, { density: 384 })
  .resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(path.join(outDir, `${name}.png`))
console.log('generado', `brand/${name}.png`)

// JPEG no tiene transparencia, así que hay que elegir un fondo. Blanco: si
// fuera teal, el logo teal desaparecería.
await sharp(buf, { density: 384 })
  .resize(SIZE, SIZE, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
  .flatten({ background: '#ffffff' })
  .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
  .toFile(path.join(outDir, `${name}.jpg`))
console.log('generado', `brand/${name}.jpg`)
