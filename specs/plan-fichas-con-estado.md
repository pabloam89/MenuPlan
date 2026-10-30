# Plan: fichas con estado — del documento único de la casa a entidades con dato, origen, estado y fecha

Verdict: viable y grande (22 trozos, 5 migraciones, varias semanas); lo que Pablo pidió el 30 oct 2026 ya está diseñado desde el 8-10 oct (`registro_campo` y la tabla `sobre` de la 0097) y nadie lo escribe: 0 filas en `sobre`. El rework es, sobre todo, cablear eso y sacar a la app y a Lola del documento único `household_state.state.data`, ficha a ficha, cerrando cada una entera. Primero se para la hemorragia de hoy (trozos 1-4), sin migración.

Fecha: 30 oct 2026. Base leída: `origin/staging` en `5b9dbaed` (#1031). Escrito en la forma del estándar de planes de la Fábrica (`standards/plan.md`), sin pasar su comprobador (ver Not verified).

Origen: #1029 (el menú cojo de la casa nueva de Pablo), #958 (auditoría de Lola, clase G «1 dato, 1 sitio»), #939 (un solo registro; fases 1-4 hechas) y la conversación con Pablo del 30 oct.

## Lo desagradable primero

- **El documento único es la causa de clase de los fallos de datos.** La app guarda la casa ENTERA 1,2 s después de cada cambio (`src/App.jsx:1786-1804`), desde 145 sitios (`setData(`: 55 en `App.jsx`, 68 en `Onboarding.jsx`, 22 en otros). Lola la lee, la cambia y la vuelve a guardar entera desde 28 sitios (`api/_bot/casa.js:336` `conCasa`, 5 reintentos). Un guardado que choca o llega tras una recarga se descarta sin más (`src/lib/versionCasa.js:42-49`, `App.jsx:2005-2015`). Así se perdió hoy la marca de alergias de la casa de Pablo: la foto de `bot_deshacer` de las 07:26:09 ya no la tenía, y a las 07:46:39 la app volvió a guardar sin ella.
- **Sin esa marca el motor esquiva los 14 alérgenos** (`src/lib/alergias.js:89-93`, decidido el 8 oct, #107) y se queda con 27 recetas (0 de pescado, 0 de huevo; reproducido con los datos de la casa): 5 huecos vacíos (`_warnings` de la semana), que nadie enseña (`api/_bot/generar.js:325` solo mira que haya un plato; `api/_bot/turno.js:207` dice «¡Menú listo!»). **25 de las 32 casas con personas tienen a alguien sin la marca; en 24 nadie la tiene.** Pablo decide (30 oct) no repoblarlas: se les vuelve a preguntar.
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

Todo dato de una ficha lleva el mismo **sobre**: `valor`, `origen` (es el estado: `por_defecto` → vacío con defecto, `supuesto`, `visto` → aprendido, `dicho` → confirmado, `derivado`, `delegado`, `no_quiere_decirlo`), `canal` (app/telegram/whatsapp/sistema), `dicho_by`, `confirmado_at`, y los nuevos `peso` (contador que olvida), `caduca_at` y `actualizado_at`. Lo define una vez el catálogo (trozo 5): para cada eje, **ficha**, tipo y vocabulario (con «otro» y nota), **defecto**, si se puede **suponer**, si es **mínimo para generar**, **caduca_dias**, **peso_menu** (cuánto cambia el menú: el orden de las preguntas), **politica** de pregunta, quién **escribe** y la regla de **choque** (`ultimo_gana` | `mas_restrictivo` | `suma`).

| Ficha | Clave | Campos (hechos) | Caduca | Dónde (al cerrar su tramo) |
|---|---|---|---|---|
| **Persona** | casa + persona | nombre, rol en casa, nacimiento o edad, avatar, color, no_es_bebe; **salud**: alergias (14 + otro con nota), intolerancias, estados con `hasta`, perfiles de salud, peso, altura | casi nunca; alergias nunca se suponen | `persona`, `persona_alergia`, `persona_intolerancia`, `persona_estado`, `persona_perfil_salud` + sobre |
| **Grupo** | casa + grupo | nombre, color, orden, personas | derivado del modelo salvo que se toque a mano | `grupo`, `grupo_persona` |
| **Casa** | casa | modelo de menú, aparatos, nivel de cocina, súper, presupuesto, quiere precios, uso de la despensa, cotitulares, quién soy por cuenta | meses | `sobre` (campo de la casa) |
| **Rutina** | casa (+ persona, día, comida) | comidas que se planifican (con aperitivo), estructura comida/cena, quién come dónde cada día y comida, tiempo entre semana y finde, tanda y su día, días de la semana que se planifican, menú del cole y cena de los niños | semanas | `sobre` con ámbito |
| **Gusto** | casa o persona o grupo + eje | eje (proteína, base, cocina, técnica, picante, plato, familia…) + valor + postura (`siempre`/`mas`/`menos`/`nunca`) + ámbito (días, comidas, desde, hasta) + salvedad | continuo; supuesto 90 d, visto 180 d (como la libreta) | tabla `gusto` (trozo 14) |
| **Regla temporal** | casa + regla | sujeto, ámbito, vigencia, efecto (excluir/presente/sesgo), salvedad | días | hoy `data.reglas`; pasa a `gusto` con vigencia (sesgo/excluir) y a Rutina (presente) |
| **Trato con Lola** | **cuenta** (user_id) | ritmo (`directo`/`guiado`), profundidad al generar (`nada`/`poco`/`mucho`), fotos, largo de mensaje, idioma | continuo; aprendido por señales | `sobre` con `persona_id` = la persona de esa cuenta |
| **Semana** | casa + lunes | días activos, huecos (día × comida × plato) con receta, comensales y **sobre por hueco** (quién lo cambió, cuándo, canal) | cada semana | `user_menu_weeks.plan` (documento por semana, como hoy) |
| **Compra** | casa + lunes | derivada del menú + marcas por artículo: añadido a mano, tachado, en casa, quitado | diario | `user_menu_weeks.shopping` = marcas; la lista se calcula |
| **Despensa** | casa + artículo | lo que hay, cantidad, dónde, caducidad | diario | `user_pantry` (ya) |
| **Receta propia / carpeta / voto** | persona (cuenta) | recetas, carpetas, colecciones, votos, descartes | cuando se toca | `user_recipes`, `recipe_folders`, `recipe_collections`, `recipe_votes`, `household_favorites`, `household_recipe_discards` (ya); fuera del documento |
| **Tarea de Lola** | casa + tarea | tipo (`falta_saber`/`espera`/`decision`/`seguimiento`), campo, persona, vence, estado | diario | `bot_tareas` (ya); se generan desde el catálogo |
| **Señal** | casa o cuenta + eje + valor | peso con decaimiento, última vez, veces | continuo | tabla `senal` (trozo 15); al pasar un umbral escribe un sobre `visto` |

## Cómo se escribe y cómo se lee

- **Una sola función de escritura** para la app y Lola: `escribirDato({casa, persona, campo, valor, origen, canal, ref})` → RPC `escribir_dato` (trozo 7-8). Escribe la fila, aplica la regla de choque del catálogo, sube `bot_rev` (para que lo de hoy siga funcionando) y devuelve el sobre. Al momento, sin espera de 1,2 s. En la app, con cola en localStorage y reintento al volver la red; si la RPC no existe (la rama se despliega antes que la migración), plan B: escribe en el documento como hoy y lo dice en el log.
- **Choque por dato, no por casa:** `ultimo_gana` (casi todo), `mas_restrictivo` (salud: añadir una alergia gana a quitarla en el mismo minuto), `suma` (señales).
- **Lectura compacta:** `ficha_casa()` v2 devuelve, por ficha, cada dato con su sobre (trozo 9). La ficha de Lola y el asistente de la app leen de ahí el estado: vacío, por defecto, supuesto, aprendido, dicho. Lo que no cabe se resume (los topes de `specs/ficha-de-la-casa.md` se mantienen).
- **Mínimos para generar** (decisión B): quién come, alergias dichas (o por silencio con aviso, #229) y días. Sin ellos, no se genera: se pregunta.
- **La app se entera al momento** con Realtime de Supabase sobre `household_state.bot_rev` y `sobre` (trozo 20), y deja el sondeo de 20 s.
- **Cada tramo cierra entero:** la clave vieja sale del documento y del registro en el último trozo del tramo. Nunca quedan dos sitios vivos para el mismo dato (hoy hay 10 copias por haberlo hecho a medias).

## Tramos

| Tramo | Trozos | Migración | Qué cierra |
|---|---|---|---|
| 0 Parar la hemorragia | 1-4 | no | marca al momento, mínimos, huecos vacíos a la vista, motor solo días activos |
| 1 Catálogo único | 5-6 | no | el registro con las columnas del eje; los 139 datos clasificados por ficha y clase |
| 2 La fila con sobre | 7-9 | 0105 | `escribir_dato`, `escribirDato`, `ficha_casa` v2, estado por dato en la app y en Lola |
| 3 Persona y salud | 10-11 | 0106 | salud y personas como fuente; fuera `members`, `groups` y el trigger 0089 |
| 4 Casa y rutina | 12-13 | no | aparatos, súper, presupuesto, despensa, comidas, estructura, horario, tiempo, tanda |
| 5 Gustos y señales | 14-15 | 0107, 0108 | libreta y reglas → `gusto`; contadores que olvidan |
| 6 Trato y preguntas | 16-17 | no | ficha Trato; una sola «siguiente pregunta»; la guía tras el alta (#1028) |
| 7 Semana, compra, tiempo real | 18-20 | no | sobre por hueco, compra derivada + marcas, aperitivo, Realtime, fin del guardado entero |
| 8 Recetas, historiales, cierre | 21-22 | 0109 | fuera recetas y carpetas del documento; historiales con poda; `data` vacío |

Cifras que bajan, medidas al cerrar cada tramo: claves vivas en `household_state.state.data` (hoy 113 registradas + 26 sin declarar → 0), `copia` (10 → 0), `sin_tabular` (54 → 0), `lola_no_lo_ve` (22 → 0), casas nuevas con alguien sin marca de alergias tras el alta (→ 0), semanas vivas con huecos esperados vacíos sin aviso (→ 0), respuestas de Lola que contradicen el estado (17 % en #958 → se vuelve a medir).

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
Blocked by: B
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
Existing: `git grep -n -i "planHuecos\|huecosEsperados\|huecos_esperados" -- src api` → sin salida. `generar.js:325` solo comprueba `planHasDishes`; los huecos sin plato se tiran con una nota en `plan._warnings` (`src/lib/aiPlanner.js:1637-1651`) que ningún mensaje lee; la vía rápida pinta «¡Menú listo!» (`api/_bot/turno.js:207`). En la semana del 30 oct de la casa de Pablo: 5 huecos vacíos y 9 avisos sin enseñar.
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
Depends on: none
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

### 7. Migración 0105: el sobre gana estado de uso, el registro sus columnas nuevas, y nacen `escribir_dato` y `ficha_casa` v2
Files: `supabase/migrations/0105_dato_con_sobre.sql`, `supabase/ESTADO.md`, `src/lib/registroCampos.test.js`, `scripts/lib/columnasVocabulario.mjs`, `src/lib/vocabularios.test.js`
Depends on: 5
Blocked by: none
Existing: `sobre` (0097:132-153) no tiene `peso`, `caduca_at` ni `actualizado_at`; `registro_campo` (0097:74) no tiene `ficha`, `defecto`, `minimo_para_generar`, `peso_menu`, `escribe` ni `choque`; `git grep -n "escribir_dato" -- supabase` → sin salida; `ficha_casa` es v1 (0097:241). `ls supabase/migrations | tail -1` → `0104_…`; `gh pr list --state open --search 0105` → 0 PR. El trigger `sobre_valor_valido` (0097:173) ya comprueba tipo y rango contra `registro_campo`: la regla de choque y el vocabulario entran ahí.
Not done: nadie la llama todavía (trozo 8); no toca `persona` ni el trigger 0089 (trozo 11). La aplica Pablo (ensayo y `--si`, regla `migraciones`): el trozo deja el comando y la línea `-- AUDITADA` la pone quien la revise. `registro_campo` se regenera entero desde el registro (como la 0097) y el test de paridad compara el INSERT de la 0105. Sin `cambio` (historial de cada cambio): decidido (Pablo, 30 oct) que los contadores sustituyen al historial; el sobre guarda el último cambio.
Done:
```sh
node scripts/apply-migration.mjs 0105_dato_con_sobre && npx vitest run supabase/principios.test.js src/lib/vocabularios.test.js src/lib/registroCampos.test.js supabase/migrations.test.js
```

### 8. `escribirDato`: una sola función para la app y Lola, al momento, con cola, choque por dato y plan B
Files: `src/lib/escribirDato.js`, `src/lib/escribirDato.test.js`, `api/_bot/datos.js`, `api/_bot/datos.test.js`, `src/server/botCore.js`
Depends on: 7
Blocked by: none
Existing: `git grep -n "escribirDato\|escribir_dato" -- src api` → sin salida. Hoy la app escribe el documento entero con `save_household_state` (`src/lib/householdState.js:72`, 0068:22) y Lola con `bot_save_casa` (`api/_bot/casa.js:159`, 0057:124); las dos suben `bot_rev`. La cola de guardados de la app (`src/lib/versionCasa.js:24`, `enColaDeCasa`) sirve de base para la cola nueva.
Not done: ningún dato pasa todavía por aquí (tramos 3-6 van moviendo escritores). No sustituye `save_household_state` ni `bot_save_casa` para lo que siga en el documento. La cola de la app guarda lo pendiente en localStorage y reintenta al volver la red; lo que lleve más de 24 h pendiente se dice (principio 3), no se tira. Plan B si la RPC no existe (rama desplegada antes que la migración): escribe en el documento como hoy y lo apunta en el log con la clase `rpc_ausente`.
Done:
```sh
npx vitest run src/lib/escribirDato.test.js api/_bot/datos.test.js
```

### 9. Leer la ficha con estado: `ficha_casa` v2 en Lola y en el asistente de la app, con vacío, por defecto, supuesto, aprendido o dicho por dato
Files: `src/lib/estadoDeDato.js`, `src/lib/estadoDeDato.test.js`, `api/_bot/fichaRpc.js`, `api/_bot/fichaRpc.test.js`, `api/_bot/ficha.js`, `api/_bot/ficha.test.js`, `src/lib/wizardRegistry.js`, `src/lib/wizardRegistry.test.js`
Depends on: 7, 8
Blocked by: none
Existing: `fichaRpc.js` lee el contrato v1 (personas, faltan, tareas, callados) tras `BOT_FICHA_RPC`; la ficha marca Dicho/Supuesto solo con `matizDe` de la libreta (`ficha.js:284-344`); el asistente distingue vacío/inferido/delegado/fijado solo en la libreta (`wizardRegistry.js:651`) y en `data` solo vacío/fijado (`:645-649`). `git grep -n "estadoDeDato" -- src api` → sin salida.
Not done: ninguna pantalla nueva en la app (regla `ui`: cambios mínimos; el asistente ya pinta `por-tocar`/`aclaracion`/`aclarado`). El analista nocturno no (trozo 15). Si `ficha_casa` v2 no está (migración sin aplicar), se lee como hoy y queda en el log, como ya hace `fichaRpc.js`. Los topes de tokens de la ficha (`specs/ficha-de-la-casa.md`, 450) no cambian: el estado se marca con la leyenda de `conocimiento.md`.
Done:
```sh
npx vitest run src/lib/estadoDeDato.test.js api/_bot/fichaRpc.test.js api/_bot/ficha.test.js src/lib/wizardRegistry.test.js
```

### 10. Salud por persona: alergias, intolerancias, estados y perfiles se escriben en sus tablas desde la app y Lola, y se leen de ahí
Files: `src/screens/Onboarding.jsx`, `src/screens/Settings.jsx`, `api/_bot/ajustes.js`, `api/_bot/silencio.js`, `api/_bot/casa.js`, `src/lib/alergias.js`, `src/lib/alergiasBase.js`, `src/lib/vocabularios.js`, `src/lib/salud.test.js`
Depends on: 1, 9
Blocked by: none
Existing: hoy `members[].allergies`, `intolerances`, `dietaryStates` (+`dietaryStatesMeta.hasta`) y `healthProfiles` viven en el JSON y el trigger 0089 los copia a `persona_alergia`, `persona_intolerancia`, `persona_estado` y `persona_perfil_salud` (0089:106). Lectores: `alergiasParaMenu` (`alergias.js:89`), la ficha (`ficha.js:180-235`), `buscar_recetas`. Los vocabularios `alergenos` y `estados` siguen pendientes (`registroCampos.js:57`). #958 G: «salud en dos sitios».
Not done: durante este trozo el documento sigue llevando la copia (doble escritura corta, con la fila como fuente al leer); la quita el trozo 11. No cambia qué es una alergia ni la regla de los 14 (`alergiasParaMenu` pasa a leer `persona.alergias_revisadas` y las filas). La regla de choque de salud es `mas_restrictivo`: añadir gana a quitar en el mismo minuto. Cierra el hueco #958 A «no tiene alergias no quita las que había».
Done:
```sh
npx vitest run src/lib/salud.test.js src/lib/alergias.test.js src/lib/alergiasMenu.test.js src/lib/alergiasSilencio.test.js api/_bot/ficha.test.js
```

### 11. Persona y grupo como fuente: nombre, rol, nacimiento, avatar, color y pertenencia en sus tablas; fuera `data.members`, `data.groups` y el trigger 0089
Files: `supabase/migrations/0106_persona_fuente.sql`, `supabase/ESTADO.md`, `src/lib/personas.js`, `src/lib/personas.test.js`, `src/App.jsx`, `src/screens/Onboarding.jsx`, `api/_bot/ajustes.js`, `api/_bot/casa.js`, `src/lib/registroFicha.js`
Depends on: 10
Blocked by: none
Existing: `persona` y `grupo` existen (0079) y los rellena el trigger desde el JSON (0089:220-263; `personasTabla.js` es su gemelo en JS). `members` se lee en 116 sitios de `Onboarding.jsx`, 74 de `App.jsx`, 28 de `ajustes.js` y 6 de `ficha.js` (`git grep -c "members"`). `groups` se recalcula ya al leer en `generar.js:280-290` (`groupsFromModel`).
Not done: los ids de persona siguen en `text` (transición a uuid en `supabase/PENDIENTES.md`, aparte). Los invitados de las reglas (`invitado: true`) no son personas. La app y Lola reciben `members`/`groups` como una **vista calculada** al cargar la casa (`personas.js`), para no reescribir los 224 lectores de golpe; lo que cambia es que nadie los escribe en el documento y el inventario los marca `derivado`. La 0106 apaga el trigger y la aplica Pablo.
Done:
```sh
node scripts/apply-migration.mjs 0106_persona_fuente && npx vitest run src/lib/personas.test.js src/lib/quitarPersona.test.js api/_bot/ajustesCantidad.test.js && npm run -s ficha:inventario
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

### 14. Gusto con ámbito: la libreta y los sesgos de las reglas pasan a la tabla `gusto` (quién, eje, valor, postura, días, comidas, vigencia, salvedad, origen, peso)
Files: `supabase/migrations/0107_gusto.sql`, `supabase/ESTADO.md`, `src/lib/gustos.js`, `src/lib/gustos.test.js`, `src/lib/notepad.js`, `src/lib/notepadFields.js`, `src/lib/libretaEnData.js`, `src/lib/reglas.js`, `api/_bot/ajustes.js`, `src/components/wizard/useWizardMenu.jsx`
Depends on: 13
Blocked by: none
Existing: la libreta guarda por clave `valor`, `origen`, `fuente` (dicho/visto/supuesto), `desde`, `hasta`, `rechazos` (`src/lib/notepad.js:54-75`) pero su ámbito es solo `todos|ninos|adultos|bebes` × `ambos|comida|cena` (`notepadFields.js`): no hay persona ni días («me gusta la china solo los findes» no cabe; la cabecera de `notepadFields.js` lo dice). Las reglas sí tienen sujeto, ámbito, vigencia y salvedad (`reglas.js:249`), con efectos `excluir|presente|sesgo`. `git grep -n -i "create table.*gusto" -- supabase` → sin salida.
Not done: favoritas, descartes y votos siguen en sus tablas y los lee el motor como hoy; el trozo 15 los convierte en señales. Las reglas `presente` (quién come dónde un día) van a Rutina (trozo 13), no aquí. La proyección a `freqs`/`reparto`/`sesgos` (`libretaEnData.js`) se calcula al leer desde `gusto` y deja de guardarse (eran 6 de las 10 copias). Lo que escriba alguien a mano y no case con un valor cae en `otro` con nota, y el inventario cuenta cuántos `otro` hay por eje (de ahí salen los valores nuevos).
Done:
```sh
node scripts/apply-migration.mjs 0107_gusto && npx vitest run src/lib/gustos.test.js src/lib/notepad.test.js src/lib/notepadMatices.test.js src/lib/reglas.test.js
```

### 15. Señales que olvidan: contadores por casa o cuenta × eje × valor con decaimiento, umbral a «aprendido», y lo que los alimenta
Files: `supabase/migrations/0108_senal.sql`, `supabase/ESTADO.md`, `src/lib/senales.js`, `src/lib/senales.test.js`, `api/_bot/menu.js`, `api/_bot/turno.js`, `src/App.jsx`, `src/lib/registroFicha.js`
Depends on: 14
Blocked by: none
Existing: no hay ningún contador: ni veces cocinado, ni tasa de aceptación, ni pesos aprendidos (`git grep -n -i "decaimiento\|semivida\|half-life" -- src/lib api/_bot` → sin salida salvo comentarios ajenos). `household_recipe_discards` lleva `cooldown_until` fijo de 7 o 14 días (`App.jsx:3938-3955`); `receta_descartes` (0102) no tiene lector en `src`/`api`; `recipe_votes` es un voto por persona sin agregación. `specs/ficha-de-la-casa.md` §4 describe el «analista» como tabla con vocabularios cerrados: esto lo sustituye con contadores en vez de una pasada nocturna.
Not done: una fila por (casa o cuenta, eje, valor), nunca una por evento (Pablo, 30 oct: eso crece sin tope). El decaimiento lo aplica `pg_cron` de noche (como `bot-retencion` en 0065:47). Al pasar el umbral se escribe un sobre `visto` en Gusto o en Trato; al bajar, se retira. Alimentan: cambiar plato (eje del plato que sale y del que entra), votos, descartes, «hazlo ya» frente a «afinemos», fotos pedidas. No escribe nunca en salud ni en lo `dicho` (regla de oro de la spec).
Done:
```sh
node scripts/apply-migration.mjs 0108_senal && npx vitest run src/lib/senales.test.js api/_bot/menu.test.js
```

### 16. Ficha Trato, por cuenta: ritmo, profundidad al generar, fotos y largo, con defecto, lo dicho y lo aprendido; Lola la lee en cada turno
Files: `src/lib/registroFicha.js`, `api/_bot/trato.js`, `api/_bot/trato.test.js`, `api/_bot/agente.js`, `api/_bot/conocimiento.md`, `api/_bot/turno.js`
Depends on: 2, 15
Blocked by: none
Existing: `git grep -n -i "\btrato\b" -- api/_bot src/lib` → solo tres comentarios ajenos; no hay ningún dato de cómo quiere cada persona que le hable Lola. El idioma se detecta por mensaje (`conQuienEscribe`). `ritmo_cocina` existe en `vocabularios.js` y es otra cosa.
Not done: el trato es de la **cuenta** (`user_id`, con la persona de esa cuenta), no de la persona: los niños no tienen cuenta y la pareja puede querer otro ritmo (Pablo, 30 oct). Defectos: ritmo `guiado`, profundidad `preguntar` (la pregunta del trozo 17), fotos `si`, largo `corto`. Las fotos del menú en Telegram (#1030) son otro trozo: aquí solo se guarda si las quiere. Evals de nivel pr por tocar `conocimiento.md`.
Done:
```sh
npx vitest run api/_bot/trato.test.js api/_bot/agenteRehacer.test.js && node scripts/bot-evals.mjs --nivel=pr
```

### 17. Qué preguntar y cuándo: una sola «siguiente pregunta» del catálogo para la app y Lola, y la guía tras el alta (#1028)
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
Files: `src/lib/compraMarcas.js`, `src/lib/compraMarcas.test.js`, `src/lib/shoppingBuilder.js`, `src/lib/menuArchive.js`, `api/_bot/menu.js`, `src/App.jsx`, `src/screens/Shopping.jsx`
Depends on: 4, 15
Blocked by: none
Existing: la compra se guarda como lista generada + lo apuntado a mano mezclados (`user_menu_weeks.shopping`, `compraDeLaSemanaNueva` en `generar.js:186`); rehacer la semana pierde «comprado» y «en casa», y lo apuntado a mano queda en dos listas (#958 E); al cambiar un plato se regenera la lista entera. Un hueco del plan no dice quién lo cambió ni cuándo. `git grep -n "compraMarcas" -- src api` → sin salida.
Not done: el formato del plan por semana se queda (documento por semana, decidido): solo gana `sobre` por hueco (quién, cuándo, canal) y `shopping` pasa a ser **solo marcas** por artículo; la lista se calcula del menú + marcas al leer, en la app y en Lola, con `buildShoppingList` (trozo 4). Quitar algo no rehace nada: es una marca `quitado`. No toca Mercadona ni los precios.
Done:
```sh
npx vitest run src/lib/compraMarcas.test.js src/lib/shoppingBuilder.test.js api/_bot/menu.test.js
```

### 19. El aperitivo es una franja que se puede planificar desde la pizarra y desde Lola
Files: `src/lib/comidas.js`, `src/lib/planner.js`, `src/lib/aiPlanner.js`, `src/screens/PizarraControles.jsx`, `api/_bot/ajustes.js`, `src/lib/aperitivo.test.js`
Depends on: 4, 13
Blocked by: none
Existing: `Aperitivo` está en `COMIDAS` con `tipo: "futuro"` y sinónimos (`src/lib/comidas.js:35-37`), `COMIDAS_PLANIFICABLES` lo excluye (`:63`) y `ALL_DAY_MEALS` del motor es `Desayuno, Comida, Cena` (`src/lib/planner.js:13`). Pablo (30 oct): llegar desde la pizarra a un menú con aperitivos algún día.
Not done: el aperitivo es una franja `extra` (como merienda o postre): un plato, pool de recetas con `mealRole` aperitivo, sin cuota. Si el catálogo estrella no tiene recetas de aperitivo, error y no relleno (regla `catalogo`). Solo los días que se pida (el ámbito del dato de Rutina lo permite tras el trozo 13).
Done:
```sh
npx vitest run src/lib/aperitivo.test.js src/lib/comidas.test.js src/lib/aiPlanner.test.js
```

### 20. La app se entera al momento: Realtime en vez del sondeo de 20 s, y el guardado por dato sustituye al documento entero
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
Files: `supabase/migrations/0109_historiales.sql`, `supabase/ESTADO.md`, `src/App.jsx`, `src/lib/historial.js`, `src/lib/historial.test.js`, `src/lib/marcasLocales.js`, `src/lib/registroFicha.js`, `scripts/lib/inventarioFicha.mjs`
Depends on: 21
Blocked by: none
Existing: `menuHistory`, `cookedDishes`, `priceObs`, `receipts`, `cookedDeltas`, `pantryGenDeltas`/`pantryDayDeltas` viven en `data` y crecen sin poda (`aiRecipes` llegó a 137 en una casa, #958 E); las marcas `expertMode`, `modePrompted`, `pantryPrefsSeen`, `useBirthDate`, `manualSlotType` son `interfaz` en el registro. `git grep -n "marcasLocales\|lib/historial" -- src` → sin salida.
Not done: no borra `household_state` ni la columna `state`: queda como documento vacío (`{}`) hasta que una migración posterior la retire, cuando `npm run consulta` confirme 0 claves en todas las casas durante un mes. Poda: 90 días para precios y tickets, 1 año para cocinados (en la migración, con `pg_cron`).
Done:
```sh
node scripts/apply-migration.mjs 0109_historiales && npx vitest run src/lib/historial.test.js src/lib/marcasLocales.test.js && npm run -s ficha:inventario
```

## Decisions for Pablo

### B. Sin alergias confirmadas (ni dichas ni por silencio), ¿Lola genera el menú?
Por qué te lo pregunto: el 8 oct decidiste lo contrario (#107: se genera esquivando los 14 alérgenos y se pregunta); hoy ese modo dio un menú con 27 recetas y huecos vacíos. Cambiarlo es cambiar lo que la familia vive la primera vez.
1. No se genera: Lola pregunta primero las alergias (la app ya lo hace en el alta) y genera al saberlas. Coste: una pregunta más antes del primer menú en el chat (recommended)
2. Se genera esquivando los 14, como hoy, pero diciendo que el menú es corto por eso y preguntando a la vez. Coste: el primer menú sigue siendo pobre
3. Se genera con lo dicho (sin esquivar) y se pregunta después. Coste: un alérgeno puede salir en el primer menú; va contra el principio de seguridad de la ficha

## Decisions taken

- principio 4 | eligió: extender `sobre` y `registro_campo` de la 0097 (ya diseñadas para esto) con las columnas que faltan | descartó: una tabla `dato` nueva al lado de `sobre`, o un JSON por ficha | motivo: decidido
- principio 4 | eligió: una tabla genérica con sobre para los ejes de casa, rutina, gusto y trato, validada contra el catálogo (trigger `sobre_valor_valido` + JS), y columnas fijas solo para persona, salud y grupo | descartó: una columna por eje (una migración por eje nuevo, que aplica Pablo) | motivo: decidido
- principio 5 | eligió: contadores con decaimiento, una fila por (casa o cuenta, eje, valor) | descartó: una fila por cada cambio (crece sin tope y pide poda; Pablo, 30 oct) | motivo: decidido
- principio 4 | eligió: el trato con Lola por cuenta (`user_id`) | descartó: por persona (los niños no tienen cuenta) o por casa (la pareja puede querer otro ritmo) | motivo: decidido
- principio 3 | eligió: generar dice qué hueco esperado se queda vacío, en Lola y en la vía rápida | descartó: seguir guardando `_warnings` sin lector | motivo: decidido
- principio 4 | eligió: menú y compra como documento por semana, con sobre por hueco y la compra calculada del menú más marcas | descartó: una fila por hueco (el menú se genera y se cambia entero) o rehacer la lista al quitar un artículo | motivo: decidido
- principio 1 | eligió: las 24 casas sin marca de alergias no se repueblan por script: se les vuelve a preguntar | descartó: marcarlas revisadas de oficio | motivo: decidido
- principio 5 | eligió: cada tramo cierra con la clave vieja fuera del documento y el inventario a cero; doble escritura solo dentro de un tramo | descartó: dejar la copia vieja «por si acaso» (hoy hay 10 así) | motivo: decidido
- principio 2 | eligió: Realtime de Supabase para que la app se entere, con el sondeo de 20 s como plan B y la cifra de escrituras medida antes de quitar el documento | descartó: sondear más a menudo (más lecturas, sin medir) | motivo: decidido
- principio 6 | eligió: una sola pregunta a Pablo (B), porque revierte una decisión suya del 8 oct; el resto de elecciones de diseño se toman y se apuntan aquí | descartó: preguntar dónde viven los ejes o si va Realtime, que no están en la lista cerrada | motivo: decidido
- principio 4 | eligió: `persona`/`grupo` como fuente y `members`/`groups` como vista calculada al cargar, para no reescribir 224 lectores de golpe | descartó: reescribir los lectores en el mismo trozo | motivo: decidido

## Not verified

- Supabase Realtime activo en el proyecto `mdzwbrworucnummibxrq` y el tope de conexiones del plan: `ops/INVENTARIO.md` no lo dice y no lo he mirado en el panel. El trozo 20 lo comprueba antes y deja el sondeo como plan B.
- El alta de Pablo del 30 oct no se ha reproducido en un navegador (no hay cuenta de prueba): la explicación del trozo 1 sale del código (`App.jsx:1786-1804`, `versionCasa.js:42-49`, `App.jsx:2005-2015`) y de los datos (`bot_deshacer` 07:26:09 sin marca; `persona.updated_at` 07:46:39 sin marca). No sé qué disparó la recarga en ese segundo.
- Este fichero no ha pasado `node scripts/check-plan.mjs --file` de la Fábrica: la guardia de esta sesión no deja copiar ni ejecutar nada de `C:\dev\fabrica` (`cp` y `cat >` negados). La forma (campos, numeración, decisiones, Done cerrado) se ha seguido a mano.
- Cuántas escrituras por minuto hará la app guardando por dato, y su coste: sin medir; lo mide el trozo 20.
- Que `bot_save_casa`, `save_household_state` y `escribir_dato` convivan sin pisarse en la doble escritura de un tramo: el diseño los hace subir el mismo `bot_rev`, pero no está probado contra la base.
- Los números 0105-0109 están libres hoy (`ls supabase/migrations | tail -1` → 0104; `gh pr list --search 0105` → 0); cada trozo los vuelve a comprobar al construirse.
- Las cifras 25/32 y 24/32 son sobre casas con al menos una persona; hay 37 casas (5 sin personas). La de «respuestas que contradicen el estado» (17 %) es la de #958 del 28 oct, no medida hoy.
- Tests que los Done nombran: los que ya existen se comprobaron con `ls` (`aiPlanner`, `menu`, `tareas`, `recipeCollections`, `userRecipesSync`, `recetas`, `shoppingBuilder`, `comidas`, `semanaDias`, `reglas`, `quitarPersona`, `link`, `vocabularios`, `principios`, `migrations`, `ajustesCantidad`, `agenteRehacer`, `menusSync`). Los nuevos (`altaGuardada`, `minimosParaGenerar`, `huecosDelPlan`, `diasActivos`, `escribirDato`, `datos`, `estadoDeDato`, `salud`, `personas`, `casaDatos`, `rutina`, `gustos`, `senales`, `trato`, `siguientePregunta`, `compraMarcas`, `aperitivo`, `realtimeCasa`, `recetasFuente`, `historial`, `marcasLocales`, `scripts/lib/inventarioFicha.test.js`) los crea su trozo y su PR trae el rojo antes. `estructuraPlatos.test.js` está en la rama `datos/estructura-efectiva` (29 oct), aún sin PR.
