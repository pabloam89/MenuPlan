# Arquitectura objetivo: un registro, tres entidades de base y una sola tubería, para Lola y la app

Estado: PROPUESTA (30 oct 2026); D1, D2 y D3 decididas por Pablo el mismo día (ver Decisions). Base leída: `origin/staging` en `5754e531`. Es el porqué de la ampliación de `specs/plan-fichas-con-estado.md` (aprobado), que es la única fuente de los campos, los trozos, las migraciones y las cifras: aquí se enlazan, no se copian. Este documento es, a su vez, la única fuente del método de choques (clases, criterios, respuestas y momentos): el plan lo enlaza. Recoge las raíces de #958 (comentario del 29 oct) y la conversación con Pablo del 30 oct.

## La idea en una frase

Todo lo que Lola y la app saben, piden y hacen se describe **una vez** en un registro, se guarda como **dato con sobre**, se cambia solo con una **operación** que pasa por una única tubería, y todo lo que condiciona el menú es una **preferencia** con la misma forma, que el motor cumple o explica por qué no.

## Lo desagradable primero

- **Hoy la garantía está en las palabras, no en la estructura** (#958, raíz común). El prompt promete; las herramientas de Lola escriben cada una a su manera; la app escribe la casa desde muchos sitios; el motor lee claves sueltas del documento; los gustos solo desempatan (`src/lib/solver.js`, paso 5). Las cifras de cada cosa, con su comando, están en el plan («Lo desagradable primero», «Estado medido», «Cifras que bajan» y el Existing de cada trozo). Nada de lo de abajo cambia eso si se hace a medias: cada capa tiene que ser **la única puerta**, con un test que haga imposible saltársela.
- **El momento es ahora.** Hay pocas casas (la cifra, en el plan, «Estado medido»). La decisión «sin convivencia» (cada ficha nueva se estrena vacía) es barata ahora y carísima con miles. Lo que no se haga en esta ronda se hará con migraciones de datos de familias reales.
- **La migración 0105 decide la forma de la escritura.** Si se escribe como está en el plan (sobre + `escribir_dato`) y después se añade la operación, se rehace. Igual con la 0107: si crea `gusto` y después se decide `preferencia`, se tira. Las dos decisiones (D1, D2) van antes de escribir esas migraciones.
- **Riesgo de sobreabstraer.** Un motor de preferencias genérico y un registro que genera todo pueden convertirse en un marco que nadie entiende. Contramedida en cada capa: forma pequeña y cerrada, y un test de paridad contra lo que hay hoy antes de retirar lo viejo.
- **No se ha visto el trabajo local sin subir** (sesiones de terminal). Ver Not verified.

## Principios

1. **Una idea, un sitio.** Cada dato, eje, valor, acción y regla se declara una vez; lo demás es proyección generada o leída de ahí.
2. **La puerta es la estructura.** Lo crítico (alergias, permisos, idempotencia, resultado) se comprueba en la tubería y en la base, no en el prompt ni en cada herramienta.
3. **Lo hecho sale de los datos.** Lo que Lola o la app dicen que se hizo se pinta desde el resultado guardado.
4. **El lenguaje libre muere a la entrada.** Solo el intérprete toca texto; desde ahí todo son valores cerrados con tipo.
5. **Cada cosa con identidad, autor y tiempo.** Operación, dato, tarea, preferencia y plato llevan id, quién, cuándo, de dónde.
6. **Lo que no se mide vuelve.** Cada capa tiene su cifra con línea base en el CI o en el panel.

## Las capas

```
 Familia ──► Lola (texto, voz, foto)          App (pantallas)
               │                                  │
               ▼                                  ▼
        [5] Conversación: turno, intérprete    [6] App: lee fichas, propone operaciones
               │        valores cerrados              │
               └──────────────┬───────────────────────┘
                              ▼
              [3] Operación: entender → comprobar → aplicar → apuntar → contar → deshacer
                              │
          ┌───────────────────┼─────────────────────────┐
          ▼                   ▼                         ▼
   [2] Estado: fichas    [4] Preferencias ──► Motor    [7] Tareas (iniciativa)
       con sobre               (entrada → problema → plan + cumplimiento)
          │                   │                         │
          └──────── todo declarado en [1] Registro (datos, ejes, valores, acciones) ────┘
                              │
              [8] Traza y medida · [9] Seguridad y privacidad · [10] Escala y coste
```

### [1] Registro: la ontología, y lo que se genera de ella

Cuatro listas, cada una de una clase de cosa, enlazadas por id:

| Lista | Qué declara | Hoy | Absorbe |
|---|---|---|---|
| **Datos** | entidades (casa, persona, grupo, rutina, preferencia, tarea, semana…) y sus campos: tipo, vocabulario, ficha, defecto, mínimo, caducidad, peso, escritor, choque | `src/lib/registroFicha.js` (con trozo 5 hecho: #1048, #1049) | `registroCampos.js` (ya proyección), `wizardRegistry.js` (en parte), `notepadFields.js`, los campos de `registroTareas.js` |
| **Ejes** | cómo es una receta o un alimento (`src/data/axisRegistry.js`), con tipo, vocabulario y si se puede agregar (sumar, contar, media) | `axisRegistry.js` | los nutrientes de `src/data/derived/recipeNutrition.json` como ejes agregables |
| **Valores** | listas cerradas | `src/lib/vocabularios.js` | los ENUMS de `registroTareas.js` |
| **Acciones** | lo que se puede hacer, con herramienta de Lola, pantalla de la app y datos que lee y escribe | `src/lib/capacidades.js` | la definición de cada herramienta de Lola |

**Lo que se genera** (el salto que falta; hoy se escribe a mano en cada sitio: el plan, trozo 25, cuenta en cuántos ficheros):

- CHECK y filas de `registro_campo` en la base (ya se hace para una parte de los campos desde la 0097).
- El esquema de cada herramienta de Lola (parámetros con `enum` y tipo) desde Acciones + Datos + Valores.
- El control de cada campo en la app por su tipo (lista cerrada → chips; número → paso; fecha → selector), como componente genérico; las pantallas siguen siendo a mano, los controles no.
- La entrada del motor ([4]) desde Ejes y Datos.
- La siguiente pregunta ([7]) desde `minimo_para_generar` y `peso_menu`.

Cifra: ficheros que hay que tocar para añadir un dato nuevo (la de hoy y su comando, en el plan, trozo 25; objetivo: el registro y, si tiene pantalla propia, la pantalla).

Challenge: un generador de pantallas completas sería un marco; no se hace. Se generan controles y esquemas, no flujos.

### [2] Estado: fichas con sobre

Es el plan aprobado, sin cambios de fondo: cada dato en su fila con su sobre (campos en el plan, «Las fichas»), sin convivencia con el documento, leído por `ficha_casa` v2. Dos cambios:

- `sobre.ref` pasa a ser **`operacion_id`** (ver [3]): de qué operación salió el dato, y por ella de qué mensaje o pantalla y de quién.
- La ficha **Gusto** del plan se sustituye por **Preferencia** ([4]).

### [3] Operación: la única tubería de escritura

Todo cambio (de Lola, de la app, de un cron) es una operación. Las herramientas de Lola y las pantallas **proponen**; solo la tubería escribe.

| Paso | Qué hace | Hoy |
|---|---|---|
| Entender | de frase o botón a `{accion, parametros}` cerrados (Acciones del registro) | `api/_bot/interprete.js` (#958 R3); quedan `diaDe`/`resolverDia` (`menu.js`) y `resolverPersona` (`estadoCasa.js`) |
| Comprobar | puerta única: alergias y salud (ningún plan con alérgeno llega a la base, venga de donde venga), permisos y papel (invitado), mínimos | repartido; `colocarPedidos` se lo saltaba (#958 A) |
| Aplicar | en una transacción, con clave de idempotencia (`mid` del mensaje o id de la pantalla), regla de choque por dato | `escribirDato` (trozo 8, por hacer), `api/_bot/idempotencia.js`, `bot_rev` |
| Apuntar | una fila en `operacion` (campos en el plan, «Las fichas», fila Operación) | `api/_bot/operacion.js` (en memoria del turno), `api/_bot/resultado.js`, `bot_deshacer` |
| Contar | la confirmación se pinta desde hecho/sin_hacer; el modelo puede adornar, no afirmar | `resultado.js`; falta en cambiar plato, añadir a la compra y generar (plan, trozo 27) |
| Deshacer | aplica la inversa de **tus** operaciones, en orden | `bot_deshacer` (foto de la casa, ya por autor: `api/_bot/casa.js:258`) |

Dónde corre: en el servidor, una sola implementación (`src/lib/operaciones/` compartido, llamado desde `api/` para Lola y para la app), y la escritura final en una RPC de Postgres que escribe filas, sobre, operación y sube la versión en la misma transacción. La app no escribe tablas directamente (la puerta de seguridad no puede vivir en el cliente).

Tareas y recordatorios encajan aquí: una operación puede quedar **pendiente** (falta un dato) y entonces crea o enlaza una tarea ([7]); un recordatorio es una operación programada (`ejecutar_at`).

Test que hace imposible la clase: toda Acción con `escribe` pasa por la tubería (ningún `update`/`insert`/`setData` de datos de ficha fuera de ella); toda operación tiene autor, ref y resultado.

La retención la fija el plan (fila Operación y trozo 35).

### [4] Preferencia y motor

**Una entidad para todo lo que condiciona el menú**: gustos, vetos, topes, mínimos, objetivos de nutrición, presupuesto, variedad, puerta de cocinas.

Sus campos están en el plan, «Las fichas», filas Preferencia y Plan.

Absorbe: la libreta (`notepadFields.js`), `sesgos`, `freqs`/`reparto`, `excluidos`, la zona de reglas (`src/lib/reglas.js`: sujeto, ámbito, vigencia, salvedad), el presupuesto (#958), la puerta de cocinas. Las alergias siguen en salud (privacidad y seguridad) y el motor las recibe como preferencias obligatorias de nivel plato.

**El motor:**

1. `entradaDelMotor(casa, semana)`: lee fichas y preferencias vigentes y compila un **problema** cerrado: huecos (día × comida × grupo × plato), candidatos por hueco (filtro de obligatorias de nivel plato), restricciones agregadas (obligatorias de nivel comida/día/semana) y objetivo (preferencias con peso; dicho pesa más que visto y que supuesto). Es lo único que leen `solver.js`, `validateMenu.js`, `pickCatalogReplacement` y `api/_bot/generar.js`.
2. Los ejes de cada receta se compilan al construir (`npm run build`) en una tabla numérica (receta × eje), para que evaluar una preferencia sea sumar columnas, no leer texto.
3. El solver resuelve: nunca rompe una obligatoria; si no hay solución, relaja preferencias de menor peso primero y lo dice.
4. Sale el plan **y** el cumplimiento: por preferencia, cumplida o no y por qué; por plato, qué preferencias pesaron (el `motivo` del sobre por hueco, trozo 18).

Las reglas de `validateMenu.js` se reescriben como preferencias del sistema (origen `derivado`) con un test de paridad sobre casas aleatorias (como ya pide el comentario de `solver.js` para cualquier versión incremental) antes de retirar las escritas a mano.

Cifras (con su línea base en el plan, trozos 24 y 31): % de preferencias dichas cumplidas por semana generada; ejes sin consumidor; tiempo del motor por semana (menos de un segundo, según Pablo).

Challenge: con muchas preferencias blandas el solver puede volverse lento o dar menús raros por compensar pesos. Contramedida: pocos operadores, pesos en escalones cerrados en vez de un número libre (los fija el trozo 31 del plan), y el banco de casas aleatorias de `solver.js` como red de tiempo y calidad.

### [5] Conversación (Lola)

- **Turno:** cola y candado por chat (`api/_bot/turnos.js`) se quedan. Cambios: si llega un mensaje y el turno aún no ha escrito nada, se cancela y se rehace con todo (el agente ya acepta `signal`); espera de ráfaga adaptativa, medida antes de cambiarla (trozo 28 del plan); ningún turno pasa del plazo (`plazo.js`) con mensajes ya tomados.
- **Intérprete:** el modelo traduce a Acciones con parámetros cerrados (esquemas generados en [1]). Lo que no casa va a `otro` con nota; si duda, pregunta (y la pregunta es una tarea con caducidad). Embeddings solo para casar con el valor o la receta más cercana (`recetasVectores.json`, `vectores.js`) y para agrupar los `otro` y proponer valores nuevos.
- **Modelos:** hoy Sonnet con Opus de reserva (`agente.js:106-114`) y Haiku para piezas (`significado.js`, `traducir.js`). Con parámetros cerrados, probar Haiku para las acciones claras y Sonnet para lo ambiguo, decidido por el banco de frases ([8]), no a ojo.
- **Respuesta:** desde el resultado de la operación ([3]). La ficha que ve Lola sale de `ficha_casa` v2 con estado por dato y prioridad fija de lo que se recorta (#958 C: hoy se recorta «Hoy» antes que la cocina).

### [6] App

- Lee fichas (`ficha_casa` v2) y escucha **una señal por casa** en tiempo real (versión + qué ficha cambió), y pide solo esa ficha. Sustituye el sondeo periódico (trozo 20). Coste estimado: céntimos por familia y mes (Supabase cobra mensajes entregados a apps abiertas y picos de conexiones).
- Escribe solo proponiendo operaciones. Pinta el cambio al momento (optimista) y, si la tubería lo rechaza o hay choque, lo dice con el motivo; **nunca** descarta en silencio lo que tocaste (hoy, un choque recarga la nube y tu último cambio se pierde: `src/lib/householdState.js`). Cola local con reintento al volver la red (como el plan, trozo 8).
- Controles de campo generados por tipo ([1]); las pantallas grandes se parten al pasar por cada tramo.

### [7] Tareas: la iniciativa de Lola

Entidad completa: sus campos están en el plan («Las fichas», fila Tarea de Lola) y su construcción en los trozos 34 y 35. La idea: toda iniciativa de Lola (preguntar, esperar, decidir, seguir, recordar, perseguir un objetivo) es una tarea con origen enlazado, prioridad, caducidad y cierre; un solo barrido para todo lo que caduca (ya existe: `api/_bot/caducidades.js`).

Cifras: preguntas hasta el primer menú; tareas caducadas sin respuesta; tiempo hasta cerrar.

### [8] Traza, medida y pruebas

- Cadena completa: mensaje o pantalla → operación → sobre del dato → entrada del motor (versión) → plato con motivo → artículo de compra con sus platos. Cada semana guarda versión de catálogo, de motor y de entrada.
- **Banco de frases** (red principal): frases reales anonimizadas, cada una con la operación esperada y el estado esperado al final, en cada PR que toque Lola o el intérprete. Cifras: % de frases bien guardadas, coste por frase, latencia. Sustituye la medida manual de #958.
- **Prueba de punta a punta** de la app (Playwright): alta → menú → cambiar plato → compra, comprobando fichas y sobres al final.
- **Cobertura:** cada Acción declara su lado de Lola y su pantalla; los huecos sin motivo (cifra en `npm run capacidades`) se cierran o se justifican, con la cifra en su línea base (ya existe: `npm run capacidades`).
- Panel: un script de solo lectura con todas las cifras de este documento.

### [9] Seguridad y privacidad

- Puerta de seguridad en la tubería y en la RPC, no en el prompt; ficha recortada por papel en código (#958 A: el invitado ve la salud).
- Test sobre las migraciones: toda tabla con `household_id`, `user_id` o `persona_id` declara cascada o anonimizado (el borrado ya falló una vez, `specs/auth.md`).
- Borrar una persona y exportar una casa o una persona, leyendo el registro.

### [10] Escala y coste

- Volumen: los datos de una casa son del orden de un centenar más los de cada persona; con miles de casas, pocos millones de filas pequeñas, siempre por casa. Señales una fila por (casa, eje, valor); operaciones con retención; historiales con poda.
- Rellenar: casi todo nace por defecto o supuesto; solo se preguntan los mínimos y el resto por peso.
- Lo que cuesta al crecer: el modelo de Lola por mensaje (lo más caro; tope del PR #929, Haiku donde baste, caché del prompt ya en uso), picos de conexiones en tiempo real, el barrido nocturno.

## Tres recorridos de punta a punta

1. **«Lucía ya no come cerdo» por Telegram.** Turno → intérprete: `preferencia.crear{quien: Lucía, nivel: plato, eje: proteinaPrincipal, operador: no_es, valor: cerdo, fuerza: obligatoria}` → puerta (Lucía es de la casa; quien lo dice puede) → aplicar (fila en `preferencia`, sobre `dicho`, telegram, autor, operación) → apuntar → respuesta desde el resultado («Apuntado: Lucía sin cerdo») → señal de casa → la app abierta lo pinta → la siguiente generación lo cumple; si la semana actual tiene cerdo para Lucía, se crea una tarea `decision` («¿cambio los dos platos con cerdo de esta semana?»).
2. **Tocas «sin picante» en la app mientras Lola genera.** La app propone la operación y la pinta al momento; la tubería la aplica (choque por dato: otro dato, no hay choque); la generación de Lola leyó la entrada antes: el menú sale con la versión anterior y lo dice su versión de entrada; se crea una tarea o un aviso «el menú se hizo antes de tu cambio: ¿lo rehago?». Nada se pierde.
3. **«quiero cambiar la cena» y, 4 s después, «la del jueves».** La espera adaptativa ve un mensaje incompleto y espera; si el turno ya empezó y no ha escrito nada, se cancela y se rehace con los dos. Sale una operación `cambiar_plato{día: jueves, comida: cena}`; si falta algo, pregunta y la pregunta caduca a los pocos minutos.

## Challenge por plano

| Plano | Riesgo | Contramedida |
|---|---|---|
| Usabilidad | valores cerrados → «no me entiende» | `otro` con nota y pregunta; eco corto de lo entendido; el banco de frases mide |
| Usabilidad | demasiadas preguntas | solo mínimos para generar; resto por peso, de una en una, con no molestar |
| Sincronización | dos escritores a la vez | operación con choque por dato, tiempo real por casa, nunca descartar en silencio |
| Ejecutabilidad | programa grande con varias sesiones a la vez | tramos en orden, un tramo vivo por zona; decidir D1 y D2 antes de 0105 y 0107; pruebas antes de partir ficheros |
| Ejecutabilidad | «sin convivencia» borra lo de las casas que ya existen | aceptado por Pablo (30 oct); se hace ahora porque con más casas no se podrá |
| Trazabilidad | el log crece sin tope | retención de operaciones y resumen |
| Motor | preferencias que chocan o sin solución | obligatorias nunca se rompen; relajar por peso y decirlo |
| Motor | más lento | ejes compilados a números; casas aleatorias como red de tiempo |
| Cobertura | acciones solo en un lado | cifra de huecos de capacidades en línea base |
| Coste | Lola cara al crecer | tope por casa, Haiku donde el banco lo permita, caché |

## Cómo afecta al plan de fichas con estado

Está escrito en el propio plan: cabecera («Ampliado el 30 oct 2026»), «Las fichas», «Cómo se escribe y cómo se lee», «Tramos» (con el orden) y los trozos 24-38. Aquí no se repite.

## Choques: prioridad, contradicciones y cuándo preguntar

Un choque es cualquier par de cosas que no pueden cumplirse a la vez. No solo entre preferencias: también entre un hecho y un deseo, entre dos personas, entre lo guardado y el mundo real, o entre lo de ayer y lo de hoy. Se resuelven todos con el mismo método, en tres pasos: clasificar, ordenar, responder.

### 1. Clasificar: qué clase de información choca

| Clase | Qué es | Ejemplos | ¿Se puede romper? |
|---|---|---|---|
| **Seguridad** | lo que hace daño si se rompe | alergias, intolerancias, etapa del bebé, embarazo, dieta médica | nunca |
| **Hecho** | cómo es la casa hoy | quién vive, quién come dónde, aparatos, horario, despensa, presupuesto disponible | no se rompe: se corrige si es falso |
| **Deseo** | lo que la familia quiere | preferencias dichas, planes de nutrición, objetivos | según su fuerza |
| **Aprendido** | lo que Lola dedujo del uso | señales que pasaron el umbral | cede ante lo dicho |
| **Supuesto** | lo que se pone sin saber | valores por defecto | cede ante todo |
| **Sistema** | reglas del producto | variedad, equilibrio, catálogo estrella, las reglas del validador | cede ante deseos dichos, salvo calidad mínima |

### 2. Ordenar: siete criterios, en este orden

Cuando dos cosas chocan, gana la primera que se distinga en este orden:

1. **Riesgo:** seguridad antes que nada.
2. **Clase:** hecho > deseo dicho > aprendido > supuesto > sistema (para una regla de calidad mínima del sistema, ver la tabla de arriba).
3. **Fuerza:** obligatoria > preferencia de peso alto > medio > bajo.
4. **Autoridad:** quién puede decidir sobre eso, según el papel en la casa (dueño, cotitular, lector, invitado: `specs/roles-de-la-casa-propuesta.md`) y sobre quién (un adulto sobre sí mismo; un adulto sobre un niño; un niño sobre sí mismo cuenta como deseo, no como obligatoria).
5. **Alcance:** lo más concreto gana: persona > grupo > casa; un día > la semana > siempre.
6. **Tiempo:** lo vigente gana a lo caducado; a igualdad, lo más reciente.
7. **Peso aprendido:** entre aprendidos, el de más peso.

El orden vive en el registro (una constante con test), no en el prompt ni en cada herramienta.

### 3. Responder: cuatro respuestas posibles

| Respuesta | Cuándo |
|---|---|
| **Aplicar en silencio** | el choque se resuelve por alcance o tiempo sin que cambie nada visible (una preferencia vieja caducada) |
| **Aplicar y avisar en una línea** | gana uno claro por el orden y lo que se pierde es una preferencia («He puesto 3 pescados, no 4, por el presupuesto») |
| **Preguntar** | toca seguridad u obligatoria; o el orden no decide (empate de autoridad entre dos adultos); o la ficha Trato de quien escribe dice «afinemos»; o es irreversible o cuesta dinero (pedir la compra) |
| **Tarea de decisión** | el choque es de la casa, no de quien escribe, o se repite: se pregunta una vez a quien tiene autoridad y la respuesta se guarda como preferencia, para no volver a decidirlo |

La ficha Trato de cada cuenta (trozo 16) mueve la frontera entre «aplicar y avisar» y «preguntar»: con «hazlo ya», solo se pregunta lo de seguridad, obligatorio, irreversible o con dinero; con «afinemos», también las preferencias.

### 4. Cuándo se detecta

| Momento | Qué choques | Dónde |
|---|---|---|
| **Al guardar** | lo nuevo con lo guardado: la misma persona se contradice, dos personas chocan, un deseo choca con un hecho («al horno» sin horno) | la tubería de operaciones ([3]), paso «comprobar» |
| **Al generar** | todo junto no cabe | el motor ([4]): relaja de menor a mayor prioridad y devuelve qué no cumplió |
| **Al ejecutar** | el mundo no coincide con lo guardado (falta un ingrediente al cocinar, el súper no tiene algo) | la operación que lo detecta crea un hecho nuevo o una tarea |
| **Al pasar el tiempo** | algo caduca o deja de existir (dieta temporal que acaba, receta retirada del catálogo, valor retirado de una lista, persona que se va) | el barrido programado ([7]): cada referencia rota es una tarea o una corrección automática declarada |

Cada choque resuelto deja rastro en la operación: qué chocó, qué ganó, por qué criterio y qué respuesta se dio. Cifras: choques por clase y respuesta, preguntas por semana y casa (que no crezcan), choques repetidos tras una tarea de decisión (deben ser 0).

### Planos que este método tiene que cubrir y que no están atados en otra parte

- **Autoridad entre miembros:** quién puede cambiar las preferencias de quién (hoy los papeles son dueño y lector; el cotitular está propuesto).
- **Hechos contra deseos:** aparatos, despensa y presupuesto como hechos que limitan deseos.
- **El mundo real:** lo que pasa al comprar y al cocinar corrige hechos.
- **Cambios del catálogo y de las listas:** una preferencia que apunta a una receta o a un valor retirado.
- **Invitados y casas temporales:** sus preferencias valen solo en su ámbito y su vigencia.
- **Varias casas por persona** (custodia compartida, comer en casa de los abuelos): no existe hoy; el método lo admite si la preferencia es de la persona y el hecho es de cada casa.

## Decisions for Pablo

### D1. Todo cambio se guarda igual, venga de Lola o de la app, con quién lo hizo y desde dónde
**Decidida por Pablo el 30 oct 2026: opción 1.** La 0105 crea también la tabla `operacion`; Lola y la app pasan por la misma tubería; el canal y el autor quedan apuntados y el otro lado se entera por la señal de tiempo real. Ni Lola ni la app tienen prioridad: un choque lo resuelve la regla del dato (último gana, más restrictivo o suma) y el método de choques.

### D2. Una tabla de preferencias que lo absorbe todo
**Decidida por Pablo el 30 oct 2026: opción 1.** La 0107 crea `preferencia` (y `plan` como conjunto con nombre y fechas) en vez de `gusto`. Absorbe todo deseo que condicione el menú. No absorbe hechos (quién vive, horario, aparatos, despensa: van en sus fichas) ni la salud (se queda en sus tablas por privacidad y el motor la recibe como obligatoria).

### D3. La puerta de seguridad, en el servidor, igual para Lola y la app
**Decidida por Pablo el 30 oct 2026: opción 1.** Una implementación compartida en el servidor y una RPC final que escribe en una transacción; la app no escribe tablas de ficha directamente.

## Not verified

- Trabajo local sin subir: se han mirado `staging` y las ramas subidas (`datos/un-dato`, `bot/lo-hecho`, #1034, #927, #929); nada de lo que esté solo en los PC de Pablo o de Álvaro.
- No se ha leído producción (filas de `bot_tareas`, `bot_reminders`, uso de tiempo real).
- La espera de ráfaga de 1 s frente a mensajes que tardan 3-4 s es deducción del código (`turnos.js`), sin medir.
- El coste de tiempo real es una estimación con los precios publicados de Supabase (plan Pro), no una medida.
- El tiempo del motor es el que dice Pablo (< 1 s), no medido en esta sesión.
