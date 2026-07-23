# MenuPlan · Sistema de Diseño de UI

> Skill de diseño extraída del código real de la app (`src/index.css`, `src/components/ui.jsx`, `src/screens/*`).
> Sirve como guía para que cualquier pantalla o componente nuevo **se sienta parte de la misma app**.
> Filosofía: **mobile-first**, estética *fresh / natural food*, verde bosque como color rector, tipografía redonda, tarjetas blancas sobre fondos verdosos muy claros, mucho aire, esquinas redondeadas y microinteracciones sutiles.

---

## 0. Principios rectores

1. **Todo es inline styles** (objetos `style={{}}` en JSX). No hay Tailwind ni CSS Modules; el CSS global (`index.css`) solo cubre reset, fuentes, animaciones keyframe y parches de inputs. Los estilos reutilizables se factorizan como **constantes de objeto** (`const pageTitle = {...}`) o **componentes** en `components/ui.jsx`.
2. **Contenedor de app estrecho**: la UI vive en una columna de **máx. 420px** centrada (`APP_SHELL_MAX_WIDTH = 420`). Diseñar siempre para móvil.
3. **Verde = marca y acción.** El verde bosque `#2d5a3d` es el color de todo lo interactivo/seleccionado/primario. Lo demás es neutro y silencioso.
4. **Blanco sobre verde muy claro.** Los fondos de página son verdes casi blancos (`#f4f8f5`, `#f7f9f7`); las tarjetas son blancas puras. Nunca blanco sobre blanco: si un panel es blanco, el fondo debe tintarse (ej. `WizardSheet` usa `#f3f8f4`) para que las tarjetas destaquen.
5. **Jerarquía por peso, no por tamaño.** Se usan pesos muy altos (700/800/900) para jerarquizar; los tamaños se mueven poco (10–26px).
6. **Redondez en todo.** Radios generosos; los elementos "atómicos" (toggles, avatares, dots, pills) son totalmente circulares (`999`).
7. **Microinteracciones discretas.** Transiciones 0.15–0.22s, `scale(.97)` al pulsar, animaciones respetando `prefers-reduced-motion`.
8. **Iconografía única: `lucide-react`.** Nunca mezclar familias de iconos.

---

## 1. Color

### 1.1 Paleta de marca (verdes)

| Token | Hex | Uso |
|---|---|---|
| **Green / primario** | `#2d5a3d` | Botones primarios, elementos seleccionados, iconos activos, bordes activos, texto de marca |
| **Green oscuro / borde profundo** | `#1c4a2e` | Inicio de gradientes, hover profundo |
| **Ink (texto principal)** | `#142f1d` | Títulos y texto de máximo contraste |
| **Ink alt** | `#1a3a24` | Texto oscuro secundario, fondo de toast |
| **Green vivo / acento** | `#4cba6e` | Fin de gradientes, estados "hecho", highlight |
| **Green medio** | `#47a066` / `#3f9656` | Acentos, gradientes largos |

### 1.2 Gradientes característicos

```
CTA / héroe:   linear-gradient(135deg, #2d5a3d 0%, #4cba6e 100%)
Cabecera menú: linear-gradient(150deg, #1c4a2e 0%, #2d5a3d 46%, #47a066 100%)
Acento lima:   linear-gradient(135deg, #7a8a3a, #a8bf5a)
Fade nav:      linear-gradient(to top, #fff 88%, rgba(255,255,255,0))
Overlay foto:  linear-gradient(to top, rgba(10,30,18,.78) 0%, rgba(10,30,18,0) 58%)
```

### 1.3 Fondos y superficies

| Token | Hex | Uso |
|---|---|---|
| Body | `#f0f0f0` | Fondo del documento (fuera del shell) |
| Page bg (variantes) | `#f7f9f7` · `#f4f8f5` · `#f5f9f6` | Fondo de cada pantalla (verde casi blanco) |
| Card | `#fff` | Tarjetas, filas, inputs |
| Tint verde suave | `rgba(45,90,61,.08)` | Fondo de chips no seleccionados |
| Tint verde control | `#f0f4f1` · `#f4f7f5` | Pista de segmented control, botones-icono ghost |
| Tint verde "éxito" | `#eaf6ee` · `#f2fbf5` · `#eaf3ed` | Badges, tarjetas seleccionadas, contadores |
| Tint cabecera tabla | `#dcebe1` (borde `#c9ddd0`) | Cabeceras de tablas/listas agrupadas |

### 1.4 Bordes

| Hex | Uso |
|---|---|
| `#e8efe9` · `#eef2ef` · `#eef3f0` | Bordes/separadores neutros por defecto |
| `#e3ebe6` · `#e0eae3` · `#dbe5de` | Bordes de tarjetas y filas |
| `#2d5a3d` | Borde activo/seleccionado (a menudo `1.5px` o `2px`) |
| `#bfe6cb` | Borde verde suave de tarjeta seleccionada |

### 1.5 Texto neutro (grises verdosos)

| Hex | Uso |
|---|---|
| `#142f1d` / `#1a3a24` | Texto principal |
| `#3a4a42` / `#444` | Texto secundario oscuro |
| `#5a7066` / `#5f7568` / `#4f6a5a` | Texto terciario |
| `#7a8a7f` / `#7a9485` / `#8d978f` | Texto atenuado / metadatos |
| `#9ab0a1` / `#9aa89e` / `#c2cfc7` | Placeholders, iconos inactivos, chevrons |
| `#9aa8a0` | Placeholder de inputs (global en `index.css`) |

### 1.6 Colores semánticos y de categoría

- **Peligro / eliminar:** `#c0392b` (texto/acción), fondo `#fdecea`; corazón activo `#e0405a`.
- **Aviso / atención:** `#b45309` · `#7a4e00`, fondo `#fff8e7`.
- **Info / azules puntuales:** `#2f6f9f` (pescados), `#2f7dc0`.
- **Privacidad:** Pública `#2d5a3d`/`#e6f3ea` · Amigos `#7a4e00`/`#fff8e7` · Privada `#5a2d7a`/`#f5edfc`.
- **Categorías de plato (icono + color):** legumbres `#b9770e`, carnes `#c0392b`, pescados `#2f6f9f`, huevos `#d4a017`, pasta/arroz `#cf7833`, sopas/cremas `#8a6cc4`, verduras `#3f9656`, platos únicos `#5a7066`, cenas rápidas `#d56b9a`, bebés `#6cb4c4`, desayunos `#c98a3a`, meriendas `#4a9d6b`, postres `#c463a0`. Color por defecto: `#5a7066`.
- **Avatares de miembros:** color asignado por persona (`memberAvatarColor`), texto blanco.

**Regla de contraste:** sobre verde `#2d5a3d` siempre texto/icono blanco `#fff`. Sobre fondos claros, texto `#142f1d`/`#1a3a24`. Los estados atenuados usan la escala de grises verdosos, nunca gris puro frío.

---

## 2. Tipografía

- **Fuente principal:** `'DM Sans'` (fallback `'Helvetica Neue', sans-serif`), cargada con eje completo 100–1000 + itálica. `-webkit-font-smoothing: antialiased`.
- **Fuente display reservada:** `'Playfair Display'` (700/800) — cargada en `index.css` para titulares serif de ocasión (héroes/export). DM Sans es la base de toda la UI.
- **`fontFamily: "inherit"`** en TODOS los `<button>`/`<input>` para no caer en la fuente nativa del sistema.

### 2.1 Escala tipográfica (observada)

| Rol | Tamaño | Peso | Extras |
|---|---|---|---|
| Título de página | `26` | `900` | `letterSpacing: -.7px`, color Ink |
| Título de sheet/card grande | `16–17` | `900` | color Ink |
| Título de sección | `14` | `800` | color Green, `letterSpacing: -.2px` |
| Botón / CTA | `14–15` | `800` | |
| Cuerpo | `13–14.5` | `600–700` | |
| Subcopy / metadatos | `12–13` | `600` | color atenuado, `lineHeight: 1.3–1.45` |
| Eyebrow / label | `10–11` | `800` | `textTransform: uppercase`, `letterSpacing: 0.5–0.9` |
| Micro (nav, badges) | `9–10.5` | `800–900` | |
| Inputs | **`16` (obligatorio)** | — | evita el auto-zoom de iOS Safari |

### 2.2 Reglas tipográficas

- **Números tabulares:** `fontVariantNumeric: "tabular-nums"` para cantidades/precios (evita "baile" de dígitos).
- **Eyebrows** siempre en mayúsculas, peso 800, con `letterSpacing` y color atenuado o verde.
- **`letterSpacing` negativo** (`-.2px` a `-.7px`) en titulares grandes para compactarlos.
- **`lineHeight: 1`** en píldoras/badges/etiquetas de una línea; `1.25–1.45` en párrafos.
- Pesos permitidos en la práctica: **600, 700, 800, 900** (nada más ligero para texto de UI).

---

## 3. Espaciado, radios y layout

### 3.1 Escala de espaciado

Múltiplos pequeños y consistentes: **4 · 6 · 8 · 10 · 12 · 14 · 16 · 20 · 22**.
- `gap` típicos: `4` (nav/acciones), `6–8` (iconos+texto), `12–14` (bloques).
- Padding de tarjeta: `14` (o `"14px 16px"`).
- Padding de sheet: `"22px 20px 20px"`.
- Márgenes entre secciones: `marginBottom: 12–14`.

### 3.2 Escala de border-radius

| Radio | Uso |
|---|---|
| `8–10` | Elementos internos pequeños, badges cuadrados, stripes |
| `12` | **Radio por defecto** de controles (segmented, botones-icono, inputs, badges) |
| `13–14` | Burbujas de icono, miniaturas de plato |
| `16` | **Tarjetas** estándar |
| `18` | Tarjetas-opción grandes, contenedor de bottom nav (`18 18 0 0`) |
| `20` | Chips/pills, hojas inferiores (`20 20 0 0`), stat cards glass |
| `24` | Toast, contenedores destacados |
| `26` | `WizardSheet` (hoja de decisión) |
| `999` / `"50%"` | Toggles, avatares, dots, botones circulares, "grabber" de sheet |

### 3.3 Layout / shell

```js
export const APP_SHELL_MAX_WIDTH = 420; // columna de app
export const BOTTOM_NAV_HEIGHT = 80;     // alto de la barra inferior
```
- **Safe areas iOS:** usar `env(safe-area-inset-bottom, 0px)` en barras/hojas fijas.
- **Spacer inferior:** `bottomNavSpacer()` → `calc(80px + env(safe-area-inset-bottom, 0px))` para que el contenido no quede tapado por la nav.
- **Overlays fijos** (`position: fixed`) centrados con `left: 50%; transform: translateX(-50%); max-width: 420`.

---

## 4. Sombras (elevación)

| Nivel | Valor | Uso |
|---|---|---|
| Sutil (0) | `0 1px 3px rgba(20,47,29,.05)` · `0 1px 2px rgba(0,0,0,.04)` | Tarjetas planas, filas |
| Elevada (1) | `0 6px 16px -12px rgba(20,47,29,.3)` · `0 6px 16px -10px rgba(20,47,29,.35)` | Tarjetas tocables, filas destacadas |
| Flotante (2) | `0 6px 20px rgba(0,0,0,.12)` · `0 6px 22px rgba(0,0,0,.2)` | Menús contextuales, toast |
| Modal (3) | `0 24px 60px rgba(0,0,0,.25)` · `0 18px 50px rgba(20,47,29,.32)` | Sheets y modales |
| Nav inferior | `0 -6px 24px rgba(20,47,29,.08)` | Barra de navegación |
| Glow verde (CTA) | `0 4px 18px rgba(45,90,61,.25)` / `...rgba(76,186,110,.35)` | Botón primario activo |
| Liquid glass | `inset 0 1px 0 rgba(255,255,255,.9), 0 10px 22px -14px rgba(31,74,48,.5)` | Stat pills translúcidas |

**Convención:** las sombras van tintadas de verde (`rgba(20,47,29,…)` / `rgba(45,90,61,…)`), no negro neutro, salvo overlays y toasts. Sombras "lifted" con **spread negativo** para un halo suave y difuso.

---

## 5. Iconografía

- **Librería única:** [`lucide-react`](https://lucide.dev). Import nominal (`import { Home, Settings } from "lucide-react"`).
- **Tamaños:** nav `20`, sección `16`, chip/inline `12–15`, burbuja de icono `18–21`, decorativo grande `32`.
- **Grosor:** `strokeWidth` por defecto `2`; **estado activo/énfasis `2.4`** (`2.2` en burbujas). El cambio de grosor es una señal de selección tan importante como el color.
- **Color:** hereda el color de estado (verde activo `#2d5a3d`, inactivo `#9ab0a1`). Sobre verde, `#fff`.
- **Burbuja de icono:** cuadrado redondeado (`radius 12–14`), fondo de color/tint, icono centrado; en momentos destacados con glow `0 4px 12px {color}55`.
- **Iconos de categoría** mapeados 1:1 a su color de categoría (ver §1.6).
- SVG a medida solo para logos de marca ajenos (ej. glifo de Google multicolor).

---

## 6. Componentes (biblioteca `components/ui.jsx`)

### 6.1 `Chip`
Pill seleccionable. `padding: "6px 14px"`, `radius 20`, `fontSize 13`, `fontWeight 500`.
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
- Header: burbuja de icono `44×44` con glow + título `16/900` + subtítulo `12.5/600`; botón cerrar circular `32px` con `<X>`.
- `WizardOptionCard`: fila grande tocable, blanca sobre el tint, `radius 18`, icono en burbuja + título `15/800` + subcopy `12/600`.

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

- **Bottom sheet:** blanco (o `#f5f9f6`), `radius 20 20 0 0`, `max-width 420`, "grabber" superior (`38×4 radius 999 #dde7e0`), header con título `17/900` + subtítulo `12`, botón cerrar circular gris `#f0f4f1`.
- **Sticky header dentro de sheet:** `position: sticky; top: 0; zIndex 5; background: #f4f8f5`.
- **Overlay de fondo:** `rgba(0,0,0,.5)`, `position: fixed; inset: 0`, animación `mp-overlay-in`.
- **z-index:** contenido `5`, nav `100`, toast `200`, modales/sheets `300`.
- **Footer de sheet:** `borderTop: 1px solid #eef3f0`, con padding que respeta `env(safe-area-inset-bottom)`.

---

## 9. Toasts / feedback efímero

```js
position: fixed; bottom: 80; left: 50%; transform: translateX(-50%);
background: #1a3a24; color: #fff; padding: "10px 18px"; borderRadius: 24;
fontSize: 13; fontWeight: 600; boxShadow: "0 6px 22px rgba(0,0,0,.2)";
zIndex: 200; maxWidth: 320; textAlign: center;
```
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

**Reglas:**
- Transiciones de estado inline: `.15s`–`.2s` (`all .15s`, `background .2s`, `transform .15s`).
- Easing "natural" preferido: `cubic-bezier(.25,.46,.45,.94)`; para dots `cubic-bezier(.4,0,.2,1)`.
- Pulsación: `scale(.97)`.
- **`prefers-reduced-motion: reduce`** → todas las animaciones caen a un simple fade `.12s`.
- ⚠️ Nota técnica en el propio CSS: usar `backwards` (no `both`) en wrappers de pantalla para no romper `position: fixed` de overlays anidados.

---

## 11. Formularios / inputs

- **`font-size: 16px` obligatorio** en `input/textarea/select` (regla global + inline) para evitar el auto-zoom de iOS Safari con viewport bloqueado.
- **Placeholder** uniforme `#9aa8a0` (`opacity: 1`).
- **Inputs numéricos compactos:** clase `.mp-no-spinner` elimina las flechas nativas.
- Estilo típico de input: fondo `#fff` (o `#f4f7f5`), borde `1.5px #e8efe9`, `radius 12`, `padding ~"10px 12px"`, texto `16 #1a3a24`.
- Foco/activo → borde verde `#2d5a3d`.

---

## 12. Voz y tono (copywriting)

- **Idioma:** español de España, cercano y cálido, tuteo implícito.
- **Etiquetas de navegación:** cortas y humanas — `Inicio`, `Recetas`, `Menús`, `En casa`, `Perfil`, `Compra`, `Análisis`.
- **Títulos de decisión** en forma de pregunta directa: `¿Para quién es el menú?`, `¿Cómo coméis en casa?`.
- **Eyebrows/labels** en mayúsculas y muy breves (`SEMANA`, `ALÉRGENOS`).
- **Copy principal (título)** conciso; **subcopy** una frase explicativa amable en color atenuado.
- **Confirmaciones** con energía positiva y emoji puntual: `¡Cocinado!`, `¡Cocinado! Stock en casa actualizado (3)`.
- **Objetos entre comillas angulares** «…» en mensajes.
- **Estados vacíos:** icono grande atenuado (`size 32 #cdd8d0`) + texto guía `#9ab0a1`, centrado, `padding "40px 20px"`.

---

## 13. Accesibilidad

- Roles/ARIA en controles a medida: `role="switch"` + `aria-checked` (toggle), `aria-label` en botones-icono (`Cerrar`), `aria-label="Navegación principal"` en la nav.
- Contraste alto texto/fondo por diseño (Ink sobre blanco; blanco sobre verde).
- Soporte de `prefers-reduced-motion`.
- Áreas táctiles amplias (mín. ~40px en botones-icono, 46px en scope circles, nav de altura 80).
- Safe areas respetadas en todos los elementos fijos.

---

## 14. Checklist para pantallas/componentes nuevos

- [ ] ¿El fondo de página es un verde casi blanco (`#f4f8f5`/`#f7f9f7`) y las tarjetas blancas?
- [ ] ¿Todo lo interactivo/seleccionado usa el verde `#2d5a3d` (relleno) o su tint (`rgba(45,90,61,.08)`)?
- [ ] ¿Radios coherentes (12 controles / 16 tarjetas / 20 pills / 26 sheets / 999 circulares)?
- [ ] ¿Espaciado en múltiplos de 4 y `max-width 420`?
- [ ] ¿Iconos de `lucide-react`, `strokeWidth 2` (2.4 si activo), tamaño acorde?
- [ ] ¿Tipografía DM Sans, pesos 600–900, inputs a 16px, `fontFamily: "inherit"` en botones/inputs?
- [ ] ¿Sombras tintadas de verde y con spread negativo para elevación?
- [ ] ¿Estados: seleccionado, deshabilitado (fondo `#c8d9ce`), pulsado (`scale(.97)`), vacío?
- [ ] ¿Transiciones 0.15–0.22s y respeto a `prefers-reduced-motion`?
- [ ] ¿Copys cortos, cálidos, en español, con eyebrows en mayúsculas?
- [ ] ¿ARIA/labels en controles a medida y safe-area en elementos fijos?

---

*Fuentes en el repo:* `src/index.css` · `src/components/ui.jsx` · `src/screens/{Onboarding,Settings,Dashboard,Menu,Shopping,RecipePlanner,CatalogBrowserSheet,HomeProfileScreen}.jsx`.
