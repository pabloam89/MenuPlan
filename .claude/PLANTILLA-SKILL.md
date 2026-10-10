# Plantilla de skill

Toda skill de `.claude/skills/<nombre>/` sirve para que una sesión con prisa
haga algo bien sin haber estado en la sesión que la escribió. Hay siete tipos,
y su única lista es `tipos_skill` de `ops/forja.json`, que también dice cómo se
asigna el tipo a una skill (`preguntas_tipo`) y qué criterios se aplican a cada
uno. Todas comparten la estructura común de aquí; lo de cada tipo (sus
secciones en orden, los campos de la ficha, cómo se prueba y su ejemplo mínimo)
está en su molde, `.claude/plantillas-skill/<tipo>.md`, generado desde la forja.
La de tipo **servicio** es un **runbook**: cómo se opera un servicio.

Tres niveles (`niveles` de `ops/forja.json`): la pieza meta, `forja-de-skills`
(nivel 0, `nivel: 0` en su ficha y sin tipo), de la que salen los moldes por tipo
(nivel 1), y de ellos cada skill (nivel 2). A la pieza meta le valen las reglas
comunes de aquí, no el molde de un tipo: sus secciones las fija `nivel_0` de la forja.

La forma la vigila `.claude/skills.test.js` (nivel 1, gratis, en el CI) con las
reglas de `scripts/lib/skills.mjs`; si algo de aquí cambia, cambia allí y el test
comprueba que los dos dicen lo mismo. Que la skill ayude de verdad lo mide el
nivel 2, `npm run skills-prueba -- <skill>`, que cuesta tokens.

Está fuera de `.claude/skills/` a propósito, igual que la plantilla de agentes:
ahí Claude Code la cargaría como si fuera una skill más.

## Reglas que valen para todas

- **Nunca valores de claves**, solo su nombre y dónde viven (el test busca
  patrones de clave y de cadenas de conexión con contraseña).
- **Lo que no se ha comprobado se dice**: `Sin comprobar` al final, con el
  motivo. Una skill que parece verificada y no lo está es peor que ninguna.
- **Cuando algo falla, la lección va al test o a la guardia; si no se puede,
  aquí, en «Lo que falló y por qué»; a la memoria, nunca** (ver `CLAUDE.md`).
- Una skill nueva solo se crea si cumple la regla de parada de
  `docs/ops/FLUJO.md` (se usa dos veces, no repite nada, tiene dueño y test).
  Un proveedor nuevo estrena su runbook con su primera lección, no antes.
- **El saber vive en una sola skill.** Si dos se pisan, una manda y la otra la
  cita por su nombre; el test falla si un párrafo largo aparece igual en dos.
- Comandos copiables tal cual, con lo que **debe salir**. «Funciona» no es una
  comprobación: di qué se ve cuando funciona.

## Estructura común

Toda skill, sea del tipo que sea, tiene estas piezas:

| Pieza | Dónde vive | Obligatoria |
|---|---|---|
| **Método** | `SKILL.md`: en servicio, «Operaciones habituales»; en los demás, la sección «Método» | sí |
| **Técnicas** | `tecnicas/<técnica>.md`, una por fichero, citadas desde `SKILL.md` | si las hay (en diagnóstico y decisión, la sección «Técnicas» las resume) |
| **Referencias** | `referencias/<tema>.md`: el detalle largo que no se lee siempre; las fuentes de fuera, en «Fuentes y comprobación» | si las hay |
| **Scripts** | `scripts/` del repo si los usa más de una pieza; `scripts/` de la skill si solo ella | si los hay |
| **Plantillas** | `plantillas/<nombre>`: el texto o fichero que se copia y se rellena | si las hay |
| **Casos de prueba** | `casos.json` en la carpeta de la skill (formato abajo) | sí, al menos 4 casos |
| **Registro de cambios** | La sección «Registro de cambios», una línea fechada por cambio. En servicio hacen ese papel «Lo que falló y por qué» y las líneas «Comprobado el …» | sí |

En la carpeta solo puede haber `SKILL.md`, `casos.json` y las subcarpetas
`referencias/`, `tecnicas/`, `scripts/` y `plantillas/`; cada fichero de una
subcarpeta lo cita `SKILL.md` con su ruta entera
(`` `.claude/skills/<nombre>/referencias/<tema>.md` ``): lo que no se cita no lo
abre nadie, y el test lo da por huérfano.

### Carga por capas

`SKILL.md` es lo que se carga siempre: corto, **como mucho 220 líneas** (el test
lo mide; no se sube el tope, se parte). Lo que solo hace falta a veces (un
procedimiento largo, una tabla de referencia, un ejemplo resuelto) va a una
capa y `SKILL.md` dice cuándo abrirla: «Para instalar las copias, abre …».

### Frontmatter

```yaml
---
name: <igual que la carpeta>
description: Úsala <cuándo: los disparadores concretos>. No para: <qué es de otra skill, regla o agente>.
metadata:
  tipo: <el que dan sus respuestas>
  dueno: <agente de .claude/agents/ que la carga en su skills:>
  comprobado: AAAA-MM-DD
---
```

- `tipo` no se elige: sale de sus respuestas (sí o no) a las preguntas de
  `preguntas_tipo`, que se apuntan en `respuestas_tipo` de `ops/forja.json`;
  manda la primera con sí (`tipoDeSkill`) y, si ninguna, `conocimiento`. El
  nivel 1 falla si el frontmatter dice otro.
- `description` es lo que lee quien decide si abrirla: dice cuándo, con las
  palabras con que se pide, y qué no es suyo. Entre 81 y 600 caracteres.
- `dueno` es quien la mantiene, y tiene que llevarla en su `skills:`.
- `comprobado` es la última vez que alguien la contrastó con la realidad, y la
  fecha tiene que salir en su línea `Comprobado el AAAA-MM-DD: …`. **Caduca a
  los 90 días** (`PLAZO_COMPROBADO_DIAS`): un trimestre, lo mismo que la ventana
  máxima de observación de un fondo y que la vida de los tokens que antes
  caducan; los proveedores cambian antes que eso. Al caducar se vuelve a
  comprobar, no se cambia la fecha sin más. La caducidad no está en
  `npm test` (el reloj pondría en rojo todos los PR): el paso «Skills del PR»
  del CI (`scripts/skills-pr.mjs`) falla solo si el PR toca una skill
  caducada; en local, `node scripts/skills-pr.mjs` avisa; y la medición semanal
  (`npm run planos`) cuenta las caducadas y las que caducan en 14 días.

### Casos de prueba (`casos.json`)

```json
{
  "skill": "<nombre>",
  "casos": [
    { "id": "ci-rojo", "peticion": "El CI de mi PR está en rojo, ¿qué ha fallado?", "skill": "<nombre>",
      "debe_salir": ["Propone gh run view <id> --log-failed", "No relanza sin mirar el log"] },
    { "id": "frontera-despliegue", "peticion": "La preview de Vercel no arranca", "skill": "vercel" }
  ]
}
```

- Al menos **4 casos**: 3 que deben cargar esta skill, con `debe_salir` (lo
  que tiene que decir o hacer quien la abra, comprobable), y 1 de frontera, que
  debe cargar otra skill o `ninguna` (el que mejor separa: la petición que se
  parece y no es suya). Eso es el suelo de la forma; la forja (abajo) pide
  **3 casos de frontera**.
- `peticion` en las palabras de quien pide, no en las de la skill. Nada de
  datos de familias ni nada sensible: el repo es público.
- Campos: `id`, `peticion`, `skill`, `debe_salir` y, si hace falta, `nota`.

## Los tipos y su plantilla

La lista de tipos, qué entra y qué sale de cada uno, cómo se prueba, la
pregunta que lleva a él y los criterios que le tocan están en `ops/forja.json`
(su vista, en `docs/ops/FORJA.md`). Las secciones obligatorias de cada tipo, en
orden, y el molde que se copia, en `.claude/plantillas-skill/<tipo>.md`, que
genera `npm run plantillas -- --escribir`. Aquí no se repite ninguna de las
dos cosas: `.claude/plantillas-skill.test.js` falla si un molde no está al día
y si aparece otra lista de tipos fuera de la forja.

Todos los tipos menos servicio comparten cabeza («Cuándo y para qué»,
«Método») y cola («Lo que falló y por qué», «Registro de cambios», «Fuentes y
comprobación»).

### El servicio, sección a sección

1. **Qué es y dónde.** Para quien llega de nuevas. Si hay un nombre antiguo o
   una trampa de identidad (otro nombre, otra cuenta), aquí.
2. **Claves y accesos.** Una línea por clave o acceso. Si el detalle manda en
   `ops/INVENTARIO.md`, se cita, no se copia.
3. **Operaciones habituales.** Una fila por operación, ordenadas de más a menos
   frecuentes. La tercera columna es lo que permite saber, sin preguntar, si
   ha ido bien. Lo que necesita un OK de Pablo se marca en la fila con «(OK)».
   Un procedimiento de muchos pasos va a `referencias/` y aquí queda su fila.
4. **Lo que falló y por qué.** Lo más reciente arriba. La fecha es de cuando
   pasó, `AAAA-MM-DD` (o `AAAA-MM` si no se sabe el día). Cada entrada cierra
   con su **Arreglo**; si no se ha arreglado, el arreglo dice «Sin resolver» y
   qué hay que hacer.
5. **Qué requiere el OK de Pablo.** La lista de gateways de este dominio. Es la
   misma regla de `CLAUDE.md`, concretada para este servicio.
6. **Coste y límites.** Una cifra con su fecha. «Sin coste propio» si no lo hay.
7. **Fuentes y comprobación.** La última línea del fichero es siempre
   `Comprobado el AAAA-MM-DD: …` o `Sin comprobar: …`.

### Los demás tipos

- **Cuándo y para qué**: el problema que resuelve y cuándo no usarla.
- **Método**: los pasos, en orden, cada uno con lo que sale. Lo largo, a una capa.
- **Lo que falló y por qué**: igual que en servicio, con fecha, causa y
  arreglo; una skill nueva puede empezar sin entradas y decirlo.
- **Registro de cambios**: `- **AAAA-MM-DD** · qué cambió (#issue)`, lo más
  reciente arriba; al menos la primera versión.
- La última línea, como en servicio: `Comprobado el …` o `Sin comprobar: …`.

## El estándar de cada tipo

El molde de cada tipo dice qué secciones lleva; esto dice **qué hace buena
a una skill de ese tipo**, qué la estropea y cómo se ve una buena. Cada punto lleva
su marca: **[F: fuente]** está en la fuente (las siglas BP, CC, DESC, EVAL, SB, CE y
BEA y sus URL, en la skill `forja-de-skills`) y **[I]** es inferencia nuestra,
también la que se traslada por analogía desde guías de prompts o de agentes. Un
tipo sin su estándar no se puede usar: `.claude/skills.test.js` falla si a un tipo le
falta «Qué lo hace bueno», «Errores típicos» o su ejemplo, si un punto no lleva
marca, y comprueba que un ejemplo real sale tal cual de la skill que cita. Si hoy
no hay ninguna skill de un tipo, el ejemplo es un esqueleto y lo dice; con la
primera skill de ese tipo, pasa a ser real. Si un punto lo contradice una skill del
tipo, manda la medida (`skills-prueba`), no este texto. Cada apartado se copia a
su molde al generarlo: se escribe aquí y solo aquí, uno por cada tipo de la forja.

### `servicio`

#### Qué lo hace bueno

- Cada operación es una fila con el comando exacto y lo que debe salir: donde un error cuesta caro, pasos cerrados y no consejos [F: BP, grados de libertad].
- «Lo que falló y por qué» recoge fallos reales con su causa y su arreglo; es la memoria del servicio y lo que el modelo no sabe [I].
- Lo irreversible está nombrado en «Qué requiere el OK de Pablo», y lo no comprobado se dice en la última línea [I].
- El estado real y lo pendiente, sin disimular; el procedimiento largo, en una capa que `SKILL.md` cita [F: BP, un solo nivel de profundidad].

#### Errores típicos

- Pegar la documentación del proveedor, que el modelo ya conoce [F: BP, lo conciso].
- Una fila sin «Debe salir»: no se sabe si fue bien [I].
- Precios, versiones o «desde tal día» escritos en el cuerpo, que se quedan viejos [F: BP, información que caduca].
- Un procedimiento de veinte pasos metido en una celda de la tabla [I].

#### Ejemplo mínimo

Real: `tailscale`, la tabla de «Operaciones habituales».

```
| Qué | Comando | Debe salir |
|---|---|---|
| Probar la entrada al servidor | `ssh root@100.73.252.32 hostname` | `HoMenu-Panel` |
```

### `procedimiento`

#### Qué lo hace bueno

- Pasos numerados en orden fijo, cada uno con lo que sale al terminarlo [F: BP, flujos con pasos claros y listas de comprobación].
- «Antes de empezar» comprueba las condiciones y «Cómo se comprueba» confirma el resultado sin enseñar datos sensibles [F: BP, bucles de comprobación].
- Los pasos que no se pueden deshacer son de una persona: el procedimiento deja los comandos listos y no los lanza [I].
- Al sustituir algo, primero se comprueba lo nuevo y solo entonces se retira lo viejo [I].
- Una lista de comprobación que se copia y se marca al final [F: BP, listas de comprobación].

#### Errores típicos

- Pasos sin salida observable: «comprueba que esté bien» [F: BP, instrucciones claras].
- Probar solo en local algo que corre en otro entorno [I, lección de la propia `alta-de-secreto`].
- Un valor secreto escrito en el comando, que queda en la conversación [I].
- Mezclar varios procedimientos en uno (dar de alta, rotar y operar el servicio) sin decir qué es de cada uno [I].

#### Ejemplo mínimo

Real: `alta-de-secreto`, el primer paso de su método.

```
1. **Una clave, un uso.** Decide quién la usa (un workflow, el despliegue, un
   script del PC, el servidor) y no reutilices la de otro uso: si se filtra o
   caduca, solo cae ese. Sale: una línea «para qué, quién la lee, dónde vive».
```

### `diagnostico`

#### Qué lo hace bueno

- Un camino por defecto y una salida para el caso raro, no un menú de opciones [F: BP, demasiadas opciones].
- Cada paso del método dice lo que sale, y el método dice cuándo se acaba [F: BP, bucles de comprobación] y la condición de parada [I: por analogía, BEA].
- Las técnicas se eligen por un dato del problema (su tipo de causa, su alcance), no por gusto [I].
- Lo que no se ha podido comprobar se escribe como hipótesis, con la observación que la confirmaría [I].
- Un ejemplo resuelto, abstracto y canónico, que sigue la propia norma de la skill [I por analogía, CE, ejemplos canónicos].

#### Errores típicos

- Un método de principios («analiza bien») sin pasos que se puedan ver [F: BP, instrucciones claras].
- Un ejemplo copiado de un caso real, con nombres o datos de familias [I].
- Dar libertad total donde un fallo cuesta caro [F: BP, grados de libertad].
- El catálogo de técnicas copiado dentro de la skill y también en su fuente: dos versiones [I].

#### Ejemplo mínimo

Real: `causa-raiz`, el paso que cierra la causa.

```
6. **Escribe la causa en tres piezas**: *mecanismo* (qué hace el sistema) +
   *condición* (cuándo falla) + *control ausente* (qué debía pararlo y no
   existe o no lo ve). Plantilla: «<mecanismo> falla cuando <condición>, y
   <control> no lo para porque <motivo>». Va al campo `mecanismo` de la ficha.
```

### `decision`

#### Qué lo hace bueno

- Las opciones se ordenan con un catálogo escrito (la escalera, los mecanismos) y se empieza por la más alta; bajar exige su motivo [I].
- Cada criterio del catálogo se aplica a la opción elegida y se dice cómo, no solo el resultado [I, prueba del tipo en `ops/forja.json`].
- Una recomendación por defecto y, aparte, cuándo conviene otra, no un menú [F: BP, demasiadas opciones].
- Cada paso del método dice lo que sale, y el método dice cuándo se acaba [F: BP, bucles de comprobación].

#### Errores típicos

- Elegir por gusto o por costumbre sin pasar por el catálogo [I].
- Un menú de opciones sin la recomendada [F: BP, demasiadas opciones].
- Copiar el catálogo de opciones dentro de la skill: dos versiones que se separan [I].

#### Ejemplo mínimo

Real: `plan-de-arreglo`, el paso que elige el mecanismo.

```
4. **Elige el mecanismo, el más alto posible.** `npm run mecanismos` → el
   catálogo `ops/mecanismos.json` por escalones, de bloqueo a texto, con
   cuándo conviene cada uno, qué cuesta y hasta qué veredicto llega. Empieza
   por arriba y baja solo con un motivo: no se puede (el proveedor no lo
   permite), cuesta más que el daño, o alcanza a menos gente de la que debe.
```

### `flujo`

#### Qué lo hace bueno

- Cada etapa nombra la skill o el agente que la lleva, y existe [I, prueba del tipo en `ops/forja.json`].
- Cada etapa tiene su puerta: lo que la hace cumplir (un hook, el CI, un workflow), no solo el texto [I, CLAUDE.md «Lo que hace cumplir esto»].
- Dice qué entra y qué sale de cada etapa, para que la siguiente sepa por dónde empezar [I].

#### Errores típicos

- Copiar dentro el método de una etapa que ya tiene su skill: dos versiones [I].
- Una etapa sin dueño o sin puerta, que depende de que alguien se acuerde [I, CLAUDE.md «Cuando algo falla»].
- Encadenar etapas sin decir qué sale de cada una, y que la siguiente lo adivine [I].

#### Ejemplo mínimo

Real: `issues`, el árbol de un fallo hasta su arreglo.

```
problema de fondo (tipo:fondo)   qué falla de fondo, su arreglo general y cómo se probará
  ├─ caso (tipo:caso)            dónde se ha visto: la evidencia
  └─ encargo (tipo:encargo)      una parte del arreglo, con su dueño y su PR
```

### `revision`

#### Qué lo hace bueno

- Cada criterio es observable y va separado de los demás, con la evidencia que lo cumple (fichero y línea, una salida) [I].
- Los criterios viven en su catálogo y la skill los cita; no los copia [I].
- Cada hallazgo sale con un código de un vocabulario cerrado y su arreglo, para poder contarlo [I].
- Quien construye no juzga, y el juez no escribe lo que revisa [I].
- Un criterio discrimina: si pasa igual con la pieza buena que con la mala, se retira [F: EVAL, aserciones que no miden nada].

#### Errores típicos

- Criterios con adjetivos («claro», «bueno») sin nada que mirar [I].
- Ejemplos calibrados solo de lo obvio, que cualquier rúbrica separa [I].
- Un juez que arregla lo que juzga: deja de ser independiente [I].
- Juzgar sin mirar antes lo ya apuntado, y dar por nuevo lo conocido [I, caso #320].

#### Ejemplo mínimo

Real: `higiene-de-skills`, el primer paso de su método.

```
1. **Lanza el script** sobre la skill: `npm run higiene-skills -- <skill>`. Sale
   una línea `higiene skill: <s> faltas: a avisos: b solape: x con: <otra>` y,
   debajo, cada defecto con su `arreglo`. Para el conjunto, `--todas`.
```

### `conocimiento`

#### Qué lo hace bueno

- «Lo que hay que saber» son hechos que el modelo no tiene (reglas del negocio, excepciones, vocabulario propio), no definiciones generales [F: BP, lo conciso].
- «Dónde vive el dato» apunta a la fuente de verdad y dice cómo leerla; no copia el dato [I].
- Se organiza por tema, con el detalle de cada uno en su capa, para cargar solo lo que se necesita [F: BP, organización por dominio].
- Una palabra por cosa en toda la skill [F: BP, terminología coherente].

#### Errores típicos

- Copiar el dato (una cifra, una lista, un estado) en la skill: pasa a haber dos fuentes y una se queda vieja [I].
- Cifras o estados que caducan escritos en el cuerpo [F: BP, información que caduca].
- Mezclar dos temas en una skill, que acaba solapando con otra [F: SB, según resúmenes; I el reparto].
- Explicar el tema como un manual en lugar de lo que el modelo no sabe [F: BP, lo conciso].

#### Ejemplo mínimo

Real: `estilo-de-respuesta`, provisional en este tipo hasta que exista el artefacto de estándares; la norma de «La norma».

```
- la primera línea es una sola frase y está en negrita;
- hay cuatro ideas o menos;
- no hay cabeceras, tablas largas ni listas de ficheros;
```

## La forja: qué hace buena a una skill

La forma no basta: una skill con todas las secciones puede no abrirse nunca o
no enseñar nada. Qué la hace ganadora, qué la hace mala, con su fuente, y cómo se
forja paso a paso (incluido cuándo **no** crearla) está en la skill
`forja-de-skills`. Lo automatizable lo comprueba la regla `forja` del nivel 1
(`scripts/lib/skillsForja.mjs`):

- **3 casos de frontera** como mínimo (peticiones parecidas que son de otra skill).
- **Sin fechas en el cuerpo** fuera de «Lo que falló y por qué», «Registro de
  cambios» y «Fuentes y comprobación».
- **Criterio de parada**: el «Método» (salvo en servicio) dice qué sale o cuándo se acaba.
- **Como mucho 3 ejemplos** por sección de ejemplos.
- **Descripciones sin solape** léxico entre skills.
- **Presentación mecánica**: los comandos en código (en línea o en bloque), las
  tablas con todas las filas del mismo ancho y sin celdas vacías, y las cabeceras
  sin saltar de nivel. Cuándo tabla, lista, negrita o código, y lo que solo juzga una
  persona, en `.claude/skills/forja-de-skills/referencias/presentacion.md`.
- Techos del estándar abierto: descripción de **1024 caracteres** y `SKILL.md` de
  **500 líneas**; los de la casa (600 y 220) van por debajo.

Lo que incumplen las skills de antes de la forja está en `EXCEPCIONES_FORJA`, una
lista que solo baja: se arregla la skill, no se añade nada. Lo que solo juzga una
persona (si cada párrafo justifica su coste, si hay un camino por defecto) o
`skills-prueba` (si dispara, si mejora sobre el modelo solo) no es test.

## Nivel 2: ¿ayuda de verdad?

`npm run skills-prueba -- <skill> [<skill>…]` (cuesta tokens; tope propio de
1 $ por pasada si no se pide otro con `--tope`, y nunca más de lo que queda del
presupuesto mensual de evals de `scripts/lib/evals.mjs`):

1. **Disparo**: para cada caso, un modelo barato ve solo los nombres y las
   descripciones de todas las skills y elige una (o `ninguna`). Acierta si
   coincide con el `skill` del caso.
2. **Ejecución**: para cada caso propio, el modelo de las sesiones lee el
   `SKILL.md` y contesta a la petición sin ejecutar nada; un corrector barato
   mira cada línea de `debe_salir`.
3. Guarda el resultado en `ops/skills-prueba/<skill>.json` y lo compara con la
   pasada anterior caso a caso (`mejora`, `empeora`, `igual`, `nuevo`).

Se lanza al cambiar una skill y antes de subir su fecha de `comprobado`. Con
`--ensayo` dice qué correría y cuánto costaría como mucho, sin llamar a nadie.
