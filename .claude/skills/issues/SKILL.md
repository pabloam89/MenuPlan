---
name: issues
description: Úsala cuando haya que registrar un fallo como caso, abrir o colgar un problema de fondo, un encargo o una decisión, clasificar o etiquetar issues, leer `npm run issues`, o decidir de qué problema de fondo es síntoma algo que falló. No para: el PR, su CI y las líneas `Closes`, `Runbook:` o `Casos:` (github) ni los workflows (github).
metadata:
  tipo: herramienta
  dueno: gobierno
  comprobado: "2026-10-09"
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

**La ficha del fondo** (#337; `scripts/lib/fondos.mjs`, workflow `fondos.yml`):
el cuerpo de cada fondo lleva un bloque de código `fondo`, de líneas
`clave: valor` (el formulario `2-fondo.yml` lo trae; lo vacío es «sin rellenar»;
listas con coma e issues como `#n`). Se lee a mano, con límites (30 líneas, 400
caracteres por texto, 30 elementos por lista): el cuerpo de un issue lo escribe
cualquiera. <!-- norma:fondo-con-ficha-y-controles -->

| Clave | Vale |
|---|---|
| `estado` | `abierto`, `diagnosticado`, `plan`, `en-curso`, `en-observacion`, `cerrado-eficaz`, `reabierto` |
| `tipo_causa` | las causas de `causa:` (la misma que la etiqueta) |
| `alcance` | `local`, `modulo`, `transversal` |
| `severidad` | `alto`, `medio`, `bajo` (el riesgo de las normas) |
| `capa_agente` | un agente de `.claude/agents/` o `sesión` |
| `barrera` | un escalón de la escalera (`bloqueo`, `test_ci`, `script`, `skill`, `texto`) |
| `casos`, `encargos` | `#n, #m` o `ninguno` |
| `verificacion` | ruta de un FICHERO de `origin/staging` que vale para su barrera: un `*.test.js` para `test_ci`, un hook, workflow o migración para `bloqueo`, un script, una skill o un texto; una carpeta no vale |
| `ventana_desde`, `ventana_hasta` | fechas AAAA-MM-DD de inicio y fin de la observación (90 días como mucho); los casos creados desde `ventana_desde` (a las 00:00 UTC de ese día) cuentan como nuevos, estén o no en `casos`: si el caso de origen es del mismo día de la fusión, pon el día siguiente |
| `mecanismo`, `causa_escape`, `clase`, `barrido`, `solucion_temporal`, `matiz`, `aprendizaje` | texto libre corto |

**Estados:** `abierto` (registrado) → `diagnosticado` (hay `mecanismo` y
`causa_escape`: qué falla y qué control debía pararlo y por qué no) → `plan`
(encargos colgados) → `en-curso` → `en-observacion` (arreglo fusionado;
`verificacion` es un fichero que ya está en `origin/staging`, `barrera` y
`ventana_hasta` puestos) → `cerrado-eficaz` (ventana limpia y `aprendizaje`
escrito: una skill, técnica, catálogo o test tocado, o `ninguno — <motivo>`).
`reabierto` es el de un caso nuevo o un «no aguantó».

**Qué hace el workflow `fondos`**, solo sobre issues de la casa (autor
`OWNER`, `MEMBER` o `COLLABORATOR`) con etiqueta `tipo:fondo`, `tipo:caso` o
`tipo:encargo`: en cada alta, edición, etiqueta, cierre o reapertura (venga de
la CLI, el MCP o la web), y una vez al día (06:35 UTC). **Colgar un hijo de un
fondo no lanza ningún workflow** (GitHub no tiene disparador para sub-issues):
lo ve el pase diario, como mucho 24 h después, en los fondos abiertos con
ficha y en los cerrados con un caso `no-aguanto-*` o posterior al cierre
(`npm run issues -- --colgar` reabre al momento). Lo que hace:
- deja UN comentario con la marca `<!-- menuplan:fondo -->` (lo actualiza, no
  apila) con una línea por regla que falla, y pone `control:ok` o `control:falla`;
- reglas: `ficha-ausente`, `ficha-bloque`, `ficha-vocabulario`,
  `ficha-incompleta`, `causa-distinta`, `sin-diagnostico`,
  `observacion-sin-verificacion`, `verificacion-no-existe`, `verificacion-no-vale`,
  `observacion-sin-ventana`, `ventana-excesiva`, `cierre-sin-aprendizaje`,
  `clasificacion` (las `faltas()` de `issues.mjs`), `sin-fondo` y
  `caso-sin-analisis` (en casos y encargos), `plan-grande`, `encargo-*` y
  `sin-preventivo-automatico` (#396, `docs/ops/ENCARGO.md`; norma `plan-tres-encargos-con-preventivo`);
- un fondo cerrado sin `aprendizaje` se **reabre**; un caso `no-aguanto-*` (o uno
  posterior al cierre) reabre el fondo y, una vez por caso, **sube un nivel de
  alcance** en la ficha (una vez por caso: la marca del comentario lo anota,
  también en fondos sin ficha); la ventana vencida sin casos nuevos y sin
  ningún no-aguanto lo pasa a `cerrado-eficaz` y lo cierra con su `arreglo:`, y
  con casos nuevos lo reabre. Los fondos de antes del 10 oct 2026 sin ficha solo
  avisan (el #334 va con ficha desde el principio: `npm run issues` lo marca).
- La marca del comentario lleva el `run` del workflow, y solo se lee un comentario
  del bot cuyo run sea de `fondos.yml`: otro workflow con el mismo bot no la falsifica.
- Informa y actúa sobre el estado del propio fondo; no impide editar. Si la API
  de GitHub no responde, el run falla con la causa (relánzalo); no culpa a nadie.

El CI de cada PR (`scripts/fondos-pr.mjs`, paso «Fondos del PR») pide
`Agente:`, el `Closes` de la rama con número y, por cada `Closes #n`, que el
fondo de un encargo tenga diagnóstico y que un fondo cerrado tenga aprendizaje.

- **El cuerpo de un caso:** cuándo, qué pasó (esperado frente a real),
  evidencia (comando y salida, PR, fichero:línea) y el análisis. El de una
  decisión: la pregunta en llano, las opciones (la recomendada primero) y qué
  pasa si no se decide. El de un encargo de un fondo, el bloque `encargo` de
  `docs/ops/ENCARGO.md` (#338; cómo se rellena, skill `plan-de-arreglo`).
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
| Ver el conjunto | `npm run issues` | fondos por casos, encargos, puntuales, por causa y agente, sin trazar, y la medida de `Casos:`; el informe de fichas (sin ficha, sin diagnóstico, ventana vencida, cerrados con aprendizaje) y los `matiz` repetidos, candidatos a valor nuevo del vocabulario |
| Ver el control de un fondo | `gh issue view <n> --comments` | el comentario `<!-- menuplan:fondo … -->` del bot, con `estado=ok` o `estado=falla` y una línea por regla |
| Poner al día la ficha de un fondo | editar el cuerpo (`gh issue edit <n> --body-file <f.md>`) con el bloque `fondo` | el workflow comenta en menos de un minuto; `control:ok` si no hay errores |
| Pasar el pase diario ahora | `gh workflow run fondos.yml --ref staging` y `gh run list --workflow fondos.yml --limit 3` | el run en verde; las ventanas vencidas, cerradas o reabiertas |
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

- **2026-10-09 · los controles del fondo solo corrían a mano (#337, fondo #231).**
  Causa: `faltas()` y `debeReabrir()` eran funciones de `npm run issues`, y
  ningún evento de GitHub las llamaba: un caso colgado desde la web o el MCP no
  reabría nada, y un fondo se cerraba sin lección. Arreglo: el workflow `fondos`
  y la ficha; tests en `scripts/fondos.test.js`, `fondos-evento.test.js` y
  `fondos-pr.test.js`, vistos fallar. Antes: 0 controles por evento y 0 fichas.
  Un `ISSUE_NUMBER` como `1e3` pasaba por número válido (`Number("1e3")` es
  1000): se lee con `^\d{1,8}$`, y hay test.
- **2026-10-09 · el bot reabría en bucle un fondo antiguo con un hijo no-aguanto
  (revisión de #337).** Causa: solo se anotaba en la marca lo que contaba el paso de
  subir alcance, no lo que reabría el paso de `debeReabrir()`; un fondo sin ficha o
  con la ficha rota reabría en cada cierre. Arreglo: lo que reabre se anota en
  `subidos`; test de dos pasadas en `scripts/fondos-ronda2.test.js` y
  `fondos-evento.test.js`. También: la ventana no cierra con un no-aguanto presente
  ni con un caso creado desde `ventana_desde` aunque esté listado, y el pase diario
  revalida los cerrados porque colgar un hijo no lanza ningún workflow.

## Qué requiere el OK de Pablo

- Crear o retirar etiquetas (`--etiquetas`; `control:ok` y `control:falla` entran
  con esa orden) y cambiar la clasificación de
  `scripts/lib/issues.mjs`.
- Cualquier ajuste de GitHub (ver la skill `github`).

## Coste y límites

Sin coste. Repo público: los issues los ve cualquiera. `npm run issues` y
`--nuevo` consultan la API de GitHub; con el límite de peticiones agotado,
fallan con su causa y se repiten más tarde.

## Fuentes y comprobación

- https://docs.github.com/issues
- https://cli.github.com/manual/gh_issue

Comprobado el 2026-10-09: esta skill sale de partir la `github` (#219) sin cambiar los hechos; no se ha vuelto a ejecutar `npm run issues` ni `--nuevo` contra GitHub al partirla. Sin comprobar: el límite exacto de la API de GitHub con el que `npm run issues` se queda sin respuesta. Comprobado el 2026-10-09 (#337): la ficha, el workflow `fondos` y el paso «Fondos del PR» con tests y una API de mentira, vistos fallar, y el lector con cuerpos hostiles. Sin comprobar: el workflow en GitHub de verdad (los endpoints REST `sub_issues` y `parent`, el run de `schedule`, las etiquetas `control:` creadas) hasta que se fusione y se edite un fondo.
