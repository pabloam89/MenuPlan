# Arquitectura objetivo: un registro, tres entidades de base y una sola tubería, para Lola y la app

Estado: PROPUESTA (30 oct 2026), sin aprobar. Base leída: `origin/staging` en `5754e531`. Amplía y reordena `specs/plan-fichas-con-estado.md` (aprobado) y recoge `specs/repaso-huecos-modelo.md`, las raíces de #958 (comentario del 29 oct) y la conversación con Pablo del 30 oct.

## La idea en una frase

Todo lo que Lola y la app saben, piden y hacen se describe **una vez** en un registro, se guarda como **dato con sobre**, se cambia solo con una **operación** que pasa por una única tubería, y todo lo que condiciona el menú es una **preferencia** con la misma forma, que el motor cumple o explica por qué no.

## Lo desagradable primero

- **Hoy la garantía está en las palabras, no en la estructura** (#958, raíz común). El prompt promete; las herramientas escriben cada una a su manera (46 herramientas en `api/_bot/agente.js`); la app escribe la casa desde 146 llamadas a `setData(`; el motor lee 31 claves sueltas del documento; los gustos solo desempatan (`src/lib/solver.js`, paso 5). Nada de lo de abajo cambia eso si se hace a medias: cada capa tiene que ser **la única puerta**, con un test que haga imposible saltársela.
- **El momento es ahora.** Hay 37 casas. La decisión «sin convivencia» (cada ficha nueva se estrena vacía) es barata con 37 y carísima con 3.000. Lo que no se haga en esta ronda se hará con migraciones de datos de familias reales.
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
| **Ejes** | cómo es una receta o un alimento: 78 entradas (`src/data/axisRegistry.js`), con tipo, vocabulario y si se puede agregar (sumar, contar, media) | `axisRegistry.js` | los nutrientes de `src/data/derived/recipeNutrition.json` como ejes agregables |
| **Valores** | listas cerradas (34) | `src/lib/vocabularios.js` | los ENUMS de `registroTareas.js` |
| **Acciones** | lo que se puede hacer: 85 capacidades, con herramienta de Lola, pantalla de la app y datos que lee y escribe | `src/lib/capacidades.js` (29 en los dos lados, 35 huecos sin motivo) | la definición de cada herramienta de Lola |

**Lo que se genera** (el salto que falta; hoy se escribe a mano en cada sitio: `cookLevel` aparece en 19 ficheros, `etapaBebe` en 20):

- CHECK y filas de `registro_campo` en la base (ya se hace para 7 campos, 0097).
- El esquema de cada herramienta de Lola (parámetros con `enum` y tipo) desde Acciones + Datos + Valores.
- El control de cada campo en la app por su tipo (lista cerrada → chips; número → paso; fecha → selector), como componente genérico; las pantallas siguen siendo a mano, los controles no.
- La entrada del motor ([4]) desde Ejes y Datos.
- La siguiente pregunta ([7]) desde `minimo_para_generar` y `peso_menu`.

Cifra: ficheros que hay que tocar para añadir un dato nuevo (hoy ~20 para un dato de la casa; objetivo: el registro y, si tiene pantalla propia, la pantalla).

Challenge: un generador de pantallas completas sería un marco; no se hace. Se generan controles y esquemas, no flujos.

### [2] Estado: fichas con sobre

Es el plan aprobado, sin cambios de fondo: cada dato en su fila con sobre (`valor`, `origen` = estado, `canal`, `dicho_by`, fechas, `peso`, `caduca_at`), sin convivencia con el documento, leído por `ficha_casa` v2. Dos cambios:

- `sobre.ref` pasa a ser **`operacion_id`** (ver [3]): de qué operación salió el dato, y por ella de qué mensaje o pantalla y de quién.
- La ficha **Gusto** del plan se sustituye por **Preferencia** ([4]).

### [3] Operación: la única tubería de escritura

Todo cambio (de Lola, de la app, de un cron) es una operación. Las herramientas de Lola y las pantallas **proponen**; solo la tubería escribe.

| Paso | Qué hace | Hoy |
|---|---|---|
| Entender | de frase o botón a `{accion, parametros}` cerrados (Acciones del registro) | `api/_bot/interprete.js` (#958 R3); quedan `diaDe`/`resolverDia` (`menu.js`) y `resolverPersona` (`estadoCasa.js`) |
| Comprobar | puerta única: alergias y salud (ningún plan con alérgeno llega a la base, venga de donde venga), permisos y papel (invitado), mínimos | repartido; `colocarPedidos` se lo saltaba (#958 A) |
| Aplicar | en una transacción, con clave de idempotencia (`mid` del mensaje o id de la pantalla), regla de choque por dato | `escribirDato` (trozo 8, por hacer), `api/_bot/idempotencia.js`, `bot_rev` |
| Apuntar | fila en `operacion`: id, casa, autor (cuenta y persona), canal, `ref` (mensaje, pantalla, tarea, cron), accion, pedido, hecho, sin_hacer con motivo, estado, `pedida_at`, `ejecutada_at`, `deshecha_at`, inversa | `api/_bot/operacion.js` (en memoria del turno), `api/_bot/resultado.js`, `bot_deshacer` |
| Contar | la confirmación se pinta desde hecho/sin_hacer; el modelo puede adornar, no afirmar | `resultado.js` en 5 ficheros de herramientas; **no** en `menu.js` ni `generar.js` |
| Deshacer | aplica la inversa de **tus** operaciones, en orden | `bot_deshacer` (foto de la casa) |

Dónde corre: en el servidor, una sola implementación (`src/lib/operaciones/` compartido, llamado desde `api/` para Lola y para la app), y la escritura final en una RPC de Postgres que escribe filas, sobre, operación y sube la versión en la misma transacción. La app no escribe tablas directamente (la puerta de seguridad no puede vivir en el cliente).

Tareas y recordatorios encajan aquí: una operación puede quedar **pendiente** (falta un dato) y entonces crea o enlaza una tarea ([7]); un recordatorio es una operación programada (`ejecutar_at`).

Test que hace imposible la clase: toda Acción con `escribe` pasa por la tubería (ningún `update`/`insert`/`setData` de datos de ficha fuera de ella); toda operación tiene autor, ref y resultado.

Retención: operación completa 90 días; después, resumen (acción, autor, fecha, hecho/no) para la traza del sobre.

### [4] Preferencia y motor

**Una entidad para todo lo que condiciona el menú**: gustos, vetos, topes, mínimos, objetivos de nutrición, presupuesto, variedad, puerta de cocinas.

| Campo | Valores |
|---|---|
| quién | casa, grupo, persona (id) |
| nivel | plato, comida, día, semana |
| eje | id de Ejes (receta, alimento o nutriente) o de Datos (coste, tiempo) |
| medida | `valor` (el del plato), `suma`, `media`, `cuenta` |
| operador | `es`, `no_es`, `al_menos`, `como_mucho`, `mas`, `menos` |
| valor | con el tipo del eje (número con unidad, booleano, valor de su vocabulario) |
| fuerza | `obligatoria` o `preferencia` con peso (0-100) |
| ámbito | días, comidas, `desde`, `hasta`, salvedad |
| conjunto | opcional: id de un **plan** con nombre y fechas («plan de Pablo, noviembre»): un plan de nutrición es un conjunto de preferencias |
| sobre | origen (dicho, visto, supuesto, por defecto, derivado), quién, cuándo, operación |

Absorbe: la libreta (`notepadFields.js`, 11 campos), `sesgos`, `freqs`/`reparto`, `excluidos`, la zona de reglas (`src/lib/reglas.js`: sujeto, ámbito, vigencia, salvedad), el presupuesto (#958), la puerta de cocinas. Las alergias siguen en salud (privacidad y seguridad) y el motor las recibe como preferencias obligatorias de nivel plato.

**El motor:**

1. `entradaDelMotor(casa, semana)`: lee fichas y preferencias vigentes y compila un **problema** cerrado: huecos (día × comida × grupo × plato), candidatos por hueco (filtro de obligatorias de nivel plato), restricciones agregadas (obligatorias de nivel comida/día/semana) y objetivo (preferencias con peso; dicho pesa más que visto y que supuesto). Es lo único que leen `solver.js`, `validateMenu.js`, `pickCatalogReplacement` y `api/_bot/generar.js`.
2. Los ejes de cada receta se compilan al construir (`npm run build`) en una tabla numérica (receta × eje), para que evaluar una preferencia sea sumar columnas, no leer texto.
3. El solver resuelve: nunca rompe una obligatoria; si no hay solución, relaja preferencias de menor peso primero y lo dice.
4. Sale el plan **y** el cumplimiento: por preferencia, cumplida o no y por qué; por plato, qué preferencias pesaron (el `motivo` del sobre por hueco, trozo 18).

Las 24 reglas de `validateMenu.js` se reescriben como preferencias del sistema (origen `derivado`) con un test de paridad sobre casas aleatorias (como ya pide el comentario de `solver.js` para cualquier versión incremental) antes de retirar las escritas a mano.

Cifras: % de preferencias dichas cumplidas por semana generada; ejes con lector (hoy 27 de 78 sin ningún consumidor); tiempo del motor por semana (hoy < 1 s, medido por Pablo).

Challenge: con muchas preferencias blandas el solver puede volverse lento o dar menús raros por compensar pesos. Contramedida: pocos operadores, pesos en tres escalones (poco, medio, mucho) en vez de 0-100 libre, y el banco de casas aleatorias de `solver.js` como red de tiempo y calidad.

### [5] Conversación (Lola)

- **Turno:** cola y candado por chat (`api/_bot/turnos.js`) se quedan. Cambios: si llega un mensaje y el turno aún no ha escrito nada, se cancela y se rehace con todo (el agente ya acepta `signal`); espera de ráfaga adaptativa (1 s; hasta 3 s si el mensaje parece incompleto); ningún turno pasa del plazo (`plazo.js`) con mensajes ya tomados.
- **Intérprete:** el modelo traduce a Acciones con parámetros cerrados (esquemas generados en [1]). Lo que no casa va a `otro` con nota; si duda, pregunta (y la pregunta es una tarea con caducidad). Embeddings solo para casar con el valor o la receta más cercana (`recetasVectores.json`, `vectores.js`) y para agrupar los `otro` y proponer valores nuevos.
- **Modelos:** hoy Sonnet con Opus de reserva (`agente.js:106-114`) y Haiku para piezas (`significado.js`, `traducir.js`). Con parámetros cerrados, probar Haiku para las acciones claras y Sonnet para lo ambiguo, decidido por el banco de frases ([8]), no a ojo.
- **Respuesta:** desde el resultado de la operación ([3]). La ficha que ve Lola sale de `ficha_casa` v2 con estado por dato y prioridad fija de lo que se recorta (#958 C: hoy se recorta «Hoy» antes que la cocina).

### [6] App

- Lee fichas (`ficha_casa` v2) y escucha **una señal por casa** en tiempo real (versión + qué ficha cambió), y pide solo esa ficha. Sustituye el sondeo de 20 s (trozo 20). Coste estimado: céntimos por familia y mes (Supabase cobra mensajes entregados a apps abiertas y picos de conexiones).
- Escribe solo proponiendo operaciones. Pinta el cambio al momento (optimista) y, si la tubería lo rechaza o hay choque, lo dice con el motivo; **nunca** descarta en silencio lo que tocaste (hoy, un choque recarga la nube y tu último cambio se pierde: `src/lib/householdState.js`). Cola local con reintento al volver la red (como el plan, trozo 8).
- Controles de campo generados por tipo ([1]); las pantallas grandes se parten al pasar por cada tramo.

### [7] Tareas: la iniciativa de Lola

Entidad completa (detalle en `specs/repaso-huecos-modelo.md`, H3): tipo (`falta_saber`, `espera`, `decision`, `seguimiento`, `recordatorio`, `objetivo`), origen enlazado (dato, hueco, señal, mensaje, caducidad), para quién y canal, prioridad desde `peso_menu`, cuándo (vence, vuelve, ventana, no molestar desde Trato, intentos), qué bloquea, cómo se cierra (y qué operación la cerró), fechas. Un solo barrido programado (pg_cron) para todo lo que caduca. Absorbe `bot_reminders` y las aclaraciones pendientes (`plato.js`: hoy no caducan).

Cifras: preguntas hasta el primer menú; tareas caducadas sin respuesta; tiempo hasta cerrar.

### [8] Traza, medida y pruebas

- Cadena completa: mensaje o pantalla → operación → sobre del dato → entrada del motor (versión) → plato con motivo → artículo de compra con sus platos. Cada semana guarda versión de catálogo, de motor y de entrada.
- **Banco de frases** (red principal): frases reales anonimizadas, cada una con la operación esperada y el estado esperado al final, en cada PR que toque Lola o el intérprete. Cifras: % de frases bien guardadas, coste por frase, latencia. Sustituye la medida manual del 17 %.
- **Prueba de punta a punta** de la app (Playwright): alta → menú → cambiar plato → compra, comprobando fichas y sobres al final.
- **Cobertura:** cada Acción declara su lado de Lola y su pantalla; los 35 huecos sin motivo se cierran o se justifican, con la cifra en su línea base (ya existe: `npm run capacidades`).
- Panel: un script de solo lectura con todas las cifras de este documento.

### [9] Seguridad y privacidad

- Puerta de seguridad en la tubería y en la RPC, no en el prompt; ficha recortada por papel en código (#958 A: el invitado ve la salud).
- Test sobre las migraciones: toda tabla con `household_id`, `user_id` o `persona_id` declara cascada o anonimizado (el borrado ya falló una vez, `specs/auth.md`).
- Borrar una persona y exportar una casa o una persona, leyendo el registro.

### [10] Escala y coste

- Volumen: ~140 datos por casa más persona; pocos millones de filas con 10.000 casas, siempre por casa. Señales una fila por (casa, eje, valor); operaciones con retención; historiales con poda.
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
| Ejecutabilidad | «sin convivencia» borra lo de 37 casas | aceptado por Pablo (30 oct); se hace ahora porque con más casas no se podrá |
| Trazabilidad | el log crece sin tope | retención de operaciones y resumen |
| Motor | preferencias que chocan o sin solución | obligatorias nunca se rompen; relajar por peso y decirlo |
| Motor | más lento | ejes compilados a números; casas aleatorias como red de tiempo |
| Cobertura | acciones solo en un lado | cifra de huecos de capacidades en línea base |
| Coste | Lola cara al crecer | tope por casa, Haiku donde el banco lo permita, caché |

## Cómo afecta al plan de fichas con estado

| Tramo del plan | Qué cambia |
|---|---|
| 0 (trozos 1-4, hechos) | nada |
| 1 (5-6, 23) | el registro pasa a cuatro listas enlazadas; nuevo trozo **5b**: los esquemas de las herramientas de Lola salen del registro |
| 2 (7-9, migración 0105) | **la 0105 crea también `operacion`** y `escribir_dato` es una operación de tipo dato; `sobre.ref` → `operacion_id`. Nuevo trozo **8b**: la tubería en el servidor; resultado obligatorio en todas las herramientas que escriben (empezando por `menu.js` y `generar.js`) |
| nuevo 2c | Lola: cancelar y rehacer turno sin escrituras, espera adaptativa, aclaraciones con caducidad, deshacer por autor desde `operacion`. No depende de fichas; puede ir en paralelo |
| 3 (10-11) | igual; las escrituras de persona y salud pasan por la tubería |
| 4 (12-13) | igual; las reglas «presente» van a Rutina; presupuesto y puerta de cocinas pasan a Preferencia en el tramo 5 |
| 5 (14-15, migración 0107) | **la 0107 crea `preferencia` (y `plan` como conjunto) en vez de `gusto`**; nuevos trozos: entrada del motor, ejes compilados, preferencias en el solver con cumplimiento, paridad de las 24 reglas |
| 6 (16-17) | se funde con tareas a fondo; `bot_reminders` y aclaraciones pasan a tareas |
| 7 (18-20) | el sobre por hueco lleva `motivo` y la semana su versión; tiempo real con una señal por casa |
| 8 (21-22) | igual |
| transversal, desde ya | banco de frases; prueba de punta a punta de la app; panel de cifras; test de cascadas |

Orden: 1 (+5b) → 2 (+operación, 8b) en paralelo con 2c y el banco de frases → 3 → 4 → 5 (preferencia y motor) → 6 (tareas) → 7 → 8.

## Decisions for Pablo

### D1. ¿La escritura es una operación con su tabla desde la 0105?
1. **Sí (recomendada):** una sola tubería y una sola traza desde el primer dato que se mueve.
2. No: `escribir_dato` como está y la operación más tarde (se rehace la 0105 y los escritores de los tramos 3-4).
3. Solo para Lola, la app con `escribir_dato` (dos caminos).

### D2. ¿La 0107 crea `preferencia` en vez de `gusto`?
1. **Sí (recomendada):** una entidad para gustos, topes, objetivos, nutrición y presupuesto; el motor la cumple.
2. No: `gusto` como en el plan y los demás tipos en sus sitios.
3. `gusto` ahora y migrar a `preferencia` después.

### D3. ¿Dónde corre la tubería para la app?
1. **En el servidor, una implementación compartida y una RPC final (recomendada):** la puerta de seguridad no vive en el cliente.
2. Solo RPC en Postgres (la lógica en SQL; más difícil de probar y de compartir con Lola).
3. En el cliente con RLS (más rápido de hacer; la seguridad depende de cada pantalla).

## Not verified

- Trabajo local sin subir: se han mirado `staging` y las ramas subidas (`datos/un-dato`, `bot/lo-hecho`, #1034, #927, #929); nada de lo que esté solo en los PC de Pablo o de Álvaro.
- No se ha leído producción (filas de `bot_tareas`, `bot_reminders`, uso de tiempo real).
- «Ejes con consumidor del motor» y «27 sin consumidor» salen del campo `consumidores` de `axisRegistry.js`, no de seguir el código.
- La espera de ráfaga de 1 s frente a mensajes que tardan 3-4 s es deducción del código (`turnos.js`), sin medir.
- El coste de tiempo real es una estimación con los precios publicados de Supabase (plan Pro), no una medida.
- El tiempo del motor es el que dice Pablo (< 1 s), no medido en esta sesión.
