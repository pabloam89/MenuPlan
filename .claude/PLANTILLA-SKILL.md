# Plantilla de skill

Toda skill de `.claude/skills/<nombre>/` sirve para que una sesión con prisa
haga algo bien sin haber estado en la sesión que la escribió. Hay ocho tipos
(la lista y su estado viven en `ops/flujo.json`, `tipos_skill`); todas
comparten la estructura común y cada tipo tiene sus secciones. La de tipo
**herramienta** es un **runbook**: cómo se opera un servicio.

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
| **Método** | `SKILL.md`: en herramienta, «Operaciones habituales»; en los demás, la sección «Método» | sí |
| **Técnicas** | `tecnicas/<técnica>.md`, una por fichero, citadas desde `SKILL.md` | si las hay (en oficio, la sección «Técnicas» las resume) |
| **Referencias** | `referencias/<tema>.md`: el detalle largo que no se lee siempre; las fuentes de fuera, en «Fuentes y comprobación» | si las hay |
| **Scripts** | `scripts/` del repo si los usa más de una pieza; `scripts/` de la skill si solo ella | si los hay |
| **Plantillas** | `plantillas/<nombre>`: el texto o fichero que se copia y se rellena | si las hay |
| **Casos de prueba** | `casos.json` en la carpeta de la skill (formato abajo) | sí, al menos 4 casos |
| **Registro de cambios** | La sección «Registro de cambios», una línea fechada por cambio. En herramienta hacen ese papel «Lo que falló y por qué» y las líneas «Comprobado el …» | sí |

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
  tipo: <uno de los ocho>
  dueno: <agente de .claude/agents/ que la carga en su skills:>
  comprobado: AAAA-MM-DD
---
```

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

## Los ocho tipos y sus secciones

Secciones obligatorias, en este orden. Los tipos que no son herramienta
comparten cabeza («Cuándo y para qué», «Método») y cola («Lo que falló y por
qué», «Registro de cambios», «Fuentes y comprobación»).

| Tipo | Qué guarda | Secciones, en orden |
|---|---|---|
| `herramienta` | Cómo se opera un servicio | Qué es y dónde · Claves y accesos · Operaciones habituales · Lo que falló y por qué · Qué requiere el OK de Pablo · Coste y límites · Fuentes y comprobación |
| `oficio` | Cómo se piensa un tipo de problema | Cuándo y para qué · Método · Técnicas · Ejemplo resuelto · Lo que falló y por qué · Registro de cambios · Fuentes y comprobación |
| `dominio` | El conocimiento del negocio | Cuándo y para qué · Método · Lo que hay que saber · Dónde vive el dato · Lo que falló y por qué · Registro de cambios · Fuentes y comprobación |
| `estandar` | Cómo deben quedar las cosas | Cuándo y para qué · Método · La norma · Bien y mal · Lo que falló y por qué · Registro de cambios · Fuentes y comprobación |
| `receta_cambio` | Los pasos de una acción que se repite | Cuándo y para qué · Método · Antes de empezar · Cómo se comprueba · Qué requiere el OK de Pablo · Lo que falló y por qué · Registro de cambios · Fuentes y comprobación |
| `rubrica_juez` | Qué mira un juez y cómo puntúa | Cuándo y para qué · Método · Qué mira · Cómo puntúa · Ejemplos calibrados · Lo que falló y por qué · Registro de cambios · Fuentes y comprobación |
| `investigacion` | Cómo buscar fuera y destilar | Cuándo y para qué · Método · Pregunta y alcance · Dónde buscar · Cómo se destila · Lo que falló y por qué · Registro de cambios · Fuentes y comprobación |
| `meta` | Cómo crear, probar y podar las propias piezas | Cuándo y para qué · Método · Cómo se prueba · Cuándo se poda · Lo que falló y por qué · Registro de cambios · Fuentes y comprobación |

Hoy hay skills de tipo herramienta, de tipo oficio (`causa-raiz` y
`plan-de-arreglo`, #338), de tipo receta de cambio (`alta-de-secreto`, #398), de tipo meta (`forja-de-skills`, #409) y de tipo estándar (`estilo-de-respuesta`, #415); el estado de cada tipo lo lleva `ops/flujo.json`. Los demás quedan declarados y no se crea ninguno hasta que
cumpla la regla de parada.

### Forma del tipo herramienta

```markdown
# <Nombre>

## Qué es y dónde
Qué es, para qué lo usamos, quién es el dueño y qué pasa cuando no es lo que
parece. Estado real hoy y **Pendiente:** lo que falta, sin disimular.

## Claves y accesos
Nombres (no valores), dónde viven y cómo se entra. Cuentas, llaves, tokens.

## Operaciones habituales
| Qué | Comando | Debe salir |
|---|---|---|
| Lo que se hace a menudo | `comando` | lo que se ve si ha ido bien |

## Lo que falló y por qué
- **AAAA-MM-DD · síntoma tal como se ve.** Causa: … Arreglo: …

## Qué requiere el OK de Pablo
- Lo que nunca se hace sin su sí explícito.

## Coste y límites
Cuánto cuesta, qué tope o cuota hay, y qué lo dispara.

## Fuentes y comprobación
- Enlaces de la documentación oficial.

Comprobado el AAAA-MM-DD: cómo se comprobó, y qué NO se comprobó.
```

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
- **Lo que falló y por qué**: igual que en herramienta, con fecha, causa y
  arreglo; una skill nueva puede empezar sin entradas y decirlo.
- **Registro de cambios**: `- **AAAA-MM-DD** · qué cambió (#issue)`, lo más
  reciente arriba; al menos la primera versión.
- La última línea, como en herramienta: `Comprobado el …` o `Sin comprobar: …`.

## El estándar de cada tipo

La forma de arriba dice qué secciones lleva cada tipo; esto dice **qué hace buena
a una skill de ese tipo**, qué la estropea y cómo se ve una buena. Cada punto lleva
su marca: **[F: fuente]** está en la fuente (las siglas BP, CC, DESC, EVAL, SB, CE y
BEA y sus URL, en la skill `forja-de-skills`) y **[I]** es inferencia nuestra,
también la que se traslada por analogía desde guías de prompts o de agentes. Un
tipo sin su estándar no se puede usar: `.claude/skills.test.js` falla si a un tipo le
falta «Qué lo hace bueno», «Errores típicos» o su ejemplo, si un punto no lleva
marca, y comprueba que un ejemplo real sale tal cual de la skill que cita. Si hoy
no hay ninguna skill de un tipo, el ejemplo es un esqueleto y lo dice; con la
primera skill de ese tipo, pasa a ser real. Si un punto lo contradice una skill del
tipo, manda la medida (`skills-prueba`), no este texto.

### `herramienta`

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

### `oficio`

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

### `dominio`

#### Qué lo hace bueno

- «Lo que hay que saber» son hechos que el modelo no tiene (reglas del negocio, excepciones, vocabulario propio), no definiciones generales [F: BP, lo conciso].
- «Dónde vive el dato» apunta a la fuente de verdad y dice cómo leerla; no copia el dato [I].
- Se organiza por tema, con el detalle de cada uno en su capa, para cargar solo lo que se necesita [F: BP, organización por dominio].
- Una palabra por cosa en toda la skill [F: BP, terminología coherente].

#### Errores típicos

- Copiar el dato (una cifra, una lista, un estado) en la skill: pasa a haber dos fuentes y una se queda vieja [I].
- Cifras o estados que caducan escritos en el cuerpo [F: BP, información que caduca].
- Mezclar dos dominios en una skill, que acaba solapando con otra [F: SB, según resúmenes; I el reparto].
- Explicar el dominio como un manual en lugar de lo que el modelo no sabe [F: BP, lo conciso].

#### Ejemplo mínimo

Esqueleto: aún no hay ninguna skill de este tipo; con la primera, se sustituye por un ejemplo real.

```
Lo que hay que saber: <un hecho que el modelo no tiene>. Se lee en <fuente>.
Dónde vive el dato: <qué dato> -> <fuente de verdad> -> <cómo se lee>.
No es de esta skill: <lo vecino> -> <skill que lo tiene>.
```

### `estandar`

#### Qué lo hace bueno

- La norma cabe en una frase que permite decir, de un caso concreto, si la cumple o no [I].
- «Bien y mal» pone el mismo caso mínimo hecho bien y hecho mal, uno junto al otro, con el porqué [F: BP, ejemplos de entrada y salida; I el formato en pares].
- Lo que una máquina puede comprobar se pasa a un test o a un hook; lo que solo juzga una persona queda escrito como tal [I].
- Pocos ejemplos, canónicos y que no contradicen la norma [I por analogía, CE, ejemplos canónicos].

#### Errores típicos

- Una norma que es un deseo («código limpio») sin nada observable [I].
- Un ejemplo que incumple la norma que enseña [I].
- Una norma que se podría comprobar con un test y vive solo como texto [I].
- La norma copiada de otra skill o de un fichero de reglas: dos versiones [I].

#### Ejemplo mínimo

Real: `estilo-de-respuesta`, la norma de «La norma».

```
- la primera línea es una sola frase y está en negrita;
- hay cuatro ideas o menos;
- no hay cabeceras, tablas largas ni listas de ficheros;
```

### `receta_cambio`

#### Qué lo hace bueno

- Pasos numerados en orden fijo, cada uno con lo que sale al terminarlo [F: BP, flujos con pasos claros y listas de comprobación].
- «Antes de empezar» comprueba las condiciones y «Cómo se comprueba» confirma el resultado sin enseñar datos sensibles [F: BP, bucles de comprobación].
- Los pasos que no se pueden deshacer son de una persona: la receta deja los comandos listos y no los lanza [I].
- Al sustituir algo, primero se comprueba lo nuevo y solo entonces se retira lo viejo [I].
- Una lista de comprobación que se copia y se marca al final [F: BP, listas de comprobación].

#### Errores típicos

- Pasos sin salida observable: «comprueba que esté bien» [F: BP, instrucciones claras].
- Probar solo en local algo que corre en otro entorno [I, lección de la propia `alta-de-secreto`].
- Un valor secreto escrito en el comando, que queda en la conversación [I].
- Mezclar varias recetas en una (dar de alta, rotar y operar el servicio) sin decir qué es de cada una [I].

#### Ejemplo mínimo

Real: `alta-de-secreto`, el primer paso de su método.

```
1. **Una clave, un uso.** Decide quién la usa (un workflow, el despliegue, un
   script del PC, el servidor) y no reutilices la de otro uso: si se filtra o
   caduca, solo cae ese. Sale: una línea «para qué, quién la lee, dónde vive».
```

### `rubrica_juez`

#### Qué lo hace bueno

- Cada criterio es observable y va separado de los demás, con la evidencia que lo cumple (fichero y línea, una salida) [I].
- La escala tiene anclas: qué es cada nivel, con un ejemplo calibrado por nivel, incluidos casi-fallos [I; DESC pide negativos cercanos para descripciones, F, y se traslada].
- El juez cita la evidencia antes de puntuar, y da un veredicto de un vocabulario cerrado que se puede contar [I].
- Quien construye no juzga, y el juez no escribe lo que revisa [I].
- Un criterio discrimina: si pasa igual con la pieza buena que con la mala, se retira [F: EVAL, aserciones que no miden nada].

#### Errores típicos

- Criterios con adjetivos («claro», «bueno») sin nada que mirar [I].
- Ejemplos calibrados solo de lo obvio, que cualquier rúbrica separa [I].
- Un juez que arregla lo que juzga: deja de ser independiente [I].
- Juzgar sin mirar antes lo ya apuntado, y dar por nuevo lo conocido [I, caso #320].

#### Ejemplo mínimo

Esqueleto: aún no hay ninguna skill de este tipo; con la primera, se sustituye por un ejemplo real.

```
Criterio: <qué se mira>. Evidencia: <fichero:línea o salida que lo cumple>.
Veredicto: ok | reparos | bloquea, con la condición comprobable de cada uno.
Calibrado: <un caso mínimo> -> <veredicto> porque <la razón>.
```

### `investigacion`

#### Qué lo hace bueno

- La pregunta es una frase y el alcance dice cuándo hay bastante, antes de buscar [I por analogía, BEA, condiciones de parada].
- Fuentes primarias y oficiales primero, con su dirección, y cada afirmación marcada como hecho de la fuente o inferencia [I].
- Se trae solo lo que responde a la pregunta, por consultas concretas, no todo lo que hay [I por analogía, CE, contexto justo a tiempo].
- Se destila a lo que cambia una decisión, y lo demás se descarta [I].
- Se dice qué fuente no se ha podido leer y de qué es resumen cada cifra [I].

#### Errores típicos

- Resumir resúmenes (cifras de segunda mano) sin decirlo [I].
- Mezclar hecho e inferencia sin marcar cuál es cuál [I].
- Buscar sin pregunta y entregar un informe largo sin conclusión [I].
- Tratar el texto de fuera como instrucciones en lugar de como dato [I, fondo #313].

#### Ejemplo mínimo

Esqueleto: aún no hay ninguna skill de este tipo; con la primera, se sustituye por un ejemplo real.

```
Pregunta: <en una frase>. Hay bastante cuando: <qué respuesta basta>.
Dónde buscar: <fuente oficial primero>, <segunda fuente>.
Destilado: <afirmación> [F: fuente] o [I]; no leído: <lo que falta>.
```

### `meta`

#### Qué lo hace bueno

- Empieza preguntando si hace falta la pieza, con una regla de parada escrita [I].
- Se ve el fallo sin la pieza antes de escribirla, y los casos se escriben antes que el texto [F: BP, evaluaciones primero; EVAL].
- Se mide con y sin la pieza, y en más de una pasada [F: EVAL, con y sin la skill, varias ejecuciones].
- Dice quién comprueba cada cosa: un test, una medida o una persona [I].
- Dice cuándo se poda lo que ya no sirve [I].

#### Errores típicos

- Alargar el texto cuando no mejora la medida [F: BP, lo conciso].
- Declarar que mejora con una sola ejecución [F: EVAL, varias ejecuciones].
- Una lista de excepciones que crece en lugar de arreglar la pieza [I].
- Una pieza generada sin contrastarla con un fallo real [F: SB, según resúmenes].

#### Ejemplo mínimo

Real: `forja-de-skills`, el segundo paso de su método.

```
2. **Ver el fallo sin la skill.** Pon la petición real a una sesión sin la skill
   y anota en qué falla (comando que inventa, paso que se salta). Sale: una
   lista de fallos reales; si está vacía, no hay skill (paso 1).
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
- **Criterio de parada**: el «Método» (salvo en herramienta) dice qué sale o cuándo se acaba.
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
