# Diseño: estado y plan del sistema

Auditoría del 9 oct 2026 (issue #239) sobre la rama `ux/239-auditoria-ui`.
Lo mantiene el agente `diseno`: cuando una cifra cambie, se actualiza aquí
con su fecha. `DESIGN_SYSTEM.md` describe criterio y voz; este fichero dice
qué falta y en qué orden. **Desde el PR del encargo #258 (9 oct 2026) existen
`src/design/tokens.js` (los 77 valores, fuente única), `src/design/tokens.css`
(generado, `npm run tokens:css`), la regla `local/no-valor-suelto` en aviso y
`lint-tokens-base.json`; ninguna pantalla está migrada todavía.** Los valores
de «Tokens propuestos» son los que quedaron en el módulo; los marcados
provisionales (interlineado de los roles de texto, `margen-pantalla` = 16,
`separacion-lista` = 8) se confirman al migrar la primera pantalla. Las
`--pz-*` de `index.css` (tema oscuro de la pizarra) son excepción declarada: no
se absorben en los tokens.

**Cifra de la regla (9 oct 2026, antes de migrar nada):** 12.793 valores
sueltos en 4.545 entradas `fichero | tipo | valor` y 83 ficheros — color 4.581,
espaciado 3.650, tamano-letra 1.289, radio 1.187, peso 1.175, movimiento 460,
sombra 307, capa 144 — y 0 `eslint-disable` de la regla. Se regenera con
`npm run lint:base -- --actualizar` (solo baja); sustituye a la tabla de regex de «Lo que hay» (que sigue
siendo la medida de la auditoría, con otro alcance).

## Decisiones

«Decidida por la sesión» = reversible: Pablo puede darle la vuelta.

| # | Decisión | Estado | Resultado |
|---|---|---|---|
| D1 | Color de marca | **Decidida por Pablo (9 oct 2026)** | Verde `#2d5a3d` = marca; teal `#0f766e` = acento de lo elegido; terracota fuera. Los usos de teal que no son selección, resueltos en D11 |
| D2 | Nombre en docs | Decidida por la sesión (9 oct 2026), reversible | HoMenu (`index.html` y manifest ya lo dicen). Aplicada al título de `DESIGN_SYSTEM.md` en el PR de tokens. **Pendiente:** el título de `README.md` (plantilla de Vite; fuera de ese PR) |
| D3 | Idioma de carpetas de assets | Decidida por la sesión (9 oct 2026), reversible | Castellano, kebab-case ASCII: `diseno/`, `scripts/diseno/`, `public/img/<familia>/`. Excepción justificada: el módulo de código `src/design/` (nombre ya fijado en el encargo del agente y en #239; las carpetas de código `src/lib`, `src/components` no siguen D3, que habla de assets) |
| D4 | Dónde viven los originales (1024 px, Midjourney) | **Decidida por Pablo (9 oct 2026)** | Vercel Blob, que ya guarda 1.035 fotos de platos; nunca `public/` ni el repo normal. Subir los originales sigue siendo un paso con su aviso (gasta espacio en un servicio externo) |
| D5 | Textos de ayuda | Decidida por la sesión (9 oct 2026), reversible | Manda la regla «Sin textos que nadie pidió» de `.claude/rules/ui.md` (sin subtítulos explicativos ni texto de ayuda). Retirada la línea contraria de `DESIGN_SYSTEM.md` (§12) en el PR de tokens |
| D6 | Mapa de color de categoría | Decidida por la sesión (9 oct 2026), reversible | Manda `CATEGORY_META` de `src/screens/CatalogBrowserSheet.jsx`; pasa a datos aparte |
| D7 | Escala de tokens | Decidida por la sesión (9 oct 2026) | Medir primero (hecho) y ajustar a la escala en un PR aparte, con capturas |
| D8 | Capturas de referencia | Decidida por la sesión (9 oct 2026) | Solo en local por ahora; CI de capturas más adelante y no obligatorio |
| D9 | Playwright como devDependency | **Abierta**, cuando se llegue a capturas | Sin ella no hay capturas definitivas ni la herramienta del paso 1 (hoy no está instalado). Es añadir una dependencia: gateway de `diseno` |
| D10 | Borrar duplicados y carpetas | **Decidida por Pablo (10 oct 2026): borrar duplicados**. Hecho en ux/limpieza-duplicados: 69 png de `Avatares/` (idénticos a `public/avatares/`), 4 de `public/categories/` (carne, pescado, pasta_arroz, verduras) y `menus_cole/` (3 PDF sin referencias). Se dejan: `Avatares/cards` (originales de los scripts `make_*.py`), los png de tienda (distintos bytes que el svg, nunca se cargan porque gana el svg; decidir) y `dish-gallery/` (retirada después, #301) | Ver «Assets» |
| D11 | Usos de teal que no son selección | **Decidida por Pablo (9 oct 2026)** | Opción A (ver «Teal»): CTA a verde de marca; el teal queda para lo elegido y, en la zona social, como `acento` |
| D12 | Logo: `brand/homenu-teal.*` es teal y `public/logo-homenu.svg` terracota | **Abierta**, cambiar el logo es gateway | Con D1 ninguno es el verde de marca. Recomendación: un único logo maestro en verde |
| D13 | Rutas de avatares guardadas en base | **Abierta (`datos` y `auditor-datos`)** | Ver «Assets». Sin su decisión no se renombra ninguna ruta de avatar |
| D14 | Placeholder | Decidida por la sesión (9 oct 2026), reversible | `#9ab0a1` (108 usos). `index.css` (la regla global de `::placeholder` y la de `.mp-panel-input`) sigue diciendo `#9aa8a0` (10 usos): es un cambio visible mínimo, **se cambia al migrar**, no en el PR de tokens. `DESIGN_SYSTEM.md` §11 ya dice `#9ab0a1` |

## Lo que hay (medido el 9 oct 2026)

**Tokens: existen desde el PR de #258, pero ninguna pantalla los usa.** Esta
sección es la medida de ANTES: sin Tailwind, sin variables CSS globales (solo
`--pz-*` de la pizarra en `src/index.css`), sin objeto de tema.

Método de las cifras: expresiones regulares sobre `src/**/*.jsx` (74
ficheros, sin `*.test.*`) contando literales escritos a mano; lo que sale de
`src/**/*.js` o `index.css` se dice aparte. No son las cifras de la regla de
lint: cuando exista, su resultado sustituye a esta tabla. Las cifras del 7 oct
(764 colores, 3.781 estilos…) tenían otro alcance y no son comparables. El
script de medida no está en el repo todavía: va con la regla
(`scripts/diseno/`), para que esta tabla se pueda regenerar.

| Medida | Valor | Regex |
|---|---|---|
| Estilos inline `style={{` | 3.767 | `style=\{\{` |
| Hex: apariciones / distintos | 4.061 / 660 (3 y 6 cifras, normalizados a 6) | `#[0-9a-f]{6}\b\|#[0-9a-f]{3}\b` |
| `rgb/rgba/hsl` apariciones / distintos | 704 / 246 | `rgba?\(…\)\|hsla?\(…\)` |
| Hex fuera de `.jsx` | 196 en 15 ficheros `.js` de `src` (`menuExport.js` 57, `dishVisuals.js` 27, `cookings.js` 18, `allergensCore.js` 15, `applianceMethods.js` 12, `panelSuggestions.js` 12, `stages.js` 12, `recipeSteps.js` 11, `mealTimes.js` 8, `wizardRegistry.js` 8, `groups.js` 7, `healthProfileMatch.js` 5, y 3 con 1–2); 11 hex y 4 `rgba` en `index.css` | mismo regex |
| Tamaños de letra distintos (usos) | 29 (1.236), con medios puntos | `fontSize:\s*N` |
| Radios numéricos distintos (usos) | 23 (1.070), más 12 formas de 2–4 lados o `50%` | `borderRadius:\s*N` |
| Pesos de letra | 7 distintos: 800 ×510, 900 ×231, 700 ×214, 600 ×145, 500 ×4, 750 ×3, 400 ×1 | `fontWeight:\s*N` |
| `boxShadow` literales: distintos / usos | 161 / 238 | `boxShadow:\s*"…"` |
| `zIndex` distintos / usos | 47 / 169 | `zIndex:\s*N` |
| Curvas `cubic-bezier` distintas (usos) en `.jsx`, `.js` y `index.css` | 31 | `cubic-bezier\([^)]*\)` |
| Familias tipográficas | 2: DM Sans (global) y Playfair Display en 5 sitios | `fontFamily` |
| `const GREEN` / `INK` / `TEAL` redefinidas | 29 / 31 / 12 ficheros | `const GREEN\s*=` |
| Overlays propios `position:"fixed", inset:0` | 77 ocurrencias en 35 ficheros | adyacentes en el literal |
| `Card` local con ese nombre exacto / `*Card` en total | 4 / 32 | `^(export )?(function\|const) Card\b` |
| `*Sheet` / `*Modal` locales | 45 | idem con `(Sheet\|Modal)` |
| Iconos | `icons.jsx`: 171 exports; 13 `<svg>` a mano en 5 ficheros fuera de él | `<svg` |
| `src/components/ui.jsx` | 1.714 líneas, 28 exports | |
| Catálogo en el chunk inicial | 6,45 MB (dato de `ops/PLANOS.md` del 7 oct, no remedido hoy) | |

Colores por propiedad (clasificación aproximada por el texto de las 45
posiciones anteriores): texto 278 distintos en 1.804 usos, fondo 209 en 1.141,
borde 127 en 514, sin propiedad clara (constantes, objetos) 258 en 592.

Más hex por fichero (7 oct, sin remedir): `Onboarding.jsx` 535, `Menu.jsx`
448, `Shopping.jsx` 225, `CatalogBrowserSheet.jsx` 221.

**Contradicciones entre la documentación y el código**
- Z-index: el doc dice nav 100, toast 200, sheets 300. El código tiene nav 100
  (`ui.jsx:513`), sheet de `ui.jsx` 300 y el toast de `App.jsx:7064` en **320**,
  el mismo nivel que las hojas sobre hojas (`FollowListSheet`, `ReportSheet`…).
- El doc cita `#1c4a2e` (verde oscuro) y `#47a066` como colores del sistema: se
  usan 5 y 1 veces.
- Info: el doc dice `#2f6f9f` (`DESIGN_SYSTEM.md` §1, antes de corregirlo; 4 usos); el azul de
  info más usado es `#2f6d8a` (15).
- Fondo de pantalla: el doc dice `#f4f8f5` y `#f7f9f7` (`DESIGN_SYSTEM.md` §0 y §14,
  antes de corregirlo; 12 y 16 usos); el más usado entre los cuatro casi idénticos es `#f5f9f6` (21).
- Peso de letra: `DESIGN_SYSTEM.md` §0.5 decía 700/800/900, y §2 y §14 decían
  600–900 (corregido en el PR de tokens); el `Chip` documentado usa 500 (4 usos de 500 en todo el código).
- Iconografía «única Nucleo»: `src/lib/menuExport.js` (HTML exportado) dibuja
  iconos a mano con nodos de estilo lucide. No hay dependencia lucide.
- `DESIGN_SYSTEM.md` se titulaba MenuPlan (D2, corregido). `README.md` es la plantilla de
  Vite. `ILUSTRACIONES-PASOS.md` planifica 20 ilustraciones que no existen.
- La regla «Sin textos que nadie pidió» de `ui.md` y `DESIGN_SYSTEM.md` §12 sobre textos de ayuda (D5, corregido).
- `DESIGN_SYSTEM.md` §0.3 («verde = todo lo interactivo/seleccionado») chocaba
  con D1 (teal = lo elegido); corregido.
- Colores de categoría: **legumbres** tiene 4 valores: `#b9770e`
  (`CatalogBrowserSheet`, `PizarraControles`, `RecipePlanner`), `#a06b2f`
  (`SliderReparto`), `#8b6914` (`Shopping`) y `#2d8a48` (`Analytics`,
  `dishVisuals`). Y `#b9770e` es también «india» en cocinas.
- qa vio 3 estilos de Atrás/Volver y 3 tratamientos de tarjeta de plato.

### Teal: no es solo selección

D1 dice «teal = acento de lo elegido». El código lo usa para más: 42
apariciones de `#0f766e`, 12 de ellas la definición de `const TEAL`, más las
constantes con otro nombre (`CARD_ACCENT_TEAL`, `SELECTED_TEAL`, `CASA_COLOR`,
`BUDGET_SLIDER_TEAL`, `EMPTY_ACCENT`, `SELECTED`). Por uso:

| Uso | Dónde (ejemplos) | ¿Selección? |
|---|---|---|
| Marcar lo elegido (borde, check, fondo) | `BasesPreferidas`, `ReportSheet`, `ShareRecipeSheet`, `wizard/ControlSheet`, `wizard/ControlRow`, teselas de `CatalogBrowserSheet`, `PizarraControles`, `SegmentedTabButton accent` | Sí |
| Botón primario o enlace de la zona social | `PersonSheet` (Seguir), `DiscoverPeopleSheet`, `ProfileDrawer`, `CommentThread`, `SharedMenuCard`, `ShareMenuSheet` | No: es acción |
| CTA primario | `Onboarding.jsx:417,439` (Siguiente, Terminar), `CatalogBrowserSheet.jsx:3427` | No: es acción, choca con «verde = acción» |
| Color de dato o de grupo | `Onboarding` `CASA_COLOR` y grupo «Todos», `cookings.js:88` (una opción de paleta), `NotificationsPopover:222`, color por defecto de `Avatar` en social, pista del slider de presupuesto, `Pantry` `EMPTY_ACCENT`, degradado de `FeedScreen:2549` | No |

**Opción A (D11, decidida por Pablo el 9 oct 2026):** `seleccionado` solo para lo elegido
(borde, check y su tinte); los CTA primarios de `Onboarding` y del catálogo
pasan a `marca` (verde); la zona social conserva el teal con el rol `acento`;
los colores de dato salen del mapa de categorías o de la paleta de grupos.
Cambia píxeles en unos 5 sitios de CTA: va en su PR de pantalla, con capturas.
Si Pablo la revirtiera, `acento` se quitaría del sistema.

**Regla de selección que fijó el PR de tokens** (el código de hoy aún mezcla):
`seleccionado` es un **rol de color** (teal) y marca **lo elegido en una lista,
tesela u hoja de elección**; los controles de estado y acción (`Chip`,
`Toggle`, `Segmented`, `BottomNav`, botón primario) se pintan en `marca`
(verde) y su estado se llama `activo`, no `seleccionado` (ver «Vocabulario de
estados»). Ese PR reescribió `DESIGN_SYSTEM.md` §0.3, §1.1 y §14 y la regla de
tokens de `ui.md`.

## Arquitectura del sistema

1. **Dos capas de tokens.** Primitivos (valores crudos; solo existen en
   `src/design/tokens.js` y **no se importan fuera de él**) y roles (`marca`, `tinta-suave`, `fondo-pantalla`,
   `superficie`, `linea`, `seleccionado`, `peligro`…). Los componentes usan
   solo roles; el HTML exportado (`menuExport.js`) importa los ROLES (`color`),
   que ya llevan el hex. No hay capa de tokens por componente salvo desvío real.
2. **Fuente única: los tokens de `src/design/tokens.js`.** Las variables CSS son
   una proyección **generada** de ellos (un script) y un test comprueba que lo
   generado coincide. El JS referencia `var(--…)`, que también resuelve alfa
   (`color-mix` o variables `-rgb`); donde no hay CSS (HTML exportado, PDF) usa
   el módulo de tokens directamente. Modo oscuro: los roles lo permiten; **no se
   construye ahora**.
3. **Un solo mecanismo para `DESIGN_SYSTEM.md`:** sus tablas de valores se
   **comprueban** con un test contra los tokens (no se generan); la prosa de
   criterio se queda escrita a mano. Si una tabla y los tokens discrepan, falla
   el test.
4. **Relaciones entre tamaños.** Espaciado: múltiplos de 4 con **dos excepciones
   declaradas, 2 y 6** (juntas 467 usos de `gap` y `padding`/`margin` hoy: 2
   ×192 y 6 ×275). Área táctil ≥ 40 px independiente del tamaño visual (se
   amplía con padding o pseudo-elemento). Radio interior = radio exterior −
   padding: **solo orienta al diseñar, no genera valores**; los valores son los
   de la escala.
5. **Lean.** Sin librerías nuevas. Un token sin uso se borra. Entra al sistema
   solo lo que usan ≥ 3 sitios.

## Tokens propuestos (77 valores)

Los 77 valores y su reparto por familia los fija `src/design/tokens.test.js` (el
reparto no se copia aquí). Los alias (`acento`, `exito`) y los roles de texto no
cuentan: no añaden valor. Los alias (`acento`, `exito`) y los roles de
texto no cuentan: no añaden valor.

«Fusiona» cuenta hex distintos que caen en ese valor por cercanía RGB ≤ 12
(casi idénticos) y ≤ 30, de forma automática e indicativa. La lista final de
fusión se fija en el PR de tokens mirando el uso (fondo, borde o texto), no solo
el valor. De los 660 hex, 268 caen a ≤ 12 de algún ancla (3.056 usos) y 426 a
≤ 30 (3.562 usos); 127 de los que quedan fuera se usan una sola vez. Un hex
pertenece a **un solo** rol.

### Color (25)

| Rol | Valor | Usos exactos | Fusiona (≤12 / ≤30) | Nota |
|---|---|---|---|---|
| `marca` | `#2d5a3d` | 372 | 2 / 3 | favicon, `theme-color` y manifest ya lo usan |
| `marca-viva` | `#4cba6e` | 37 | 1 / 4 | fin de degradado, «hecho» |
| `marca-fondo` | `#eaf6ee` | 12 | 30 / 32 | tinte verde (badge, nav seleccionado, éxito); `#e8f0ea` (23), `#e9f4ed` (13) |
| `seleccionado` | `#0f766e` | 42 | 1 / 3 | D1. `acento` es alias del mismo primitivo (ver D11) |
| `seleccionado-fondo` | `#eef6f4` | 7 | 13 / 20 | **el** tinte de lo elegido (uno solo); `#e2f1ee` |
| `tinta` | `#142f1d` | 211 | 4 / 10 | absorbe `#1a3a24` (58 usos; distancia ≈ 14): fusión visible, a mirar |
| `tinta-media` | `#42594c` | 14 | 8 / 23 | texto secundario oscuro (`#3d5245`, `#3a4a42`) |
| `tinta-suave` | `#5a7066` | 64 | 13 / 20 | `#5a7a66`, `#5f7568`, `#6b7d70` |
| `tinta-tenue` | `#7a9485` | 67 | 9 / 20 | metadatos; absorbe `#7a8a7f` (54) |
| `tinta-palida` | `#9ab0a1` | 108 | 8 / 17 | placeholder (D14) e icono inactivo; `#8aa294` (35) cae aquí |
| `superficie` | `#ffffff` | 874 (`#fff` incluido) | 5 / 5 | tarjetas, texto sobre marca |
| `fondo-pantalla` | `#f5f9f6` | 21 | 26 / 27 | `#f4f7f5` (21), `#f7f9f7` (16), `#f4f8f5` (12): hoy 4 fondos casi idénticos |
| `fondo-suave` | `#f0f4f1` | 41 | 12 / 13 | pista de segmented, botón ghost; **incluye `#eef4ef` (36)**, que se usa sobre todo como fondo |
| `linea-suave` | `#eef3f0` | 66 | 13 / 14 | separadores; **sin** `#eef4ef` |
| `linea` | `#e0eae3` | 45 | 61 / 82 | bordes de tarjeta; `#e3ebe6` (38), `#e8efe9` (24, se usa como borde), `#dde7e0` (17) |
| `linea-fuerte` | `#cdd8d0` | 17 | 20 / 50 | checkbox, chevrons; `#cfe0d6` (21), `#c2cfc7` (14) |
| `peligro` | `#c0392b` | 61 | 1 / 12 | texto/acción destructiva y estado de error |
| `peligro-fondo` | `#fdecea` | 5 | 19 / 26 | |
| `favorito` | `#e0405a` | 19 | 1 / 1 | corazón activo |
| `aviso` | `#b45309` | 9 | 1 / 5 | |
| `aviso-fondo` | `#fff8e7` | 3 | 12 / 16 | |
| `info` | `#2f6d8a` | 15 | 1 / 7 | el doc dice `#2f6f9f`; ese valor se queda en el mapa de categorías (pescados) |
| `info-fondo` | derivado de `info` con alfa .10 | — | — | **provisional**: sin evidencia en el código, no se inventa un hex |
| `scrim` | `rgba(0,0,0,.45)` | 19 | 6 opacidades hoy | modal; `rgba(0,0,0,.5)` (22) y `rgba(20,47,29,.45)` (13) se fusionan aquí |
| `velo` | `rgba(255,255,255,.92)` | 24 | — | cristal sobre imagen |

Alias sin valor propio: `acento` = `seleccionado`; `exito` = texto `marca` sobre
`marca-fondo` (el código no tiene color de éxito propio).

Fuera del sistema (a decidir al migrar):
- `#1c4a2e` y `#47a066`: 5 y 1 usos; no llegan al listón de 3.
- Escala slate de Compra (`#64748b` 17, `#334155` 2, `#f1f5f9` 4, `#5a7a9a` 7):
  choca con «nunca gris frío» del doc. Decidir al migrar `Shopping`.
- Azul `#4a6fd4` (10): enlaces y secciones sociales (`BLUE` en
  `NotificationsPopover`, `CommentThread`, `DiscoverPeopleSheet`). Candidato a
  `info` o a retirar.
- Morado `#7c3aed` (3), privacidad `#5a2d7a`/`#f5edfc`/`#7a4e00`.
- **Mapa de categorías (D6)**: 18 colores de `CATEGORY_META` + 6 de `FACET_META` +
  8 de `COCINA_META` (`CatalogBrowserSheet.jsx:112–204`). Son datos, no roles:
  viven en un fichero de datos aparte (`src/design/categorias`), con
  `#5a7066` (= `tinta-suave`) de color por defecto. Los otros mapas (legumbres,
  `SliderReparto`, `Shopping`, `Analytics`, `RecipePlanner`) se reconducen a él.

### Tipografía (12)

| Token | Valor | Medido |
|---|---|---|
| familia | DM Sans (1; Playfair Display ×5 sale o se decide) | `index.css:11` |
| pasos (8) | `10 / 11 / 12 / 13 / 14 / 16 / 20 / 26` | ver tabla de snap |
| pesos (3) | `700 / 800 / 900` | 86 % de los usos; 600 (145) sube a 700. `DESIGN_SYSTEM.md` §0.5 ya lo decía; §2 y §14 se corrigieron en el PR de tokens |
| roles de texto | `titulo`, `cuerpo`, `etiqueta`, `mini` con interlineado | combinan lo anterior; interlineado **provisional** (los más usados de 287 `lineHeight`: ver `tokens.js`) |

Divergencia: la escala de 8 pasos no tiene 15 (43 usos), 18 (17) ni nada por
encima de 26 (28, 30, 32, 46: 6 usos; títulos de héroe). Esos 6 se dejan fuera
de la escala hasta mirarlos uno a uno.

### Espaciado (9), radios (7), sombras (4), capas (8), movimiento (4), tamaños (8)

| Familia | Propuesta | Divergencia con el código |
|---|---|---|
| Espaciado (9) | `2 / 4 / 6 / 8 / 12 / 16 / 20 / 24 / 32` (2 y 6 son excepciones declaradas); roles `margen-pantalla` y `separacion-lista` | Sin las excepciones, 6, 10, 14, 18 y 22 sumarían unos 1.140 usos. Los roles se midieron del código y son **provisionales**: `margen-pantalla` 16 (se usa más el 14, pero 16 está en la escala) y `separacion-lista` 8 (`tokens.js`). `0` va en la lista blanca |
| Radios (7) | `4 mini · 8 chico · 12 control · 16 tarjeta · 20 panel · 26 modal · 999 pildora` | `control` 12 = botones e inputs; `tarjeta` 16; `panel` 20 = esquinas altas de hoja (`20px 20px 0 0`); `modal` 26 = tarjeta de `WizardSheet` (todo en `DESIGN_SYSTEM.md` §3.2 y §6). `mini` 4 **no estaba en la propuesta**: 72 usos entre 2 y 7. `50%` (87 usos, círculos) en lista blanca |
| Sombras (4) | niveles `0–3` | 161 literales distintos. Por desenfoque (otra regex, 225 literales de una pieza): ≤ 4 px ×65, 5–12 ×39, 13–24 ×47, 25–40 ×24, > 40 ×39, `inset` ×6, `none` ×5. Se agrupan en 3 niveles por desenfoque |
| Capas (8) | `capa-local` 1–5 (**provisional**: el tope, 5) · `capa-nav` 100 · `capa-flotante` 150 · `capa-hoja` 300 · `capa-hoja-2` 320 · `capa-toast` 330 · `capa-emergente` 1000 · `capa-tutorial` 1200 | 47 valores hoy. Regla: el toast va por encima de toda hoja (≥ `capa-hoja-2`). Otros valores en uso: 1150–1250 (tutorial y coach de `Menu`, `DishActionBar`, `Onboarding`), 1300, 3000 (`SchoolMenuDeck`) y 9999 (`InstallPwaBanner`) se reconducen a `capa-tutorial` o `capa-emergente` al migrar; 340–342 (`FeedScreen`) se miran uno a uno |
| Movimiento (4) | 3 duraciones: `rapida` .15 s · `media` .22 s · `lenta` .35 s; 1 curva `cubic-bezier(.4,0,.2,1)`; `prefers-reduced-motion` respetado por defecto | Duraciones medidas en `transition`/`animation` (primera de cada declaración, `.jsx` + `.js` + `index.css`): .22 s ×17, .12 ×10, .15 ×9, .2 ×8, .18 ×8, .16 ×7, .3 ×6, .34 ×6, .4 ×5, .26 ×5; se agrupan .12–.18 → rápida, .2–.26 → media, .3–.4 → lenta. Curva: `cubic-bezier(.4,0,.2,1)` 32 usos (26 + 6 escritos `0.4,0,0.2,1`), luego `.22,1,.36,1` 15 y `.25,.46,.45,.94` 14. `index.css` tiene 24 usos de 14 curvas y **no lee tokens hoy**; sus curvas de rebote en `@keyframes` (p. ej. `.34,1.4,.64,1`) quedan como excepción declarada, porque `ui.md:23-24` manda transcribir los keyframes, no sustituirlos. 5 reglas `prefers-reduced-motion` en `index.css` |
| Tamaños (8) | táctil ≥ 40 · iconos `14 / 16 / 18 / 20 / 24` · columna 420 · nav 80 (más safe-area, que es `env()` y no un valor) | Columna 420 y nav 80 ya son constantes de `ui.jsx:72-73`. Iconos: `size=` medido sobre 771 usos: 16 ×117, 15 ×92, 18 ×84, 14 ×77, 13 ×61, 17 ×60, 12 ×50, 11 ×40, 20 ×25, 22 ×22. La escala original 16/20/24 cubre 158 (20 %); **14/16/18/20/24 cubre 319 (41 %)**. Lo demás (15, 13, 17, 12…) se mueve en el snap |

Táctil ≥ 40: no se ha medido cuántos controles quedan por debajo (`width`/`height`
de 24 a 38 suman cientos, pero no se sabe cuáles son botones). Lo medirá `qa` o
la regla de lint.

### Tabla de «snap» (se aplica en PR aparte, D7)

Regla: al paso más cercano; en empate, **hacia arriba** (el texto no se
encoge). `0` no se toca (lista blanca). «Cambian» cuenta usos cuyo valor se
mueve. Las tablas de radios y espaciado se calcularon sobre la escala **sin**
las propuestas `4`/`2`/`6`; con ellas, los valores pequeños se reparten así:
radios 2–5 (31 usos) a `mini` 4 y 6–7 se quedan en 8; espaciado 1–3 (288 usos de
padding/margin y 76 de gap) a 2, y 5–6 (padding/margin 202, gap 199) a 6; 7 y 9 siguen yendo a 8.

**Tamaño de letra** (1.236 usos, 519 cambian = 42 %):

| Paso | Recibe (valor actual × usos) | Usos que recibe |
|---|---|---|
| 10 | 8,5×3, 9×19, 9,5×21, 10×49 | 92 |
| 11 | 10,5×57, 11×134 | 191 |
| 12 | 11,5×81, 12×165 | 246 |
| 13 | 12,5×133, 13×184 | 317 |
| 14 | 13,5×80, 14×105, 14,5×21 | 206 |
| 16 | 15×43, 15,5×2, 16×54, 16,5×2, 17×19 | 120 |
| 20 | 18×17, 19×12, 20×16, 21×1, 22×6 | 52 |
| 26 | 24×2, 26×4 | 6 |
| fuera | 28×2, 30×2, 32×1, 46×1 | 6, a decidir |

**Radios numéricos** (1.070 usos, 474 cambian = 44 %):

| Paso | Recibe |
|---|---|
| 8 | 1×1, 2×11, 3×7, 4×10, 5×3, 6×14, 7×27, 8×53, 9×40 (166) |
| 12 | 10×112, 11×54, 12×136, 13×30 (332) |
| 16 | 14×108, 15×10, 16×67 (185) |
| 20 | 18×22, 20×33, 22×11 (66) |
| 26 | 24×14, 26×6 (20) |
| 999 | 99×4, 999×297: ya son píldora; `50%` ×87 se queda |

**Espaciado** (`gap` 944 usos; `padding`/`margin` numéricos 3.326, de ellos 814
son `0`):

| Paso | Valores que caen |
|---|---|
| 4 | 1, 2, 3, 4, 5 |
| 8 | 6, 7, 8, 9 |
| 12 | 10, 11, 12, 13 (gap 242 / padding 683) |
| 16 | 14, 15, 16 |
| 20 | 18, 19, 20 |
| 24 | 22, 24, 26 |
| 32 | 28, 30, 32 |
| fuera | 34, 40, 42, 44, 48, 50, 54, 56, 84, 120 (22 usos de padding/margin): a mirar uno a uno |

Cuesta: solo en `padding`/`margin`, 1.478 de 2.512 usos distintos de 0 (59 %)
cambian de valor (cifra sobre la escala sin 2 ni 6). Es una migración visible;
por eso va en su PR, pantalla a pantalla, con capturas antes y después, y no
junto a la migración exacta.

## Componentes

Entra al sistema solo lo que usan ≥ 3 sitios. Hay 15 en la lista; **8 no tienen
primitivo hoy** (`Button`, `Card`, `Field`, `Sheet` unificado, `HeaderPantalla`,
`ListRow`, `Skeleton`, `Spinner`). Los pide el issue #239, de modo que
`ui.md` («no inventes componentes nuevos sin que se pidan») no los bloquea.

Variantes cerradas (`variante`, `tamano` con `s / m / l`; nunca props de estilo
libres). Cada uno tiene su entrada en `/catalogo` (solo DEV, tras unificar).
### Vocabulario de estados (único sitio)

Es el vocabulario de todo el sistema; `DESIGN_SYSTEM.md`, `qa.md` y los
componentes lo usan tal cual y no definen otro.

| Estado | Significa |
|---|---|
| `reposo` | sin interacción |
| `pulsado` | mientras se toca (`scale(.97)`) |
| `activo` | un control de estado o de acción está encendido (`Chip`, `Segmented`, `BottomNav`, `Toggle`); se pinta en `marca` (verde) |
| `deshabilitado` | no se puede usar |
| `cargando` | esperando datos (`Skeleton`, `Spinner`); no «carga» |
| `peligro` | acción destructiva o fallo; no «error» |
| `vacío` | no hay datos que mostrar |
| `sin-conexión` | no hay red |

`seleccionado` **no es un estado de control**: es solo el rol de color (teal)
con que se marca lo elegido en una lista, tesela u hoja de elección
(`Card` `elegible`, `ListRow`). Un `Chip` activo está `activo`, no
`seleccionado`.


| Componente | Variantes | Estados | Hoy |
|---|---|---|---|
| `Button` | `primario`, `secundario`, `fantasma`, `peligro`; `tamano` s/m/l | todos; `cargando` con `Spinner` | botones sueltos; `GoogleButton`, `GhostPillButton` en `ui.jsx` |
| `Card` | `plana`, `destacada` (borde marca), `elegible` | `reposo`, `seleccionado` | 4 `Card` locales (`Analytics`, `HomeProfileScreen`, `Settings`, `SpendPanel`), ver «Lo que hay» |
| `Chip` / `Badge` | `neutro`, `marca`, `aviso`, `peligro` | `activo`, quitable | `Chip` en `ui.jsx`, peso 500 |
| `Toggle` | `tamano` s/m | encendido/apagado, `deshabilitado` | `ToggleSwitch` |
| `Segmented` | `claro`, `oscuro`; con pestañas | `activo` | `SegmentedControl`, `SegmentedTabBar` |
| `Field` | `texto`, `numero`, `buscar`; con etiqueta | `reposo`, foco, `peligro`, `deshabilitado` | inputs sueltos; placeholder en `index.css` |
| `Sheet` | `abajo`, `centrada`; **un solo overlay** | abierta, cerrando | overlays propios y `*Sheet`/`*Modal` locales (ver «Lo que hay»), `WizardSheet` en `ui.jsx` |
| `Toast` | `info`, `exito`, `peligro` | — | `App.jsx` (busca `mp-toast-in`), fuera de `ui.jsx`. Hoy es **claro** (superficie tintada como `WizardSheet`; ver `DESIGN_SYSTEM.md` §9). Posible evolución, **sin decidir**: pasarlo a oscuro (`tinta`) sería un cambio visible y va en su PR con capturas. Choca con `ui.md` («sin toasts que nadie pidió»): se queda solo para los avisos que ya existen |
| `Avatar` | `tamano` s/m/l; con foto o iniciales | — | `Avatar`, `AvatarStack` |
| `HeaderPantalla` | con `atras`, con acción | — | 3 estilos de Atrás/Volver (qa) |
| `ListRow` | con icono, con valor, con chevron | `pulsado`, `seleccionado` | filas hechas a mano |
| `BottomNav` | — | `reposo`, `activo` | `BottomNav` en `ui.jsx` |
| `EmptyState` | con o sin acción | — | `EmptyIllustration`, `EmptyState` en `Menu` y `MenusScreen` |
| `Skeleton` | `texto`, `bloque` | `cargando` | sin primitivo |
| `Spinner` | `tamano` s/m/l | `cargando` | sin primitivo |

Los estados de pantalla (`cargando`, vacío, `peligro`, sin conexión) son
componentes del sistema, no ramas sueltas dentro de cada pantalla. `ui.jsx` se
parte por componente poco a poco: cada pantalla migrada saca del fichero lo que
usa.

## Assets

### Familias, formato y peso máximo

Medido el 9 oct (MB decimales). `public/` entero: 55,7 MB, 919 ficheros:
751 png, 110 jpg, 50 webp, 3 html, 2 json, 2 svg, 1 mp4. Mediana y p95 salen de
los tamaños en disco. Los topes son propuesta; lo que los supera se re-exporta a
WebP en el pipeline (no se ha convertido nada para comprobar el peso resultante).

| Familia | Formato | Hoy | Tope propuesto |
|---|---|---|---|
| `icono` (interfaz) | SVG, trazo único, color heredado | `icons.jsx` (171), `build:icons` | 3 KB |
| `ilustracion` (categorías, ingredientes, tarjetas) | WebP | `ingredients` 502 png 200 px, mediana 15 KB, p95 19 KB, máx 74 KB · `categories` 77, p95 107 KB, máx 125 KB · `avatares/cards` 153, p95 96 KB, máx 150 KB | 30 KB (200 px), 120 KB (resto) |
| `foto-plato` | WebP | 1.035 en Vercel Blob; originales (~2,5 GB) fuera del repo | pendiente de medir en Blob |
| `avatar` | WebP | grandes 1024 px: 69 png, 31,8 MB, mediana por rol de 366 a 649 KB, máx 691 KB · miniaturas 192 px: 69 png, máx 15 KB · `lola-perfil.jpg` | miniatura 15 KB; grande a decidir tras exportar (hoy se sirven 1024 px a pantallas de 30–130 px) |
| `logo` (HoMenu y tiendas) | SVG | `brand/homenu-teal.*`, `public/logo-homenu.svg`, tiendas: `src/assets/store-logos` 17 ficheros con svg y png a la vez | 10 KB; un solo formato por logo |
| `marca` (derivados de plataforma del logo) | SVG / PNG | `favicon.svg`, `pwa-icons` 6, `splash.jpg`, `splash.mp4` (2,3 MB) | según plataforma; el vídeo queda fuera de la regla de peso |

**El logo de HoMenu está en la familia `logo`** (maestro único en `diseno/marca/`,
D12); `marca` son sus derivados que exige el navegador o la tienda.

### Manifiesto: uno solo

`diseno/manifiesto.json`. **No se crea un segundo manifiesto de fotos de plato:**
`src/assets/dishes/dishImages.json` (id → URL de Blob, 1.037 líneas) y
`dishImageDerivatives.json` (4.917 líneas) ya son el manifiesto de `foto-plato`;
el manifiesto único los **referencia** como fuente de esa familia
(`raiz: blob`), no los copia.

Cada entrada: clave única `familia/subgrupo/slug`, `raiz` (`public`, `src` o
`blob`), fuente, prompt y seed, derivados, `usado_en`. La clave incluye el
subgrupo porque hay choques de slug entre carpetas: `huevos` y `salsas` están a
la vez en `ingredients/` y `categories/`, `cena` en `quick/`,
`avatares/cards/cuando_se_sirve/` y `meal-icons/`, y `postres` es carpeta, categoría
y fruta de temporada.

### Mapa de renombrado (solo la tabla; no se mueve nada)

Nombres en castellano, kebab-case ASCII, `familia/slug@tamano.ext`. Los nombres
nuevos son propuesta. `public/` solo recibe derivados; los originales van a
`diseno/fuentes/` (D4).

| Hoy | Nuevo | Notas |
|---|---|---|
| `public/avatares/<rol>/`, `thumbs/` (abuela, abuelo, adulto, bebe, hija, hijo, mama, papa) | **fuera del alcance (D13)** | Las rutas se construyen en ejecución (`stages.js:252-257,273`) **y se guardan en base**: `shared_menus.avatar` jsonb (`sharedMenu.js:108`, migración `0027_social_feed.sql:127`) y `clave_avatar` con formato `hija_7` (`personasTabla.js:104`). Mientras `datos` y `auditor-datos` no decidan cómo tratar las rutas persistidas, no se renombra nada de avatares ni se les cambia el formato; no cuenta en pesos |
| `public/avatares/agente/agente.png` | `public/img/avatar/agente.webp` | 0 referencias literales; **no es** `lola-perfil.jpg` (hash distinto). `lola` confirma si se usa |
| `src/assets/lola/lola-perfil.jpg` | se queda donde está (`avatar`, `raiz: src`) | Lo importan `Dashboard.jsx:12`, `Menu.jsx:140`, `Shopping.jsx:3` |
| `brand/lola-perfil.jpg` (sin seguimiento) | no se versiona | Idéntico por hash a `src/assets/lola/lola-perfil.jpg`; no entra en `diseno/` para no duplicar. `brand/chef-mateo-perfil.jpg` y el `.png` de Midjourney, también sin seguimiento: los decide quien los creó |
| `public/avatares/hogares/` (4 jpg) | `public/img/ilustracion/hogares/` | |
| `public/avatares/cards/<subcarpeta>/` (69) | `public/img/ilustracion/tarjetas/<tema>/` | `cuando_se_sirve`→`cuando-se-sirve`, `foto_recetas`→`foto-recetas`, `pantry_mode`→`modo-despensa`, `pantry_prefs`→`preferencias-despensa`, `scope_picker`→`selector-ambito`, `wizard_picker`→`selector-asistente`, `wizard_timing`→`ritmo-asistente`; `bebe`, `electrodomesticos`, `familia`, `tandas` igual. Rutas con plantilla: `ModeSheets.jsx:16`, `applianceMethods.js:27`, `ScopePickerScreen.jsx:52` |
| `public/avatares/cards/*.{png,jpg,webp}` sueltos (84) | `public/img/ilustracion/tarjetas/<tema>/`, reparto por prefijo: `casa/` 4 (`casa_*`) · `cocinero/` 14 (`cook_*`) · `comidas/` 19 (`desayuno_*`, `merienda_*`, `postre_*`, `comemos_*`, `estructura_*`, `mismo/distinto_menu_ninos`, `yogur_fruta`, `comidas`) · `ninos/` 10 (`ninos_*`) · `despensa/` 6 (`despensa*`, `nevera`, `congelador`) · `vacios/` 6 (`empty_*`) · `recetas-y-compartir/` 8 (`recetas_*`, `share_*`, `vis_*`) · `ajustes/` 17 (`ajustes_generales`, `cerrar_sesion`, `eliminar_cuenta`, `empezar_de_cero*`, `reiniciar_menu`, `escanear`, `subir_*`, `modo_*`, `inspirate`, `otros`, `otro_grupo_familiar`, `sin_compra`, `continuar_donde_lo_deje`, `aun_no_menu_generado`) | 4+14+19+10+6+6+8+17 = 84. Rutas con plantilla: `ModeSheets.jsx:340` (`/avatares/cards/${slug}.png`), `wizardRegistry.js:464` (`cook_${id}.png`) |
| `public/categories/*.png` y `*.webp` | `public/img/ilustracion/categorias/<slug>.webp` | 4 pares idénticos por hash: `carne`=`carnes`, `pescado`=`pescados`, `pasta_arroz`=`pasta_arroces`, `verduras`=`ensaladas_verduras`. Rutas con plantilla: `ingredientImages.js:492,506`, `menuExport.js:808` |
| `public/categories/cut/**` (40 png) | `public/img/ilustracion/categorias/recorte/…` | `SliderCocinas.jsx:61` construye la ruta |
| `public/ingredients/` (502 png) | **se queda en png** hasta el paso de conversión; luego `public/img/ilustracion/ingredientes/<slug>@200.webp` | Si cambia el formato hay que reescribir `src/lib/ingredientImages.js:20`, `ingredientImages.test.js:14-20` y `scripts/build-ingredient-catalog.mjs:122-124` (todos asumen `/ingredients/<id>.png`) |
| `public/budget-cards`, `variety-cards`, `quick` | `public/img/ilustracion/tarjetas/{presupuesto,variedad,rapido}/` | una referencia literal cada una |
| `public/postres/` (6 jpg, `postres_013`–`018`) | familia `foto-plato`, **fuera de `public/`** | Son fotos de plato: `dishImages.json` tiene entrada de Blob para `postres_013` y `postres_014`, no para 015–018; 0 referencias en `src`, `api` ni `index.html`. Mover = D10 |
| `public/seasonal-fruit/` | `public/img/ilustracion/tarjetas/fruta-temporada/` | 2 ficheros la referencian |
| `public/meal-icons`, `public/nav-icons` | `public/img/icono/…` (re-hechos en SVG) | 0 referencias literales; pueden construirse en ejecución, sin comprobar |
| `public/pwa-icons/` (menos `feature-graphic.png`), `favicon.svg`, `splash.*` | `public/img/marca/` (favicon y manifest se quedan en la ruta que pide el navegador y solo se registran) | |
| `public/pwa-icons/feature-graphic.png` (1024×500) | `diseno/marca/tienda-play/` (fuera de `public/`) | Gráfico de ficha de tienda, 0 referencias en el código; no necesita servirse. Mover = D10 |
| `public/logo-homenu.svg` | `diseno/marca/` (logo maestro, familia `logo`) | terracota (D12) |
| `public/.well-known/assetlinks.json` | se queda; no es asset gráfico | ruta fija por estándar (Android); sale de la regla de nombres y pesos |
| `public/{eliminar-cuenta,privacidad,terminos}.html` | se quedan; no son assets | páginas legales con URL pública |
| `public/store/mercadona.json` | no es imagen: sale de la regla | |
| `src/assets/store-logos/` (17) | `src/assets/logo/tienda/<slug>.svg` | svg si existe, si no png→webp. `Carrefour.svg`, `Lidl.svg`, `Mercadona.svg` (con mayúscula) pasan a minúscula y absorben a `carrefour.png`, `lidl.png`, `mercadona.png`; `dia.svg` a `dia.png`. `SpendPanel.jsx:131` los carga con `import.meta.glob` por nombre de fichero: comprobar cómo normaliza el slug antes de renombrar |
| `src/assets/dashboard/` (10) | `src/assets/ilustracion/panel/` | |
| `src/assets/dishes/` (json y js) | se queda | manifiesto de `foto-plato`; lo referencia el manifiesto único |
| `Avatares/` (raíz, 83 png, 50,6 MB) | `diseno/fuentes/…` o Blob (D4) | 69 de 83 tienen copia idéntica en `public/`; el resto, a revisar. Aquí no hay rutas de base: solo originales |
| `dish-gallery/`, `menus_cole/` | fuera de la raíz | `dish-gallery` se retiró (#301, 10 oct 2026); `menus_cole` ya no está |

### Pipeline

```
diseno/fuentes/<familia>/   originales (Blob o LFS; nunca en public)
diseno/prompts/<familia>    prompt y seed de cada familia
diseno/marca/               logo maestro único
diseno/manifiesto.json      el único manifiesto (ver arriba)
public/img/<familia>/       solo derivados optimizados
src/assets/                 solo lo que importa el código
scripts/diseno/             recorte, tarjetas, optimizado, iconos, logo
```

- `npm run assets:build` y `npm run assets:check` (en CI): todo derivado tiene
  fuente y entrada en el manifiesto, sin duplicados, cada ruta usada existe, y
  los pesos están bajo el tope de su familia.
- El renombrado lo hace un script que genera el mapa antiguo→nuevo, reescribe
  las referencias y **falla si queda una ruta rota**. Las rutas construidas en
  ejecución (`cards/`, `categories/`, `cut/`) se mapean a mano en el script; no
  basta con buscar literales. **Nada de lo que esté guardado en base se
  renombra** (D13).
- Hoy los `make_*.py` leen carpetas que no existen en un clon limpio, y solo
  `build:icons` tiene comando npm (lee de una carpeta con licencia que solo
  existe en un PC). Es el estado a corregir.
- Duplicados: 75 grupos por hash (150 ficheros) entre `public/`, `Avatares/`,
  `src/assets/` y `brand/`; 35,0 MB sobrantes (70 MB si se cuentan las dos
  copias). Borrar solo con OK de Pablo (D10).

## Cumplimiento

1. Regla local `no-valor-suelto` (en `eslint-rules/`) en `warn`, dentro de
   `lint-base.mjs` (un solo recorrido). **Alcance (hecho):** `src/**/*.jsx` y
   17 `.js` de `src` con color escrito a mano (lista en `eslint.config.js`; la
   tabla de «Lo que hay» decía 15), salvo `src/design/`, `src/data/` y los
   tests. **`index.css` queda fuera**: ESLint no lee CSS; sus 11 hex y 4 `rgba`
   se vigilan al migrar (pendiente: una pasada de regex sobre él en
   `lint-base`). Excepción por escrito: `menuExport.js` (HTML exportado, sin
   CSS de la app) importa los roles (`color`) del módulo de tokens en lugar de
   `var(--…)`; los primitivos no se importan fuera de `tokens.js`. Un valor suelto nuevo **avisa** y no rompe el CI; `lint-base.mjs
   --estricto` lo hace fallar y se activa en el CI cuando se migre la primera
   pantalla.
2. Línea base por **lista** `fichero | tipo | valor` → cuenta
   (`lint-tokens-base.json`), no por recuento (el recuento se deja engañar:
   extraer `const GAP = 13` baja el contador sin tocar ningún token). Solo
   puede bajar: `--actualizar` se niega a subirla y un test fija el tope.
   Renombrar o mover un fichero no cuenta como nuevo.
3. Lista blanca: la que define la regla (`eslint-rules/no-valor-suelto.js`); es la
   que manda y no se copia aquí.
4. Se cuentan los `eslint-disable` de esa regla. La cifra «antes» es la de la
   regla, no la de esta página.
5. Tests del PR de tokens: (a) las variables CSS generadas coinciden con los
   tokens; (b) las tablas de valores de `DESIGN_SYSTEM.md` coinciden con los
   tokens (formato fijo); (c) favicon, manifest y `theme-color` usan el
   color de marca de los tokens (`src/design/marca.test.js`; el logo sigue en D12).

## Orden de trabajo

0. Decididas por Pablo: D1, D4, D11. Abiertas: D9, D10, D12, D13. Pasos 2 y
   3 hechos en el PR de #258 (9 oct 2026); queda por hacer lo que dice cada
   punto sobre la migración.
1. **Capturas mínimas antes de migrar nada**, a 375×812 y 420×900. Herramienta:
   Playwright, que **no está instalado** y depende de D9; sin ella, capturas
   manuales de `qa`. Es la referencia de regresión: la escala cambia píxeles y
   sin ella una regresión en `Onboarding` no se ve. `?demo=1` no llega a
   Onboarding ni a las hojas: **el parámetro de demo en `App.jsx` es parte de
   este paso**, tras `import.meta.env.DEV`, y es zona muy disputada.
2. Tokens (`src/design/`) + variables CSS generadas + los tres tests de
   «Cumplimiento», en el mismo PR que corrige `DESIGN_SYSTEM.md` (nav, toast,
   capas, D2, D5, §0.3, §1.1, §14, info, fondos, pesos y tamaños) y cambia a la
   vez: la regla de tokens de `ui.md`, el método de `diseno.md` (ya no dice
   «D1–D4»), `qa.md`, la fila «Reglas de UI» de `CLAUDE.md` y el plano 13 de
   `ops/PLANOS.md`, que se queda en un enlace a este fichero;
   el dato «6,45 MB en el chunk inicial» ya está arriba.
3. Regla de lint en `warn` + línea base por lista.
4. Migración en dos pasos, una pantalla por PR y pasada por `qa`: primero
   **exacta** (cada valor existente pasa a token si coincide; si no, lista «a
   decidir»); después, en PR aparte y con revisión visual, el **snap**. Orden
   por hex: `Onboarding`, `Menu`, `Shopping`, `CatalogBrowserSheet`.
5. Primitivos clave unificados (Atrás/Volver, `Card`, tarjeta de plato,
   cabeceras, `Sheet`); **después** `?catalogo=1` solo en DEV, con el patrón de
   `PanelPlayground`. Catalogar antes solo documentaría la deriva.
6. Capturas definitivas con Playwright (D9): comparadas en local con tolerancia
   (Windows y ubuntu pintan distinto). CI de capturas después y no obligatorio.
7. Pipeline de assets y manifiesto único; WebP de ilustraciones y cabecera
   `immutable`. **Los avatares quedan fuera hasta que `datos` y `auditor-datos`
   resuelvan D13** (dependencia: rutas persistidas en `shared_menus.avatar` y
   `clave_avatar`).
8. Limpieza (con OK de Pablo, porque es borrar): `Avatares/` fuera del índice,
   pares de `categories/`, logos duplicados, `public/postres/`,
   `feature-graphic.png`, `dish-gallery/` y `menus_cole/` fuera de la raíz.
9. Aparte: nombre accesible a los ~20 botones sin nombre de «Tu menú»; la
   pegatina de Lola tapa la última fila de «Compra».

## Sin comprobar

- Si los avatares sin referencia literal se usan de verdad (hay rutas
  construidas en ejecución); si `nav-icons/`, `meal-icons/` y `postres/` (0
  referencias literales) se usan igual.
- Cómo `SpendPanel.jsx` normaliza el slug de los logos de tienda con mayúscula.
- Qué entra de verdad en el precache de la PWA.
- Si los originales que faltan existen en algún PC o en Blob.
- Cuántos controles táctiles miden menos de 40 px.
- Peso real de los WebP tras convertir: los topes son propuesta.
- Los valores provisionales (interlineado de los roles de texto,
  `margen-pantalla`, `separacion-lista`, `capa-local`, `info-fondo`): salen de lo
  más usado y se confirman al migrar la primera pantalla.
- La clasificación de color por propiedad falla con estilos montados en varias
  líneas; sirve para el orden de magnitud. Las duraciones cuentan solo la primera
  de cada declaración.
- Capturas a 375 y 420: no hay (Playwright no instalado, D9).
