# HoMenu · Sistema de Diseño de UI

> Skill de diseño extraída del código real de la app (`src/index.css`, `src/components/ui.jsx`, `src/screens/*`).
> Sirve como guía para que cualquier pantalla o componente nuevo **se sienta parte de la misma app**.
> Filosofía: **mobile-first**, estética *fresh / natural food*, verde bosque como color rector, tipografía redonda, tarjetas blancas sobre fondos verdosos muy claros, mucho aire, esquinas redondeadas y microinteracciones sutiles.
>
> **Una sola fuente para los valores: `src/design/tokens.js`.** Las tablas marcadas con `<!-- tokens:… -->` se comprueban con un test (`src/design/disenoDoc.test.js`) contra los tokens; si una tabla y los tokens discrepan, falla. Las variables CSS (`src/design/tokens.css`) se generan de los tokens (`npm run tokens:css`). La prosa de criterio, la voz y los componentes se escriben aquí a mano. Estado, decisiones y orden de migración: `docs/diseno/ESTADO.md`.
> Los hex y medidas de las secciones 6 en adelante describen cómo está hoy cada componente; al migrarlo se sustituyen por el token de su rol.

---

## 0. Principios rectores

1. **Todo es inline styles** (objetos `style={{}}` en JSX). No hay Tailwind ni CSS Modules; el CSS global (`index.css`) solo cubre reset, fuentes, animaciones keyframe y parches de inputs. Los estilos reutilizables se factorizan como **constantes de objeto** (`const pageTitle = {...}`) o **componentes** en `components/ui.jsx`.
2. **Contenedor de app estrecho**: la UI vive en una columna de **máx. 420px** centrada (`APP_SHELL_MAX_WIDTH = 420`). Diseñar siempre para móvil.
3. **Verde = marca y acción; teal = lo elegido.** El verde bosque (`marca`) es el color del botón primario y de los controles de estado (chip activo, toggle, segmented, nav). Lo **elegido** en una lista, tesela u hoja de elección se marca en `seleccionado` (teal, D1) con su tinte `seleccionado-fondo`. Lo demás es neutro y silencioso.
4. **Blanco sobre verde muy claro.** El fondo de página es `fondo-pantalla` (un verde casi blanco, uno solo); las tarjetas son `superficie` (blanco puro). Nunca blanco sobre blanco: si un panel es blanco, el fondo debe tintarse (ej. `WizardSheet`) para que las tarjetas destaquen.
5. **Jerarquía por peso, no por tamaño.** Se usan pesos muy altos (700/800/900) para jerarquizar; los tamaños se mueven poco (10–26px, los 8 pasos de §2).
6. **Redondez en todo.** Radios generosos; los elementos "atómicos" (toggles, avatares, dots, pills) son totalmente circulares (`radio-pildora`).
7. **Microinteracciones discretas.** Transiciones de `mov-rapida` a `mov-media`, `scale(.97)` al pulsar, animaciones respetando `prefers-reduced-motion`.
8. **Iconografía única: Nucleo (core / outline / 24px).** Nunca mezclar familias de iconos.

---

## 1. Color

### 1.1 Roles de color (25)

Los componentes usan **roles**, nunca el hex. Un hex pertenece a un solo rol. Los casi idénticos de hoy (cuatro fondos de pantalla, tres tintas oscuras…) se funden en el rol al migrar cada pantalla (`docs/diseno/ESTADO.md`).

<!-- tokens:color -->
| Rol | Valor | Uso |
|---|---|---|
| `marca` | `#2d5a3d` | Botón primario, controles de estado activos (chip, toggle, segmented, nav), iconos activos, texto de marca |
| `marca-viva` | `#4cba6e` | Fin de degradados, estado "hecho" |
| `marca-fondo` | `#eaf6ee` | Tinte verde: badge, nav seleccionado, éxito |
| `seleccionado` | `#0f766e` | Lo elegido en una lista, tesela u hoja de elección (borde, check). En la zona social, alias `acento` |
| `seleccionado-fondo` | `#eef6f4` | El tinte de lo elegido (uno solo) |
| `tinta` | `#142f1d` | Títulos y texto de máximo contraste; fondo del toast |
| `tinta-media` | `#42594c` | Texto secundario oscuro |
| `tinta-suave` | `#5a7066` | Texto terciario; color por defecto de categoría |
| `tinta-tenue` | `#7a9485` | Texto atenuado y metadatos |
| `tinta-palida` | `#9ab0a1` | Placeholder de inputs (D14), icono inactivo |
| `superficie` | `#ffffff` | Tarjetas, filas, inputs, texto sobre `marca` |
| `fondo-pantalla` | `#f5f9f6` | Fondo de cada pantalla |
| `fondo-suave` | `#f0f4f1` | Pista de segmented, botón-icono ghost |
| `linea-suave` | `#eef3f0` | Separadores y filas |
| `linea` | `#e0eae3` | Bordes de tarjeta |
| `linea-fuerte` | `#cdd8d0` | Checkbox, chevrons |
| `peligro` | `#c0392b` | Texto/acción destructiva y estado de error |
| `peligro-fondo` | `#fdecea` | Tinte de peligro |
| `favorito` | `#e0405a` | Corazón activo |
| `aviso` | `#b45309` | Atención |
| `aviso-fondo` | `#fff8e7` | Tinte de aviso |
| `info` | `#2f6d8a` | Información |
| `info-fondo` | `rgba(47,109,138,.1)` | Tinte de info (derivado de `info`, alfa .10) |
| `scrim` | `rgba(0,0,0,.45)` | Fondo de modal |
| `velo` | `rgba(255,255,255,.92)` | Cristal sobre imagen |

Alias sin valor propio: `acento` = `seleccionado`; `exito` = texto `marca` sobre `marca-fondo` (no hay color de éxito propio).

**Selección (D1, D11):** `seleccionado` marca solo lo **elegido** (borde, check y su tinte `seleccionado-fondo`). Los controles de estado y de acción —`Chip` activo, `Toggle`, `Segmented`, `BottomNav`, botón primario y CTA— van en `marca`. El teal en la zona social es el rol `acento`.

**Fuera del sistema** (se deciden al migrar la pantalla que los usa): el verde oscuro `#1c4a2e` y el medio `#47a066` (5 y 1 usos), la escala slate de Compra, el azul `#4a6fd4`, los morados de privacidad y el mapa de categorías (D6: es dato, vive aparte).

### 1.2 Gradientes característicos

Los degradados llevan hex porque aún no tienen rol; al migrar usarán `marca`, `marca-viva` y `superficie`.

```
CTA / héroe:   linear-gradient(135deg, #2d5a3d 0%, #4cba6e 100%)
Cabecera menú: linear-gradient(150deg, #1c4a2e 0%, #2d5a3d 46%, #47a066 100%)
Acento lima:   linear-gradient(135deg, #7a8a3a, #a8bf5a)
Fade nav:      linear-gradient(to top, #fff 88%, rgba(255,255,255,0))
Overlay foto:  linear-gradient(to top, rgba(10,30,18,.78) 0%, rgba(10,30,18,0) 58%)
```

### 1.3 Dónde va cada rol

- **Fondos:** `fondo-pantalla` (pantalla), `superficie` (tarjetas, filas, inputs), `fondo-suave` (pista de segmented, botones ghost), `marca-fondo` (badges, contadores, nav seleccionado), tinte de chip no seleccionado `rgba(45,90,61,.08)` (aún sin rol). El fondo del documento fuera del shell es `#f0f0f0`.
- **Bordes:** `linea-suave` (separadores), `linea` (tarjetas y filas), `linea-fuerte` (checkbox, chevrons). Borde activo: `marca` en controles de estado, `seleccionado` en lo elegido (a menudo `1.5px` o `2px`).
- **Texto:** `tinta` (principal), `tinta-media` (secundario oscuro), `tinta-suave` (terciario), `tinta-tenue` (metadatos), `tinta-palida` (placeholder, iconos inactivos). Nunca gris puro frío.

### 1.4 Colores semánticos y de categoría

- **Peligro / eliminar:** `peligro` (texto/acción) sobre `peligro-fondo`; corazón activo `favorito`.
- **Aviso / atención:** `aviso` sobre `aviso-fondo`.
- **Info:** `info` sobre `info-fondo`.
- **Privacidad:** Pública `#2d5a3d`/`#e6f3ea` · Amigos `#7a4e00`/`#fff8e7` · Privada `#5a2d7a`/`#f5edfc` (fuera del sistema hasta migrar `ShareMenuSheet`).
- **Categorías de plato (icono + color):** legumbres `#b9770e`, carnes `#c0392b`, pescados `#2f6f9f`, huevos `#d4a017`, pasta/arroz `#cf7833`, sopas/cremas `#8a6cc4`, verduras `#3f9656`, platos únicos `#5a7066`, cenas rápidas `#d56b9a`, bebés `#6cb4c4`, desayunos `#c98a3a`, meriendas `#4a9d6b`, postres `#c463a0`. Color por defecto: `tinta-suave`. Estos colores son **datos**, no roles (D6): manda `CATEGORY_META` de `CatalogBrowserSheet.jsx`, que pasará a un fichero de datos aparte; `legumbres` tiene hoy cuatro valores y se reconduce a ese mapa.
- **Avatares de miembros:** color asignado por persona (`memberAvatarColor`), texto `superficie`.

**Regla de contraste:** sobre `marca` siempre texto/icono `superficie`. Sobre fondos claros, texto `tinta`. Los estados atenuados usan la escala `tinta-*`, nunca gris puro frío.

---

## 2. Tipografía

- **Fuente principal:** `'DM Sans'` (fallback `'Helvetica Neue', sans-serif`), cargada con eje completo 100–1000 + itálica. `-webkit-font-smoothing: antialiased`.
- **Fuente display reservada:** `'Playfair Display'` (700/800) — cargada en `index.css` para titulares serif de ocasión (héroes/export). DM Sans es la base de toda la UI.
- **`fontFamily: "inherit"`** en TODOS los `<button>`/`<input>` para no caer en la fuente nativa del sistema.

### 2.1 Tokens tipográficos (12)

Una familia, 8 pasos y 3 pesos. Los tamaños intermedios de hoy (9, 9.5, 10.5, 12.5, 13.5, 15, 17, 18…) se mueven al paso más cercano, hacia arriba en empate (`docs/diseno/ESTADO.md`, «snap»); 28, 30, 32 y 46 quedan fuera hasta mirarlos uno a uno.

<!-- tokens:tipografia -->
| Token | Valor | Uso |
|---|---|---|
| `familia` | `'DM Sans', 'Helvetica Neue', sans-serif` | Toda la UI |
| `paso-10` | `10` | Micro: nav, badges |
| `paso-11` | `11` | Eyebrow / label |
| `paso-12` | `12` | Metadatos |
| `paso-13` | `13` | Cuerpo pequeño, chips |
| `paso-14` | `14` | Cuerpo, título de sección, botón |
| `paso-16` | `16` | Título de sheet; inputs (obligatorio, evita el auto-zoom de iOS Safari) |
| `paso-20` | `20` | Cifras destacadas |
| `paso-26` | `26` | Título de página |
| `peso-700` | `700` | Cuerpo (el 600 de hoy sube aquí) |
| `peso-800` | `800` | Títulos de sección, botones, etiquetas |
| `peso-900` | `900` | Títulos de página y de sheet |

### 2.2 Roles de texto

`titulo`, `cuerpo`, `etiqueta` y `mini` combinan tamaño, peso e interlineado (variables `--texto-<rol>-tam|peso|interlineado`). **El interlineado es provisional**: sale de lo más usado en el código y se confirma al migrar la primera pantalla.

| Rol | Tamaño | Peso | Extras |
|---|---|---|---|
| `titulo` | `paso-26` | `peso-900` | `letterSpacing: -.7px`, color `tinta` |
| `cuerpo` | `paso-14` | `peso-700` | |
| `etiqueta` | `paso-11` | `peso-800` | `textTransform: uppercase`, `letterSpacing: 0.5–0.9`; color atenuado o `marca` |
| `mini` | `paso-10` | `peso-800` | nav, badges |

### 2.3 Reglas tipográficas

- **Números tabulares:** `fontVariantNumeric: "tabular-nums"` para cantidades/precios (evita "baile" de dígitos).
- **Eyebrows** siempre en mayúsculas, `peso-800`, con `letterSpacing` y color atenuado o `marca`.
- **`letterSpacing` negativo** (`-.2px` a `-.7px`) en titulares grandes para compactarlos.
- **`lineHeight: 1`** en píldoras/badges/etiquetas de una línea; `1.25–1.45` en párrafos.
- Pesos permitidos: **700, 800, 900** (nada más ligero para texto de UI). El 600 y el 500 de hoy suben a 700.

---

## 3. Espaciado, radios y layout

### 3.1 Escala de espaciado (9)

Múltiplos de 4 con **dos excepciones declaradas, 2 y 6**. Roles: `margen-pantalla` (16) y `separacion-lista` (8), ambos **provisionales** (los más usados en el código: se confirman al migrar la primera pantalla).

<!-- tokens:espaciado -->
| Token | Valor | Uso |
|---|---|---|
| `esp-2` | `2` | Excepción: separaciones mínimas |
| `esp-4` | `4` | `gap` de nav y acciones |
| `esp-6` | `6` | Excepción: icono + texto |
| `esp-8` | `8` | `gap` de listas, icono + texto |
| `esp-12` | `12` | Bloques, margen entre secciones |
| `esp-16` | `16` | Padding de tarjeta y margen de pantalla |
| `esp-20` | `20` | Padding lateral de sheet |
| `esp-24` | `24` | Separación entre grupos |
| `esp-32` | `32` | Separación grande |

### 3.2 Radios (7)

El radio interior es el exterior menos el padding: orienta al diseñar, no genera valores. `50%` (círculos) y `0` no son tokens.

<!-- tokens:radio -->
| Token | Valor | Uso |
|---|---|---|
| `radio-mini` | `4` | Piezas pequeñas internas, stripes |
| `radio-chico` | `8` | Elementos internos, badges cuadrados |
| `radio-control` | `12` | **Por defecto** de controles: segmented, botones-icono, inputs, botones |
| `radio-tarjeta` | `16` | **Tarjetas** estándar |
| `radio-panel` | `20` | Esquinas altas de hoja (`20 20 0 0`), bottom nav |
| `radio-modal` | `26` | Tarjeta de `WizardSheet` y toast |
| `radio-pildora` | `999` | Toggles, avatares, dots, chips, "grabber" de sheet |

### 3.3 Tamaños y layout / shell (8)

Área táctil mínima 40 px, independiente del tamaño visual (se amplía con padding o pseudo-elemento). Iconos: 14 / 16 / 18 / 20 / 24 (nav 20, sección 16, chip/inline 14, burbuja de icono 18–20).

<!-- tokens:tamano -->
| Token | Valor | Uso |
|---|---|---|
| `tam-tactil` | `40` | Área táctil mínima |
| `tam-icono-14` | `14` | Chip, inline |
| `tam-icono-16` | `16` | Sección, el más usado |
| `tam-icono-18` | `18` | Burbuja de icono |
| `tam-icono-20` | `20` | Nav |
| `tam-icono-24` | `24` | Tamaño de dibujo de Nucleo |
| `tam-columna` | `420` | `APP_SHELL_MAX_WIDTH`: columna de app |
| `tam-nav` | `80` | `BOTTOM_NAV_HEIGHT`, más safe-area (`env()`, que no es un valor) |

```js
export const APP_SHELL_MAX_WIDTH = 420; // columna de app
export const BOTTOM_NAV_HEIGHT = 80;     // alto de la barra inferior
```
- **Safe areas iOS:** usar `env(safe-area-inset-bottom, 0px)` en barras/hojas fijas.
- **Spacer inferior:** `bottomNavSpacer()` → `calc(80px + env(safe-area-inset-bottom, 0px))` para que el contenido no quede tapado por la nav.
- **Overlays fijos** (`position: fixed`) centrados con `left: 50%; transform: translateX(-50%); max-width: 420`.

---

## 4. Sombras (elevación)

Cuatro niveles. Los 161 literales de hoy se agrupan por desenfoque en estos al migrar.

<!-- tokens:sombra -->
| Token | Valor | Uso |
|---|---|---|
| `sombra-0` | `0 1px 3px rgba(20,47,29,.05)` | Tarjetas planas, filas |
| `sombra-1` | `0 6px 16px -12px rgba(20,47,29,.3)` | Tarjetas tocables, filas destacadas |
| `sombra-2` | `0 6px 20px rgba(0,0,0,.12)` | Menús contextuales, toast |
| `sombra-3` | `0 24px 60px rgba(0,0,0,.25)` | Sheets y modales |

Sin token todavía (se deciden al migrar su pantalla): sombra de la nav inferior `0 -6px 24px rgba(20,47,29,.08)`, glow verde del CTA `0 4px 18px rgba(45,90,61,.25)` y "liquid glass" `inset 0 1px 0 rgba(255,255,255,.9), 0 10px 22px -14px rgba(31,74,48,.5)`.

**Convención:** las sombras van tintadas de verde (`rgba(20,47,29,…)` / `rgba(45,90,61,…)`), no negro neutro, salvo overlays y toasts. Sombras "lifted" con **spread negativo** para un halo suave y difuso.

---

## 5. Iconografía

- **Librería única:** [Nucleo](https://nucleoapp.com), familia **core**, relleno **outline**, tamaño **24px**. Los iconos viven copiados en el repo (`src/components/icons.jsx`, generado por `npm run build:icons`); nunca se importan desde `~/.nucleo`. Import nominal (`import { Home, Settings } from "../components/icons.jsx"`).
- **Añadir un icono:** busca el componente en la familia core/outline/24px, añádelo al mapa de `scripts/build-nucleo-icons.mjs` y regenera. No pegues SVG a mano en las pantallas.
- **Tamaños:** solo los `tam-icono-*` de §3.3 (14 / 16 / 18 / 20 / 24); decorativo grande `32`.
- **Grosor:** `strokeWidth` por defecto `2`; **estado activo/énfasis `2.4`** (`2.2` en burbujas). El cambio de grosor es una señal de selección tan importante como el color.
- **Color:** hereda el color de estado (verde activo `#2d5a3d`, inactivo `#9ab0a1`). Sobre verde, `#fff`.
- **Burbuja de icono:** cuadrado redondeado (`radius 12–14`), fondo de color/tint, icono centrado; en momentos destacados con glow `0 4px 12px {color}55`.
- **Iconos de categoría** mapeados 1:1 a su color de categoría (ver §1.6).
- SVG a medida solo para logos de marca ajenos (ej. glifo de Google multicolor).

---

## 6. Componentes (biblioteca `components/ui.jsx`)

### 6.1 `Chip`
Pill seleccionable. `padding: "6px 14px"`, `radius 20`, `fontSize 13`, `fontWeight 700` (hoy 500; sube al migrar).
- No seleccionado: fondo `rgba(45,90,61,.08)`, texto verde, borde `1.5px rgba(45,90,61,.2)`.
- Seleccionado: fondo `#2d5a3d`, texto `#fff`, borde verde. `transition: all .2s`.
- `removable` añade una "×" cuando está activo.

### 6.2 `SegmentedControl`
Selector de 2–3 opciones. Pista `#f0f4f1`, `radius 12`, `padding 3`.
- Segmento activo: fondo `#fff` + `boxShadow 0 1px 4px rgba(0,0,0,.1)` (o `activeDark` → fondo verde, texto blanco, sin sombra).
- Texto `13/800`, icono opcional `size 15 strokeWidth 2.4`, `padding "7px 0"`, `radius 9`.

### 6.3 `ToggleSwitch`
Interruptor iOS. Pista `48×28`, `radius 999`; knob `24×24` blanco con `boxShadow 0 1px 4px rgba(0,0,0,.12)`.
- On: fondo `#2d5a3d`, knob `translateX(20px)`. Off: fondo `#d4e0d8`.
- `role="switch"`, `aria-checked`, `transition .2s`. Label opcional a la izquierda (`14/700`).

### 6.4 Radio buttons / checkboxes (patrón, no componente único)
Caja **cuadrada redondeada** (no nativa): `~22×22`, `radius 6`, borde `1.5px`.
- Marcado: fondo `#2d5a3d`, check `<Check>` blanco centrado.
- Sin marcar: fondo `#fff`, borde `#cdd8d0`.
- El label acompaña con peso `700→800` al marcarse y el texto oscurece (`#3a4a42 → #142f1d`).

### 6.5 `SliderInput`
Slider estilo iOS dentro de tarjeta blanca (`radius 16`, borde `#eef2ef`).
- Pista `4px` gris `#e5ede7`, relleno verde `#2d5a3d` por porcentaje.
- Thumb `28×28` blanco circular con doble sombra; label + valor (verde `15/800`) arriba.

### 6.6 `BottomNav`
Barra inferior fija (portal a `document.body`), `max-width 420`, centrada, con fade superior.
- Contenedor blanco `radius 18 18 0 0`, borde superior `#e0eae3`, sombra `0 -6px 24px rgba(20,47,29,.08)`.
- Ítem activo: fondo `#f0f7f2`, `boxShadow inset 0 0 0 1px #d4e6da`, icono verde `strokeWidth 2.4`, label `10/800`. Inactivo: icono `#9ab0a1`, label `600`.
- Dos contextos: `home` (Inicio · Recetas · Menús · En casa · Perfil) y `menu` (Inicio · Menú · Compra · Análisis).

### 6.7 `GoogleButton` / `GhostPillButton`
Botones pill (`radius 999`).
- **Google:** blanco, borde `1.5px #dbe5de`, glifo multicolor, `padding "15px 20px"`, `15/800`.
- **Ghost:** translúcido; variante `light` (sobre fondo oscuro) y `dark`. Feedback al pulsar `scale(.97)`.

### 6.8 `Avatar` / `AvatarStack`
Círculo con foto o iniciales (`initialsOf`). Tamaño param., fondo = color de miembro, texto blanco `~0.42×size / 700`. `AvatarStack` solapa `-8px` con borde blanco `2px` y burbuja `+N`.

### 6.9 `WeekRangeBadge`
Badge de rango semanal: fondo `#f4f8f5`, borde `#e0eae3`, `radius 12`, con burbuja verde de calendario + eyebrow "Semana" (`9/800 uppercase`) y rango (`13/900`).

### 6.10 `ScopeCircle` / `GroupScopePicker`
Selector de "para quién" con círculos de `46px` (borde `2.5px` del color del grupo). Activo: relleno del color + glow `{color}55`. Label `10/800` debajo. Separador vertical `1×40 #dde8e1` entre "Todos" y los grupos.

### 6.11 `WizardSheet` + `WizardOptionCard`
Modal centrado de **decisión** (elegir entre pocos caminos claros).
- Overlay `rgba(0,0,0,.5)`, animación `mp-overlay-in` + `mp-sheet-up`.
- Tarjeta **tintada verde** `#f3f8f4` (no blanca), `radius 26`, sombra `0 24px 60px rgba(0,0,0,.25)`, borde `#e2ede5`.
- Header: burbuja de icono `44×44` con glow + título `16/900`, sin subtítulo explicativo (`ui.md`); botón cerrar circular `32px` con `<X>`.
- `WizardOptionCard`: fila grande tocable, blanca sobre el tint, `radius 18`, icono en burbuja + título `15/800`, sin subcopy.

### 6.12 `ProgressDots`
Indicador de pasos: barras `flex:1` (`4–5px`, `radius 99`). Hecho `#2d5a3d`, activo `#4cba6e` con glow, pendiente `#d6e6db`. `transition .35s cubic-bezier(.4,0,.2,1)`.

### 6.13 `Card` / `SectionTitle` (patrón por pantalla)
- **Card:** blanca, `radius 16`, `padding 14`. Variante destacada con borde verde `2px #2d5a3d`.
- **SectionTitle:** icono verde `16/2.4` + texto `14/800` verde, con acción opcional a la derecha (ej. link "Editar" con `<Pencil>` `13/700`).

### 6.14 Botones — resumen de recetas

| Tipo | Estilo |
|---|---|
| **Primario** | Fondo `#2d5a3d`, texto `#fff`, `radius 12`, `padding "12px 20px"`, `14/800`. Deshabilitado: fondo `#c8d9ce`/`#cdd5d0`, sin sombra. Activo con glow verde. |
| **Primario "wow"** | Gradiente `135deg #2d5a3d→#4cba6e`, sombra `0 4px 18px rgba(76,186,110,.35)`. |
| **Botón-icono** | `40×40`, blanco, borde `#e0eae3`, `radius 12`, icono verde. Variante "money": relleno verde + sombra. |
| **Ghost/link** | Sin fondo ni borde, texto verde `13/700`, `padding 0`. |
| **Feedback táctil** | `transform: scale(.97)` on press, `transition .15s`. |

---

## 7. Tablas y listas agrupadas

MenuPlan no usa `<table>` HTML: son **filas flex/grid dentro de contenedores redondeados**.

- **Contenedor de grupo:** fondo `#f6f9f7`, borde `1px #dfe9e2`, `radius 12`, `overflow: hidden`.
- **Cabecera de grupo/tabla:** fondo `#dcebe1`, borde inferior `1px #c9ddd0`, `padding "9px 10px"`, con icono + label. Variante verde sólida: fondo `#2d5a3d`, texto blanco.
- **Filas:** separadas por `borderBottom: 1px solid #eef3f0` (la última sin borde). Fila = flex con `flex:1` para el texto (con `overflow: hidden; textOverflow: ellipsis; whiteSpace: nowrap`), columnas de cantidad a la derecha.
- **Grid de fila (compra):** `gridTemplateColumns: "1fr 4.5rem auto"`, `minHeight 36`, `gap 8`.
- **Columna numérica:** `13/800`, `color #64748b`, `textAlign: right`, `tabular-nums`.
- **Day stripe** (encabezado de día): fondo `#f1f5f9`, `borderLeft: 3px solid #64748b`, label `13/900 uppercase letterSpacing .5`, número `18/900`.
- **Fila seleccionada:** fondo `#f2fbf5`, borde `1.5px #bfe6cb`.

> Nota: la pantalla de Compra introduce una escala **slate/gris azulada** (`#64748b`, `#334155`, `#f1f5f9`, `#e8f0ea`) para diferenciar el modo "logístico" del resto de la app, que es verde.

---

## 8. Sheets, modales y overlays

- **Bottom sheet:** `superficie` (o `fondo-pantalla`), `radio-panel` en las esquinas altas (`20 20 0 0`), `max-width` `tam-columna`, "grabber" superior (`38×4`, `radio-pildora`), header con el título (`17/900`; sin subtítulo explicativo, `ui.md`) y botón cerrar circular `fondo-suave`.
- **Sticky header dentro de sheet:** `position: sticky; top: 0; zIndex: capa-local; background: fondo-pantalla`.
- **Overlay de fondo:** `scrim`, `position: fixed; inset: 0`, animación `mp-overlay-in`.
- **Footer de sheet:** `borderTop: 1px solid linea-suave`, con padding que respeta `env(safe-area-inset-bottom)`.

### 8.1 Capas (z-index, 8)

El **toast va por encima de toda hoja** (`capa-toast` > `capa-hoja-2` > `capa-hoja`); hoy el toast está en 320, igual que las hojas sobre hojas, y sube a 330 al migrar. Los 47 valores de `zIndex` de hoy se reconducen a estas 8 capas; los de 1150–1250 (tutorial, coach), 1300, 3000 y 9999 van a `capa-tutorial` o `capa-emergente`.

<!-- tokens:capa -->
| Token | Valor | Uso |
|---|---|---|
| `capa-local` | `5` | Contenido: cabeceras pegajosas dentro de una hoja (1–5) |
| `capa-nav` | `100` | Barra de navegación inferior |
| `capa-flotante` | `150` | Elementos flotantes sobre la nav |
| `capa-hoja` | `300` | Hojas y modales |
| `capa-hoja-2` | `320` | Hoja sobre hoja |
| `capa-toast` | `330` | Toast, por encima de toda hoja |
| `capa-emergente` | `1000` | Popovers y banners |
| `capa-tutorial` | `1200` | Tutorial y coach |

---

## 9. Toasts / feedback efímero

```js
position: fixed; bottom: tam-nav; left: 50%; transform: translateX(-50%);
background: tinta; color: superficie; padding: "10px 18px"; borderRadius: radio-modal;
fontSize: paso-13; fontWeight: peso-700; boxShadow: sombra-2;
zIndex: capa-toast; maxWidth: 320; textAlign: center;
```
Valores en roles de token (hoy el toast de `App.jsx` los lleva sueltos: fondo `#1a3a24`, radio 24, peso 600, `zIndex` 320).
- **Auto-dismiss ~2400ms** con timer limpiado en `unmount` (`clearTimeout`).
- Entra con `mp-toast-in`.
- **Copys de toast:** muy cortos, con comillas angulares para el objeto: `Añadido «Lentejas»`, `Quitado «…»`, `¡Cocinado!`. Nunca dobles mensajes si un sheet ya resume la acción.

---

## 10. Movimiento y animación (`index.css`)

| Clase | Animación | Duración / easing |
|---|---|---|
| `.mp-overlay-in` | fade in | `.18s ease` |
| `.mp-sheet-up` | sube + fade | `.22s cubic-bezier(.25,.46,.45,.94)` |
| `.mp-nav-fwd` / `.mp-nav-back` | slide horizontal ±14px | `.22s cubic-bezier(...)` `backwards` |
| `.mp-tab-fwd` / `.mp-tab-back` | slide ±8px | `.18s ease` `backwards` |
| `.mp-toast-in` | sube + fade | `.2s ease` |
| `.rotating` | giro infinito | `1s linear` (spinners) |

Las `@keyframes` y las clases `mp-*` de `index.css` se **transcriben, no se sustituyen** (`ui.md`): sus curvas de rebote quedan como excepción declarada y `index.css` no lee tokens todavía.

### 10.1 Tokens de movimiento (4)

Las ~80 duraciones de hoy se agrupan: .12–.18 s a `mov-rapida`, .2–.26 s a `mov-media`, .3–.4 s a `mov-lenta`. Una sola curva.

<!-- tokens:movimiento -->
| Token | Valor | Uso |
|---|---|---|
| `mov-rapida` | `.15s` | Pulsación, color, transform |
| `mov-media` | `.22s` | Transiciones de estado, hojas |
| `mov-lenta` | `.35s` | Barras de progreso, aparición de bloques |
| `mov-curva` | `cubic-bezier(.4,0,.2,1)` | La curva de las transiciones inline |

**Reglas:**
- Transiciones de estado inline: `mov-rapida` a `mov-media` con `mov-curva`.
- Pulsación: `scale(.97)`.
- **`prefers-reduced-motion: reduce`** → todas las animaciones caen a un simple fade `.12s`; las variables `--mov-*` caen a `.01s`.
- ⚠️ Nota técnica en el propio CSS: usar `backwards` (no `both`) en wrappers de pantalla para no romper `position: fixed` de overlays anidados.

---

## 11. Formularios / inputs

- **`font-size: 16px` obligatorio** en `input/textarea/select` (regla global + inline) para evitar el auto-zoom de iOS Safari con viewport bloqueado.
- **Placeholder** uniforme `tinta-palida` `#9ab0a1` (`opacity: 1`, D14). Hoy `index.css` aún dice `#9aa8a0`; se cambia al migrar.
- **Inputs numéricos compactos:** clase `.mp-no-spinner` elimina las flechas nativas.
- Estilo típico de input: fondo `superficie` (o `fondo-pantalla`), borde `1.5px linea`, `radio-control`, `padding ~"10px 12px"`, texto `paso-16` en `tinta`.
- Foco/activo → borde `marca`.

---

## 12. Voz y tono (copywriting)

- **Idioma:** español de España, cercano y cálido, tuteo implícito.
- **Etiquetas de navegación:** cortas y humanas — `Inicio`, `Recetas`, `Menús`, `En casa`, `Perfil`, `Compra`, `Análisis`.
- **Títulos de decisión** en forma de pregunta directa: `¿Para quién es el menú?`, `¿Cómo coméis en casa?`.
- **Eyebrows/labels** en mayúsculas y muy breves (`SEMANA`, `ALÉRGENOS`).
- **Copy principal (título)** conciso. **Sin subtítulos explicativos ni texto de ayuda** (`.claude/rules/ui.md`, D5): un badge es un icono y dos palabras.
- **Confirmaciones** con energía positiva y emoji puntual: `¡Cocinado!`, `¡Cocinado! Stock en casa actualizado (3)`.
- **Objetos entre comillas angulares** «…» en mensajes.
- **Estados vacíos:** icono grande atenuado (`size 32`, `linea-fuerte`) + una frase corta de estado en `tinta-palida` (no texto de ayuda), centrado, `padding "40px 20px"`.

---

## 13. Accesibilidad

- Roles/ARIA en controles a medida: `role="switch"` + `aria-checked` (toggle), `aria-label` en botones-icono (`Cerrar`), `aria-label="Navegación principal"` en la nav.
- Contraste alto texto/fondo por diseño (Ink sobre blanco; blanco sobre verde).
- Soporte de `prefers-reduced-motion`.
- Áreas táctiles de `tam-tactil` (40 px) o más, aunque el dibujo sea menor; 46px en scope circles, nav de `tam-nav`.
- Safe areas respetadas en todos los elementos fijos.

---

## 14. Checklist para pantallas/componentes nuevos

- [ ] ¿Ningún color, tamaño, radio, sombra, capa ni tiempo escrito a mano? Todo sale de `src/design/tokens.js` (roles); si falta uno, se añade allí con su porqué.
- [ ] ¿El fondo de página es `fondo-pantalla` y las tarjetas `superficie`?
- [ ] ¿Controles de estado y acción (chip, toggle, segmented, nav, botón primario) en `marca`, y solo lo elegido en `seleccionado`?
- [ ] ¿Radios por rol (`radio-control` / `radio-tarjeta` / `radio-panel` / `radio-modal` / `radio-pildora`)?
- [ ] ¿Espaciado de la escala (múltiplos de 4, más 2 y 6), `tam-columna` de ancho máximo y objetivos táctiles de `tam-tactil` o más, a 375 y 420 px?
- [ ] ¿Iconos de `components/icons.jsx` (Nucleo core outline), `strokeWidth 2` (2.4 si activo), tamaño `tam-icono-*`?
- [ ] ¿Tipografía DM Sans, pesos 700/800/900, inputs a 16px, `fontFamily: "inherit"` en botones/inputs?
- [ ] ¿Sombras de las cuatro `sombra-*` y capas de las `capa-*` (el toast sobre toda hoja)?
- [ ] ¿Estados: seleccionado, deshabilitado, pulsado (`scale(.97)`), vacío?
- [ ] ¿Transiciones de `mov-rapida` a `mov-media` y respeto a `prefers-reduced-motion`?
- [ ] ¿Copys cortos, cálidos, en español, sin subtítulos explicativos ni texto de ayuda, con eyebrows en mayúsculas?
- [ ] ¿ARIA/labels en controles a medida y safe-area en elementos fijos?

---

*Fuentes en el repo:* `src/index.css` · `src/components/ui.jsx` · `src/screens/{Onboarding,Settings,Dashboard,Menu,Shopping,RecipePlanner,CatalogBrowserSheet,HomeProfileScreen}.jsx`.
