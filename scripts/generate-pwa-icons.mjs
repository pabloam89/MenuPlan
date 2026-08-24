// Genera los iconos de la PWA (public/pwa-icons/) a partir del logo en
// public/favicon.svg. Re-ejecutar este script si el logo cambia.
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(import.meta.dirname, '..')
const svgBuffer = fs.readFileSync(path.join(ROOT, 'public/favicon.svg'))
const outDir = path.join(ROOT, 'public/pwa-icons')
fs.mkdirSync(outDir, { recursive: true })

async function makeIcon(name, size, { background = { r: 0, g: 0, b: 0, alpha: 0 }, padPercent = 0.12 } = {}) {
  const contentSize = Math.round(size * (1 - padPercent * 2))
  const logo = await sharp(svgBuffer, { density: 384 })
    .resize(contentSize, contentSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer()
  await sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(path.join(outDir, name))
  console.log('generado', name)
}

// Iconos normales: fondo transparente, el propio mark ya tiene contraste.
await makeIcon('icon-192.png', 192, { padPercent: 0.12 })
await makeIcon('icon-512.png', 512, { padPercent: 0.12 })

// Maskable: Android recorta el icono con distintas formas (círculo, squircle...),
// así que el logo tiene que caber en la "safe zone" central — fondo opaco
// obligatorio y bastante más margen que en los iconos normales.
await makeIcon('icon-maskable-512.png', 512, {
  background: { r: 255, g: 255, b: 255, alpha: 1 },
  padPercent: 0.22,
})

// apple-touch-icon: iOS no soporta transparencia bien, y no usa maskable,
// así que fondo blanco con el margen normal.
await makeIcon('apple-touch-icon.png', 180, {
  background: { r: 255, g: 255, b: 255, alpha: 1 },
  padPercent: 0.14,
})
