# Meta-sistema de diseño: N0, N1 y N2

Propuesta del 11 oct 2026 (Pablo y una sesión). **Nada de esto está construido**,
salvo lo que se dice que ya existe en HoMenu. Sirve para decidir antes de
escribir código.

## 0. Respuesta corta

**Sí, es meta-diseño:** una especificación que dice cómo debe ser *cualquier*
sistema de diseño, y de la que salen los de cada proyecto. Tres capas, como la
forja de skills (#458) y los niveles de las entidades:

| Nivel | Qué es | Obedece a | Ejemplo |
|---|---|---|---|
| **N0** | Las **leyes** de diseño: valen para todo proyecto (contraste, tamaños, escalas, un valor por rol). | — | «Texto normal, 4,5:1 de contraste.» |
| **N1** | La **forja**: qué debe listar y definir cualquier sistema de diseño (bloques, campos, vocabularios cerrados). | N0 | «Todo sistema define su escala tipográfica con estos campos.» |
| **N2** | El **perfil por tipo de proyecto**: qué parámetros se eligen y cuáles son obligatorios, opcionales o no aplican. | N1 | «Herramienta interna: densidad alta, sin modo táctil.» |
| *Instancia* | El sistema de **un** proyecto: sus tokens, sus componentes y su documento. No es un nivel. | Su N2 | HoMenu hoy (`DESIGN_SYSTEM.md`, `tokens.js`); el panel mañana. |

Reglas de siempre en estos niveles: uno inferior **cumple** todo lo del superior,
puede **añadir** y no puede **quitar ni relajar**; si chocan, se corrige el inferior.

**Lo que se comparte entre proyectos es la ley y la forma, no los píxeles.** HoMenu
y el panel no usarán el mismo botón ni la misma letra; sí el mismo criterio de
contraste, la misma forma de definir un token y la misma lista de lo que hay que
decidir. Ejemplo de Pablo: HoMenu usa DM Sans y el panel otra letra. Las dos
cumplen N0, rellenan el mismo bloque «Tipografía» de N1 y difieren en el valor
que su N2 permite.

## 1. Cómo encaja con lo que ya hay

- **HoMenu** (instancia): `DESIGN_SYSTEM.md` (criterio y voz), `src/design/tokens.js`
  (77 valores, fuente única), `docs/diseno/ESTADO.md` (decisiones D1–D12 y cifras).
  Es un sistema ya hecho; este documento no lo sustituye, lo pone en un marco.
- **Forja de skills** (`ops/forja/`, #458): el mismo patrón de tres capas (criterios
  base, por tipo, por ficha). La skill y el agente `diseno` leerían N1 como sus criterios.
- **Entidades** (#566): hacen falta cuatro entidades nuevas, `sistema-de-diseno`,
  `token`, `componente` y `patron`. Se proponen allí; no se tocan desde aquí.
- **Panel de la factoría** (`homenu-panel`): hoy sin sistema de diseño (cinco líneas
  de CSS). Será la primera instancia del perfil P2 de N2.

## 2. N0: las leyes

Cada ley dice **cómo se comprueba**. Lo que obliga es un test o un lint, no el
texto (hereda el principio de las entidades). `[existe]` = ya hay en HoMenu;
`[por construir]` = no.

| Id | Ley | Cómo se comprueba |
|---|---|---|
| L01 | **Ningún valor visual suelto.** Color, tamaño, espacio, radio, sombra, capa y tiempo salen de un token. | Lint `no-valor-suelto` con base que solo baja `[existe]` |
| L02 | **Un token por rol, no por valor.** Se llama `texto-secundario`, no `gris-600`. | Test de nombres contra el vocabulario de roles `[por construir]` |
| L03 | **Tres capas de tokens:** primitivo → semántico → de componente. Las pantallas solo usan las dos últimas. | Test: ningún componente referencia un primitivo `[por construir]` |
| L04 | **Una fuente por valor.** El resto (CSS, docs, JSON) se genera y un test compara. | `disenoDoc.test.js` y `tokens:css` `[existe]` |
| L05 | **Contraste.** Texto normal ≥ 4,5:1, texto grande ≥ 3:1, controles, iconos y gráficos ≥ 3:1 (WCAG 1.4.3 y 1.4.11). | Test que calcula las parejas texto/fondo declaradas, en cada tema `[por construir]` |
| L06 | **Objetivo táctil o de clic.** Mínimo 24×24 px CSS (WCAG 2.5.8); el perfil fija el recomendado (44 px táctil, 32 px puntero). | Test sobre los tamaños de los tokens y revisión de `qa` `[parcial: 40 px en HoMenu]` |
| L07 | **Foco visible y no tapado**; todo se maneja con teclado, en orden lógico (WCAG 2.4.7, 2.4.11). | Revisión de `qa` + test de navegación con Playwright `[por construir]` |
| L08 | **El color nunca es la única señal** (WCAG 1.4.1): error, estado y selección llevan además forma, texto o icono. | Revisión de `qa` y lista de estados con su señal `[por construir]` |
| L09 | **Reflow y zoom.** Sin pérdida de contenido a 320 px de ancho y con el texto al 200 % (WCAG 1.4.10, 1.4.4). | Capturas a 320 y 375 px `[parcial]` |
| L10 | **Movimiento por tokens** (duración y curva) y respeto a `prefers-reduced-motion`; nada esencial solo con animación. | Lint de transiciones sueltas `[parcial]` |
| L11 | **Escalas, no valores libres.** Espacio sobre rejilla de 4 px; tipografía con una razón fija entre pasos; radios y sombras por pasos con nombre. | Test de los tokens contra su escala `[existe]` |
| L12 | **Jerarquía.** Una sola acción primaria por vista; el énfasis sigue a la importancia. | Checklist de pantalla `[existe]`; sin test |
| L13 | **Proximidad y alineación.** Lo relacionado junto: el espacio dentro de un grupo es menor que el espacio entre grupos; una rejilla por pantalla. | Checklist; sin test |
| L14 | **Estados completos.** Todo componente interactivo define reposo, foco, pulsado, activo, deshabilitado, cargando, error y vacío (y hover si hay puntero). | Test: la ficha del componente rellena el vocabulario de estados `[por construir]` |
| L15 | **Texto elástico.** Toda cadena soporta un 40 % más de longitud; fechas, números y moneda con formato local. | Captura con textos largos `[por construir]` |
| L16 | **Temas.** Claro y oscuro desde los mismos tokens semánticos, o se declara por qué no hay uno. | Test: cada token semántico tiene valor en cada tema declarado `[por construir]` |
| L17 | **Un componente existe en el catálogo o no existe.** No se copia ni se rehace por pantalla; uno nuevo entra con su ficha. | Test de importaciones y de fichas `[por construir]` |
| L18 | **Rendimiento visual.** Fuentes con alternativa y carga controlada; imágenes con tamaño reservado; sin saltos de maquetación. | Medida en CI `[por construir]` |
| L19 | **Voz declarada.** Cada proyecto fija tono, vocabulario y reglas de redacción; un nombre por concepto. | Glosario y test del vocabulario `[parcial]` |
| L20 | **Todo cambio deja rastro.** Versión, decisión (D#) y changelog; se depreca, no se borra. | `ESTADO.md` con decisiones `[existe]`; changelog `[por construir]` |
| L21 | **Se mide.** Cada sistema publica sus cifras: valores sueltos, cobertura de tokens, componentes migrados, fallos de contraste. | `lint:base` `[existe]`; el resto `[por construir]` |
| L22 | **Accesibilidad de entrada y autenticación.** Sin repetir datos ya dados, sin pruebas cognitivas para entrar, arrastre con alternativa (WCAG 3.3.7, 3.3.8, 2.5.7). | Revisión de `qa` por flujo `[por construir]` |

## 3. N1: qué debe listar un sistema de diseño

Un sistema está **completo** cuando cada bloque tiene su contenido o una línea
«no aplica» con motivo. Los bloques, de lo fundamental a lo que se construye encima.

### A. Identidad y principios

| Campo | Qué dice |
|---|---|
| Propósito | Para quién y para qué es el producto; qué no es. |
| Personalidad | 3–5 rasgos con su opuesto («cálido, no infantil»). |
| Principios rectores | Máximo 8, ordenables, cada uno con un ejemplo y un contraejemplo. |
| Perfil N2 | A cuál de los perfiles de la sección 4 obedece. |
| Alcance | Qué superficies cubre (app, web, bot, correo, impresión). |
| Dueño y fecha | Quién lo mantiene y cuándo se comprobó por última vez. |

### B. Fundamentos visuales

Cada fundamento se define con **valor, rol, uso, no-uso y comprobación**.

| Fundamento | Qué debe listar |
|---|---|
| **Color** | Paletas primitivas con escala; roles semánticos (superficie, texto, borde, acción, marca, selección, foco); estados (hover, activo, deshabilitado); colores de feedback (éxito, aviso, error, información); colores de categoría; gradientes; **tabla de contraste** de cada pareja texto/fondo, en cada tema; reglas de uso (qué color no se usa solo, cuántos acentos). |
| **Tipografía** | Familias con alternativas (`fallback`) y licencia; carga (peso del fichero, `font-display`); escala con razón; pesos permitidos; interlineado por rol; tracking; roles de texto (título, cuerpo, etiqueta, dato, código); longitud de línea (45–75 caracteres); reglas de mayúsculas, números tabulares, truncado y ajuste. |
| **Espaciado** | Escala base (rejilla de 4 px); espaciado interno, entre elementos y entre secciones; márgenes de pantalla; separación de lista. |
| **Tamaños** | Objetivo táctil y de puntero; iconos; avatares; altura de controles; anchos mínimos y máximos. |
| **Layout y rejilla** | Contenedores y ancho máximo; columnas y huecos; comportamiento por ancho; zonas seguras; orden de lectura. |
| **Puntos de ruptura** | Anchos de cambio con nombre; qué cambia en cada uno; ancho mínimo soportado (320 px). |
| **Radios** | Pasos con nombre y su rol (control, tarjeta, panel, modal, píldora). |
| **Bordes y trazos** | Grosores, estilos y colores; trazo de iconos; separadores. |
| **Elevación y sombras** | Pasos con nombre, qué sube y por qué; sombra en tema oscuro. |
| **Capas (z-index)** | Orden fijo con nombre (contenido, cabecera, hoja, modal, aviso). |
| **Opacidad y superposiciones** | Valores de velo, deshabilitado y desenfoque. |
| **Movimiento** | Duraciones, curvas, patrones (entrada, salida, desplazamiento, retroalimentación), qué no se anima, alternativa con `prefers-reduced-motion`. |
| **Iconografía** | Familia única, tamaños, trazo, alineación, cuándo icono solo y cuándo con texto, etiqueta accesible. |
| **Imagen e ilustración** | Estilo, proporciones, peso máximo, formatos, texto alternativo, recorte, fondos, dónde viven los originales. |
| **Datos y gráficos** | Paleta categórica y secuencial apta para daltonismo; tablas; ejes, leyendas, vacíos; cómo se muestran números grandes. |
| **Densidad** | Compacta, normal o cómoda y qué cambia en cada una (espacio, tamaño, fila). |
| **Interacción de puntero y táctil** | Cursor, hover, pulsación larga, gestos y su alternativa visible. |

### C. Tokens (la arquitectura)

| Campo | Qué dice |
|---|---|
| Formato | Fichero de datos, preferible el del W3C Design Tokens Community Group (`$type`, `$value`). |
| Capas | Primitivos, semánticos, de componente: qué vive en cada una. |
| Nombres | Forma, separador y espacio de nombres; vocabulario de roles. |
| Tipos | `color`, `dimension`, `fontFamily`, `fontWeight`, `duration`, `cubicBezier`, `shadow`, `border`, `typography`, `number`. |
| Temas | Claro, oscuro, alto contraste, marca; cuáles hay y cómo se resuelve un token por tema. |
| Salidas | CSS, JS, JSON, docs; cuál se genera de cuál. |
| Versionado | Cuándo un cambio de valor es compatible y cuándo rompe. |
| Excepciones | Valores que quedan fuera, con motivo y dueño (hoy: las `--pz-*` de la pizarra). |

**Ficha de token:** `id`, `nombre`, `capa`, `tipo`, `valor` (por tema), `rol`, `uso`, `no-uso`, `alias-de`, `estado`, `desde`, `decisión`.

### D. Componentes

Un catálogo con **una ficha por componente**:

| Campo | Qué dice |
|---|---|
| `id` y `nombre` | Estables; el id no se reutiliza. |
| `categoría` | Acción, entrada, selección, navegación, feedback, contenedor, datos, medios, estructura. |
| `propósito` | Una frase: para qué sirve y cuándo no usarlo. |
| `anatomía` | Las partes con nombre (etiqueta, icono, contenedor, indicador). |
| `variantes` | Del vocabulario: primario, secundario, terciario, peligro, fantasma. |
| `tamaños` | Del vocabulario: xs, s, m, l, xl; cuáles admite. |
| `estados` | Reposo, hover, foco, pulsado, activo, deshabilitado, cargando, error, vacío. |
| `API` | Propiedades, valores, valores por defecto, eventos. |
| `comportamiento` | Cómo responde a teclado, táctil, puntero y a los cambios de ancho. |
| `accesibilidad` | Rol, atributos ARIA, orden de foco, teclas, etiqueta, contraste, objetivo. |
| `tokens` | Los tokens de componente y semánticos que consume. |
| `contenido` | Longitud de texto, truncado, voz. |
| `usar y no usar` | Mínimo dos casos y dos contraejemplos. |
| `ejemplos` | Un ejemplo vivo y su captura de referencia. |
| `relacionados` | Alternativas y componentes que lo contienen o contiene. |
| `madurez` | Propuesto, beta, estable, deprecado, retirado. |
| `dueño` y `desde` | Quién y cuándo. |

**Catálogo mínimo por familia** (lo que cualquier sistema acaba necesitando):
botón y enlace; campo de texto, área, selector, casilla, radio, interruptor,
control deslizante, fecha, búsqueda; chip y etiqueta; pestañas, navegación
inferior, lateral, migas, paginación; tarjeta, lista, tabla, acordeón, divisor;
hoja, modal, menú, popover, información al pasar el ratón; aviso (toast), banner,
diálogo de confirmación; indicador de carga, esqueleto, barra de progreso, vacío,
error; avatar, insignia, icono, imagen; gráfico, estadística, línea de tiempo.

### E. Patrones (cómo se combinan los componentes)

Formularios y validación; alta y asistentes por pasos; navegación y jerarquía de
pantallas; búsqueda, filtros y ordenación; listas largas y paginación; tablas de
datos; estados vacío, cargando, error y sin conexión; retroalimentación (éxito,
deshacer, confirmar lo destructivo); permisos y estados bloqueados; onboarding;
edición en el sitio; arrastrar y soltar con alternativa; notificaciones; carga
de ficheros; ayuda y soporte. Cada patrón lleva: problema, cuándo usarlo,
componentes que usa, flujo, errores, accesibilidad, ejemplo.

**Patrones de movimiento** (misma ficha, más `duración`, `curva`, `qué anima`,
`qué no`, `alternativa con movimiento reducido` y `presupuesto`): entrada y salida
de hoja y modal, transición entre pantallas, aparición de lista, carga y
esqueleto, respuesta a la pulsación, expandir y plegar, microinteracción de éxito
o error. Reglas: solo se anima `transform` y `opacity`; nada esencial solo con
animación; ninguna pasa de 400 ms sin motivo escrito; cada una tiene alternativa
con movimiento reducido. Si hay una biblioteca de animación, tiene su ficha en Q.

### F. Plantillas y estructura de pantalla

Cáscara de la aplicación (cabecera, navegación, contenido, zonas fijas); tipos
de pantalla (lista, detalle, formulario, panel, vacío, error); anatomía de una
pantalla con sus márgenes y zonas seguras; orden de lectura y de foco.

**Navegación** (una ficha por pieza: barra inferior, barra lateral, menú
hamburguesa o cajón, pestañas, migas, cabecera fija): cuándo se usa y a qué ancho
sustituye a cuál; qué se pliega y qué queda visible; cómo se abre y se cierra con
puntero, táctil y teclado; dónde va el foco al abrir y al cerrar; cómo se marca la
página actual (no solo con color); qué pasa con el desplazamiento del fondo;
profundidad máxima; tamaño de objetivo; qué hace sin JavaScript. Un menú
hamburguesa en pantalla ancha, o una barra lateral en móvil, se declaran como
excepción con motivo.

### G. Contenido y voz

Tono (con rangos: de qué humor a qué situación); persona gramatical; reglas de
redacción (longitud, voz activa, sin jerga); vocabulario del producto con
sinónimos prohibidos; mensajes de error con estructura fija (qué pasó, qué
hacer); vacíos; confirmaciones; nombres de acciones; mayúsculas y puntuación;
inclusión; formatos de fecha, hora, número y moneda.

### H. Accesibilidad

Nivel objetivo (WCAG 2.2 AA como mínimo); contraste; teclado y foco; lectores de
pantalla (nombres, roles, estados, regiones, avisos en vivo); objetivos; zoom y
reflow; movimiento y destellos (nada que parpadee más de tres veces por segundo);
formularios (etiquetas, errores, ayuda); medios (subtítulos, texto alternativo,
transcripción); idioma de la página y de los trozos; pruebas (automáticas,
manuales, con lector); declaración de lo que no se cumple todavía.

### I. Internacionalización y formatos

Idiomas soportados; dirección de escritura; longitud de cadenas; plurales y
géneros; zona horaria (la de Madrid y cómo se enseña); formatos locales; texto
dentro de imágenes (prohibido o con alternativa); fuentes con caracteres
necesarios.

### J. Plataformas y dispositivos

Dispositivos y navegadores soportados; entradas (táctil, puntero, teclado, voz);
orientación; zonas seguras; instalación (PWA); modo sin conexión; preferencias del
sistema (oscuro, movimiento reducido, contraste alto, tamaño de texto).

### K. Gobierno y ciclo de vida

Dueño; cómo se propone un componente o un token; quién decide; ciclo de vida
(propuesto → beta → estable → deprecado → retirado); política de deprecación
(se avisa, se mide el uso, se retira); versionado y changelog; registro de
decisiones (D1, D2…); cómo se pide una excepción; calendario de revisión.

### L. Herramientas y comprobaciones

Lint de valores sueltos; test de contraste; test de la tabla de tokens contra
la doc; test de fichas; capturas de referencia a 320, 375 y 1100 px; pruebas
automáticas de accesibilidad; galería viva de componentes; checklist de pantalla
nueva; plantilla de PR con la línea de diseño; agente juez (`qa`).

### M. Medición

Valores sueltos (hoy 12.793 en HoMenu, antes de migrar); cobertura de tokens por
pantalla; componentes del catálogo frente a copias; pantallas migradas;
fallos de contraste; resultado de la auditoría de accesibilidad; peso de fuentes
e imágenes; fecha de la última comprobación.

### N. Documentación y entrega

Cómo se lee (qué es normativo y qué es consejo); índice; ejemplos; qué fichero
manda sobre cuál; cómo se entrega a quien construye (código, datos, galería, o
diseño en una herramienta externa); cómo se enseña lo que cambió.

### O. Marca y activos

Logotipo y variantes; zona de respeto; tamaño mínimo; usos prohibidos; colores de
marca; iconos de la app y del navegador; fotografías e ilustraciones y dónde
viven los originales; licencias de fuentes, iconos e imágenes; nombre del
producto en cada sitio.

### P. Superficies sin píxeles

Un sistema de diseño también cubre lo que no se ve en una pantalla. Para Lola
(Telegram hoy, WhatsApp después): longitud de mensaje, uso de negrita y emojis,
botones en línea, listas, cómo se pide una aclaración, qué hace cuando no
entiende, tono. Para el correo: ancho, tipografías seguras, modo oscuro,
alternativa de texto. Para lo impreso o el PDF: márgenes, tipografía, color en
blanco y negro. Misma estructura que una superficie visual: valor, rol, uso,
no-uso, comprobación.

### Q. Bibliotecas y dependencias

Todo lo de terceros que entra en el sistema de diseño. Una **ficha por biblioteca**:

| Campo | Qué dice |
|---|---|
| `id` y `nombre` | Estables (por ejemplo, `nucleo`). |
| `rol` | Iconos, gráficos, componentes sin estilo (headless), animación, fuentes, utilidades. |
| `licencia` | Tipo, qué permite (uso comercial, redistribuir los ficheros) y dónde está la prueba. |
| `peso` | Coste en el paquete y cómo se carga (solo lo que se usa, no el conjunto entero). |
| `importación` | Cómo entra: paquete, ficheros copiados o generados; versión fijada. |
| `envoltorio` | Si el proyecto la usa directa o detrás de un componente propio, y por qué. |
| `reglas de uso` | Qué conjuntos o piezas se admiten y cuáles no. |
| `alternativa` | Qué se haría si desaparece o cambia de licencia. |
| `dueño` y `comprobada` | Quién la vigila y la fecha de la última revisión. |

Reglas: una sola familia de iconos por proyecto; ninguna biblioteca entra sin su
ficha; una dependencia de diseño no se actualiza sin mirar su registro de cambios.
**Iconos (Nucleo, el caso actual):** conjuntos permitidos, trazo y tamaños fijos
por rol, convención de nombres, y de dónde salen los ficheros (el servidor MCP de
Nucleo para buscar y obtener; el icono se copia al repo, no se enlaza).
Comprobación: test de que todo icono usado existe en el conjunto declarado y de
que no hay una segunda familia.

### Vocabularios cerrados de N1

Cada uno vive una vez, con su definición, en una constante con su test:
**estados** (reposo, hover, foco, pulsado, activo, deshabilitado, cargando, error,
vacío, sin-conexión); **tamaños** (xs, s, m, l, xl); **variantes** (primario,
secundario, terciario, peligro, fantasma); **madurez** (propuesto, beta, estable,
deprecado, retirado); **tipos de token** (los de DTCG); **capas de token**
(primitivo, semántico, componente); **categorías de componente** (acción,
entrada, selección, navegación, feedback, contenedor, datos, medios, estructura);
**temas** (claro, oscuro, contraste-alto); **densidades** (compacta, normal,
cómoda); **niveles de accesibilidad** (A, AA, AAA); **superficies** (app, web,
bot, correo, impreso).

## 4. N2: perfiles por tipo de proyecto

El perfil decide **qué parámetros se eligen y cuáles obligan**. El valor concreto
(la letra, el verde) lo pone la instancia, dentro de lo que su perfil permite.

### Parámetros

| Parámetro | Qué se decide |
|---|---|
| Plataforma y entrada | Móvil táctil, escritorio con puntero y teclado, solo mensajería, solo lectura. |
| Densidad | Compacta, normal o cómoda. |
| Ancho | Columna estrecha, fluido, ancho máximo. |
| Personalidad | De cálida a sobria. |
| Familia tipográfica y escala | Familia, razón de escala, pesos. |
| Paleta | Marca, acento, semánticos, categorías. |
| Forma | Radios (de redondos a rectos), sombras, bordes. |
| Temas | Solo claro, claro y oscuro, alto contraste. |
| Accesibilidad objetivo | A, AA o AAA. |
| Movimiento | Ninguno, discreto o expresivo. |
| Iconos e imágenes | Familia, ilustración sí o no. |
| Voz | Tuteo y calidez frente a neutro y técnico. |
| Datos | Tablas densas, gráficos, solo texto. |
| Idioma | Idiomas y formatos. |

### Perfiles

| Id | Perfil | Instancia hoy |
|---|---|---|
| **P1** | App de consumo móvil | HoMenu (la app) |
| **P2** | Herramienta interna con datos | El panel de la factoría |
| **P3** | Web de marketing o de aterrizaje | Aún no hay |
| **P4** | Bot de mensajería | Lola |
| **P5** | Documentación e informes | `docs/`, las salidas de los scripts |
| **P6** | Correo transaccional | Aún no hay |

### Valores típicos por perfil

| Parámetro | P1 consumo móvil | P2 herramienta interna | P3 marketing | P4 bot | P5 documentación |
|---|---|---|---|---|---|
| Entrada | Táctil | Puntero y teclado | Mixta | Texto | Lectura |
| Densidad | Cómoda | **Compacta** | Cómoda | — | Normal |
| Ancho | Columna de 420 px | Fluido, tope de 1400 px | Fluido | — | Columna de lectura (65 caracteres) |
| Personalidad | Cálida, redonda | **Sobria, neutra** | Expresiva | Cercana | Neutra |
| Radios | Generosos | Pequeños (2–6 px) | Medios | — | Mínimos |
| Temas | Claro (oscuro por decidir) | **Claro y oscuro** | Claro | El del cliente | Claro e impresión |
| Objetivo táctil | 40–44 px | 24–32 px | 44 px | — | — |
| Accesibilidad | AA | AA | AA | AA (texto claro, sin imágenes sin alternativa) | AA |
| Movimiento | Discreto | Casi nada | Expresivo | — | Ninguno |
| Datos | Poco | **Tablas y gráficos** | Poco | Listas cortas | Tablas |

### Qué bloques de N1 obligan en cada perfil

● obligatorio · ○ opcional · – no aplica (con motivo escrito)

| Bloque N1 | P1 | P2 | P3 | P4 | P5 | P6 |
|---|---|---|---|---|---|---|
| A. Identidad y principios | ● | ● | ● | ● | ○ | ● |
| B. Fundamentos visuales | ● | ● | ● | – | ○ | ● |
| C. Tokens | ● | ● | ● | – | ○ | ○ |
| D. Componentes | ● | ● | ● | – | – | ○ |
| E. Patrones | ● | ● | ○ | ○ | – | – |
| F. Plantillas | ● | ● | ● | – | ○ | ● |
| G. Contenido y voz | ● | ● | ● | ● | ● | ● |
| H. Accesibilidad | ● | ● | ● | ● | ● | ● |
| I. Internacionalización | ● | ○ | ● | ● | ○ | ● |
| J. Plataformas | ● | ● | ● | ● | – | ● |
| K. Gobierno | ● | ● | ● | ● | ○ | ○ |
| L. Herramientas | ● | ● | ○ | ○ | ○ | ○ |
| M. Medición | ● | ○ | ○ | ● | – | – |
| N. Documentación | ● | ● | ● | ● | ● | ● |
| O. Marca y activos | ● | ○ | ● | ● | ○ | ● |
| P. Superficies sin píxeles | – | – | – | ● | ○ | ● |
| Q. Bibliotecas y dependencias | ● | ● | ● | – | – | ○ |

## 5. Dónde estamos hoy

Leído el 11 oct 2026 a partir de las cabeceras de `DESIGN_SYSTEM.md` y de
`ESTADO.md`; **no es una auditoría línea a línea**.

**HoMenu (P1)**

| Bloque | Estado |
|---|---|
| Color, tipografía, espaciado, radios, sombras, capas, movimiento, iconografía | Hecho, con tokens y test de la doc contra los tokens |
| Componentes | Parcial: una receta por componente en la sección 6, sin ficha por componente ni capa de tokens de componente |
| Patrones | Parcial: tablas, hojas, avisos, formularios; faltan vacío, error y sin conexión como patrón |
| Contenido y voz | Hecho (sección 12) |
| Accesibilidad | Cinco puntos; **sin contraste medido por test** ni lista de pruebas |
| Temas | Solo claro; el tema oscuro de la pizarra (`--pz-*`) es una excepción declarada |
| Datos y gráficos, i18n, densidad, superficies sin píxeles | Sin definir |
| Gobierno | Registro de decisiones (D1–D12); sin política de deprecación ni changelog |
| Medición | Valores sueltos medidos (12.793); ninguna pantalla migrada aún |

**Panel (P2):** prácticamente todo por hacer; hoy cinco líneas de CSS.

## 6. Qué se construye, en qué orden

1. **Aprobar este documento** (leyes, bloques, perfiles). Lo que no convenza se corrige aquí.
2. **Dato.** `ops/diseno/bloques.json` con los bloques de N1, sus campos y sus vocabularios, y un test que exige a cada instancia declarar cada bloque (cubierto o «no aplica» con motivo). **Hecho el 12 oct 2026 (#591) el dato y su test contra este documento; falta la declaración por instancia.**
3. **Primera instancia nueva: el panel (P2).** Tokens mínimos, componentes que usa (tabla, barra lateral, tarjeta de resumen, aviso), tema claro y oscuro, contraste medido. Lo construye `diseno` y lo juzga `qa`.
4. **Contraste por test** para las dos instancias (L05), el cambio más barato con más efecto. **Hecho el 12 oct 2026 (#591) para HoMenu** (`src/design/contraste.test.js`, parejas en `ops/diseno/contraste.json`, 5 excepciones declaradas); el panel, cuando tenga tokens.
5. **Ficha por componente** en HoMenu (L14, L17) conforme se migren pantallas.
6. **Skill de revisión de diseño** (hermana de `higiene-de-skills`): lee N0 y N1 como criterios y revisa una instancia; el agente `diseno` la carga. **Hecho el 12 oct 2026 (#591): `revision-de-diseno`.** Las leyes de N0 se comprueban con tests (paso 4), no con una skill por nivel.
7. **Entidades** `sistema-de-diseno`, `token`, `componente` y `patron` en el mapa (#566).

## 7. Riesgos y qué no hacer

- **Sobreingeniería.** Con dos proyectos, un generador que construya sistemas a partir del perfil sería excesivo. El valor está en N0 con tests, N1 como lista de bloques que se exige y N2 como tabla de parámetros. Un generador, si llega, llega después.
- **Compartir píxeles.** Un paquete común de componentes entre HoMenu y el panel los ataría: son repos, lenguajes visuales y ritmos distintos. Se comparte la ley y la forma.
- **Prosa sin test.** Si una ley no tiene comprobación, queda marcada `[por construir]` y no cuenta como cumplida.
- **Empezar por el aspecto.** El orden de 6 pone el contraste y el dato antes que el CSS bonito.

## 8. Decisiones para Pablo

1. **¿Dónde vive el meta-sistema?** Recomendado: en MenuPlan (`docs/diseno/`), porque ahí están el agente `diseno`, la forja y el CI; el panel y cualquier proyecto nuevo lo citan. Alternativa: un repo propio.
2. **¿Accesibilidad objetivo?** Recomendado: WCAG 2.2 AA para todos los perfiles que tienen pantalla.
3. **¿Qué comparten HoMenu y el panel?** Recomendado: solo la ley y la forma; el panel tiene su propia identidad de «factoría», sobria. Alternativa: compartir el verde de marca como acento.
4. **¿Orden?** Recomendado: el de la sección 6, empezando por el panel como primera instancia.

## Fuentes

- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- Formato de tokens del W3C: https://www.designtokens.org/
- Material Design 3: https://m3.material.io/
- Apple, Human Interface Guidelines: https://developer.apple.com/design/human-interface-guidelines/
- Carbon (IBM): https://carbondesignsystem.com/
- Polaris (Shopify): https://polaris.shopify.com/
- Spectrum (Adobe): https://spectrum.adobe.com/
- Atomic Design: https://atomicdesign.bradfrost.com/
