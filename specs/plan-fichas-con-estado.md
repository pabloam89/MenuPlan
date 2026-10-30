# Plan: fichas con estado — del documento único de la casa a entidades con dato, origen, estado y fecha

Verdict: viable y grande (40 trozos tras la ampliación del 30 oct por la tarde y la partición del trozo 7, 6 migraciones, varias semanas; sin convivencia con lo viejo: Pablo, 30 oct, «si tienen que empezar de cero, es lo que hay»); lo que Pablo pidió el 30 oct 2026 ya está diseñado desde el 8-10 oct (`registro_campo` y la tabla `sobre` de la 0097) y nadie lo escribe: 0 filas en `sobre`. El rework es, sobre todo, cablear eso y sacar a la app y a Lola del documento único `household_state.state.data`, ficha a ficha, cerrando cada una entera. Primero se para la hemorragia de hoy (trozos 1-4), sin migración. Aprobado por Pablo el 30 oct 2026 («arranca»), con la decisión B contestada.

**Ampliado el 30 oct 2026 (tarde) con la arquitectura objetivo** (`specs/arquitectura-objetivo.md`, decisiones D1-D3 de Pablo: «vamos a por todo»): toda escritura es una **operación** que pasa por una única tubería en el servidor (la migración del trozo 7 crea también `operacion`); la del trozo 14 crea **`preferencia`** (y `plan` como conjunto) en vez de `gusto`; el motor recibe una **entrada única** y cumple las preferencias con un **método de choques** común; las **tareas** de Lola pasan a entidad completa y absorben recordatorios y aclaraciones (trozo 34). Los trozos 1-23 conservan su número (las sesiones los citan); los cambios van dentro de cada uno y los nuevos son 24-38; el 39 y el 40 nacen al partir el trozo 7 (30 oct, noche). Si una sesión ya empezó el 7, el 8 o el 14 con la forma vieja, lo ajusta a esta antes de abrir PR.

Fecha: 30 oct 2026. Base leída: `origin/staging` en `5b9dbaed` (#1031). Escrito en la forma del estándar de planes de la Fábrica (`standards/plan.md`), sin pasar su comprobador (ver Not verified).

Origen: #1029 (el menú cojo de la casa nueva de Pablo), #958 (auditoría de Lola, clase G «1 dato, 1 sitio»), #939 (un solo registro; fases 1-4 hechas) y la conversación con Pablo del 30 oct.

## Lo desagradable primero

- **El documento único es la causa de clase de los fallos de datos.** La app guarda la casa ENTERA 1,2 s después de cada cambio (`src/App.jsx:1786-1804`), desde 145 sitios (`setData(`: 55 en `App.jsx`, 68 en `Onboarding.jsx`, 22 en otros). Lola la lee, la cambia y la vuelve a guardar entera desde 28 sitios (`api/_bot/casa.js:336` `conCasa`, 5 reintentos). Un guardado que choca o llega tras una recarga se descarta sin más (`src/lib/versionCasa.js:42-49`, `App.jsx:2005-2015`). Así se perdió hoy la marca de alergias de la casa de Pablo (solo lectura, `npm run consulta`, con `household_id` de su casa): `select to_char(created_at at time zone 'Europe/Madrid','HH24:MI:SS'), (select string_agg(coalesce(m->>'alergiasRevisadas','?'),' ') from jsonb_array_elements(antes->'state'->'data'->'members') m) from bot_deshacer where household_id=… order by created_at` → `07:25:14 | null` y `07:26:09 | false false false false`; `select to_char(updated_at at time zone 'Europe/Madrid','HH24:MI:SS'), alergias_revisadas from persona where household_id=…` → cuatro filas `07:46:39 | false`. La marca nunca llegó a la base y la app volvió a guardar sin ella.
- **Sin esa marca el motor esquiva los 14 alérgenos** (`src/lib/alergias.js:89-93`, decidido el 8 oct, #107) y se queda con 27 recetas (0 de pescado, 0 de huevo). Reproducido sin modelo ni escritura con un script de un solo uso que carga `buildGroupContext` (`src/lib/aiPlanner.js`) y `filterRecipes` (`src/utils/filterRecipes.js`) sobre el `state.data` de la casa, empaquetado con `esbuild` por los `.jsx`: `pool: 27, carne 13, legumbres 12, verdura 6, pasta_arroz 5, pescado 0, huevos 0`, con `allergies` = los 14 e `intolerances: ["sin_gluten"]` aunque las cuatro personas tienen `allergies: []`. El resultado en la semana guardada: `select count(*), count(*) filter (where w ~ 'hueco omitido|sin asignar') from user_menu_weeks, jsonb_array_elements_text(plan->'_warnings') w where household_id=…` → `9 | 6`: 6 huecos sin plato (`mie_comida_2`, `vie_cena`, `sab_comida_2`, `sab_cena`, `dom_cena` sin receta compatible; `dom_comida_2` sin sitio en el reparto) y 3 avisos de objetivos (pescado y huevos «no alcanzables»), que nadie enseña (`api/_bot/generar.js:325` solo mira que haya un plato; `api/_bot/turno.js:207` dice «¡Menú listo!»). **25 de las 32 casas con personas tienen a alguien sin la marca; en 24 nadie la tiene.** Pablo decide (30 oct) no repoblarlas: se les vuelve a preguntar.
- **Lo diseñado no se cableó.** `registro_campo` (7 campos, con `politica`, `caduca_dias`, `seguridad`, `columna`) y `sobre` (valor, `origen` dicho/supuesto/visto/derivado/por_defecto/delegado/no_quiere_decirlo, `canal`, `dicho_by`, `confirmado_at`, `bloqueado`; 0097:132-153) existen desde el 10 oct. `ficha_casa()` las lee tras la bandera `BOT_FICHA_RPC`. **Ningún código escribe `sobre`** (lo dice la propia 0097 y `select count(*) from sobre` → 0). Las tablas `persona*` y `grupo*` son una copia que rellena un trigger desde el JSON (0089:220-263), no la fuente.
- **La casa no sabe qué sabe.** El asistente de la app distingue vacío/inferido/delegado/fijado solo en la libreta de gustos; para los datos de `data` solo vacío o fijado, «porque data no guarda procedencia» (`src/lib/wizardRegistry.js:645-649`). La ficha de Lola marca Dicho/Supuesto solo en la libreta (`api/_bot/ficha.js:284-344`). `fuente: "visto"` existe en el esquema de la libreta y nadie lo escribe (solo tests).
- **Siete registros, cada uno con un trozo del catálogo de ejes:** `registroFicha.js` (113 datos), `registroCampos.js` (7 campos con política de pregunta), `wizardRegistry.js` (14 preguntas con orden y suposición), `notepadFields.js` (11 ejes de la libreta), `axisRegistry.js` (78 ejes de receta, 3 de hogar), `vocabularios.js` (34 listas) y `capacidades.js` (85 capacidades). Ninguno tiene valor por defecto, mínimo para generar, caducidad por eje ni peso para el menú.
- **Inventario de hoy** (`npm run -s ficha:inventario`): 113 datos registrados; deuda `sin_declarar: 26, enum_sin_vocabulario: 8, copia: 10, legado: 11, lola_no_lo_ve: 22, app_no_lo_ve: 8, sin_tabular: 54`.
- **Hay fallos de motor que este modelo no arregla y que caen en los trozos 3 y 4:** el motor planifica siempre de lunes a domingo aunque la semana empiece el viernes (`src/lib/aiPlanner.js:517-530`, `src/lib/planner.js:156`, `src/lib/shoppingBuilder.js:238`), y un hueco que no llena se tira con una nota que nadie lee (`aiPlanner.js:1637-1651`).

## Estado medido (30 oct 2026)

| Qué | Cifra | Cómo |
|---|---|---|
| Casas / personas / semanas guardadas | 37 / 108 / 279 | `npm run consulta` |
| Recetas propias / filas de despensa | 15 / 181 | ídem |
| Filas en `sobre` / en `registro_campo` | 0 / 7 | ídem |
| Casas con personas y alguien sin marca de alergias | 25 de 32 | ídem (24 sin nadie marcado) |
| Sitios que escriben la casa: app / Lola | 145 / 28 | `git grep -c "setData("`, `conData(\|conCasa(` |
| Datos registrados de casa + persona | 113 | `ficha:inventario` |
| Datos sin tabular (objeto, mapa, lista) | 54 | ídem |
| Copias guardadas de otro dato | 10 | ídem |

## Lo que ya existe y se reutiliza (principio 4: una idea, un sitio)

| Pieza | Dónde | Qué le falta |
|---|---|---|
| Catálogo de campos con política de pregunta | `src/lib/registroCampos.js` → `registro_campo` (0097) | pasar de 7 a todos; ficha, defecto, mínimo, peso, choque |
| Sobre del dato (origen, quién, canal, cuándo) | tabla `sobre` (0097:132) | escritor; peso y caducidad de uso; estado «aprendido» |
| Registro de datos de la ficha | `src/lib/registroFicha.js` | ficha y clase por dato; los 26 sin declarar |
| Preguntas del asistente con orden y suposición | `src/lib/wizardRegistry.js` | leer el estado de `data` desde los sobres; servir también a Lola |
| Libreta con origen, fuente y vigencia | `src/lib/notepad.js:54-75`, `notepadFields.js` | ámbito por persona, días y comida; pasar a filas |
| Reglas con sujeto, ámbito, vigencia y salvedad | `src/lib/reglas.js:249` | son ya «gusto con ámbito» para excluir/presente/sesgo; se unifican |
| Tareas de Lola («falta saber», con `campo`) | `bot_tareas` (0080), `src/lib/registroTareas.js` | generarlas desde el catálogo, no solo alergias y etapa del bebé |
| Ficha de Lola con Dicho/Supuesto | `api/_bot/ficha.js`, `fichaRpc.js` (`ficha_casa` v1) | el estado de cada dato, no solo de la libreta |
| Lectura compacta en una ida | `ficha_casa()` (0097:241) | v2 con los sobres de todas las fichas |
| Vocabularios cerrados con CHECK y test | `src/lib/vocabularios.js` (`origen_dato`, `canales_dato`, `ref_tipo`) | `alergenos`, `estados`, `postura`, `choque` |
| Diccionario de cómo se dice cada cosa | `src/lib/diccionario.js` (#939 fase 3) | nada aquí: lo usan el buscador y la vía rápida |
| Mapa de capacidades y ficha por herramienta | `src/lib/capacidades.js` (#939 fase 4), `npm run capacidades`, `capacidades.test.js`; `herramienta(ficha, def)` y `FICHAS` en `api/_bot/agente.js:146-170, 1702` | que las herramientas y pantallas declaren los datos que leen y escriben; dos cifras más en su línea base (`capacidades.base.json`): datos sin pregunta en Lola y sin pantalla en la app (trozo 23) |
| Spec de la ficha y el analista nocturno | `specs/ficha-de-la-casa.md` (capas, gusto en cuatro capas, precedencia) | este plan la ejecuta; el «analista» son los trozos 15 y 17 |

## Las cuatro clases de dato

Todo lo que hoy va en `household_state.state.data` cae en una de estas, y cada clase se guarda de una forma. Es el criterio que decide cada trozo; el inventario lo cuenta (trozo 6).

| Clase | Qué es | Dónde vive | Ejemplos de hoy |
|---|---|---|---|
| **Hecho** | Lo que la casa dice o la app ve | Una fila por dato, con sobre | personas, alergias, horario, gustos, aparatos |
| **Derivado** | Se calcula de otros hechos | No se guarda: se calcula al leer | `groups` (de las personas y el modelo), `freqs`/`reparto` (de la libreta), `allergiesReviewed`, `menuWeek`, `kidDinnerMatchesAdultLunch`, `useHomeStock`, la compra (del menú) |
| **Marca de pantalla** | Estado de una interfaz, no de la casa | El móvil (localStorage), nunca la casa | `expertMode`, `modePrompted`, `pantryPrefsSeen`, `useBirthDate`, `cookLevelManual`, `manualSlotType` |
| **Historial** | Solo se añade | Tabla con fecha y poda | `menuHistory`, `cookedDishes`, `priceObs`, `receipts`, `cookedDeltas` |

## Las fichas (entidades) y sus campos

Todo dato de una ficha lleva el mismo **sobre**: `valor`, `origen` (es el estado: `por_defecto` → vacío con defecto, `supuesto`, `visto` → aprendido, `dicho` → confirmado, `derivado`, `delegado`, `no_quiere_decirlo`), `canal` (app/telegram/whatsapp/sistema), `dicho_by`, `confirmado_at`, y los nuevos `peso` (contador que olvida), `caduca_at` y `updated_at`. Lo define una vez el catálogo (trozo 5): para cada eje, **ficha**, tipo y vocabulario (con «otro» y nota), **defecto**, si se puede **suponer**, si es **mínimo para generar**, **caduca_dias**, **peso_menu** (cuánto cambia el menú: el orden de las preguntas), **politica** de pregunta, quién **escribe** y la regla de **choque** (`ultimo_gana` | `mas_restrictivo` | `suma`).

| Ficha | Clave | Campos (hechos) | Caduca | Dónde (al cerrar su tramo) |
|---|---|---|---|---|
| **Persona** | casa + persona | nombre, rol en casa, nacimiento o edad, avatar, color, no_es_bebe; **salud**: alergias (14 + otro con nota), intolerancias, estados con `hasta`, perfiles de salud, peso, altura | casi nunca; alergias nunca se suponen | `persona`, `persona_alergia`, `persona_intolerancia`, `persona_estado`, `persona_perfil_salud` + sobre |
| **Grupo** | casa + grupo | nombre, color, orden, personas | derivado del modelo salvo que se toque a mano | `grupo`, `grupo_persona` |
| **Casa** | casa | modelo de menú, aparatos, nivel de cocina, súper, presupuesto, quiere precios, uso de la despensa, cotitulares, quién soy por cuenta | meses | `sobre` (campo de la casa) |
| **Rutina** | casa (+ persona, día, comida) | comidas que se planifican (con aperitivo), estructura comida/cena, quién come dónde cada día y comida, tiempo entre semana y finde, tanda y su día, días de la semana que se planifican, menú del cole y cena de los niños | semanas | `sobre` con ámbito |
| **Preferencia** (antes «Gusto») | casa, grupo o persona + id | quién, **nivel** (`plato`/`comida`/`dia`/`semana`), **eje** (de `axisRegistry.js`, nutriente o dato agregable como coste o tiempo), **medida** (`valor`/`suma`/`media`/`cuenta`), **operador** (`es`/`no_es`/`al_menos`/`como_mucho`/`mas`/`menos`), valor con el tipo del eje, **fuerza** (`obligatoria` o preferencia con peso `bajo`/`medio`/`alto`), ámbito (días, comidas, desde, hasta, salvedad), `plan_id` opcional + sobre | continuo; supuesto 90 d, visto 180 d | tabla `preferencia` (trozo 14) |
| **Plan** (conjunto de preferencias) | casa o persona + id | nombre, desde, hasta, activo: un plan de nutrición, una dieta temporal, «semana ligera» | sus fechas | tabla `plan_preferencias` (trozo 14) |
| **Regla temporal** | casa + regla | sujeto, ámbito, vigencia, efecto (excluir/presente/sesgo), salvedad | días | hoy `data.reglas`; pasa a `preferencia` con vigencia (sesgo/excluir) y a Rutina (presente) |
| **Operación** | casa + id | autor (cuenta y persona), canal, `ref_tipo` (`mensaje`/`pantalla`/`tarea`/`cron`/`motor`) + `ref_id`, acción (id de capacidades), pedido, hecho, sin_hacer con motivo, choques resueltos, estado, `pedida_at`, `ejecutada_at`, `deshecha_at`, inversa, clave de idempotencia | la fija el trozo 35 | tabla `operacion` (trozo 7) |
| **Trato con Lola** | **cuenta** (user_id) | ritmo (`directo`/`guiado`), profundidad al generar (`nada`/`poco`/`mucho`), fotos, largo de mensaje, idioma | continuo; aprendido por señales | `sobre` con `persona_id` = la persona de esa cuenta |
| **Semana** | casa + lunes | días activos, huecos (día × comida × plato) con receta, comensales y **sobre por hueco** (quién lo cambió, cuándo, canal) | cada semana | `user_menu_weeks.plan` (documento por semana, como hoy) |
| **Compra** | casa + lunes | derivada del menú + marcas por artículo: añadido a mano, tachado, en casa, quitado | diario | `user_menu_weeks.shopping` = marcas; la lista se calcula |
| **Despensa** | casa + artículo | lo que hay, cantidad, dónde, caducidad | diario | `user_pantry` (ya) |
| **Receta propia / carpeta / voto** | persona (cuenta) | recetas, carpetas, colecciones, votos, descartes | cuando se toca | `user_recipes`, `recipe_folders`, `recipe_collections`, `recipe_votes`, `household_favorites`, `household_recipe_discards` (ya); fuera del documento |
| **Tarea de Lola** | casa + tarea | tipo (`falta_saber`/`espera`/`decision`/`seguimiento`/`recordatorio`/`objetivo`), origen enlazado (`dato`/`hueco`/`senal`/`mensaje`/`caducidad`/`familia`/`choque`), para quién (casa, persona, cuenta) y canal, prioridad (de `peso_menu`), vence, vuelve, intentos y tope, qué bloquea (`generar`/`compra`/nada), cierre y operación que la cerró, fechas | diario | `bot_tareas` ampliada (trozo 34); absorbe `bot_reminders` y las aclaraciones pendientes |
| **Señal** | casa o cuenta + eje + valor | peso con decaimiento, última vez, veces | continuo | tabla `senal` (trozo 15); al pasar un umbral escribe un sobre `visto` |

## Cómo se escribe y cómo se lee

- **Una sola tubería de escritura** (D1, D3): Lola y la app **proponen** operaciones; solo la tubería del servidor (`src/lib/operaciones/`, llamada desde `api/_bot/` y desde `api/operacion.js` para la app) escribe, con los pasos que define `specs/arquitectura-objetivo.md`, [3] (única fuente de la tubería); aquí, lo que construye cada trozo: la tubería y su puerta (26), la tabla `operacion` (7), la RPC `aplicar_operacion` (39), los choques (33). `escribirDato` es la operación de tipo dato. Ninguna pantalla escribe tablas de ficha directamente.
- **Una sola función de escritura de datos** para la app y Lola: `escribirDato({casa, persona, campo, valor, origen, canal, ref})` → operación de tipo dato → RPC `escribir_dato` (trozos 39 y 8). Escribe la fila, aplica la regla de choque del catálogo, sube `bot_rev` (para que lo de hoy siga funcionando) y devuelve el sobre. Al momento, sin espera de 1,2 s. En la app, con cola en localStorage y reintento al volver la red; si la RPC no existe (la rama se despliega antes que la migración), no se guarda y se dice (principio 3): nada vuelve al documento.
- **Choque por dato, no por casa:** `ultimo_gana` (casi todo), `mas_restrictivo` (salud: añadir una alergia gana a quitarla en el mismo minuto), `suma` (señales).
- **Lectura compacta:** `ficha_casa()` v2 devuelve, por ficha, cada dato con su sobre (trozo 9). La ficha de Lola y el asistente de la app leen de ahí el estado: vacío, por defecto, supuesto, aprendido, dicho. Lo que no cabe se resume (los topes de `specs/ficha-de-la-casa.md` se mantienen).
- **Mínimos para generar** (decisión B): quién come, alergias dichas (o por silencio con aviso, #229) y días. Sin ellos, no se genera: se pregunta.
- **La app se entera al momento** con Realtime de Supabase sobre `household_state.bot_rev` y `sobre` (trozo 20), y deja el sondeo de 20 s.
- **Sin convivencia con lo viejo** (Pablo, 30 oct 2026: «no quiero migrar nada; si tienen que empezar de cero, es lo que hay»): cuando una ficha pasa a sus filas, el documento deja de leerse y de escribirse para esa ficha en el mismo trozo. Ni doble escritura, ni repoblado de datos viejos, ni leer la clave antigua «por si acaso». Las casas que ya existen estrenan cada ficha vacía: la app y Lola preguntan como a una casa nueva. Lo que ya está en tablas (semanas, compra, recetas propias, despensa) se queda. Nunca quedan dos sitios vivos para el mismo dato (hoy hay 10 copias por haberlo hecho a medias).
- **Qué hace cada migración** (el único sitio que lo dice; la tabla de tramos solo dice si el tramo trae migración y cada trozo la construye): la 0105 da al sobre y al registro sus columnas y crea la tabla `operacion` (trozo 7); la 0106 crea `aplicar_operacion` y `escribir_dato` (trozo 39); la 0107 crea `ficha_casa` v2 y retira `sobre.ref` (trozo 40); la 0108 crea `escribir_persona` (definer: la única vía de escritura a `persona` y `persona_*`, porque ningún usuario puede tocarlas) y retira el trigger 0089 con sus funciones (trozo 10); la 0109 crea de una vez `preferencia`, `plan_preferencias`, señal e historiales (trozo 14), que usan los trozos 15, 22 y 31 sin migración propia; la 0110 amplía `bot_tareas` y retira `bot_reminders` (trozo 34). Las tablas de salud por persona ya existen (0079). Si un trozo posterior necesita una columna más, es una migración pequeña aparte.

## Entidades y campos nuevos, frente a los que ya hay

Comparados con las dos bases: la de la Fábrica (`.fabrica/entities.json` y `.fabrica/fields.json`, que registran las entidades de la propia Fábrica: `project`, `lesson`, `reviewer-no`, `review-record`, `intervention`, `message`, `session`, `question`, `plan`, `skill`, `role`, `standard`, `rule`, `goal`, `invariant`; ninguna es de dominio de MenuPlan) y la de MenuPlan (`ENTIDADES` en `src/lib/registroFicha.js:62`, con la misma forma de la forja: `casa`, `persona`, `grupo`). El trozo 24 da de alta en `ENTIDADES` las que aquí salen «nueva».

| Nueva | Parecido que ya existe | Resultado |
|---|---|---|
| entidad `operacion` | `bot_deshacer` (foto de la casa por escritura, con autor: `api/_bot/casa.js:200-215`) y `bot_idempotencia` (respuesta guardada por orden repetida: `api/_bot/idempotencia.js`, 0080) | nueva: ninguna de las dos guarda pedido, hecho, sin_hacer, ref ni inversa. `bot_deshacer` se queda solo para lo que aún va por el documento y se retira con el último tramo; la clave de idempotencia de la tubería es columna de `operacion`, y `bot_idempotencia` sigue para las órdenes de tareas hasta el trozo 34, que las pasa a la tubería |
| entidad `preferencia` | la libreta (`notepad`, `src/lib/notepad.js:54-75`), `data.reglas` (`src/lib/reglas.js`), `sesgos`, `freqs`/`reparto`, `excluidos`, `data.budget`, `cocinas` | mismo significado: la absorbe a todas (trozo 14) y ninguna sigue viva; no se añade una al lado |
| entidad `plan_preferencias` | `plan` de la Fábrica (un documento de plan de trabajo, como este) | otra cosa con nombre parecido: se llama siempre «conjunto de preferencias» en el código y en la UI, y la tabla lleva el sufijo `_preferencias` para no confundirlos |
| campos de `bot_tareas` | 0076: `kind`, `scope`, `status`, `falta`, `clave`; 0080: `tipo`, `campo`, `persona_id`, `objetivo`, `pedido`, `vuelve_at`, y `bot_reminders.tarea_id` con su FK a `bot_tareas` (0080:120-124) | se reutilizan `tipo`, `campo`, `persona_id`, `objetivo`, `pedido` y `vuelve_at`; nuevos: `origen_tipo`, `origen_id`, `para`, `prioridad`, `intentos`, `bloquea`, `cerrada_por`, `ejecutar_at`; `kind` deja de escribirse (lo sustituye `tipo`, como ya hace el disparador de 0080) y se retira en la migración del trozo 34 |
| `sobre.operacion_id` | `sobre.ref` (0097) | mismo significado, más preciso: `operacion_id` nace en el trozo 7 y `ref_tipo`/`ref_id` se retiran en el trozo 40 |
| `version_catalogo` de la semana | `catalog_meta` (0006) guarda la versión del catálogo de la base, una para todas las casas | nueva por semana: dice con qué catálogo se hizo cada menú, que `catalog_meta` no puede decir |

## Tramos

| Tramo | Trozos | Migración | Qué cierra |
|---|---|---|---|
| 0 Parar la hemorragia | 1-4 | no | marca al momento, mínimos, huecos vacíos a la vista, motor solo días activos |
| 1 Catálogo único | 5-6, 23, 24, 25 | no | el registro con las columnas del eje; los 139 datos clasificados por ficha y clase; herramientas y pantallas con los datos que leen y escriben; cuatro listas enlazadas (datos, ejes, valores, acciones); esquemas de herramientas generados |
| 2 La fila con sobre y la operación | 7-9, 26, 27, 39, 40 | sí | tubería única de escritura; `escribir_dato`, `escribirDato`, `ficha_casa` v2; resultado obligatorio en toda herramienta que escribe; un solo intérprete |
| 2c Turno de Lola | 28 | no | cancelar y rehacer sin escrituras, espera adaptativa, aclaraciones que caducan, deshacer por autor |
| 3 Persona y salud | 10-11 | sí | salud y personas como fuente; fuera `members`, `groups` y el trigger 0089 |
| 4 Casa y rutina | 12-13 | no | aparatos, súper, presupuesto, despensa, comidas, estructura, horario, tiempo, tanda |
| 5 Preferencias, señales y motor | 14-15, 30-33 | sí | libreta, reglas, sesgos, topes y presupuesto → `preferencia`; contadores que olvidan; entrada única del motor; ejes compilados; preferencias cumplidas con informe; las 24 reglas como preferencias del sistema; método de choques |
| 6 Trato, preguntas y tareas | 16-17, 34-35 | sí | ficha Trato; una sola «siguiente pregunta»; tareas como entidad completa; un solo barrido de caducidades y referencias rotas |
| 7 Semana, compra, tiempo real | 18-20 | no | sobre por hueco con motivo, versión de la semana, compra derivada + marcas, aperitivo, Realtime con una señal por casa, fin del guardado entero |
| 8 Recetas, historiales, cierre | 21-22, 36 | no | fuera recetas y carpetas del documento; historiales con poda; `data` vacío; borrar persona y exportar |
| Transversal (desde ya) | 29, 37, 38 | no | banco de frases que comprueba el estado guardado; prueba de punta a punta de la app; panel de cifras |

Orden (lo fijan los «Depends on»; ningún par de trozos sin orden entre ellos toca el mismo fichero, comprobado con `check-plan` de la Fábrica): 0 → 1 (24, 25) → 2 (7, 39, 40, 8, 9, 26, 27) → 2c (28) → 3 → 4 → 5 (14, 15, 30, 31, 32, 33) → 6 (16, 17, 34, 35) → 7 → 8. Sin dependencias, en paralelo desde ya: 29 y 37; el 38 va detrás del 37 y del 7.

Cifras que bajan, medidas al cerrar cada tramo: claves vivas en `household_state.state.data` (hoy 113 registradas + 26 sin declarar → 0), `copia` (10 → 0), `sin_tabular` (54 → 0), `lola_no_lo_ve` (22 → 0), casas nuevas con alguien sin marca de alergias tras el alta (→ 0), semanas vivas con huecos esperados vacíos sin aviso (→ 0), respuestas de Lola que contradicen el estado (17 % en #958 → se mide con el banco de frases, trozo 29). Cifras nuevas: escrituras fuera de la tubería (→ 0, trozo 26), herramientas que escriben sin resultado (→ 0, trozo 27), analizadores de fechas y personas fuera del intérprete (hoy 3 → 0, trozo 27), claves `data.*` leídas por el motor (hoy 30 → 0, trozo 30), ejes sin consumidor (hoy 27 de 78, trozo 31), % de preferencias dichas cumplidas por semana (trozo 31), ficheros que hay que tocar para añadir un dato (hoy 19 para `cookLevel`, trozo 25), preguntas hasta el primer menú (trozo 34).

## Chunks

### 1. El alta guarda la marca de alergias al momento, y a Lola se le avisa después de guardar
Files: `src/lib/altaGuardada.js`, `src/lib/altaGuardada.test.js`, `src/App.jsx`, `src/screens/Onboarding.jsx`, `src/lib/frontalBot.js`
Depends on: none
Blocked by: none
Existing: la marca se pone en el último clic (`conRevision`, `src/screens/Onboarding.jsx:2348`) y se sube 1,2 s después con el documento entero (`src/App.jsx:1804`); el aviso a Lola sale en ese mismo clic (`App.jsx:5738`, `avisarAltaALola`) y Lola apunta «he rellenado las alergias» (`api/bot/link.js:68`) aunque el dato no haya llegado. `git grep -n "guardarAhora\|flushSave\|guardarYa" -- src` → sin salida. `ls src/lib/alergias*.test.js` → `alergias.test.js`, `alergiasLibres.seguridad.test.js`, `alergiasMenu.test.js`, `alergiasSilencio.test.js` (ninguno cubre el cierre del alta).
Not done: no cambia el modelo (eso es el tramo 2-3): sigue escribiendo el documento, pero ya, esperando la respuesta y antes de avisar a Lola. No repuebla las 24 casas sin marca (Pablo, 30 oct: se les vuelve a preguntar; lo hace el trozo 2 y la tarea de alergias que ya existe). No toca las otras pantallas del asistente. No reproduce en navegador el alta de Pablo (sin cuenta de prueba; ver Not verified): el arreglo ataca la clase (un dato de seguridad en un guardado diferido que se descarta en silencio), que está demostrada con los datos de `bot_deshacer` y `persona.updated_at`.
Done:
```sh
npx vitest run src/lib/altaGuardada.test.js src/lib/alergias.test.js
```

### 2. Mínimos para generar: sin alergias dichas (o por silencio) no se genera, se pregunta
Files: `src/lib/minimosParaGenerar.js`, `src/lib/minimosParaGenerar.test.js`, `api/_bot/generar.js`, `api/_bot/generar.test.js`, `api/_bot/conocimiento.md`
Depends on: 3
Blocked by: none
Existing: `git grep -n -i "minimo_para_generar\|minimosParaGenerar" -- src api` → sin salida. Hoy, sin marca, el motor esquiva los 14 alérgenos (`src/lib/alergias.js:89-93`, #107) y genera con ~27 recetas. La pregunta de alergias ya existe como tarea (`registroCampos.js`: `alergias` con `politica: una_vez`, `seguridad: true`) y el silencio con aviso también (`api/_bot/silencio.js`, #229).
Not done: la app no cambia (su alta ya pasa por la pantalla de alergias y, con el trozo 1, la marca llega). No decide qué más es mínimo: «quién come» ya lo exige `generar.js:287` y «días» sale de `menuWeek`; el catálogo (trozo 5) los declara. Evals: cambia `conocimiento.md`, así que corre `node scripts/bot-evals.mjs --nivel=pr` antes de fusionar (regla `lola`); un caso nuevo («prepárame el menú» con una persona sin alergias revisadas → Lola pregunta y no genera) se ve en rojo antes del arreglo.
Done:
```sh
npx vitest run src/lib/minimosParaGenerar.test.js api/_bot/generar.test.js && node scripts/bot-evals.mjs --nivel=pr
```

### 3. Generar no calla un hueco vacío: invariante de completitud y mensaje que lo dice
Files: `src/lib/huecosDelPlan.js`, `src/lib/huecosDelPlan.test.js`, `api/_bot/generar.js`, `api/_bot/generar.test.js`, `api/_bot/turno.js`
Depends on: none
Blocked by: none
Existing: `git grep -n -i "planHuecos\|huecosEsperados\|huecos_esperados" -- src api` → sin salida. `generar.js:325` solo comprueba `planHasDishes`; los huecos sin plato se tiran con una nota en `plan._warnings` (`src/lib/aiPlanner.js:1637-1651`) que ningún mensaje lee; la vía rápida pinta «¡Menú listo!» (`api/_bot/turno.js:207`). En la semana del 30 oct de la casa de Pablo: 9 avisos sin enseñar, 6 de ellos huecos sin plato (consulta y salida en «Por qué», arriba).
Not done: no rellena los huecos (eso es el motor, trozo 4 y el pool de recetas); no toca cómo la app pinta un hueco vacío (ya lo pinta). «Hueco esperado» = día activo × comida que se cocina (`modeForGroupSlot`) × platos de su estructura; el cálculo vive en `huecosDelPlan.js`, que es también lo que medirá la cifra «semanas vivas con huecos esperados vacíos» con `npm run consulta`.
Done:
```sh
npx vitest run src/lib/huecosDelPlan.test.js api/_bot/generar.test.js
```

### 4. El motor planifica solo los días de la semana pedida
Files: `src/lib/aiPlanner.js`, `src/lib/planner.js`, `src/lib/shoppingBuilder.js`, `src/lib/diasActivos.test.js`
Depends on: none
Blocked by: none
Existing: `git grep -n "activeDays" -- src/lib/aiPlanner.js src/lib/planner.js src/lib/shoppingBuilder.js` → sin salida. `buildGroupContext` recorre `DAYS` entero (`aiPlanner.js:517-530`), `weeklySlotBudget` cuenta 7 días (`planner.js:156`) y la compra suma los 7 (`shoppingBuilder.js:238`); el recorte a los días pedidos solo se hace al pintar (`api/_bot/menu.js:320`). La semana del 30 oct (viernes a domingo) guardó huecos de lunes a jueves.
Not done: no cambia la app ni Lola: las dos ya pasan `startDayIdx`/`days` en `menuWeek` (`prepararGeneracion.js:110`); el motor empieza a leerlos. No toca cuotas ni variedad más allá de que el presupuesto de huecos sea el real. La cifra: huecos guardados fuera del rango de la semana en semanas vivas (hoy ≥ 8 en una de 7) → 0.
Done:
```sh
npx vitest run src/lib/diasActivos.test.js src/lib/aiPlanner.test.js
```

### 5. El registro de la ficha gana las columnas del eje: ficha, defecto, suposición, mínimo, caducidad, peso, escritor y choque
Files: `src/lib/registroFicha.js`, `src/lib/registroFicha.test.js`, `src/lib/registroCampos.js`, `src/lib/registroCampos.test.js`, `src/lib/wizardRegistry.js`, `src/lib/wizardRegistry.test.js`, `src/lib/vocabularios.js`, `scripts/lib/inventarioFicha.mjs`
Depends on: 1, 2, 3, 4
Blocked by: none
Existing: `registroFicha.js:113-117` (`dato`) tiene entidad, tema, estado, tipo, vocabulario, campo, libreta, otros, de, motivo, vive y modulo; `registroCampos.js:37-45` tiene politica, seguridad, caduca_dias, por, aplica y columna para 7 campos; `wizardRegistry.js` tiene orden, suposicion, requiere y activa para 14 preguntas. `git grep -n "choque\|defecto:" -- src/lib/registroFicha.js src/lib/wizardRegistry.js src/lib/registroCampos.js` → solo dos comentarios de `wizardRegistry.js` (:56, :767), ninguna columna. `vocabularios.js` ya tiene `origen_dato`, `canales_dato` y `ref_tipo`; faltan `postura` y `choque`.
Not done: no mueve ningún dato ni toca la base. `registroCampos.js` pasa a ser una proyección del registro (los 7 campos siguen saliendo iguales: el test de paridad con la 0097 no cambia) y `wizardRegistry.js` lee `orden` y `suposicion` del registro en vez de llevarlos. `axisRegistry.js` (receta) y `capacidades.js` no se tocan: el eje de receta es #939, no esta ficha. El inventario aprende las columnas nuevas y falla si a un dato `activo` le falta `ficha`.
Done:
```sh
npx vitest run src/lib/registroFicha.test.js src/lib/registroCampos.test.js src/lib/wizardRegistry.test.js src/lib/vocabularios.test.js
```

### 6. Cada dato de la casa, en su ficha y su clase: los 26 sin declarar, las 10 copias y las marcas de pantalla
Files: `src/lib/registroFicha.js`, `scripts/lib/inventarioFicha.mjs`, `scripts/lib/inventarioFicha.base.json`, `scripts/ficha-inventario.mjs`
Depends on: 5
Blocked by: none
Existing: `npm run -s ficha:inventario` → `sin_declarar: 26` (`rosters`, `allergiesReviewed`, `etapaBebe`, `slotType`, `mealStructureByGroup`, `menuWeekDays`, `notepad`, `cocinas`, `favoritos`, `cookedDishes`, `profilePhoto`, `persona.dislikes`…), `copia: 10`, `legado: 11`, `sin_tabular: 54`. Las clases de este plan (hecho, derivado, marca, historial) no existen en el registro: `ESTADOS` son `activo | copia | legado | interfaz` (`registroFicha.js:90`).
Not done: no borra ninguna clave del documento: eso lo hace el último trozo de cada tramo (11, 13, 14, 20, 21, 22) al cerrar su ficha. `copia` y `legado` siguen contándose hasta entonces. La clase `derivado` dice con qué función se calcula; una copia sin función es deuda que el inventario sigue contando.
Done:
```sh
npm run -s ficha:inventario && npx vitest run scripts/lib/inventarioFicha.test.js src/lib/registroFicha.test.js
```

### 7. Migración 0105: el sobre gana estado de uso, el registro sus columnas nuevas, y nace la tabla `operacion`
Ampliado (D1, 30 oct tarde): la 0105 crea también la tabla `operacion` (campos en «Las fichas», fila Operación; solo la lee y la escribe el servidor, porque `pedido` e `inversa` llevan salud) con clave de idempotencia única por (casa, clave), y `sobre.operacion_id` (FK a `operacion`, `on delete set null`). La RPC que escribe es el trozo 39 y la lectura nueva el trozo 40: el SQL de las tres juntas pasaba de 700 líneas (30 oct, #1059). La retención va en el barrido del trozo 35.
Files: `supabase/migrations/0105_dato_con_sobre.sql`, `supabase/ESTADO.md`, `supabase/datoConSobre.test.js`, `supabase/principios.test.js`, `supabase/idsPersonaGrupo.test.js`, `ops/columnas-texto.json`, `src/lib/registroCampos.js`, `src/lib/registroCampos.test.js`, `scripts/lib/columnasVocabulario.mjs`, `src/lib/vocabularios.js`, `src/lib/vocabularios.test.js`
Depends on: 5, 6, 25
Blocked by: none
Existing: `sobre` (0097:132-153) no tiene `peso`, `caduca_at` ni `updated_at` (nombre de PRINCIPIOS §9, con su disparador `set_updated_at`); `registro_campo` (0097:74) no tiene `ficha`, `defecto`, `minimo_para_generar`, `peso_menu`, `escribe` ni `choque`; `git grep -n "escribir_dato" -- supabase` → sin salida; `ficha_casa` es v1 (0097:241). `ls supabase/migrations | tail -1` → `0104_…`; `gh pr list --state open --search 0105` → 0 PR. El trigger `sobre_valor_valido` (0097:173) ya comprueba tipo y rango contra `registro_campo`, y así se queda.
Not done: no crea `aplicar_operacion` ni `escribir_dato` (trozo 39) ni `ficha_casa` v2 (trozo 40), y no quita `sobre.ref` (trozo 40); nadie escribe todavía en `operacion` ni en `sobre`. No retira el trigger 0089 ni crea `escribir_persona` (eso es la migración del trozo 10). No repuebla nada: las filas nacen vacías y cada casa las estrena cuando la app o Lola vuelven a preguntar (sin convivencia, Pablo 30 oct). No crea las tablas de gusto, señal e historiales (eso es la migración del trozo 14) ni toca las de salud por persona, que ya existen (`persona_alergia`, `persona_intolerancia`, `persona_estado`, `persona_perfil_salud`, 0079:40-68). La aplica Pablo (ensayo y `--si`, regla `migraciones`): el trozo deja el comando y la línea `-- AUDITADA` la pone quien la revise. `registro_campo` se regenera entero desde el registro (como la 0097) y el test de paridad compara el INSERT de la 0105. Sin `cambio` (historial de cada cambio): decidido (Pablo, 30 oct) que los contadores sustituyen al historial; el sobre guarda el último cambio.
Done:
```sh
node scripts/apply-migration.mjs 0105_dato_con_sobre && npx vitest run supabase/datoConSobre.test.js supabase/principios.test.js src/lib/vocabularios.test.js src/lib/registroCampos.test.js supabase/migrations.test.js
```

### 8. `escribirDato`: una sola función para la app y Lola, al momento, con cola, choque por dato, y fallo en alto si falta la RPC
Ampliado (D1, D3): `escribirDato` no llama a la RPC desde el navegador: propone una operación de tipo dato a la tubería del servidor (trozo 26), que comprueba y llama a `aplicar_operacion`. En la app, el cambio se pinta al momento y, si la tubería lo rechaza o choca, se dice con el motivo; nunca se descarta en silencio.
Files: `src/lib/escribirDato.js`, `src/lib/escribirDato.test.js`, `api/_bot/datos.js`, `api/_bot/datos.test.js`, `src/server/botCore.js`
Depends on: 39
Blocked by: none
Existing: `git grep -n "escribirDato\|escribir_dato" -- src api` → sin salida. Hoy la app escribe el documento entero con `save_household_state` (`src/lib/householdState.js:72`, 0068:22) y Lola con `bot_save_casa` (`api/_bot/casa.js:159`, 0057:124); las dos suben `bot_rev`. La cola de guardados de la app (`src/lib/versionCasa.js:24`, `enColaDeCasa`) sirve de base para la cola nueva.
Not done: ningún dato pasa todavía por aquí (tramos 3-6 van moviendo escritores). No sustituye `save_household_state` ni `bot_save_casa` para lo que siga en el documento. La cola de la app guarda lo pendiente en localStorage y reintenta al volver la red; lo que lleve más de 24 h pendiente se dice (principio 3), no se tira. Si la RPC no existe (rama desplegada antes que la migración): no se guarda, se dice en pantalla o en el chat, y se apunta en el log con la clase `rpc_ausente`; nunca se escribe en el documento (sin convivencia).
Done:
```sh
npx vitest run src/lib/escribirDato.test.js api/_bot/datos.test.js
```

### 9. Leer la ficha con estado: `ficha_casa` v2 en Lola y en el asistente de la app, con vacío, por defecto, supuesto, aprendido o dicho por dato
Files: `src/lib/estadoDeDato.js`, `src/lib/estadoDeDato.test.js`, `api/_bot/fichaRpc.js`, `api/_bot/fichaRpc.test.js`, `api/_bot/ficha.js`, `api/_bot/ficha.test.js`, `src/lib/wizardRegistry.js`, `src/lib/wizardRegistry.test.js`
Depends on: 8, 40
Blocked by: none
Existing: `fichaRpc.js` lee el contrato v1 (personas, faltan, tareas, callados) tras `BOT_FICHA_RPC`; la ficha marca Dicho/Supuesto solo con `matizDe` de la libreta (`ficha.js:284-344`); el asistente distingue vacío/inferido/delegado/fijado solo en la libreta (`wizardRegistry.js:651`) y en `data` solo vacío/fijado (`:645-649`). `git grep -n "estadoDeDato" -- src api` → sin salida.
Not done: ninguna pantalla nueva en la app (regla `ui`: cambios mínimos; el asistente ya pinta `por-tocar`/`aclaracion`/`aclarado`). El analista nocturno no (trozo 15). Si `ficha_casa` v2 no está (migración sin aplicar), se lee como hoy y queda en el log, como ya hace `fichaRpc.js`. Los topes de tokens de la ficha (`specs/ficha-de-la-casa.md`, 450) no cambian: el estado se marca con la leyenda de `conocimiento.md`.
Done:
```sh
npx vitest run src/lib/estadoDeDato.test.js api/_bot/fichaRpc.test.js api/_bot/ficha.test.js src/lib/wizardRegistry.test.js
```

### 10. Persona y salud pasan a sus filas en un solo trozo: la app y Lola leen `members`/`groups` como vista calculada desde `persona`, `grupo` y `persona_*`, escriben por `escribirDato` sobre la RPC `escribir_persona` de la 0108, que retira el trigger 0089; el documento deja de llevarlos
Files: `supabase/migrations/0108_persona_fuente.sql`, `supabase/ESTADO.md`, `scripts/backfill-personas.mjs`, `src/lib/personas.js`, `src/lib/personas.test.js`, `src/lib/alergias.js`, `src/lib/alergiasBase.js`, `src/App.jsx`, `src/screens/Onboarding.jsx`, `src/screens/Settings.jsx`, `api/_bot/casa.js`, `api/_bot/ficha.js`, `api/_bot/ajustes.js`, `api/_bot/silencio.js`, `src/lib/vocabularios.js`, `src/lib/salud.test.js`
Depends on: 9, 28
Blocked by: none
Existing: `persona` y `grupo` existen (0079) y los rellena el trigger desde el JSON en cada guardado (0089:220-263; `personasTabla.js` es su gemelo en JS); la salud también: `0089_personas_al_guardar.sql:162` lista `allergies`, `intolerances`, `dietaryStates`, `healthProfiles`, `:192-204` las vuelca a `persona_alergia`, `persona_intolerancia`, `persona_estado` y `persona_perfil_salud`, y `:245` lo llama al guardar miembros. Nadie puede escribir esas tablas como usuario: no hay políticas de escritura (`grep -n -i "create policy.*persona" supabase/migrations/*.sql` → sin salida); solo las funciones definer `persona_sincronizar_casa` (0081:14, rehecha en 0082:21; la llama el trigger) y `persona_reemplazar_casa` (0079:112, que desde 0082:107 solo delega en la anterior; la llama `scripts/backfill-personas.mjs:53`), y `save_household_state` corre como el usuario (0089:218-219). La migración del trozo 7 no las toca. Hoy nadie en la app lee esas filas: `members` se lee del documento en 116 sitios de `Onboarding.jsx`, 74 de `App.jsx`, 28 de `ajustes.js` y 6 de `ficha.js` (`git grep -c "members"`); `alergiasParaMenu` (`alergias.js:89`) lee `members[].allergies`. Lola las lee solo por `ficha_casa` (0097:273) tras el interruptor `BOT_FICHA_RPC`. Los escritores: `setData` de `members` en `Onboarding.jsx` y `Settings.jsx`, `ajustes.js` (`anadir_comensal`, `ajustar_alergias`, `ajustar_salud`), `silencio.js` (`marcarPorSilencio`). `groups` ya se recalcula al leer en `generar.js:280-290` (`groupsFromModel`). Los vocabularios `alergenos` y `estados` siguen pendientes (`registroCampos.js:57`). `git grep -n "drop trigger\|disable trigger" -- supabase/migrations | grep -i persona` → sin salida. #958 G: «salud en dos sitios».
Not done: el corte de lectura y de escritura va en el mismo trozo (regla «sin convivencia»). Lectura: al cargar la casa, `personas.js` construye `members`/`groups` desde las filas (`persona`, `grupo`, `grupo_persona`, `persona_*`), para no reescribir los 224 lectores de golpe; `alergiasParaMenu` pasa a leer esa vista (misma regla de los 14, `persona.alergias_revisadas`); el documento no se lee para esto ni «por si acaso». Escritura: la 0108 crea `escribir_persona(p_household, p_persona, p_dato jsonb)` (definer, comprueba que quien llama es de la casa, la única vía de escritura a `persona`, `grupo` y `persona_*`, con `mas_restrictivo` en salud: añadir gana a quitar en el mismo minuto) y hace `drop trigger` de `personas_al_guardar` y `personas_al_crear` y `drop function` de `_personas_al_guardar`, `_persona_filas_de_estado`, `persona_sincronizar_casa` y `persona_reemplazar_casa` (que solo delega en ella); este trozo borra también `scripts/backfill-personas.mjs`, su único llamador (repoblar desde el documento es convivencia). `escribir_persona` actualiza en sitio y nunca borra y reinserta: la FK de `bot_tareas` a `persona` borra en cascada (0083); `escribirDato` (trozo 8) la llama para los datos de ficha persona y salud, y los escritores de identidad (nombre, rol, nacimiento, avatar, color, grupos) y de salud (alergias, intolerancias, estados, perfiles, `alergias_revisadas`) pasan por ahí; al guardar, el documento ya no lleva `members` ni `groups`. Orden de despliegue (la rama antes que la migración, regla del repo): sin la RPC no se guarda y se dice (`rpc_ausente`, trozo 8); hasta que Pablo la aplique, los clientes viejos siguen guardando `members` y el trigger copiando (el estado de hoy, sin pérdida); tras aplicarla, el trigger no existe y un `members` que escriba un cliente viejo aún abierto no lo lee nadie (lo quita el siguiente guardado del código nuevo). La aplica Pablo (ensayo y `--si`). `vocabularios.js` gana `alergenos` y `estados` (constante + test) y `escribir_persona` los comprueba. Nada de doble escritura ni repoblado: una casa sin filas se trata como nueva. Se mide en el PR con `npm run consulta`: filas de `persona` antes y después de la 0108 iguales y ningún `persona.updated_at` retrocede. Los ids de persona siguen en `text` (uuid en `supabase/PENDIENTES.md`, aparte). Los invitados de las reglas (`invitado: true`) no son personas. Cierra #958 A «no tiene alergias no quita las que había».
Done:
```sh
node scripts/apply-migration.mjs 0108_persona_fuente && npx vitest run src/lib/personas.test.js src/lib/salud.test.js src/lib/alergias.test.js src/lib/alergiasMenu.test.js src/lib/alergiasSilencio.test.js src/lib/quitarPersona.test.js api/_bot/ficha.test.js api/_bot/ajustesCantidad.test.js supabase/migrations.test.js
```

### 11. Fuera el gemelo JS del trigger: `personasTabla.js` y su test; `members`/`groups` quedan `derivado` en el registro
Files: `src/lib/personasTabla.js`, `src/lib/personasTabla.test.js`, `scripts/lib/inventarioFicha.mjs`, `src/lib/registroFicha.js`, `src/lib/registroFicha.test.js`
Depends on: 10
Blocked by: none
Existing: tras el trozo 10 el trigger ya no existe y nadie guarda `members` en el documento, pero queda su gemelo en JS: `personasTabla.js` lo leen `src/lib/personasTabla.test.js:2` y `scripts/lib/inventarioFicha.mjs:155` (`CAMPOS_CON_COLUMNA`); `registroFicha.js:65` lo nombra como lector de `members`. Hoy `git grep -n "personasTabla" -- src api scripts | grep -v "^src/lib/personasTabla.js"` → 7 líneas en 4 ficheros (una es `backfill-personas.mjs:16`, que se va en el 10).
Not done: solo código, sin migración. Se borran `personasTabla.js` y su test; el inventario deja de leer `CAMPOS_CON_COLUMNA` y toma las columnas de `persona` del registro; `members` y `groups` quedan `derivado` (vista calculada, sin columna propia) con `personas.js` como lector. No toca datos.
Done:
```sh
! git grep -q "personasTabla" -- src api scripts && npx vitest run src/lib/registroFicha.test.js && npm run -s ficha:inventario
```

### 12. Casa: modelo de menú, aparatos, nivel de cocina, súper, presupuesto, precios y uso de la despensa, como datos con sobre
Files: `src/screens/Onboarding.jsx`, `src/screens/Settings.jsx`, `api/_bot/ajustes.js`, `src/lib/prepararGeneracion.js`, `api/_bot/ficha.js`, `src/lib/casaDatos.js`, `src/lib/casaDatos.test.js`
Depends on: 11
Blocked by: none
Existing: hoy `menuModel`, `kitchenTools`+`customKitchenTools`, `cookLevel`(+`cookLevelManual`), `supermarkets`, `hasBudget`/`budget`, `wantsPriceEstimates`, `pantryMode`(+`pantryModeSet`, `useHomeStock`) viven en `data` (`registroFicha.js:120-234`); `budget` lo pregunta Lola y no lo lee nadie (#958 B); `trastos` y `supermercados` sustituyen la lista entera (#958 C). `git grep -n "casaDatos" -- src api` → sin salida.
Not done: ningún campo nuevo: los mismos ejes con sobre. `cookLevelManual`, `pantryModeSet`, `pantryPrefsSeen` dejan de guardarse en la casa (marcas de pantalla → el móvil, trozo 22) porque el sobre ya dice si es `dicho` o `por_defecto`. El presupuesto gana lector con la estimación de #1019 (motor/presupuesto), no aquí.
Done:
```sh
npx vitest run src/lib/casaDatos.test.js api/_bot/ficha.test.js api/_bot/generar.test.js
```

### 13. Rutina: comidas, estructura, quién come dónde, tiempo, tanda, días y cole, con ámbito día/comida y sobre
Files: `src/screens/Onboarding.jsx`, `src/screens/PizarraControles.jsx`, `api/_bot/ajustes.js`, `src/lib/semanaDias.js`, `src/lib/prepararGeneracion.js`, `src/lib/rutina.js`, `src/lib/rutina.test.js`
Depends on: 12
Blocked by: none
Existing: `meals`/`extraMeals`, `mealStructure`/`mealStructureCena`(+`ByGroup`), `schedule` (claves `id|dia|comida`), `slotType`, `cookTime`, `tanda`/`tandaPlatos`/`diaTanda`, `menuWeekDays`/`menuWeekOffsets`/`menuWeek` (copia), `kidDinnerConfig`, `schoolMenus` viven en `data`; 9 de ellos son `sin_tabular`. `estructuraPlatos.js` (rama `datos/estructura-efectiva`, 29 oct, sin PR) ya unifica la lectura de uno o dos platos. `git grep -n "rutina.js\|lib/rutina" -- src api` → sin salida.
Not done: el menú del cole (`schoolMenus`) se mueve con la misma forma (semana × persona × día), sin rediseñar su importación. `menuWeekOverrides` (horario propio de una semana) se queda en la ficha Semana (trozo 18). «El finde» y «de lunes a jueves» (#958 B) se resuelven con el ámbito del dato, no con listas.
Done:
```sh
npx vitest run src/lib/rutina.test.js src/lib/semanaDias.test.js src/lib/estructuraPlatos.test.js
```

### 14. Migración 0109 y preferencias: nacen de una vez `preferencia`, `plan_preferencias`, `senal` e historiales (con su poda), y la libreta, los sesgos y vetos de las reglas, los topes por familia, el presupuesto y la puerta de cocinas pasan a `preferencia`
Cambiado (D2, 30 oct tarde): donde abajo dice `gusto`, léase `preferencia`, con la forma de la fila Preferencia de «Las fichas» (quién, nivel, eje, medida, operador, valor, fuerza, ámbito, plan, sobre). CHECK de `nivel`, `medida`, `operador` y `fuerza` contra `vocabularios.js` (constante + test); el `eje` se valida contra el registro de ejes (trigger como `sobre_valor_valido`). Absorbe además lo que el plan dejaba fuera: `data.budget`/`hasBudget` (como preferencia de semana sobre coste), los topes de `freqs` (como `como_mucho`/`al_menos` por familia de plato) y `cocinas` (puerta de cocinas, `src/lib/cocinaTopes.js`). No absorbe hechos (aparatos, horario, despensa) ni salud (se queda en `persona_*`; el motor la recibe como obligatoria, trozo 30). `src/lib/preferencias.js` y su test son ficheros nuevos (`ls src/lib/gustos.js src/lib/preferencias.js` → No such file or directory, los dos: `gustos.js` nunca llegó a existir).
Files: `supabase/migrations/0109_preferencia_senal_historial.sql`, `supabase/ESTADO.md`, `src/lib/preferencias.js`, `src/lib/preferencias.test.js`, `src/lib/cocinaTopes.js`, `src/lib/notepad.js`, `src/lib/notepadFields.js`, `src/lib/libretaEnData.js`, `src/lib/reglas.js`, `api/_bot/ajustes.js`, `src/components/wizard/useWizardMenu.jsx`, `src/lib/vocabularios.js`, `src/lib/vocabularios.test.js`
Depends on: 13
Blocked by: none
Existing: la libreta guarda por clave `valor`, `origen`, `fuente` (dicho/visto/supuesto), `desde`, `hasta`, `rechazos` (`src/lib/notepad.js:54-75`) pero su ámbito es solo `todos|ninos|adultos|bebes` × `ambos|comida|cena` (`notepadFields.js`): no hay persona ni días («me gusta la china solo los findes» no cabe; la cabecera de `notepadFields.js` lo dice). Las reglas sí tienen sujeto, ámbito, vigencia y salvedad (`reglas.js:249`), con efectos `excluir|presente|sesgo`. `git grep -n -i "create table[^(]*\(gusto\|senal\|historial\)" -- supabase/migrations` → sin salida (las de salud por persona sí existen, 0079:40-68).
Not done: la 0109 crea también `senal` con su trabajo nocturno de decaimiento (`senal_decaer()` en SQL, programado con `pg_cron` como `bot-retencion` en 0065:47; la fórmula vive ahí y `senales.js` solo lee) y las tablas de historiales con su poda `pg_cron` (90 días precios y tickets, 1 año cocinados), para que Pablo aplique una sola vez lo de los tramos 5 y 8; las escriben los trozos 15 y 22. La aplica Pablo (ensayo y `--si`). Favoritas, descartes y votos siguen en sus tablas y los lee el motor como hoy; el trozo 15 los convierte en señales. Las reglas `presente` (quién come dónde un día) van a Rutina (trozo 13), no aquí. La proyección a `freqs`/`reparto`/`sesgos` (`libretaEnData.js`) se calcula al leer desde `gusto` y deja de guardarse (eran 6 de las 10 copias). Lo que escriba alguien a mano y no case con un valor cae en `otro` con nota, y el inventario cuenta cuántos `otro` hay por eje (de ahí salen los valores nuevos).
Done:
```sh
node scripts/apply-migration.mjs 0109_preferencia_senal_historial && npx vitest run supabase/migrations.test.js src/lib/preferencias.test.js src/lib/notepad.test.js src/lib/notepadMatices.test.js src/lib/reglas.test.js
```

### 15. Señales que olvidan: contadores por casa o cuenta × eje × valor con decaimiento, umbral a «aprendido», y lo que los alimenta
Files: `src/lib/senales.js`, `src/lib/senales.test.js`, `api/_bot/menu.js`, `api/_bot/turno.js`, `src/App.jsx`, `src/lib/registroFicha.js`
Depends on: 14
Blocked by: none
Existing: no hay ningún contador: ni veces cocinado, ni tasa de aceptación, ni pesos aprendidos (`git grep -n -i "decaimiento\|semivida\|half-life" -- src/lib api/_bot` → sin salida salvo comentarios ajenos). `household_recipe_discards` lleva `cooldown_until` fijo de 7 o 14 días (`App.jsx:3938-3955`); `receta_descartes` (0102) no tiene lector en `src`/`api`; `recipe_votes` es un voto por persona sin agregación. `specs/ficha-de-la-casa.md` §4 describe el «analista» como tabla con vocabularios cerrados: esto lo sustituye con contadores en vez de una pasada nocturna.
Not done: una fila por (casa o cuenta, eje, valor), nunca una por evento (Pablo, 30 oct: eso crece sin tope). El decaimiento lo aplica de noche `senal_decaer()`, que crea y programa la migración del trozo 14: este trozo no trae migración y no copia la fórmula en JS; `senales.js` lee la fila y escribe la señal. Al pasar el umbral se escribe (por la tubería, operación con `ref_tipo: cron`) una preferencia `visto` o un dato de Trato; al bajar, se retira. Alimentan: cambiar plato (eje del plato que sale y del que entra), votos, descartes, «hazlo ya» frente a «afinemos», fotos pedidas. No escribe nunca en salud ni en lo `dicho` (regla de oro de la spec).
Done:
```sh
npx vitest run src/lib/senales.test.js api/_bot/menu.test.js
```

### 16. Ficha Trato, por cuenta: ritmo, profundidad al generar, fotos y largo, con defecto, lo dicho y lo aprendido; Lola la lee en cada turno
Files: `src/lib/registroFicha.js`, `api/_bot/trato.js`, `api/_bot/trato.test.js`, `api/_bot/agente.js`, `api/_bot/conocimiento.md`, `api/_bot/turno.js`
Depends on: 2, 15, 23, 33
Blocked by: none
Existing: `git grep -n -i "\btrato\b" -- api/_bot src/lib` → solo tres comentarios ajenos; no hay ningún dato de cómo quiere cada persona que le hable Lola. El idioma se detecta por mensaje (`conQuienEscribe`). `ritmo_cocina` existe en `vocabularios.js` y es otra cosa.
Not done: el trato es de la **cuenta** (`user_id`, con la persona de esa cuenta), no de la persona: los niños no tienen cuenta y la pareja puede querer otro ritmo (Pablo, 30 oct). Defectos: ritmo `guiado`, profundidad `preguntar` (la pregunta del trozo 17), fotos `si`, largo `corto`. Las fotos del menú en Telegram (#1030) son otro trozo: aquí solo se guarda si las quiere. Evals de nivel pr por tocar `conocimiento.md`.
Done:
```sh
npx vitest run api/_bot/trato.test.js api/_bot/agenteRehacer.test.js && node scripts/bot-evals.mjs --nivel=pr
```

### 17. Qué preguntar y cuándo: una sola «siguiente pregunta» del catálogo para la app y Lola, y la guía tras el alta (#1028)
Ampliado: preguntar es crear una tarea `falta_saber` (trozo 34); la «siguiente pregunta» elige entre las tareas abiertas por prioridad, y la frontera entre decidir y preguntar la marca el Trato de la cuenta (método de choques, trozo 33).
Files: `src/lib/siguientePregunta.js`, `src/lib/siguientePregunta.test.js`, `src/lib/wizardRegistry.js`, `api/_bot/tareas.js`, `api/_bot/caducidades.js`, `api/bot/link.js`, `api/bot/link.test.js`, `api/_bot/conocimiento.md`
Depends on: 9, 16
Blocked by: none
Existing: el asistente de la app elige la siguiente pregunta en `wizardRegistry.js:797` (`siguientePregunta`) y Lola no la usa (`git grep -n "siguientePregunta" -- api` → sin salida); las tareas «falta saber» de Lola solo nacen para alergias y etapa del bebé (`registroCampos.js:64`, `CAMPOS_PREGUNTABLES`); tras el alta Lola dice un texto fijo (`api/bot/link.js:26`, `AVISO_ALTA`).
Not done: la elección es una función pura sobre el catálogo y los sobres: (vacío o caducado) × `peso_menu` × `politica` × trato de la cuenta; devuelve como mucho una pregunta por turno y nunca una de salud fuera de su política. Tras el alta: «¿te lo preparo ya o lo afinamos juntos? Te guío» según el trato; si afina, 3-5 preguntas por peso. No reescribe las pantallas del asistente: solo de dónde sale el orden. Evals de nivel pr.
Done:
```sh
npx vitest run src/lib/siguientePregunta.test.js src/lib/wizardRegistry.test.js api/bot/link.test.js api/_bot/tareas.test.js && node scripts/bot-evals.mjs --nivel=pr
```

### 18. La semana lleva sobre por hueco, y la compra es derivada más marcas: añadido a mano, tachado, en casa, quitado
Ampliado (arquitectura [4] y [8]): el sobre por hueco lleva también `motivo` (ids de las preferencias que pesaron y si fue el motor, un cambio a mano o Lola, del informe del trozo 31) y `operacion_id`; la semana guarda `version_catalogo` (`BUNDLED_CATALOG_VERSION`), `version_motor` y la marca de la entrada (trozo 30). Cada artículo de la compra derivada sabe de qué platos sale. Lectores: la herramienta de Lola «por qué este plato» (nueva, con su ficha en `agente.js`) y la ficha del plato en la app.
Files: `src/lib/compraMarcas.js`, `src/lib/compraMarcas.test.js`, `src/lib/shoppingBuilder.js`, `src/lib/menuArchive.js`, `api/_bot/menu.js`, `src/App.jsx`, `src/screens/Shopping.jsx`, `api/_bot/agente.js`, `api/_bot/fichas.test.js`
Depends on: 4, 15, 17
Blocked by: none
Existing: la compra se guarda como lista generada + lo apuntado a mano mezclados (`user_menu_weeks.shopping`, `compraDeLaSemanaNueva` en `generar.js:186`); rehacer la semana pierde «comprado» y «en casa», y lo apuntado a mano queda en dos listas (#958 E); al cambiar un plato se regenera la lista entera. Un hueco del plan no dice quién lo cambió ni cuándo. `git grep -n "compraMarcas" -- src api` → sin salida.
Not done: el formato del plan por semana se queda (documento por semana, decidido): solo gana `sobre` por hueco (quién, cuándo, canal) y `shopping` pasa a ser **solo marcas** por artículo; la lista se calcula del menú + marcas al leer, en la app y en Lola, con `buildShoppingList` (trozo 4). Quitar algo no rehace nada: es una marca `quitado`. No toca Mercadona ni los precios.
Done:
```sh
npx vitest run src/lib/compraMarcas.test.js src/lib/shoppingBuilder.test.js api/_bot/menu.test.js
```

### 19. El aperitivo es una franja que se puede planificar desde la pizarra y desde Lola
Files: `src/lib/comidas.js`, `src/lib/planner.js`, `src/lib/aiPlanner.js`, `src/screens/PizarraControles.jsx`, `api/_bot/ajustes.js`, `src/lib/aperitivo.test.js`
Depends on: 13, 18
Blocked by: none
Existing: `Aperitivo` está en `COMIDAS` con `tipo: "futuro"` y sinónimos (`src/lib/comidas.js:35-37`), `COMIDAS_PLANIFICABLES` lo excluye (`:63`) y `ALL_DAY_MEALS` del motor es `Desayuno, Comida, Cena` (`src/lib/planner.js:13`). Pablo (30 oct): llegar desde la pizarra a un menú con aperitivos algún día.
Not done: el aperitivo es una franja `extra` (como merienda o postre): un plato, pool de recetas con `mealRole` aperitivo, sin cuota. Si el catálogo estrella no tiene recetas de aperitivo, error y no relleno (regla `catalogo`). Solo los días que se pida (el ámbito del dato de Rutina lo permite tras el trozo 13).
Done:
```sh
npx vitest run src/lib/aperitivo.test.js src/lib/comidas.test.js src/lib/aiPlanner.test.js
```

### 20. La app se entera al momento: Realtime en vez del sondeo de 20 s, y el guardado por dato sustituye al documento entero
Ampliado (arquitectura [6]): la app escucha **una sola señal por casa** (la versión y qué ficha cambió, escrita por `aplicar_operacion`), no cada tabla, y pide solo esa ficha: un cambio es un mensaje por aparato abierto (coste estimado: céntimos por familia y mes en el plan Pro de Supabase).
Files: `src/App.jsx`, `src/lib/householdState.js`, `src/lib/versionCasa.js`, `src/lib/realtimeCasa.js`, `src/lib/realtimeCasa.test.js`
Depends on: 18
Blocked by: none
Existing: `git grep -n "postgres_changes\|\.channel(" -- src` → sin salida; la app sondea `bot_rev` cada 20 s y al volver a la pestaña (`App.jsx:263`, `:1830-1845`); guarda el documento entero con espera de 1,2 s (`:1786-1804`) y, si choca, recarga y tira lo local (`:2005-2015`).
Not done: el documento aún lleva recetas, carpetas e historiales hasta los trozos 21-22; `household_state` no se borra. Antes de quitar el guardado entero se mide una semana cuántas escrituras por dato hace la app frente a hoy (`user_events` ya tiene `app_version`), y se apunta la cifra en el PR. Sin conexión Realtime (o si el proyecto no la tiene activa: ver Not verified), el sondeo sigue como plan B.
Done:
```sh
npx vitest run src/lib/realtimeCasa.test.js src/lib/versionCasa.test.js src/lib/menusSync.test.js
```

### 21. Recetas propias, carpetas y colecciones solo en sus tablas; fuera del documento
Files: `src/App.jsx`, `src/lib/recipeCollections.js`, `src/lib/userRecipesSync.js`, `api/_bot/recetas.js`, `api/_bot/propias.js`, `src/lib/registroFicha.js`, `src/lib/recetasFuente.test.js`
Depends on: 20
Blocked by: none
Existing: `userRecipes`, `recipeCollections` y `recipeFolders` tienen tabla (`vive: "tabla:user_recipes"`, `recipe_collections`, `recipe_folders` en `registroFicha.js`) y además copia en `data`; #958 G: «Lola sigue escribiendo la copia `data.userRecipes`, y con ella vuelven recetas ya borradas» y «carpetas en dos sitios». `git grep -n "recetasFuente" -- src api` → sin salida.
Not done: no cambia el modelo de receta propia ni la visibilidad (#958, 0103-0104); solo quién es la fuente. Los votos y favoritas ya son señales (trozo 15).
Done:
```sh
npx vitest run src/lib/recetasFuente.test.js src/lib/userRecipesSync.test.js src/lib/recipeCollections.test.js api/_bot/recetas.test.js
```

### 22. Historiales con poda y marcas de pantalla en el móvil: el documento de la casa queda vacío
Files: `src/App.jsx`, `src/lib/historial.js`, `src/lib/historial.test.js`, `src/lib/marcasLocales.js`, `src/lib/registroFicha.js`, `scripts/lib/inventarioFicha.mjs`
Depends on: 21
Blocked by: none
Existing: `menuHistory`, `cookedDishes`, `priceObs`, `receipts`, `cookedDeltas`, `pantryGenDeltas`/`pantryDayDeltas` viven en `data` y crecen sin poda (`aiRecipes` llegó a 137 en una casa, #958 E); las marcas `expertMode`, `modePrompted`, `pantryPrefsSeen`, `useBirthDate`, `manualSlotType` son `interfaz` en el registro. `git grep -n "marcasLocales\|lib/historial" -- src` → sin salida.
Not done: no borra `household_state` ni la columna `state`: queda como documento vacío (`{}`) hasta que una migración posterior la retire, cuando `npm run consulta` confirme 0 claves en todas las casas durante un mes. La poda la hace el `pg_cron` de la migración del trozo 14, con los plazos escritos allí una sola vez. Los historiales viejos del documento no se copian: se empieza a contar desde que la app escribe filas (sin convivencia).
Done:
```sh
npx vitest run src/lib/historial.test.js src/lib/marcasLocales.test.js && npm run -s ficha:inventario
```

### 23. Herramientas y pantallas con ficha: cada una declara qué datos lee y escribe, y los datos sin pregunta en Lola o sin pantalla en la app son cifras con línea base, como los huecos
Files: `api/_bot/agente.js`, `api/_bot/fichas.test.js`, `src/lib/capacidades.js`, `src/lib/capacidades.test.js`, `src/lib/capacidadesDatos.test.js`, `src/lib/capacidades.base.json`, `scripts/capacidades.mjs`
Depends on: 5, 6
Blocked by: none
Existing: Lola tiene 46 herramientas (`grep -c 'name: "' api/_bot/agente.js` → 46; Pablo recordaba 41, cifra de otra fecha). El mapa de capacidades (#939 fase 4, 28 oct) ya es la ficha de «qué se puede hacer y dónde»: `npm run capacidades` → `Capacidades: 85; en los dos lados: 29; huecos (un lado vacío sin motivo): 35`; 51 de las 85 llevan `datos:` con claves del registro (`grep -c 'datos: \["' src/lib/capacidades.js` → 51; la línea 66 es el valor por defecto `datos: []`); `capacidades.test.js:10-28` cruza los nombres de `lola:` con los de `agente.js` y falla si una herramienta no existe. Cada herramienta de Lola ya tiene su ficha junto a su definición (`herramienta(ficha, def)`, `api/_bot/agente.js:146-170`: `soloLectura`, `pantalla`, `lector`, `avisoLento`), exportada en `FICHAS` (`agente.js:1702`), de donde salen `SOLO_LECTURA`, `AVISO_LENTO` y `pantallaDe`; `fichas.test.js` exige que esté completa. Los 35 huecos ya son una cifra con línea base que solo baja: `src/lib/capacidades.base.json` (`"huecos": 35, "apagadas": 6`) y `capacidades.test.js:40-44` («los huecos de sincronía solo bajan»). Lo que no existe: la ficha no dice qué datos lee o escribe la herramienta (`grep -c "escribe:\|lee:" api/_bot/agente.js` → 0), y ningún test dice si un dato del registro se queda sin quien lo pregunte en Lola o sin pantalla que lo rellene en la app.
Not done: no añade ni quita herramientas ni cierra los 35 huecos (cada hueco es su tarea; aquí se cuentan). No hay tabla por casa: qué puede hacer Lola es vocabulario del producto y vive en el código, una vez (Pablo, 30 oct); lo que es de cada familia (ritmo, profundidad, permisos) es la ficha Trato (trozo 16). No corre evals por capacidad (una frase → la herramienta que toca): se deja para cuando el trozo 17 fije la «siguiente pregunta». No toca `registroFicha.js` (trozos 5, 6, 16 y 22): lo lee. Qué hace: la ficha de cada herramienta (`herramienta(ficha, def)`) gana `lee`, `escribe` (claves del registro) y `capacidad` (id del mapa), obligatorios como hoy `soloLectura` y `lector`; `fichas.test.js` exige los tres y que cada clave exista en el registro; `capacidades.js` deja de repetir `datos:` y `lola:` a mano y los deriva de `FICHAS` y de las pantallas (principio 4); `npm run capacidades -- --datos` enseña, por dato del registro, quién lo pregunta en Lola y quién lo rellena en la app, y sus dos cifras (datos sin pregunta en Lola, datos sin pantalla en la app) entran en `capacidades.base.json` junto a los huecos, con la misma regla de «solo bajan» en el test que ya existe.
Done:
```sh
npx vitest run api/_bot/fichas.test.js src/lib/capacidades.test.js src/lib/capacidadesDatos.test.js && npm run -s capacidades -- --datos
```

### 24. Cuatro listas enlazadas: datos, ejes, valores y acciones; los nutrientes como ejes agregables y cada eje con su tipo y si se puede sumar
Files: `src/data/axisRegistry.js`, `src/data/axisRegistry.test.js`, `src/lib/vocabularios.js`, `src/lib/vocabularios.test.js`, `src/lib/registroTareas.js`, `src/lib/registroFicha.js`, `src/lib/notepadFields.js`, `src/lib/registros.test.js`
Depends on: 5, 6
Blocked by: none
Existing: siete registros (ver «Lo desagradable primero»); `axisRegistry.js` declara 78 entradas (`grep -cE "\bn: [0-9]+, id:" src/data/axisRegistry.js` → 78) con `tipo`, `estado` (`grep -c 'estado: "activo"'` → 50; `sin_lector` → 14; `silencioso` → 13; `sin_datos` → 1) y `consumidores` (`grep -c "consumidores: \[\]" src/data/axisRegistry.js` → 27 sin ninguno, entre ellos `nova`, `tiempoActivo`, `quienCocina`, `perecibilidad`, `objetivoCorporal`, `protocoloDietetico`); `registroTareas.js` lleva sus propios `ENUMS`; `notepadFields.js` declara 11 campos con `dominio` propio; la nutrición por receta está en `src/data/derived/recipeNutrition.json` y no es un eje. `git grep -n "agregable" -- src/data src/lib` → sin salida; `ls src/lib/registros.test.js` → No such file or directory.
Not done: no mueve datos ni toca la base. Cada eje gana `agregable` (`suma`/`media`/`cuenta`/`no`) y `unidad`; los nutrientes de `recipeNutrition.json` entran como ejes de ámbito receta con `agregable: suma` y su unidad (los valores siguen en el derivado: el eje dice cómo leerlos). Los `ENUMS` de `registroTareas.js` pasan a `vocabularios.js` (proyección, como hizo el trozo 5 con `registroCampos.js`). `ENTIDADES` (`registroFicha.js:62`) gana `operacion`, `preferencia` y `plan_preferencias` con los campos de la forja (ver «Entidades y campos nuevos»). Los campos de la libreta quedan como datos del registro con `ficha: preferencia` y apuntan al eje que expresan (`eje:`), para que el trozo 14 los convierta sin traducir a mano. Un test (`registros.test.js`) cruza las cuatro listas: todo id nombrado existe en su lista y ningún valor se declara en dos.
Done:
```sh
npx vitest run src/lib/registros.test.js src/data/axisRegistry.test.js src/lib/vocabularios.test.js src/lib/registroFicha.test.js
```

### 25. Los esquemas de las herramientas de Lola salen del registro
Files: `src/lib/esquemaHerramienta.js`, `src/lib/esquemaHerramienta.test.js`, `api/_bot/agente.js`, `api/_bot/fichas.test.js`, `api/_bot/__snapshots__/fichas.test.js.snap`
Depends on: 23, 24
Blocked by: none
Existing: los esquemas de las 46 herramientas de `agente.js` (`grep -c 'name: "' api/_bot/agente.js` → 46) escriben a mano sus `enum` y tipos; `git grep -l cookLevel -- src api | grep -v test | wc -l` → 19 y `git grep -l etapaBebe -- src api | grep -v test | wc -l` → 17; con el trozo 23 cada herramienta declara `lee`/`escribe`. `git grep -n "esquemaHerramienta" -- src api` → sin salida.
Not done: no genera pantallas ni flujos; solo los parámetros de cada herramienta que toca un dato del registro (tipo, `enum` del vocabulario, descripción corta del dato). El texto de cada herramienta (para qué sirve) sigue a mano. La instantánea de fichas cambia y se revisa en el PR. Cifra: ficheros que hay que tocar para añadir un dato preguntable por Lola (hoy, los de `git grep -l <clave>`: 19 para `cookLevel` → registro + su herramienta si es nueva). Evals de nivel pr (cambia lo que ve el modelo).
Done:
```sh
npx vitest run src/lib/esquemaHerramienta.test.js api/_bot/fichas.test.js && node scripts/bot-evals.mjs --nivel=pr
```

### 26. La tubería de operaciones: entender, comprobar, aplicar, apuntar, contar y deshacer, una sola para Lola y la app, en el servidor
Files: `src/lib/operaciones/tuberia.js`, `src/lib/operaciones/tuberia.test.js`, `src/lib/operaciones/puerta.js`, `src/lib/operaciones/puerta.test.js`, `api/operacion.js`, `api/_bot/operacion.js`, `api/_bot/casa.js`, `api/_bot/db.js`, `src/lib/escribirDato.js`, `src/lib/tuberiaUnica.test.js`
Depends on: 7, 8
Blocked by: none
Existing: piezas sueltas: `api/_bot/operacion.js` (contexto del turno en memoria: autor, `mid`, reintento; #958 R4), `api/_bot/resultado.js` (hecho/sin_hacer; #958 R1), `api/_bot/idempotencia.js`, `bot_deshacer` con autor (`casa.js:200-215`, deshacer solo lo de quien lo pide, `casa.js:258`); la seguridad del menú vive dentro del motor (`fixedDishes.js` `recipeViolatesHardSafety`) y `colocarPedidos` se la saltaba (#958 A). La app escribe con `save_household_state` desde el navegador. `git grep -n "aplicar_operacion\|lib/operaciones" -- src api` → sin salida; `ls src/lib/operaciones api/operacion.js src/lib/tuberiaUnica.test.js` → No such file or directory (los tres).
Not done: no mueve fichas (cada tramo pasa sus escritores por aquí). La puerta (`puerta.js`) es una: alergias y salud (ningún plan ni plato con alérgeno de quien come llega a la base, venga de donde venga), permisos por papel (dueño, cotitular, lector, invitado) y mínimos; los choques los añade el trozo 33. `api/operacion.js` es la entrada de la app (sesión de Supabase del usuario; la tubería comprueba que es de la casa). `bot_deshacer` sigue para lo que aún va por el documento; lo que pasa por la tubería se deshace con la inversa de su operación. Test de clase (`tuberiaUnica.test.js`): ningún `insert`/`update`/`rpc` a tablas de ficha fuera de `src/lib/operaciones/` y las RPC que crean las migraciones de este plan (lista cerrada).
Done:
```sh
npx vitest run src/lib/operaciones/tuberia.test.js src/lib/operaciones/puerta.test.js src/lib/tuberiaUnica.test.js
```

### 27. Resultado obligatorio en toda herramienta que escribe, empezando por cambiar plato, compra y generar; un solo intérprete de fechas y personas
Files: `api/_bot/menu.js`, `api/_bot/generar.js`, `api/_bot/agente.js`, `api/_bot/resultado.js`, `api/_bot/interprete.js`, `api/_bot/estadoCasa.js`, `api/_bot/resultadoObligatorio.test.js`, `api/_bot/interpreteUnico.test.js`
Depends on: 26
Blocked by: none
Existing: `resultado.js` lo importan `agente.js` (recibo), `ajustes.js`, `cole.js`, `despensa.js`, `idempotencia.js`, `menu.js`, `recetas.js` y `tareas.js` (`git grep -l 'from "./resultado.js"' -- api/_bot`); en `menu.js` solo lo devuelve quitar de la compra (`menu.js:518`, acción `compra_quitar`): cambiar plato y añadir a la compra no, y `generar.js` no lo importa. Acciones con resultado hoy: `ACCIONES` en `resultado.js:33`. `ls api/_bot/resultadoObligatorio.test.js api/_bot/interpreteUnico.test.js` → No such file or directory (los dos). `interprete.js` (#958 R3) ya sustituye a la mayoría de analizadores, pero quedan `diaDe` y `resolverDia` (`menu.js:115`, `:153`) y `resolverPersona` (`estadoCasa.js:19`).
Not done: cambiar plato, añadir a la compra y generar devuelven resultado (acciones nuevas en `ACCIONES`); la puerta de `ejecutar` (`agente.js`) rechaza el resultado de una herramienta con `escribe` no vacío (trozo 23) que no traiga `{pedido, hecho, sin_hacer}` y lo apunta como fallo, no como éxito; la confirmación a la familia se pinta desde ahí. `diaDe`, `resolverDia` y `resolverPersona` pasan a llamar al intérprete o desaparecen. Evals de nivel pr.
Done:
```sh
npx vitest run api/_bot/resultadoObligatorio.test.js api/_bot/interpreteUnico.test.js api/_bot/menu.test.js api/_bot/generar.test.js && node scripts/bot-evals.mjs --nivel=pr
```

### 28. El turno de Lola: cancelar y rehacer si llega otro mensaje antes de escribir, y espera adaptativa
Files: `api/_bot/turnos.js`, `api/_bot/turnosRafaga.test.js`, `api/_bot/agente.js`, `api/bot/telegram.js`, `api/_bot/medidaTurno.js`
Depends on: 27
Blocked by: none
Existing: el deshacer por autor ya está (`api/_bot/casa.js:258`) y las aclaraciones ya caducan a las 3 h (`api/_bot/caducidades.js`, `CADUCA.PROPUESTA`): este trozo no los toca. Cola y candado por chat con espera de ráfaga fija de 1 s y hasta 4 vueltas (`turnos.js`, `ESPERA_RAFAGA_MS = 1000`, `MAX_VUELTAS = 4`); el agente acepta `signal` (`ejecutar`, `responder`); un mensaje que llega durante el turno se atiende en la vuelta siguiente, después de que Lola haya contestado al anterior.
`api/_bot/medidaTurno.js` ya existe (piezas puras de la medida de un turno, #910, que lee `scripts/lib/bot-semana.mjs`) con su test `api/_bot/medidaTurno.test.js`; `turnos.test.js` también existe; `ls api/_bot/turnosRafaga.test.js` → No such file or directory: el test nuevo (un mensaje que llega con el turno sin escrituras rehace el turno con los dos; con escrituras, va en la vuelta siguiente; la espera solo sube con un mensaje incompleto) falla antes del trozo.
Not done: primero se mide, añadiendo a `medidaTurno.js` el campo que falta: cuántos turnos reciben otro mensaje del mismo chat mientras corren, y a qué distancia. Si hay casos: con un mensaje nuevo en la cola y ninguna escritura en el turno (la operación del turno no ha apuntado nada), se aborta con `signal` y se rehace con todo; con escrituras, se sigue y el nuevo va en la vuelta siguiente. La espera sube a 3 s solo si el último mensaje parece incompleto (sin verbo de acción reconocido por el intérprete, o termina en «y», «que», «la del»…; lista cerrada con test). No cambia el plazo de Vercel (`plazo.js`).
Done:
```sh
npx vitest run api/_bot/turnosRafaga.test.js
```

### 29. El banco de frases comprueba lo guardado, no solo la herramienta llamada
Files: `scripts/bot-evals.mjs`, `scripts/bot-evals.json`, `scripts/lib/evals.mjs`, `scripts/lib/evalsEstado.test.js`
Depends on: none
Blocked by: none
Existing: `scripts/bot-evals.mjs` corre el agente de verdad con herramientas de mentira y comprueba qué herramientas llama y con qué argumentos (`args`, subcadena), con niveles `pr`, `seguridad` y completo (`node scripts/bot-evals.mjs --help`, cabecera del fichero); no comprueba el estado final ni cuenta coste por caso como cifra con línea base. `scripts/lib/evals.test.js` y el modo `--simulado` ya existen; `ls scripts/lib/evalsEstado.test.js` → No such file or directory: el test nuevo (un caso con `espera` cuya operación no coincide sale en rojo; el resumen de la pasada trae % de operaciones exactas y coste por caso) falla antes del trozo.
Not done: cada caso puede llevar `espera`: la operación esperada (acción y parámetros cerrados) y, cuando hay tubería (trozo 26), el sobre esperado (`origen`, `canal`). Se añaden las frases reales de #958 (anonimizadas) que dieron el 17 %. Cifras por pasada: % de casos con la operación exacta, coste medio por caso y latencia, guardadas con la pasada (ya se guardan resultados en JSONL). Un modo `--modelo=` para comparar Haiku y Sonnet en el mismo banco (para decidir qué mensajes puede llevar el modelo barato).
Done:
```sh
npx vitest run scripts/lib/evalsEstado.test.js
```

### 30. La entrada del motor: una sola función compila fichas y preferencias en un problema cerrado; los ejes de receta, compilados a números al construir
Files: `src/lib/entradaMotor.js`, `src/lib/entradaMotor.test.js`, `src/lib/aiPlanner.js`, `src/lib/solver.js`, `api/_bot/generar.js`, `scripts/compilar-ejes.mjs`, `src/data/derived/recipeEjes.json`, `scripts/validate-catalog.mjs`
Depends on: 15
Blocked by: none
Existing: el motor lee 30 claves distintas de `data.*` en `aiPlanner.js`, `solver.js`, `reglas.js` y `validateMenu.js` (`grep -ohE "data\.[a-zA-Z]+" src/lib/aiPlanner.js src/lib/solver.js src/lib/reglas.js src/utils/validateMenu.js | sort -u | wc -l` → 30; sin contar desestructuraciones); `reglas.js` proyecta sus reglas a `data.sesgos`/`excluidosReglas` para que el motor no sepa que existen. `git grep -n "entradaDelMotor\|entradaMotor" -- src api` → sin salida; `ls src/lib/entradaMotor.js scripts/compilar-ejes.mjs src/data/derived/recipeEjes.json` → No such file or directory (los tres).
Not done: `entradaDelMotor(casa, semana)` devuelve huecos (día × comida × grupo × plato), candidatos por hueco (filtro de obligatorias de nivel plato y de salud), restricciones agregadas y objetivos con su peso y su origen, y una marca de versión. Es lo único que leen `generateMenuWithAI`, `solver.js`, `validateMenu.js`, `pickCatalogReplacement` y `generar.js`. `scripts/compilar-ejes.mjs` escribe en el build una tabla receta × eje numérica (derivado, como los de `src/data/derived/`). Test de paridad: misma casa y misma semilla por el camino viejo y por la entrada dan el mismo menú, hasta que el trozo 31 cambie el objetivo. Cifra: claves `data.*` leídas por el motor → 0.
Done:
```sh
npx vitest run src/lib/entradaMotor.test.js src/lib/aiPlanner.test.js && node scripts/compilar-ejes.mjs --comprobar
```

### 31. Las preferencias en el solver: obligatorias como reglas, el resto como objetivo con peso, y el informe de cumplimiento
Files: `src/lib/solver.js`, `src/lib/solver.test.js`, `src/lib/cumplimiento.js`, `src/lib/cumplimiento.test.js`, `api/_bot/generar.js`, `api/_bot/turno.js`, `src/lib/huecosDelPlan.js`
Depends on: 30
Blocked by: none
Existing: el orden del solver es déficit del reparto (1e4 por familia que falta), luego el orden del pool por `ordenarPorSesgo` mezclado con ruido de semilla (`solver.js`, paso 5): las preferencias solo desempatan; «no más de dos ensaladas» no se guarda como tope (#958 B). El solver ya relaja reglas relajables (`REGLAS_RELAJABLES`) y cuenta `solverRelajados`. `ls src/lib/cumplimiento.js` → No such file or directory; `src/lib/solver.test.js` existe.
Not done: `obligatoria` nunca se rompe (si no hay solución, hueco vacío con motivo, trozo 3); `al_menos`/`como_mucho` de preferencia entran como déficit con su peso (escalones `bajo`/`medio`/`alto`), `mas`/`menos` como orden con peso, y lo `dicho` pesa más que lo `visto` y que lo `supuesto` (método de choques, trozo 33). Sale, con el plan, el cumplimiento por preferencia (cumplida, parcial, no, y por qué) y por hueco las que pesaron (para el `motivo` del trozo 18). Lola y la vía rápida dicen en una línea lo que no se pudo cumplir. Red de calidad y tiempo: las casas aleatorias que ya usa el solver (huecos, semanas enteras, relajaciones, ms por unidad) antes y después, en el PR. Cifra: % de preferencias dichas cumplidas por semana generada.
Done:
```sh
npx vitest run src/lib/solver.test.js src/lib/cumplimiento.test.js api/_bot/generar.test.js
```

### 32. Las 24 reglas del validador como preferencias del sistema, con paridad
Files: `src/utils/validateMenu.js`, `src/utils/validateMenu.test.js`, `src/lib/preferenciasSistema.js`, `src/lib/preferenciasSistema.test.js`
Depends on: 31
Blocked by: none
Existing: `validateMenu.js` (`wc -l < src/utils/validateMenu.js` → 2104) escribe a mano sus reglas, que la cabecera del solver cuenta como 24 (`src/lib/solver.js:18`), y es la única fuente de verdad del solver («la misma regla escrita dos veces, divergiendo en silencio»). `ls src/lib/preferenciasSistema.js` → No such file or directory.
Not done: cada regla se declara como preferencia de origen `derivado` y casa `*` (sistema) en `preferenciasSistema.js`; el validador las evalúa con el mismo evaluador del trozo 31. Una regla solo se retira de `validateMenu.js` cuando un test de paridad sobre casas y asignaciones aleatorias da el mismo veredicto (lo que pide la cabecera de `solver.js` para cualquier versión incremental). Las que no quepan en la forma de preferencia se quedan escritas y se cuentan (cifra que solo baja).
Done:
```sh
npx vitest run src/lib/preferenciasSistema.test.js src/utils/validateMenu.test.js src/lib/solver.test.js
```

### 33. El método de choques: clasificar, ordenar y responder, en una constante con test, aplicado al guardar y al generar
Files: `src/lib/choques.js`, `src/lib/choques.test.js`, `src/lib/operaciones/puerta.js`, `src/lib/vocabularios.js`, `api/_bot/conocimiento.md`
Depends on: 26, 32
Blocked by: none
Existing: la regla de choque por dato (`ultimo_gana`/`mas_restrictivo`/`suma`) la declara el registro (trozo 5); no hay nada que detecte choques entre datos distintos (una preferencia contra otra, un deseo contra un hecho): `git grep -n -i "choques\b" -- src/lib api/_bot | grep -v test` → sin salida; `ls src/lib/choques.js` → No such file or directory. Método completo en `specs/arquitectura-objetivo.md`, «Choques».
Not done: `choques.js` declara, como constantes con su test, las clases, el orden de criterios y las respuestas del método de choques, tal como los define `specs/arquitectura-objetivo.md`, «Choques» (única fuente; este plan no los copia). La puerta (trozo 26) lo aplica al guardar y apunta el choque en la operación; el solver (trozo 31) usa el mismo orden para relajar; la frontera entre «aplicar y avisar» y «preguntar» la mueve el Trato de la cuenta (trozo 16). Cifras: choques por clase y respuesta; choques repetidos tras una tarea de decisión (→ 0). Evals de nivel pr.
Done:
```sh
npx vitest run src/lib/choques.test.js src/lib/operaciones/puerta.test.js && node scripts/bot-evals.mjs --nivel=pr
```

### 34. Migración 0110 y tareas a fondo: tipo, origen enlazado, para quién, prioridad, cuándo, qué bloquea y cómo se cierra; los recordatorios pasan a ser tareas
Files: `supabase/migrations/0110_tareas_a_fondo.sql`, `supabase/ESTADO.md`, `src/lib/registroTareas.js`, `api/_bot/tareas.js`, `api/_bot/recordatorios.js`, `api/_bot/vispera.js`, `api/_bot/borrar.js`, `api/_bot/chats.js`, `api/_bot/ficha.js`, `src/lib/siguientePregunta.js`, `api/_bot/tareas.test.js`
Depends on: 17, 26, 33
Blocked by: none
Existing: `bot_tareas` (0076-0083) con `tipo` (`espera`/`falta_saber`/`decision`/`seguimiento`) y `aplazada` escritos solo tras `BOT_TAREAS_V2`; preguntas solo para `alergias` y `etapa_bebe` (`registroTareas.js`, `SOBRE_A_CAMPO`); tres objetivos fijos. `bot_reminders` (0057) es otra tabla con su estado (`pending`/`sent`/`cancelled`) y sus lectores (`git grep -l bot_reminders -- api src | grep -v test` → `borrar.js`, `chats.js`, `ficha.js`, `recordatorios.js`, `vispera.js`). `ls supabase/migrations/0110_*` → No such file or directory.
Not done: la 0110 añade a `bot_tareas` origen (`origen_tipo` + `origen_id`), `para` (casa/persona/cuenta) y canal, prioridad, `vuelve_at`, intentos y tope, `bloquea`, `cerrada_por` (operación), `ejecutar_at` y el tipo `recordatorio` y `objetivo` (con meta, medida y progreso); retira `bot_reminders` en la misma migración y sus lectores pasan a tareas en el mismo trozo (sin convivencia: los recordatorios pendientes se pierden y se dice en el PR cuántos había). `BOT_TAREAS_V2` desaparece (lo nuevo es lo único). Las tareas nacen del catálogo (dato mínimo vacío o caducado), del motor (hueco sin llenar), de señales, de la familia y de choques. La aplica Pablo (ensayo y `--si`). Cifras: preguntas hasta el primer menú, tareas caducadas sin respuesta, tiempo hasta cerrar. Evals de nivel pr.
Done:
```sh
node scripts/apply-migration.mjs 0110_tareas_a_fondo && npx vitest run api/_bot/tareas.test.js src/lib/siguientePregunta.test.js supabase/migrations.test.js && node scripts/bot-evals.mjs --nivel=pr
```

### 35. Un solo barrido de lo que caduca o deja de existir: estados, propuestas, tareas, operaciones viejas y referencias rotas
Files: `api/_bot/caducidades.js`, `api/_bot/caducidades.test.js`, `src/lib/referenciasRotas.js`, `src/lib/referenciasRotas.test.js`
Depends on: 14, 34
Blocked by: none
Existing: `caducidades.js` ya es la lista cerrada `COSAS_QUE_CADUCAN` con quién caduca cada cosa (`ESTADO_SALUD`, `PROPUESTA` a 3 h, `TAREAS_DEL_MENSAJE` a 12 h, `COLA`) y un test que exige función de barrido para cada una. `ls src/lib/referenciasRotas.js` → No such file or directory.
Not done: se añaden a la lista: preferencias con `hasta` vencido y planes vencidos, tareas vencidas (según su tipo), operaciones de más de 90 días (a resumen) y **referencias rotas**: preferencias o tareas que apuntan a una receta retirada del catálogo estrella, a un valor retirado de un vocabulario o a una persona que ya no está (#958 G, «borrar una persona deja restos»). Cada referencia rota es una corrección automática declarada o una tarea, nunca un fallo callado. Sin migración: usa el cron que ya existe.
Done:
```sh
npx vitest run api/_bot/caducidades.test.js src/lib/referenciasRotas.test.js
```

### 36. Privacidad con el dato repartido: cascadas comprobadas, borrar una persona y exportar una casa
Files: `supabase/cascadas.test.js`, `api/_bot/borrar.js`, `api/delete-account.js`, `api/exportar.js`, `src/lib/exportarCasa.js`, `src/lib/exportarCasa.test.js`
Depends on: 22, 34
Blocked by: none
Existing: el borrado de cuenta depende de las cascadas de las FK y ya falló una vez en producción (`specs/auth.md`, 15 ago 2026); este plan crea `operacion`, `preferencia`, `plan_preferencias`, `senal` e historiales. `git grep -n "exportarCasa\|api/exportar" -- src api` → sin salida; `ls supabase/cascadas.test.js api/exportar.js src/lib/exportarCasa.js` → No such file or directory (los tres).
Not done: `cascadas.test.js` recorre las migraciones y exige que toda tabla con `household_id`, `user_id` o `persona_id` declare `on delete cascade`, `set null` o un anonimizado escrito en la lista del test. Borrar una persona: qué se borra y qué se anonimiza, por tabla, en una operación. Exportar: un JSON por casa o persona leído del registro (cada ficha con sus sobres). Sin pantalla nueva: la descarga sale del perfil, donde ya está borrar cuenta.
Done:
```sh
npx vitest run supabase/cascadas.test.js src/lib/exportarCasa.test.js
```

### 37. Una prueba de punta a punta de la app: alta, menú, cambiar plato y compra, comprobando fichas y sobres
Files: `e2e/recorrido.spec.js`, `playwright.config.js`, `package.json`
Depends on: none
Blocked by: none
Existing: ninguna pantalla grande (`Onboarding.jsx`, `Menu.jsx`, `App.jsx`, `Shopping.jsx`, `PizarraControles.jsx`) tiene una prueba que la abra y la use; hay comprobaciones que leen el texto del código. `ls playwright.config.* e2e` → sin salida. Playwright y Chromium están en las sesiones en la nube.
Not done: corre la app en modo sin cuenta (anónimo, local; `specs/auth.md`) con datos de mentira, sin tocar la base. Recorre alta → generar → cambiar un plato → ver la compra, y comprueba lo que la app enseña. Cuando la tubería exista, una segunda variante con una casa de prueba en una rama de Supabase o un doble de la API comprueba fichas y sobres. No la mete en el CI: añadirla a un workflow toca `.github/workflows/` (ruta cerrada) y es un trozo aparte con su decisión y su revisión de seguridad; hasta entonces se corre con su Done.
Done:
```sh
npx playwright test e2e/recorrido.spec.js
```

### 38. El panel de cifras: un script de solo lectura con todas las cifras del plan
Files: `scripts/cifras-modelo.mjs`, `scripts/lib/cifrasModelo.js`, `scripts/lib/cifrasModelo.test.js`, `package.json`
Depends on: 7, 37
Blocked by: none
Existing: las cifras están repartidas: `npm run ficha:inventario`, `npm run capacidades`, el banco de frases, consultas sueltas con `npm run consulta`. El panel vive en otro repo (`homenu-panel`). `ls scripts/cifras-modelo.mjs scripts/lib/cifrasModelo.js` → No such file or directory (los dos).
Not done: `npm run cifras:modelo` saca en una tabla (y en JSON con `--json` para el panel) las cifras de «Cifras que bajan» y las nuevas de los trozos 24-37, con su línea base y la fecha. Solo lectura (`npm run consulta` por debajo). El panel las lee del JSON; no se toca su repo desde aquí.
Done:
```sh
npx vitest run scripts/lib/cifrasModelo.test.js && npm run -s cifras:modelo -- --sin-base
```

### 39. Migración 0106: `aplicar_operacion` escribe filas, sobres y operación en una transacción, y `escribir_dato` es una operación de tipo dato
Files: `supabase/migrations/0106_aplicar_operacion.sql`, `supabase/ESTADO.md`, `supabase/datoConSobre.test.js`
Depends on: 7
Blocked by: none
Existing: tras el trozo 7 existen `operacion` (solo servidor) y `sobre.operacion_id`; `git grep -n -i "function public\.aplicar_operacion\|function public\.escribir_dato" -- supabase/migrations` → sin salida (la migración del trozo 7 solo las nombra en comentarios). `bot_rev` lo suben hoy `save_household_state` (0068) y `bot_save_casa` (0057).
Not done: la RPC definer `aplicar_operacion(p_operacion jsonb)` (solo `service_role`) escribe los sobres, apunta la operación y sube `bot_rev` en una transacción; es idempotente por (casa, clave); aplica la regla de choque de cada dato (`ultimo_gana`, `mas_restrictivo`, `suma`); lo supuesto no pisa lo dicho por la familia; un campo con columna propia (persona y salud) va a `sin_hacer` con motivo hasta que exista `escribir_persona` (trozo 10); crea el sobre con `on conflict` y recorre los datos en orden fijo. `escribir_dato` (invoker) la llama con una operación de tipo dato. Nadie la llama todavía (trozo 8). La aplica Pablo (ensayo y `--si`).
Done:
```sh
node scripts/apply-migration.mjs 0106_aplicar_operacion && npx vitest run supabase/datoConSobre.test.js supabase/migrations.test.js
```

### 40. Migración 0107: `ficha_casa` v2 devuelve cada dato con su sobre y su estado, y `sobre.ref` se retira
Files: `supabase/migrations/0107_ficha_casa_v2.sql`, `supabase/ESTADO.md`, `supabase/datoConSobre.test.js`, `scripts/lib/columnasVocabulario.mjs`, `src/lib/vocabularios.js`, `src/lib/vocabularios.test.js`, `api/_bot/fichaRpc.js`, `api/_bot/fichaRpc.test.js`
Depends on: 39
Blocked by: none
Existing: `ficha_casa` es v1 (0097:241) y `api/_bot/fichaRpc.js` lee ese contrato tras `BOT_FICHA_RPC`; `sobre.ref_tipo`/`ref_id` (0097) los sustituye `sobre.operacion_id` desde el trozo 7, y `REF_TIPO` (`vocabularios.js`) y `columnasVocabulario.mjs` aún los nombran.
Not done: `ficha_casa` v2 devuelve, por ficha, cada dato con su sobre y su estado (vacío, por defecto, supuesto, aprendido, dicho, caducado); un campo con columna y sin sobre no cuenta como sabido en `faltan`, y `faltan` ignora los sobres caducados. La migración retira `sobre.ref_tipo` y `ref_id` (CONTRAE: Pablo la lanza con `--pablo`) y el mismo trozo quita `REF_TIPO` y su columna de `columnasVocabulario.mjs`. `fichaRpc.js` acepta la versión 1 o 2 del contrato hasta que el trozo 9 lea la 2. La aplica Pablo (ensayo y `--si`).
Done:
```sh
node scripts/apply-migration.mjs 0107_ficha_casa_v2 && npx vitest run supabase/datoConSobre.test.js src/lib/vocabularios.test.js api/_bot/fichaRpc.test.js supabase/migrations.test.js
```

## Decisions for Pablo

### B. Sin alergias confirmadas (ni dichas ni por silencio), ¿Lola genera el menú?
**Decidida por Pablo el 30 oct 2026: opción 1** («No, pregunta primero»). El trozo 2 queda desbloqueado.
Por qué te lo pregunto: el 8 oct decidiste lo contrario (#107: se genera esquivando los 14 alérgenos y se pregunta); hoy ese modo dio un menú con 27 recetas y huecos vacíos. Cambiarlo es cambiar lo que la familia vive la primera vez.
1. No se genera: Lola pregunta primero las alergias (la app ya lo hace en el alta) y genera al saberlas. Coste: una pregunta más antes del primer menú en el chat (recommended)
2. Se genera esquivando los 14, como hoy, pero diciendo que el menú es corto por eso y preguntando a la vez. Coste: el primer menú sigue siendo pobre
3. Se genera con lo dicho (sin esquivar) y se pregunta después. Coste: un alérgeno puede salir en el primer menú; va contra el principio de seguridad de la ficha

## Decisions taken

- principio 4 | eligió: extender `sobre` y `registro_campo` de la 0097 (ya diseñadas para esto) con las columnas que faltan | descartó: una tabla `dato` nueva al lado de `sobre`, o un JSON por ficha | motivo: decidido
- principio 4 | eligió: una tabla genérica con sobre para los ejes de casa, rutina, gusto y trato, validada contra el catálogo (trigger `sobre_valor_valido` + JS), y columnas fijas solo para persona, salud y grupo | descartó: una columna por eje (una migración por eje nuevo, que aplica Pablo) | motivo: decidido
- principio 4 | eligió: contadores con decaimiento, una fila por (casa o cuenta, eje, valor): el gusto por un valor vive en una sola fila | descartó: una fila por cada cambio, que reparte el mismo gusto en muchas filas que luego hay que sumar (y crece sin tope: Pablo, 30 oct) | motivo: decidido
- principio 4 | eligió: el trato con Lola por cuenta (`user_id`) | descartó: por persona (los niños no tienen cuenta) o por casa (la pareja puede querer otro ritmo) | motivo: decidido
- principio 3 | eligió: generar dice qué hueco esperado se queda vacío, en Lola y en la vía rápida | descartó: seguir guardando `_warnings` sin lector | motivo: decidido
- principio 4 | eligió: menú y compra como documento por semana, con sobre por hueco y la compra calculada del menú más marcas | descartó: una fila por hueco (el menú se genera y se cambia entero) o rehacer la lista al quitar un artículo | motivo: decidido
- principio 1 | eligió: las 24 casas sin marca de alergias no se repueblan por script: se les vuelve a preguntar | descartó: marcarlas revisadas de oficio | motivo: decidido
- principio 4 | eligió: sin convivencia: cuando una ficha pasa a sus filas, el documento deja de leerse y escribirse para ella en el mismo trozo, y las casas existentes la estrenan vacía (Pablo, 30 oct: «no quiero migrar nada; si tienen que empezar de cero, es lo que hay») | descartó: doble escritura por tramo, repoblar lo viejo o leer la clave antigua «por si acaso», que mantiene dos sitios vivos para el mismo dato durante semanas (hoy hay 10 copias así) | motivo: decidido
- principio 4 | eligió: la regla de choque de cada dato se aplica en `aplicar_operacion`, la única vía de escritura (D3), y el vocabulario lo comprueba el JS que propone la operación desde `vocabularios.js`; el trigger `sobre_valor_valido` sigue solo con tipo y rango | descartó: meter el choque y el vocabulario en el trigger, que reparte las reglas de una escritura entre la RPC y un disparador y copia en SQL las listas de `vocabularios.js` | motivo: decidido
- principio 3 | eligió: hasta que exista `escribir_persona` (trozo 10), un dato de persona o salud que llegue a `aplicar_operacion` (trozo 39) va a `sin_hacer` con su motivo | descartó: apuntarlo como «dicho» en el sobre sin escribir `persona_*`, que da por guardada una alergia que no está donde la lee el motor; o abortar la operación entera por un dato | motivo: decidido
- principio 4 | eligió: `aplicar_operacion` es definer y solo la llama el servidor (`service_role`), y `escribir_dato` es invoker y pasa por ella (trozo 39) | descartó: dar `aplicar_operacion` a `authenticated`, que deja una segunda puerta de escritura en el cliente, al lado de la del servidor (D3) | motivo: decidido
- principio 1 | eligió: en `ficha_casa` v2 (trozo 40) un campo con columna y sin sobre no cuenta como sabido en `faltan`, y un sobre caducado tampoco | descartó: contarlo como sabido porque la columna tiene valor, que dice a Lola que conoce una alergia que nadie ha confirmado con sobre | motivo: decidido
- principio 4 | eligió: una migración por idea, como dice «Qué hace cada migración» (ampliado el 30 oct por la tarde desde las tres del plan aprobado, y la del trozo 7 partida al construirla, #1059) | descartó: una sola con todo, que mete en un fichero ideas de cuatro tramos y no se puede juzgar entero; meter las tareas en la migración del trozo 14, que junta preferencias y tareas, dos ideas de tramos distintos | motivo: decidido
- principio 2 | eligió: Realtime de Supabase para que la app se entere, con el sondeo de 20 s como plan B y la cifra de escrituras medida antes de quitar el documento | descartó: sondear más a menudo (más lecturas, sin medir) | motivo: decidido
- principio 6 | eligió: una sola pregunta a Pablo (B), porque revierte una decisión suya del 8 oct; el resto de elecciones de diseño se toman y se apuntan aquí | descartó: preguntar dónde viven los ejes o si va Realtime, que no están en la lista cerrada | motivo: decidido
- principio 4 | eligió: las herramientas de Lola y las pantallas de la app son vocabulario del producto, con su ficha en el código (`agente.js`, `capacidades.js`), y cada una declara los datos que lee y escribe; el mapa deriva de ahí (Pablo, 30 oct: opción 1) | descartó: una tabla de herramientas por casa, que repite en cada familia lo que es del producto y se desfasa del código | motivo: decidido
- principio 4 | eligió: lo que cada herramienta lee y escribe va en su ficha de `agente.js` (`herramienta(ficha, def)`, exportada en `FICHAS`), donde ya están `soloLectura`, `pantalla` y `lector` | descartó: una tabla aparte por nombre (`herramientasDatos.js`), que sería la segunda lista de lo que se sabe de cada herramienta, justo lo que `agente.js:149-151` quitó el 2 oct | motivo: decidido
- principio 4 | eligió: el trozo 10 corta a la vez la lectura y la escritura de persona y salud (`members`/`groups` como vista calculada desde las filas, para no reescribir 224 lectores de golpe; los escritores a `escribirDato`) y trae su migración (`escribir_persona` y fuera el trigger 0089) en el mismo trozo | descartó: leer primero de las filas y cortar la escritura en otro trozo, que deja el documento vivo como escritor del mismo dato un trozo entero (dos sitios); y reescribir los 224 lectores de golpe, que no cabe en un PR | motivo: decidido

- principio 4 | eligió: toda escritura es una operación que pasa por una única tubería en el servidor, con su tabla `operacion` desde la migración del trozo 7 (Pablo, 30 oct tarde: D1 opción 1) | descartó: `escribir_dato` sin operación y la operación más tarde, que rehace la migración del trozo 7; o la operación solo para Lola | motivo: decidido
- principio 4 | eligió: una tabla `preferencia` que absorbe todo deseo que condiciona el menú, y `plan_preferencias` como conjunto con nombre y fechas, en la migración del trozo 14 (Pablo, 30 oct tarde: D2 opción 1) | descartó: `gusto` como estaba y cada tipo de deseo en su sitio; o `gusto` ahora y migrar después | motivo: decidido
- principio 4 | eligió: la puerta de seguridad y la tubería en el servidor, iguales para Lola y la app; la app no escribe tablas de ficha (Pablo, 30 oct tarde: D3 opción 1) | descartó: la comprobación en el cliente, pantalla a pantalla, que repite la misma regla en cada pantalla | motivo: decidido
- principio 4 | eligió: los recordatorios son un tipo de tarea y `bot_reminders` se retira en la migración del trozo 34, sin convivencia | descartó: dos tablas con estados distintos para «algo que Lola tiene pendiente con la familia» | motivo: decidido
- principio 4 | eligió: la salud se queda en `persona_*` y el motor la recibe como preferencia obligatoria | descartó: copiar alergias e intolerancias en `preferencia`, que las guarda en dos sitios | motivo: decidido
- principio 4 | eligió: la app escucha una sola señal por casa que escribe `aplicar_operacion` | descartó: que cada pantalla escuche sus tablas, que repite en cada pantalla qué tablas forman cada ficha | motivo: decidido
- principio 4 | eligió: los ejes de receta se compilan en el build a una tabla numérica derivada de `axisRegistry.js` y del catálogo | descartó: una tabla de números mantenida a mano junto al registro | motivo: decidido
- principio 4 | eligió: la fuerza de una preferencia es un vocabulario cerrado (`obligatoria` y tres pesos) | descartó: un peso numérico libre por preferencia, que no se puede contar ni comparar | motivo: decidido
- principio 5 | eligió: la puerta de `ejecutar` rechaza a la herramienta que escribe sin resultado, y un test prohíbe escrituras de ficha fuera de la tubería | descartó: pedir el resultado en el prompt o en la descripción de cada herramienta | motivo: decidido
- principio 5 | eligió: un test sobre las migraciones exige cascada o anonimizado en cada tabla con casa, cuenta o persona | descartó: revisarlo a mano en cada migración (ya falló una vez, `specs/auth.md`) | motivo: decidido
- principio 2 | eligió: una regla del validador solo se retira con un test de paridad sobre casas aleatorias | descartó: reescribirla como preferencia y retirarla a ojo | motivo: decidido
- principio 2 | eligió: el turno de Lola se mide antes de cambiar la espera de ráfaga | descartó: subir la espera sin cifra de cuántos turnos reciben mensajes a mitad | motivo: decidido
- principio 4 | eligió: el plazo de retención de las operaciones y su resumen se escriben una sola vez, en el barrido del trozo 35 | descartó: el mismo plazo escrito también en la migración y en la tubería | motivo: decidido
- principio 2 | eligió: la espera de ráfaga solo sube (hasta 3 s, y solo con un mensaje que parece incompleto) si la medida del trozo 28 enseña turnos con mensajes a mitad | descartó: fijar ya una espera más larga para todos los mensajes sin cifra | motivo: decidido
- principio 4 | eligió: el orden de los criterios y de las clases del método de choques vive en una constante de `choques.js` que leen la puerta y el solver | descartó: escribir el orden en el prompt de Lola y otra vez en el solver | motivo: decidido
- principio 4 | eligió: la clave de idempotencia de lo que pasa por la tubería es una columna de `operacion`, y las órdenes de tareas dejan `bot_idempotencia` en el trozo 34 | descartó: guardar la misma repetición en `operacion` y en `bot_idempotencia` a la vez | motivo: decidido
- principio 4 | eligió: el conjunto de preferencias se llama `plan_preferencias` y «conjunto de preferencias» en código y pantalla | descartó: llamarlo `plan`, el mismo nombre que la entidad `plan` de la Fábrica para otra cosa | motivo: decidido
- principio 6 | eligió: la prueba de punta a punta no entra en un workflow en este plan | descartó: añadirla a `.github/workflows/`, ruta cerrada que pide su decisión y su revisión de seguridad | motivo: decidido
- principio 6 | eligió: todo el alcance de la arquitectura objetivo en esta ronda («vamos a por todo», Pablo, 30 oct tarde) | descartó: núcleo ahora y lo demás aplazado | motivo: decidido

## Not verified

- Los trozos 24-38 y los cambios a 7, 8, 14, 15, 17, 18 y 20 se escribieron el 30 oct por la tarde desde una sesión en la nube que solo ve `staging` y las ramas subidas: si una sesión de terminal ya tiene trabajo local de los trozos 7, 8 o 14 con la forma vieja, este plan no lo sabe.
- Los ficheros nuevos que nombran los trozos 24-38 (tests incluidos) no existen; los existentes se comprobaron con `ls` o `git grep` (`bot-evals.mjs`, `caducidades.js`, `idempotencia.js`, `resultado.js`, `interprete.js`, `operacion.js`, `cocinaTopes.js`, `turnos.js`).
- La cifra de ejes sin consumidor (27 de 78) sale del campo `consumidores` de `axisRegistry.js`, no de seguir el código.
- La espera de ráfaga de 1 s frente a mensajes que tardan más es deducción: el trozo 28 mide antes de cambiar nada.

- Supabase Realtime activo en el proyecto `mdzwbrworucnummibxrq` y el tope de conexiones del plan: `ops/INVENTARIO.md` no lo dice y no lo he mirado en el panel. El trozo 20 lo comprueba antes y deja el sondeo como plan B.
- El alta de Pablo del 30 oct no se ha reproducido en un navegador (no hay cuenta de prueba): la explicación del trozo 1 sale del código (`App.jsx:1786-1804`, `versionCasa.js:42-49`, `App.jsx:2005-2015`) y de los datos (`bot_deshacer` 07:26:09 sin marca; `persona.updated_at` 07:46:39 sin marca). No sé qué disparó la recarga en ese segundo.
- Cuántos clientes de la app siguen abiertos con una versión vieja cuando se aplica la migración del trozo 10 (un `members` que guarden tras ella no lo lee nadie): no se mide; se asume que la PWA se actualiza al abrir.
- Este fichero ha pasado una copia literal del comprobador de planes de la Fábrica (`scripts/lib/plan.mjs`, `decision.mjs` e `intervention.mjs`, leídos el 30 oct 2026, con los seis principios, las cuatro clases y las rutas cerradas pasados a mano), no el `scripts/check-plan.mjs` en su sitio: la guardia de esta sesión no deja ejecutar nada en la carpeta de la Fábrica.
- Cuántas escrituras por minuto hará la app guardando por dato, y su coste: sin medir; lo mide el trozo 20.
- Que `bot_save_casa`, `save_household_state` y `escribir_dato` suban el mismo `bot_rev` sin pisarse mientras el documento siga llevando otras fichas: el diseño lo prevé, pero no está probado contra la base.
- Los números de las migraciones de los trozos 10, 14 y 34 se reservan aquí sin PR abierto; la del trozo 7 está en `staging` (#1059) y las de los trozos 39 y 40 se construyen aparte. Cada trozo vuelve a comprobar su número al construirse (`ls supabase/migrations | tail -1` y `gh pr list --state open --search <número>`).
- Cuántas casas vivas (con menú de esta semana) se verán «empezando de cero» en cada ficha: hoy 37 casas, 29 semanas vivas (trozo 4); no se ha contado cuántas son de familias de verdad y cuántas de prueba.
- Las cifras 25/32 y 24/32 son sobre casas con al menos una persona; hay 37 casas (5 sin personas). La de «respuestas que contradicen el estado» (17 %) es la de #958 del 28 oct, no medida hoy.
- Tests que los Done nombran: los que ya existen se comprobaron con `ls` (`aiPlanner`, `menu`, `tareas`, `recipeCollections`, `userRecipesSync`, `recetas`, `shoppingBuilder`, `comidas`, `semanaDias`, `reglas`, `quitarPersona`, `link`, `vocabularios`, `principios`, `migrations`, `ajustesCantidad`, `agenteRehacer`, `menusSync`). Los nuevos (`altaGuardada`, `minimosParaGenerar`, `huecosDelPlan`, `diasActivos`, `escribirDato`, `datos`, `estadoDeDato`, `salud`, `personas`, `casaDatos`, `rutina`, `gustos`, `senales`, `trato`, `siguientePregunta`, `compraMarcas`, `aperitivo`, `realtimeCasa`, `recetasFuente`, `historial`, `marcasLocales`, `scripts/lib/inventarioFicha.test.js`) los crea su trozo y su PR trae el rojo antes. `estructuraPlatos.test.js` está en la rama `datos/estructura-efectiva` (29 oct), aún sin PR.
