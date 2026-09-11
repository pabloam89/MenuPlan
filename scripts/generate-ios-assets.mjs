// Genera el icono y la pantalla de inicio de la app iOS (Capacitor) a partir
// de brand/homenu-teal-ios.svg. Re-ejecutar este script si el logo cambia.
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(import.meta.dirname, '..')
const svgBuffer = fs.readFileSync(path.join(ROOT, 'brand/homenu-teal-ios.svg'))
const assets = path.join(ROOT, 'ios/App/App/Assets.xcassets')
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 }

async function makeImage(file, size, padPercent) {
  const contentSize = Math.round(size * (1 - padPercent * 2))
  // Densidad justa para rasterizar el SVG (viewBox de ~1000 unidades) al
  // tamaño final: una fija muy alta revienta el límite de píxeles en el splash.
  const density = Math.ceil((72 * contentSize) / 1000) + 1
  const logo = await sharp(svgBuffer, { density })
    .resize(contentSize, contentSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer()
  await sharp({ create: { width: size, height: size, channels: 4, background: WHITE } })
    .composite([{ input: logo, gravity: 'center' }])
    // App Store Connect rechaza iconos con canal alfa: se aplana a RGB.
    .flatten({ background: WHITE })
    .removeAlpha()
    .png()
    .toFile(path.join(assets, file))
  console.log('generado', file)
}

// Icono: 1024×1024 opaco. iOS ya redondea las esquinas, no hay que hacerlo aquí.
await makeImage('AppIcon.appiconset/AppIcon-512@2x.png', 1024, 0.16)

// Splash: el storyboard lo escala con "aspect fill", así que en un iPhone solo
// se ve la franja central del cuadrado — de ahí el margen tan grande.
for (const file of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  await makeImage(`Splash.imageset/${file}`, 2732, 0.4)
}
