# N0 — Principios de las entidades

Este documento es la ley de partida de todas las entidades de MenuPlan. Lo
leen las forjas de cada entidad (el nivel N1) antes de escribir nada. Vale
para los tres ejes: **horizontal** (cómo trabajamos), **vertical** (el
producto HoMenu) y **bridge**, o puente (lo que cruza los dos). Cada eje solo
añade extensiones. Ningún eje tiene excepciones.

La lista de entidades está en `ops/entidades.json` y su mapa en
[MAPA.md](MAPA.md). Una **entidad** es una cosa con id estable y definición
propia. Un **eje** es el bloque al que pertenece: horizontal, vertical o puente.

## Cómo se marca cada afirmación

Cada principio lleva su fuente con una marca:

- **[F]**: lo dice la fuente citada, que se leyó o se resumió en la búsqueda del 11 oct 2026.
- **[S]**: es inferencia nuestra. Nadie externo lo afirma así.

Una cifra «antes» sale de las auditorías del 11 oct 2026 sobre `staging`.
Dice con qué comando se mide o de quién es. Después de cada arreglo se mide
la misma cifra. Una cifra que no se pudo reproducir no se cita.

## Cómo se leen los niveles

Hay cuatro niveles. Cada uno obedece al anterior.

| Nivel | Qué es | A qué ley obedece | Estado |
|---|---|---|---|
| **N0** | Principios que valen para toda entidad: este documento. | `CLAUDE.md` y los hooks. Si chocan, manda el hook. | Escrito |
| **Extensión de la base (vertical)** | Cómo son las tablas: fechas (§9), migraciones (§10), nombres (§12) y quién cambia (§18) de `docs/datos/PRINCIPIOS.md`. Lo vigila `supabase/principios.test.js`. [F] | N0. Es la extensión del eje vertical para la base. | Escrito |
| **N1** | La forja de una entidad: su id, sus campos, sus vocabularios, su ciclo de vida y su registro. Uno por entidad. | N0, más las extensiones de su eje. | Por escribir |
| **N2** | Los tipos de una entidad (los tipos de skill, los tipos de issue). | Su N1. | Por escribir |
| **N3** | Los tipos específicos dentro de un tipo (un tipo concreto de evento, de norma, de plano). | Su N2. | Por escribir |

Estos niveles no son los niveles de una skill ni los niveles de los planos.
Son solo de este bloque. Cinco reglas:

1. Un nivel inferior cumple todo lo del superior. No lo repite: lo cita por su número.
2. Un nivel inferior puede **añadir** campos, controles o vocabularios. Eso es una extensión.
3. Un nivel inferior no puede **quitar ni relajar** nada del superior. Eso sería una excepción y no existe.
4. Si un nivel inferior choca con el superior, se corrige el inferior.
5. Si el superior está mal, se corrige el superior con una fila en `ops/DECISIONES.md`. Después se revisan los inferiores.

Una extensión de eje es, por ejemplo, que una entidad vertical lleve
`household_id` (la casa), o que una horizontal lleve su `dueno`. Cada
extensión nombra el principio de N0 que desarrolla. Un puente cumple las
extensiones de los dos ejes a la vez.

Los N1, N2 y N3 no se escriben en este paso. Los sujetos de las normas y de
los estándares de agente ya se cruzan con las entidades: cada uno es una
entidad, un tipo suyo (futuro N2) o queda fuera con motivo
(`ops/entidades-sujetos.json`).

## Los principios

### 1. Un nombre por concepto y un concepto por nombre

Principio: `one-word-one-meaning` (su enunciado, en `docs/PRINCIPIOS.md`; aquí, el desarrollo).

**Desarrollo.** Cada concepto tiene un solo nombre en todo el proyecto. Cada nombre significa un solo concepto. Dos conceptos distintos nunca comparten nombre. Si hay que distinguir, se crea un nombre nuevo. La traducción entre castellano e inglés vive en un solo sitio: el campo `en` de la ficha del glosario.

**Por qué.** La auditoría de nomenclatura encontró «responsable» escrito de siete formas: `dueno`, `agente`, `autor`, `por`, `ejecutor`, `emisor` y `quien`. La «fecha» tiene nueve nombres: `fecha`, `fecha_utc`, `comprobado`, `comprobado_el`, `actualizado`, `calibrado_el`, `desde`, `mes` y `ts`. El escalón de un mecanismo se llama `escalon`, `barrera` y `arreglo`. En sentido contrario, «caso» significa cinco cosas, «entorno» tres y «estado» tres. No se citan recuentos de apariciones: no se pudieron reproducir.

**Cómo se comprueba.** `ops/glosario.test.js` lo vigila para los términos de proceso. `ops/entidades.test.js` exige que cada entidad con ficha tenga como id el `en` de esa ficha, y que un `en` no se repita. Falta extenderlo a los nombres de campo y de valor: cada N1 incluye su lista de campos y un test que rechaza el duplicado.

**Fuente.** [F] Google AIP-190 y AIP-140: mismo nombre para el mismo concepto, nombres distintos para conceptos distintos, también entre APIs que se usan juntas.

### 2. Los sinónimos prohibidos se escriben, una vez

Principio: `one-word-one-meaning` (su enunciado, en `docs/PRINCIPIOS.md`; aquí, el desarrollo).

**Desarrollo.** Cada concepto tiene un término preferido. Los otros nombres que se usan para él se anotan como sinónimos prohibidos en el glosario, y solo allí. Un sinónimo prohibido no se usa en ningún registro, campo, valor ni texto de proceso. Los registros de entidades los derivan del glosario; no los copian. Se distingue un sinónimo (otra palabra, mismo concepto) de una variante de escritura (misma palabra, otra forma). La variante se normaliza sin más.

**Por qué.** El glosario ya lo hace para el proceso y aun así quedan 58 apariciones prohibidas, congeladas en una lista que solo baja. Se miden con `npm run glosario -- --medir` (el 10 oct eran 78 en 46 pares; hoy son 38 pares). Fuera del glosario no hay lista. `git grep -I -o -w MenuPlan` da 424 apariciones en el repo (89 en `.md`). `HoMenu` da 466 (135 en `.md`). Nada dice cuál es cuál.

**Cómo se comprueba.** `ops/glosario.test.js` para el proceso. `ops/entidades.test.js` deriva los sinónimos de la ficha (`prohibidosDe`). Exige que ninguno sea el id de otra entidad ni el nombre de una entidad. Cada N1 usa los de su ficha.

**Fuente.** [F] ANSI/NISO Z39.19: con sinónimos se elige un término preferido y se aplica de forma uniforme y explicada (resumen de estudio, no el texto de la norma). [S] Ampliarlo a campos y valores, y derivarlo del glosario.

### 3. Valores discretos en los atributos; texto libre solo de respaldo

Principio: `discrete-first` (su enunciado, en `docs/PRINCIPIOS.md`; aquí, el desarrollo).

**Desarrollo.** Un atributo que se va a contar, filtrar o agrupar toma sus valores de un vocabulario cerrado. El texto libre se usa solo para lo que cambia a menudo o para lo que nadie va a agrupar. Un vocabulario que crece lleva un valor `otro` y el texto de respaldo al lado. Todo vocabulario lleva además un valor para lo desconocido (`desconocida`, `sin_especificar`). Un campo nunca queda vacío para decir «no sé».

**Por qué.** La auditoría de datos encontró al menos diez columnas con texto libre que son vocabulario: `persona_alergia.alergeno`, `persona_intolerancia.valor`, `persona_estado.estado`, `persona_perfil_salud.perfil`, `persona.rol_hogar`, `user_events.event`, `app_feedback.type` y `app_feedback.screen`, `household_favorites.scope`, `user_profiles.device_type` y `bot_chats.lang`. Los alérgenos tienen tres verdades distintas (`EU_ALLERGEN_IDS`, `ALLERGENS` de recetas y la tabla de alias).

**Cómo se comprueba.** Constante en JS con su test y, si el valor va a SQL, un `CHECK`. Ya es la norma de `CLAUDE.md` («Pensar en datos») y de PRINCIPIOS §4. `ops/vocabularios-vida.test.js` vigila los valores anclados, incluidos los siete vocabularios del registro de entidades (`scripts/lib/entidades.mjs`). Cada N1 enumera sus atributos discretos y su vocabulario.

**Fuente.** [F] Google AIP-126: enumeración para conjuntos que cambian poco («no más de una vez al año» como regla práctica); texto cuando el conjunto cambia a menudo; primer valor «sin especificar». [F] Protobuf y Stripe: hay enums abiertos y cerrados. [S] Cerrado para lo que fija el producto, abierto con `otro` donde el conjunto crece.

### 4. Cada entidad tiene un id estable, único y con forma

Principio: `stable-unique-id` (su enunciado, en `docs/PRINCIPIOS.md`; aquí, el desarrollo).

**Desarrollo.** Cada entidad lleva un `id` propio. Es único dentro de su registro. No cambia nunca. No se reutiliza cuando la entidad se retira. Los ids de entidad van en inglés, en minúsculas ASCII y con palabras unidas por guion (`pull-request`). Los campos de los JSON van en inglés y con guion bajo (`source_of_truth`). El N1 de su eje fija otra forma solo si lo justifica.

**Por qué.** Hoy hay al menos seis formas de id: kebab (`norm`, `module`), snake (`mechanism`, `metric`), entero (`plano`), uuid, texto con prefijo (`menu_`, `fld_`, `user_`) y `bigserial` en la base. Las migraciones repiten tres números: 0003, 0006 y 0051 (cuenta de prefijos de `supabase/migrations/`; la 0080b es un índice en `supabase/manual/`, previsto en PRINCIPIOS §10). La clave de `bot_candados` es solo `chat_id`, sin canal. `constructor` choca con `Object.prototype` como id.

**Cómo se comprueba.** El test de cada registro rechaza el id repetido o con mala forma (`ops/entidades.test.js`, `ops/normas.test.js`, `ops/mecanismos.test.js`). `supabase/migrations.test.js` vigila los números de migración. Cada N1 fija la forma de su id.

**Fuente.** [F] ISO/IEC 11179-5: la identificación garantiza la unicidad dentro de un registro (se usó un resumen, no el texto). [F] OpenTelemetry: dos atributos, métricas o eventos no deben compartir nombre. [S] La forma kebab en inglés es nuestra.

### 5. Los nombres tienen forma: caracteres, separador y espacio de nombres

Principio: `names-have-form` (su enunciado, en `docs/PRINCIPIOS.md`; aquí, el desarrollo).

**Desarrollo.** Un nombre de id, campo, valor o evento usa solo letras ASCII minúsculas, dígitos y un separador. En la base y en los campos de JSON el separador es `_`. En los ids de entidad es `-`. Un nombre de evento lleva un espacio de nombres delante (`guardia.bloqueo`). El punto lo separa. No se usan tildes ni espacios.

**Por qué.** En la base viva hay 35 índices con `idx_`, 8 con `uq_` y 18 sin prefijo conocido. Las restricciones siguen varios patrones: 54 `_check`, 10 `chk_` y 13 `_vocabulario`. Se miden con `npm run consulta` sobre `pg_indexes` (esquema `public`) y `pg_constraint`, y el auditor de datos las reprodujo el 11 oct. El texto de las migraciones da otras cifras. PRINCIPIOS §12 ya fija los prefijos `_fk`, `_vocabulario`, `uq_` e `idx_`, pero como **[revisión]**: nadie lo comprueba solo. El vocabulario del log de voz guarda `sí` con tilde.

**Cómo se comprueba.** Cada N1 trae la regex de la forma de su id y de sus campos, y su test la aplica. Para la base, el paso pendiente es convertir la revisión de §12 en una comprobación de `supabase/principios.test.js`.

**Fuente.** [F] OpenTelemetry (naming): los nombres deben limitarse a Basic Latin imprimible y deberían ir en un espacio de nombres; las herramientas lo estrechan a minúsculas, dígitos, `_` y `.`. [I] `docs/datos/PRINCIPIOS.md` §12: `snake_case` ASCII, `_at`, `_on`, `es_` e `is_` por tipo y prefijos de índices. [S] El separador `-` en ids de entidad es la costumbre de la casa.

### 6. Toda entidad tiene un registro con definición

Principio: `entity-has-registry` (su enunciado, en `docs/PRINCIPIOS.md`; aquí, el desarrollo).

**Desarrollo.** Cada entidad tiene un registro: un fichero de datos con su id, su fuente de verdad y su ficha de glosario con la definición en una frase. La definición vive en el glosario y en ningún otro sitio. Un nombre sin definición no basta. Una entidad sin registro se marca `without_registry` en `ops/entidades.json` y su N1 dice cuándo lo tendrá.

**Por qué.** La auditoría de proceso contó 11 entidades con registro propio y 11 sin él. Ese recuento no es el del JSON. `ops/entidades.json` cuenta sus 40 entidades (campo `registry`): 11 `with_registry`, 19 `partial` y 10 `without_registry`. Los servicios son una tabla en prosa de unas 22 filas sin id. En la primera versión del registro de entidades, las definiciones estaban copiadas del glosario y ya divergían en 11 casos.

**Cómo se comprueba.** `ops/entidades.test.js`: el estado del registro es de un vocabulario cerrado, una entidad `with_registry` nombra su fuente y `definition` no puede volver al JSON. La cifra se vuelve a medir cuando cambie el JSON.

**Fuente.** [F] ISO/IEC 11179-5: los nombres se completan con un registro de metadatos y con vocabularios controlados; los nombres no establecen por sí mismos equivalencia de significado. [S] Un registro por entidad y la definición solo en el glosario.

### 7. Una fuente de verdad por dato y por vocabulario

Principio: `one-fact-one-place` (su enunciado, en `docs/PRINCIPIOS.md`; aquí, el desarrollo).

**Desarrollo.** Cada dato y cada vocabulario tiene un solo lugar donde se define. Los demás sitios lo importan o lo derivan. No se copia a mano. Una copia generada se marca como derivada y un test la compara con su origen.

**Por qué.** La lista de jueces está copiada en `presupuestos.mjs:38`, `flujo.mjs:50`, `vocabularios-vida.json:22`, el glosario (`juez`) y `CLAUDE.md`. Hay dos registros llamados «métricas» (`ops/metricas.json` y `metricas[]` en `MODULOS.json`). Los precios de los modelos están en dos sitios (`ops/precios-modelos.json` y `PRECIOS` en `scripts/lib/evals.mjs`). Una decisión vive como issue y como fila de `ops/DECISIONES.md`, sin enlace. Un fondo guarda sus casos y encargos en tres sitios. `MESES` se declara seis veces (`api/_bot/ficha.js`, `memoria.js`, `pintar.js`, `rapido.js`, `src/lib/pedidoLola.js` y `src/screens/PizarraControles.jsx`). `ESTADOS_CRITERIO` existe dos veces con valores distintos (`scripts/lib/forja.mjs` y `planos.mjs`). Se miden con `git grep -n -E "(const|let) MESES"` y `git grep -n "ESTADOS_CRITERIO ="`.

**Cómo se comprueba.** Un test por cada vocabulario o dato compartido compara las copias con el origen. Cada N1 nombra la fuente de verdad de su entidad (campo `source_of_truth` de `ops/entidades.json`) y lista sus derivados. `ops/entidades.test.js` comprueba que la fuente existe en git, con las mayúsculas exactas.

**Fuente.** [I] `CLAUDE.md`: «cada dato en un solo sitio» y «ningún campo ni tabla sin lector». [I] `docs/datos/PRINCIPIOS.md` §6, «Un dato, un sitio». [S] Aplicarlo también a los vocabularios de proceso.

### 8. Todo lo que cambia lleva quién, qué y cuándo

Principio: `who-what-when` (su enunciado, en `docs/PRINCIPIOS.md`; aquí, el desarrollo).

**Desarrollo.** Todo lo que cambia deja tres datos: quién lo cambió, qué se cambió y cuándo. «Quién» es una identidad, y la identidad apunta a una persona (principio 9). «Cuándo» es un instante con zona, en UTC. «Qué» es un valor de vocabulario. Un borrado también deja rastro.

**Por qué.** Catorce de 54 tablas no tienen `created_at`. Son estas: `bot_candados`, `bot_usage`, `grupo`, `grupo_persona`, `persona_alergia`, `persona_estado`, `persona_intolerancia`, `persona_perfil_salud`, `household_state`, `user_state`, `user_profiles`, `apple_auth_tokens`, `household_members` y `recipe_collections`. La cuenta es de la auditoría de datos, tras aplicarse la 0097. El autor se escribe de ocho formas (`owner_id`, `owner_user_id`, `user_id`, `created_by`, `linked_by`, `dicho_by`, `author_id`, `reporter_id`). No queda autor en las altas y bajas de alergias, intolerancias y estados, ni al entrar o salir de la casa. Los borrados duros de despensa, menús y favoritos no dejan nada. `senales.log` no lleva fecha.

**Cómo se comprueba.** Para tablas nuevas, PRINCIPIOS §9 exige `created_at` y lo comprueba `supabase/principios.test.js` **[auto]**; las 14 de arriba son anteriores. §18 fija `created_by`, `actor` y `canal` con revisión, no con test. Para lo que no es base (logs, registros de `ops/`), cada N1 incluye los tres campos y un test que falle sin ellos.

**Fuente.** [F] W3C PROV-O (30 abr 2013): Entidad, Actividad (con inicio y fin) y Agente (quien responde). [I] `docs/datos/PRINCIPIOS.md` §9 y §18. [S] La forma «quién, qué, cuándo» en tres campos fuera de la base.

### 9. La persona y la identidad son entidades distintas

Principio: `person-vs-identity` (su enunciado, en `docs/PRINCIPIOS.md`; aquí, el desarrollo).

**Desarrollo.** Un **miembro del equipo** (`team-member`) es quien responde de lo que se hace. Una **identidad** (`identity`) es la cuenta con la que actúa el equipo: un login, una App de GitHub, una cuenta de servicio, un bot. Toda identidad apunta a un miembro del equipo, o dice que no lo tiene. Todo registro de acción guarda la identidad, no el nombre de la persona. La **persona** (`person`) es la de la casa, como en la base; no es la del equipo. La cuenta de un canal de una casa (`channel-identity`, `bot_identities`) es otra entidad, vertical.

**Por qué.** El login de Pablo está escrito en `issues.mjs`, `tokenSesion.mjs`, `buscarAntes`, `cumplimiento`, `fabricaGh`, `CODEOWNERS` (41 veces) y los workflows. El vocabulario de identidades tiene cuatro valores (`pablo`, `app`, `otra`, `desconocida`). No hay ningún enlace de identidad a persona. Hay al menos dos Apps de GitHub, cuentas de servicio de 1Password, `github-actions[bot]` y los bots de Telegram. «La sesión actuó con la identidad de Pablo» no se puede ver en ningún registro. Hasta el 11 oct, «persona» valía para el equipo y para la casa a la vez.

**Cómo se comprueba.** Por construir. El N1 de Identidad define el registro y su test cruza cada login conocido con un miembro del equipo. Mientras, `ops/entidades.test.js` vigila que las cuatro entidades existan con sus ejes.

**Fuente.** [F] W3C PROV-O: el agente es quien responde y puede ser una persona, una organización o un agente de software. [S] El nombre «identidad» para el agente de software y el enlace obligatorio a la persona. El reparto entre `team-member` y `person` es decisión de Pablo del 11 oct (opción A del auditor de datos, reversible).

### 10. Un evento lleva campos fijos

Principio: `log-what-happens` (su enunciado, en `docs/PRINCIPIOS.md`; aquí, el desarrollo).

**Desarrollo.** Todo evento se escribe con los mismos campos: `id`, `ts` (UTC), `type`, `source`, `session`, `identity` y `subject`. `type` es de un vocabulario cerrado y lleva espacio de nombres. Los datos propios del evento van aparte, con nombres propios. Un evento se escribe como `campo: valor` en una línea o como JSON, nunca mezclados en un mismo log.

**Por qué.** Hoy hay seis formatos de registro de eventos: `eventos.jsonl`, `senales.log`, `voz.log`, `gh.log`, `zonas.log` y la línea de arranque `identidad-sesion`. Hay más logs aparte: `ensayos.log`, `gasto.jsonl` y `pasadas.jsonl`, y 19 firmas de línea en `ops/metricas.json` (`lineas`). Los separadores mezclan `: ` y `=`. Solo `eventos.jsonl` lleva sesión. Ninguno lleva la identidad que actuó. El vocabulario tiene seis tipos (`skill_cargada`, `agente_lanzado`, `bloqueo_guardia`, `permiso_pedido`, `estado_sin_leer`, `aviso_guardia`).

**Cómo se comprueba.** `ops/metricas.test.js` ya vigila las formas de línea de `ops/metricas.json`. Falta un test del esquema común del evento. Lo define el N1 de Evento. Los dos eventos nuevos que pidió Pablo (operación de riesgo sin aprendizaje y aprendizaje registrado) se definen en #568; aquí solo se deja la relación `event triggers skill` y `event produces learning`.

**Fuente.** [F] CloudEvents 1.0: atributos obligatorios `id`, `source`, `specversion` y `type`; opcionales `time` (RFC 3339) y `subject`; `id` y `source` únicos por evento. [S] La lista de campos fijos de la casa (`session`, `identity`, UTC en lugar de RFC 3339). El campo se llama `identity` y no `actor`. `actor` ya es una columna de la base con otro vocabulario: usuario, bot, cron o script (PRINCIPIOS §18).

### 11. Se depreca; no se borra

Principio: `deprecate-not-delete` (su enunciado, en `docs/PRINCIPIOS.md`; aquí, el desarrollo).

**Desarrollo.** Un id, un campo, un valor o un término que deja de usarse se marca `retired` y dice qué lo sustituye (`replaced_by`). No se borra ni se reutiliza el nombre. Un retirado no vuelve a activo. Un cambio de definición que no cambia el significado se registra con su motivo.

**Por qué.** El glosario y los vocabularios ya lo hacen, y hay test. Hoy ningún término del glosario está retirado. Se mide con `ls ops/glosario/terminos | wc -l` (66 fichas en staging, 84 con las de este PR) y `grep -l '"estado": "retirado"' ops/glosario/terminos/*.json` (ninguna). En cambio, la base borra de verdad en despensa, menús y favoritos sin dejar rastro.

**Cómo se comprueba.** `ops/glosario.test.js` y `ops/vocabularios-vida.test.js` (ciclo de vida contra `origin/staging`). `ops/entidades.test.js` hace lo mismo con los ids de las entidades. Cada N1 dice cómo se retira su entidad.

**Fuente.** [F] OpenTelemetry: lo renombrado o desaconsejado se deprecia en vez de borrarse. [S] Extender la regla a ids de entidad y a filas de la base.

### 12. Un vocabulario tiene ciclo de vida

Principio: `closed-vocabulary` (su enunciado, en `docs/PRINCIPIOS.md`; aquí, el desarrollo).

**Desarrollo.** Todo vocabulario pasa por cuatro fases. **Nace**: con una definición por valor, anclada en `ops/vocabularios-vida.json`. **Vive**: un valor nuevo se añade con su definición; una definición solo cambia con una redefinición registrada. **Se retira**: un valor sin uso pasa a `retirados`, con `pasa_a` y fecha, y su nombre no se reutiliza. **Se cierra**: el vocabulario entero se retira con su motivo. Estos registros solo crecen.

**Por qué.** `ops/vocabularios-vida.json` ancla 63 vocabularios y 380 valores (cuenta de `anclados`; 56 y 327 en staging, más los 7 de este registro) y tiene un control contra `origin/staging`. Fuera de ese control quedan vocabularios duplicados. `ESTADOS_CRITERIO` está en dos sitios con valores distintos, `FUERZA_OK` (`estandaresAgentes.mjs`) frente a `FUERZAS` (`regla.mjs`), `HEALTH_FLAGS` (`recipeSchema.js` y `healthFlags.js`) y `CAMPOS` frente a `CAMPOS_TELEGRAM` (`loginTelegram.js` y `llaveLola.js`). Se encuentran con `git grep -n -E "(const|let) NOMBRE"`. La palabra «estado» tiene tres sentidos.

**Cómo se comprueba.** `ops/vocabularios-vida.test.js` y `ops/glosario.test.js`. Cada N1 enumera los vocabularios de su entidad y los ancla.

**Fuente.** [S] Mecanismo propio de la casa (`ops/vocabularios-vida.json`). Se apoya en [F] ANSI/NISO Z39.19 (término preferido, criterio aplicado de forma uniforme) y en [F] OpenTelemetry (deprecar).

### 13. Cada eje tiene su lenguaje y se traduce en la frontera

Principio: `axis-language-bridge` (su enunciado, en `docs/PRINCIPIOS.md`; aquí, el desarrollo).

**Desarrollo.** Cada eje usa su propio lenguaje dentro de su contexto. Una palabra que cruza de eje se declara puente en `ops/entidades.json`. Se define una sola vez, con su frase propia de cada lado (`role_in_axis`). Una palabra puente no cambia de significado según el eje. Si lo necesita, se parte en dos entidades con nombres distintos.

**Por qué.** «Persona» ya era dos cosas y hoy son dos entidades (`team-member` y `person`). «Evento» es un registro de hooks y una tabla del producto. «Entorno» tiene tres sentidos (entornos de Vercel, `VIGIA_ENTORNO` y environments de GitHub), y hay una sola base de datos para todos. Hoy hay diez puentes: `environment`, `deployment`, `event`, `metric`, `eval`, `judge`, `migration`, `table`, `data-source` y `module`.

**Cómo se comprueba.** `ops/entidades.test.js` exige que los puentes acordados existan con ese eje y que cada uno diga su `role_in_axis`. Exige también que `MAPA.md` y el JSON coincidan en los dos sentidos, diagrama de puentes incluido. Cada N1 de un puente trae su traducción a los dos ejes.

**Fuente.** [F] Domain-Driven Design (lenguaje ubicuo y contexto delimitado): la misma palabra puede significar cosas distintas en contextos distintos; el lenguaje se divide donde cambia y se conecta con correspondencias explícitas (a través de fuentes secundarias; el artículo original no se encontró). [S] Los tres ejes como contextos.

## Cómo se hacen cumplir

- Lo que obliga es el test, no el texto. Cada principio dice cuál es su test. Donde dice «por construir», lo trae el N1.
- Un test nuevo se ve fallar una vez antes de creérselo.
- Una norma sin test tiene veredicto blando en `ops/normas.json`, con la barrera que le falta.
- Se toma el principio y el test, no el proceso. Somos un equipo de dos o tres personas [S].

## Cómo se cambia el registro de entidades

Todo cambio va por PR con el CI en verde. Como convención, sin control que la haga cumplir, lo juzga `auditor-datos` y quien lo construye no lo juzga. La barrera real es `ops/entidades.test.js`: el procedimiento solo dice qué hacer para pasarlo.

- **Añadir una entidad.** Por analogía con la regla de parada de `ops/flujo.json` (que hoy solo aplica a catálogo, skill y agente): se usa dos veces o más, no repite otra y tiene dueño, que es su `source_of_truth`. Sin control. Pasos que sí exige el test:
  - Fila en `ops/entidades.json` con `id`, `name`, `axis`, `term`, `source_of_truth`, `id_format`, `registry` y `status`, y al menos una relación.
  - `term` apunta a una ficha del glosario con `en` igual al id (solo una vertical puede no llevar `term`).
  - Fila y flecha en `docs/entidades/MAPA.md`, y la cifra «Hoy hay N entidades» al día.
  - Si su nombre se usa en los dos ejes, es un puente: lleva `role_in_axis`, flecha en el diagrama de puentes, clase `puente` y su sitio en la lista `PUENTES` del test. Una relación entre ejes distintos va también al diagrama de puentes.
- **Añadir un tipo o un tipo específico (N2, N3).** No es una entidad: es un valor de un vocabulario cerrado de su entidad (principio 12). Anclarlo en `ops/vocabularios-vida.json` es lo correcto, pero hoy nada lo exige y el vocabulario de `recorded_in` aún no lo está. Si necesita campos propios, se estudia como entidad.
- **Cambiar una definición.** Se cambia en el glosario, nunca en el JSON. Si cambia el significado, no se edita: se retira el término y nace otro (principio 11).
- **Quitar o sustituir una entidad.** No se borra: `status: retired` con `replaced_by`. Un id ya fusionado en staging queda fijado. La retirada conserva su fila en el mapa y al menos una relación. **Límite de hoy:** el test exige a cada entidad horizontal o puente un `term` activo con `en` igual a su id, y no deja repetirlo; retirar y crear otra para el mismo concepto obliga a tener dos términos o falla. Hasta ajustar el test (encargo a `datos`), un id horizontal o puente no se cambia.
- **Añadir o cambiar una relación.** Se edita en el JSON y en el diagrama a la vez. El test exige que `stored_as` sea de su vocabulario (`field`, `file`, `none`, `unaudited`) y que `field` y `file` lleven `stored_in`. Que sea cierto lo mira el juez.
- **Nombres.** Id de entidad en inglés y kebab; campos en inglés y snake (principio 5). Si choca con un sinónimo prohibido, manda el glosario.

## Idioma de los nombres (decisión de Pablo, 11 oct 2026)

Pablo decidió: **todo en inglés**, en los tres ejes. Se aplica así:

- **En inglés**, lo que lee una máquina: ids de entidades, campos de los JSON de `ops/`, valores de los vocabularios cerrados, y tablas y columnas.
- **En castellano**, lo que lee una persona: definiciones, notas, documentos, comentarios del código y mensajes.
- **Ritmo**: lo nuevo, en inglés desde ya. Lo que ya existe cambia cuando se toque, nunca de golpe. Renombrar en la base es una migración en producción y lleva plan B.
- **Una sola traducción**: el campo `en` de cada ficha del glosario. El id de la entidad es ese `en`.

- **Metaclaves comunes**: `actualizado`, `sujetos`, `$comentario` y `version` de los `ops/*.json` siguen en castellano en todos los ficheros, también en los nuevos. Se renombrarán juntas en un encargo propio, no fichero a fichero.
- **Campos de las plantillas de regla y de principio** (excepción, #620): `nombre`, `sujeto`, `fuerza`, `condicion`, `exigencia`, `nota`, `control`, `principio`, `ambito`, `acciones`, `normas`, `enunciado`, `porque`, `fuentes`, `detalle` y `origen` siguen en castellano. Son los campos comunes de `scripts/lib/regla.mjs`, que comparten todos los catálogos de reglas (normas, forja, estándares, redacción, principios); renombrarlos en uno solo los separaría de los demás. Se renombrarían todos a la vez, con las metaclaves. Los valores de vocabulario nuevos sí van en inglés (los de `ambito`: `code`, `infra`…); los de `acciones` (`construir`, `juzgar`…) son de antes y siguen la regla del ritmo.

Cómo encaja con PRINCIPIOS §12, que ya fija las columnas estructurales en
inglés (`id`, `*_id`, `created_at`, `updated_at`, `status`) y deja las de
dominio en castellano: la decisión **amplía** §12. Por eso la frase «las de
dominio pueden ir en español» de §12 queda superada. Quien la cambie es el
agente `datos`, con su propio PR y su fila en `ops/DECISIONES.md`; este
documento no toca `docs/datos/PRINCIPIOS.md`. Tampoco se renombran las tablas
muy cableadas, como el prefijo `user_*` y `channel` frente a `canal` en las
tablas `bot_*` (propuesta del auditor de datos).

La base tiene 54 tablas: 37 con nombre en inglés y 17 en castellano. Se miden
con `npm run consulta` sobre `information_schema.tables` (el auditor de datos
las contó el 11 oct). Las de castellano no empiezan todas en la 0060:
`bot_codigos` nace en la 0058.

## Decisiones ya tomadas sobre estas entidades

- **Aprendizaje.** El término es «aprendizaje», no «lección» (glosario). El id es `learning`. Su campo declarado `recorded_in` («dónde quedó») vale `test`, `guard`, `rule` o `skill`, y con `skill` lleva `reason_not_automated`. Sigue siendo `without_registry`.
- **Persona.** `person` es la persona de la casa, como en la base. El equipo es `team-member`. El término del glosario «persona» sigue siendo el del equipo. Renombrarlo a «miembro del equipo» irá en un PR aparte. Mientras, las fichas «persona» y «persona de la casa» se relacionan en los dos sentidos y la nota de «persona» avisa.
- **Tres «mecanismo».** Existen tres cosas con ese nombre: los ids de `ops/mecanismos.json`, `ficha.mecanismo` del fondo (texto libre con la causa) y el campo del aprendizaje (`test`, `guard`, `rule` o `skill`). Este último se renombró a `recorded_in` para que cada «mecanismo» signifique una sola cosa (principio 1).
- **Identidad.** `identity` es horizontal. La cuenta de un canal de la casa es `channel-identity`, vertical.
- **Tabla.** `table` es un puente: la crea una migración y la custodia un módulo. La fuente de datos no se cuelga de ellos, porque no comparten id.

## Lo que este documento no resuelve

- **Clave (PROPUESTA, sin decidir).** Hoy se dice clave, secreto y token. Opción A: `clave` es el término, `secreto` pasa a sinónimo prohibido y `token` es un tipo de clave. No se toca el glosario todavía, porque la skill `alta-de-secreto` usa «secreto». En inglés se usa `secret`.
- **Vertical.** Casa, receta, menú, despensa, lista de la compra y conversación con Lola llevan solo id y nombre. Su auditoría es otra fase.
- **Métrica.** Hay dos registros con el mismo nombre. El N1 de Métrica decide si se fusionan o se reparten en dos entidades.
- No se leyeron el texto original de Fowler ni el de ISO 11179: se usaron resúmenes. Antes de citar la edición concreta de ISO, hay que mirar el catálogo de ISO.
- No se adopta el marco de gobierno de DAMA-DMBOK. Solo se toma su reparto entre diccionario de datos, glosario de negocio y catálogo.

## Fuentes

- Google AIP-190, AIP-140 y AIP-126: <https://google.aip.dev/190>, <https://google.aip.dev/140>, <https://google.aip.dev/126>.
- OpenTelemetry, convenciones de nombres: <https://opentelemetry.io/docs/specs/semconv/general/naming/>.
- ISO/IEC 11179-5: <https://www.iso.org/es/contents/data/standard/03/53/35347.html>.
- ANSI/NISO Z39.19, por resumen: <https://marciazeng.metadataetc.org/Z3919/>.
- W3C PROV-O: <https://www.w3.org/TR/prov-o/>.
- CloudEvents 1.0: <https://github.com/cloudevents/spec>.
- Protobuf y Stripe, enums abiertos y cerrados: <https://protobuf.dev/programming-guides/enum>, <https://docs.stripe.com/api/enums>.
- `docs/datos/PRINCIPIOS.md`, §6, §9, §10, §12 y §18.
- Domain-Driven Design, vía fuentes secundarias.
- Las tres auditorías del 11 oct 2026 (entidades, nomenclatura y base de datos): de ahí salen las cifras «antes».
- La revisión del 11 oct sobre #566.
