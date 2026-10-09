---
name: issues
description: Úsala cuando haya que registrar un fallo como caso, abrir o colgar un problema de fondo, un encargo o una decisión, clasificar o etiquetar issues, leer `npm run issues`, o decidir de qué problema de fondo es síntoma algo que falló. No para: el PR, su CI y las líneas `Closes`, `Runbook:` o `Casos:` (github) ni los workflows (github).
---

# Issues

## Qué es y dónde

Lo que no se cierra en una sesión vive en un issue: sobrevive al reinicio, lo
ven Álvaro y las sesiones de la nube, y con las mismas etiquetas siempre se
puede contar. Un fallo no se apunta suelto: se analiza hasta su **problema de
fondo** (la norma, en CLAUDE.md, «Cuando algo falla»). La clasificación tiene
una sola fuente, `scripts/lib/issues.mjs`; los formularios de
`.github/ISSUE_TEMPLATE/` salen de ella y `scripts/issues.test.js` vigila que
no se separen y que la norma siga escrita aquí, en CLAUDE.md y en `/orquestar`.
El PR, su CI y sus líneas (`Closes`, `Runbook:`, `Casos:`) son de la skill `github`.

```
problema de fondo (tipo:fondo)   qué falla de fondo, su arreglo general y cómo se probará
  ├─ caso (tipo:caso)            dónde se ha visto: la evidencia
  └─ encargo (tipo:encargo)      una parte del arreglo, con su dueño y su PR
```

| Grupo | Valores | Cuándo |
|---|---|---|
| `tipo:` | `fondo`, `caso`, `encargo`, `decision` | uno por issue |
| `analisis:` | `nuevo`, `abierto`, `no-aguanto-roto`, `no-aguanto-corto`, `puntual` | todo caso |
| `causa:` | `vigilante-falso`, `vigilante-hueco`, `entorno`, `dos-fuentes`, `error-silencioso`, `coordinacion`, `modelo-datos`, `codigo`, `sin-comprobar` | todo fondo, y el caso puntual |
| `area:` | `datos`, `lola`, `ui`, `catalogo`, `motor`, `ops` | siempre |
| `arreglo:` | `test`, `guardia`, `script`, `regla`, `skill`, `ninguno` | al cerrar un fondo: dónde quedó |

**El análisis de un caso**, siempre con una de estas respuestas:

1. `nuevo`: no hay fondo. Abre uno con `## Arreglo general` y `## Cómo se
   probará` (qué test cubre la clase entera) y cuelga el caso.
2. `abierto`: hay uno abierto (búscalo en `npm run issues`). Cuélgalo.
3. `no-aguanto-roto` o `no-aguanto-corto`: el fondo lo cerró un PR. Cuélgalo:
   `--colgar` lo reabre y nombra el PR. **Roto**: el arreglo funcionaba y algo
   lo deshizo o lo esquivó; falta un test que lo proteja. **Corto**: tapó los
   casos conocidos y no la clase; el nuevo arreglo es más general, no otra
   excepción.
4. `puntual`: no puede repetirse, o repetirlo no hace daño. El cuerpo dice
   «Puntual porque …» y lleva `causa:`. Se cierra en el momento. «Alguien
   podría volver a hacerlo» no es puntual. Ejemplo válido: GitHub caído.

**El arreglo** va en el fondo: uno o varios encargos colgando de él. Uno por
superficie (base, scripts, bot…) cuando el cambio vive en sitios distintos;
uno solo, con un dueño y un juez por superficie, cuando es una pieza común
(partirla daría dos versiones: `dos-fuentes`). El fondo se cierra cuando
acaban sus encargos y el test de la clase está en verde.

- **El cuerpo de un caso:** cuándo, qué pasó (esperado frente a real),
  evidencia (comando y salida, PR, fichero:línea) y el análisis. El de una
  decisión: la pregunta en llano, las opciones (la recomendada primero) y qué
  pasa si no se decide.
- **La traza no se rellena: se deduce.** Fechas, reaperturas, asignados,
  padre e hijos los guarda GitHub. Quién arregló sale del PR que cierra: lleva
  `Closes #n` y una línea `Agente: <nombre>` (o `sesión`); la plantilla de PR
  los trae. Si se cierra a mano, «PR #n» en el comentario de cierre.
- **Los casos de un PR** se registran **antes de abrirlo** (uno por issue) y el
  PR los nombra en su línea `Casos: #n, #m` o `Casos: ninguno — <motivo>`
  (#185). Esa línea, la guardia y el CI que la comprueban, y la lección de los 7 PR sin caso, son de la skill `github`;
  `npm run issues` cuenta cuántos de los últimos 50 PR la llevan.
- **Cada semana**, `/revision-issues`: puntuales que se parecen (tres son un
  fondo), casos en el fondo equivocado, fondos repetidos y fondos sin encargos.
- **Una categoría nueva** se añade en `scripts/lib/issues.mjs`, se regeneran
  las etiquetas y se pone en el formulario; antes, mira si encaja en una existente.
- **Quién lleva qué** (#271, `scripts/lib/lleva.mjs`): `tarea <rama> <n>` comenta
  en el issue `<!-- menuplan:lleva rama=… -->` (uno por rama) y `retirar` lo borra;
  `npm run issues` y el arranque cruzan encargo → rama → último commit
  («parada» a las 4 h), las ramas sin número y `--marcas-huerfanas` (lista, no borra).
- **Pablo ve sus decisiones** porque se le asignan (correo y app de GitHub):
  `github.com/pabloam89/MenuPlan/issues?q=is:open+label:tipo:decision`.
- **Avisos que llegan solos:** al editar un fichero, el hook `avisos.mjs`
  cuenta los issues abiertos que lo nombran (una vez por sesión y fichero);
  al terminar de responder, `pendientes.mjs` frena una vez a la sesión que
  deja decisiones o pendientes sin ningún issue, o fallos sin ningún caso
  registrado. `npm run podar` lista las ramas huérfanas (sin PR ni issue, de
  más de 3 días).

## Claves y accesos

Ninguna clave propia: se usa la CLI `gh` con la sesión de Pablo (`gh auth status`).
**El repo es público:** ni claves, ni datos de familias, ni fallos aprovechables
en un issue (esos, a Pablo, en privado).

## Operaciones habituales

| Qué | Comando | Debe salir |
|---|---|---|
| Registrar un caso | `npm run issues -- --nuevo "…" --tipo caso --analisis abierto --area ops --cuerpo <f.md> --padre <fondo>` | antes de crear enseña los parecidos (issues y también carpetas y ramas vivas con palabras del título) y para; si no es ninguno, `--crear-igual`. La guardia niega `gh issue create` a pelo: el 8 oct se abrió tres veces el mismo fallo |
| Abrir un problema de fondo | `npm run issues -- --nuevo "…" --tipo fondo --causa error-silencioso --area datos --cuerpo <f.md>` | el issue creado, con su `## Arreglo general` y `## Cómo se probará` |
| Abrir un encargo | `npm run issues -- --nuevo "…" --tipo encargo --area datos --cuerpo <f.md> [--padre <fondo>]` | el issue creado, colgado del fondo si se dio |
| Abrir una decisión | `npm run issues -- --nuevo "…" --tipo decision --area datos --cuerpo <f.md>` | el issue creado y asignado a Pablo |
| Colgar un caso o encargo | `npm run issues -- --colgar <caso o encargo> <fondo>` | queda como hijo; si el fondo estaba cerrado, lo reabre y nombra el PR |
| Tarea de un issue | `npm run tarea -- ops/x 193` | la rama lleva el número delante del nombre; el PR pedirá `Closes #193` |
| Coger un encargo | `gh issue edit <n> --add-assignee @me` (o «Quién lo coge» en el cuerpo) | el asignado en el issue |
| Cerrar a mano | `gh issue close <n> --comment "Queda en el PR #n"` (un fondo, antes con `--add-label arreglo:test`) | cerrado; solo si no lo cerró el PR |
| Ver el conjunto | `npm run issues` | fondos por casos, encargos, puntuales, por causa y agente, sin trazar, y la medida de `Casos:` |
| Ordenar lo que falta | `npm run issues -- --ordenar` | las etiquetas y el padre que faltan, leídos de un formulario |
| Crear o retirar etiquetas (OK) | `npm run issues -- --etiquetas` | las etiquetas de GitHub igual que `scripts/lib/issues.mjs` |

## Lo que falló y por qué

- **2026-10-08 · el mismo fallo se abrió tres veces como issue.** Causa: crear con
  `gh issue create` a pelo no mira lo que ya existe. Arreglo: `--nuevo` enseña los
  parecidos y para, y la guardia niega `gh issue create` a pelo.
- **2026-10-09 · nadie sabía quién llevaba #255 (caso #270 del fondo #143).**
  Causa: el listado solo enseñaba el asignado de GitHub y una rama sin número
  no se enlazaba con nada. Arreglo: (#271) la marca, el cruce y «posiblemente
  parada»; test en `scripts/lleva.test.js`. Antes: 3 de 11 carpetas sin número
  y 0 de 6 encargos con rama enseñados como «lo lleva».

## Qué requiere el OK de Pablo

- Crear o retirar etiquetas (`--etiquetas`) y cambiar la clasificación de
  `scripts/lib/issues.mjs`.
- Cualquier ajuste de GitHub (ver la skill `github`).

## Coste y límites

Sin coste. Repo público: los issues los ve cualquiera. `npm run issues` y
`--nuevo` consultan la API de GitHub; con el límite de peticiones agotado,
fallan con su causa y se repiten más tarde.

## Fuentes y comprobación

- https://docs.github.com/issues
- https://cli.github.com/manual/gh_issue

Comprobado el 2026-10-09: esta skill sale de partir la `github` (#219) sin cambiar los hechos; no se ha vuelto a ejecutar `npm run issues` ni `--nuevo` contra GitHub al partirla. Sin comprobar: el límite exacto de la API de GitHub con el que `npm run issues` se queda sin respuesta.
