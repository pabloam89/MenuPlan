# Medios: dónde vive cada foto, ilustración y vídeo

Regla 3-2-1: todo lo que costó dinero o trabajo tiene **tres copias, en dos
sitios, una fuera del ordenador**. Ningún medio va en git, y ninguno vive en
OneDrive (el repo salió de OneDrive el 8 oct 2026: sincronizar los ficheros
que leen los tests saturaba el disco).

## Las cuatro clases

| Clase | Qué es | Se puede tirar | Copias |
|---|---|---|---|
| **Publicado** | Lo que ve el usuario en la app | Nunca | Almacén de la app (Supabase Storage / Vercel Blob) + Drive |
| **De pago** | Salió de un servicio que se paga: fotos de Gemini, ilustraciones de Midjourney, modelos de Tripo | Nunca, aunque «se pueda regenerar»: regenerar cuesta dinero y no sale igual | Drive + bucket con versiones (R2/B2) + `C:\dev` |
| **Trabajo propio** | Hecho a mano o con esfuerzo: tickets sintéticos, feedback de UX, renders de vídeo | Nunca sin preguntar | Drive + `C:\dev` |
| **Se rehace gratis** | Sale igual de un comando sin coste: build, `core.mjs`, datos públicos descargables (CIQUAL, USDA) | Sí | Ninguna |

Ante la duda, no es «se rehace gratis».

## Inventario (8 oct 2026, ~8 GB, en `C:\dev\MenuPlan`)

| Carpeta | Contenido | Clase |
|---|---|---|
| `scripts/test-photos/` | 1.814 PNG, pruebas de foto por receta (Gemini) | De pago |
| `scripts/prompt-test/` | 23 PNG, pruebas de prompt | De pago |
| `dish-gallery/review/` | 1.611 JPG, galería de revisión de fotos | De pago |
| `output/dishes/` | 2.505 JPG, fotos de platos generadas | De pago |
| `public/dishes/` | fotos que se sirven en el bundle | Publicado |
| `Avatares/` (`cards`, `3d`, `animaciones`) | ilustraciones Midjourney, 3D de Tripo (`.fbx`, `.glb`) | De pago (14 cards están en git) |
| `public/avatares/` | avatares que se sirven | Publicado |
| `out/video/` | 20 MP4 y 244 PNG de Remotion | Trabajo propio |
| `Tickets Compra Sintéticos/`, `ux feedback/` | tickets de prueba, PDF de feedback | Trabajo propio |
| `output/ciqual/`, `output/usda/` | tablas públicas de nutrición | Se rehace gratis |

## Dónde van las copias

- **Drive compartido de Google Workspace** (`menuplanai.com`), «MenuPlan Medios»,
  con la misma estructura de carpetas. Es de la empresa, no de una cuenta
  personal.
- **Bucket con versiones** (Cloudflare R2 o Backblaze B2) solo para lo de
  pago, con bloqueo de borrado.
- **`C:\dev\MenuPlan`**: la copia de trabajo que usan los scripts.

Se sube y se comprueba con `rclone` (`rclone copy` y después `rclone check`,
que compara sumas de control). Nunca `rclone sync` hacia el Drive o el bucket:
`sync` borra en el destino lo que falta en el origen.

## Reglas para las sesiones

- Un medio nuevo de pago se sube a las copias el mismo día.
- Nunca borrar una carpeta de medios: si estorba, se mueve.
- Un script que genera medios escribe en su carpeta de esta tabla, nunca en
  `src/` ni en la raíz.
