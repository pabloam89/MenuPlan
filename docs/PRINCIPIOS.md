# Principios de la casa

<!-- Generado desde ops/principios/, ops/principios-producto/, ops/redaccion.json con «npm run principios-casa -- --escribir». No se edita a mano: ops/principios.test.js lo compara. -->

La lista única de principios: el porqué de lo que se pide. Tres capas que no se repiten: un **principio** dice por qué; una **norma** (`ops/normas.json`, `docs/ops/NORMAS.md`) dice lo que debe ser verdad, con su control, y cita su principio; un **estándar** de tarea (`ops/estandares-agentes.json`) cita normas. Cada principio lleva sus fuentes (**[F]** una fuente externa lo dice, **[I]** está escrito en la casa, **[S]** inferencia nuestra o fuente secundaria) y, si hay, el detalle donde se desarrolla. Los de producto y redacción viven en su propio catálogo, con su fuerza y su control, y aquí se listan sin copiarse.

Las normas de cada principio: `npm run principios-casa -- <id>`. Un principio propio que aún no cita ninguna norma está en `principios_sin_norma` de `ops/principios/_catalogo.json`, con su motivo; esa lista solo baja, y la de cada catálogo delegado tiene su propio techo.

## Cifras

| Área | Principios | De un catálogo delegado | Propios sin norma |
|---|---|---|---|
| código (`code`) | 8 | 0 | 0 |
| infraestructura (`infra`) | 12 | 0 | 0 |
| datos (`data`) | 15 | 0 | 0 |
| catálogo (`catalog`) | 1 | 0 | 0 |
| producto (`product`) | 40 | 40 | 0 |
| proceso (`process`) | 11 | 0 | 0 |
| redacción (`writing`) | 16 | 16 | 0 |
| entidades (`entities`) | 9 | 0 | 3 |
| **Total** | **112** | **56** | **3** |

## Código (`code`)

El código del repo y su forma: tests, lint y ficheros.

- `builder-does-not-judge` — **Quien construye no juzga.** El veredicto sobre un cambio lo da otro agente distinto del constructor y sin herramientas de escritura.
  - Porqué: Quien ha escrito algo ve lo que quiso hacer y no lo que hizo, y un juez que escribe acaba arreglando en vez de juzgar.
  - Fuentes: [I] `CLAUDE.md`
  - Detalle: `CLAUDE.md#agentes`
  - Viene de: C7
- `context-in-repo` — **Contexto en el repositorio.** Lo que una sesión necesita saber vive en el repositorio, no en la memoria de una persona ni de una sesión.
  - Porqué: Cada sesión empieza sin memoria, así que lo que no está en el repo se pierde o se reinventa.
  - Fuentes: [I] `CLAUDE.md`
  - Detalle: `CLAUDE.md#lo-que-hace-cumplir-esto`
  - Viene de: C5
- `deny-when-in-doubt` — **Ante la duda, se niega.** Cuando falta un dato para decidir, como una credencial o un catálogo completo, el sistema cierra el paso.
  - Porqué: Un fallo que cierra se ve enseguida y se arregla, mientras que uno que deja pasar se descubre tarde y con daño.
  - Fuentes: [I] `api/sinCredencial.test.js`
  - Viene de: C10
- `explicit-over-clever` — **Explícito antes que ingenioso.** El código dice a la vista lo que hace, con nombres enteros e importaciones fijas, sin nada montado en tiempo de ejecución.
  - Porqué: Un agente o un revisor solo razona sobre lo que puede buscar, y un nombre montado al vuelo no sale en ninguna búsqueda.
  - Fuentes: [I] `eslint.config.js`
  - Viene de: C2
- `one-change-one-intent` — **Un cambio, una intención.** Cada sesión lleva una sola tarea en su carpeta y su rama, y cada PR cierra un solo propósito.
  - Porqué: Dos intenciones en un cambio no se revisan, se revierten ni se atribuyen por separado, y las sesiones en paralelo se pisan.
  - Fuentes: [I] `CLAUDE.md`
  - Detalle: `CLAUDE.md#una-sesión-una-tarea`
  - Viene de: C1
- `state-read-at-source` — **Estado leído en su fuente.** Una sesión da un estado por cierto solo tras leerlo en su fuente en ese momento, no de memoria.
  - Porqué: Varias sesiones cambian el mismo repo a la vez, y lo que era cierto hace una hora puede no serlo ya.
  - Fuentes: [I] `.claude/hooks/pendientes.mjs`
  - Viene de: C9
- `test-is-the-contract` — **El test es el contrato.** Un test que corre en el CI fija lo que el código promete, y cada test nuevo se ve fallar antes de creérselo.
  - Porqué: Un test que nunca se vio en rojo puede no medir nada, y lo que no fija un test se rompe sin que nadie lo vea.
  - Fuentes: [I] `.claude/rules/tests.md`
  - Detalle: `.claude/rules/tests.md#tests`
  - Viene de: C6
- `tests-are-not-relaxed` — **Los tests no se relajan.** Un test en rojo se arregla en el código o se discute con su motivo, sin aflojarlo, saltarlo ni borrarlo.
  - Porqué: Un test relajado sigue en verde y deja de vigilar justo lo que acababa de fallar.
  - Fuentes: [I] `scripts/lib/avisosPr.mjs`
  - Viene de: C8

## Infraestructura (`infra`)

Identidades, permisos, secretos, ramas, CI, despliegues, copias y servicios.

- `bounded-blast-radius` — **Radio de daño acotado.** Todo lo que gasta o escribe tiene un límite de daño por día, por mes, por casa y por origen.
  - Porqué: Sin límite, un bucle, un abuso o un error de código convierte un fallo pequeño en una factura o en datos rotos.
  - Fuentes: [I] `api/_guard.test.js`
  - Viene de: I4
- `declared-is-real` — **Lo declarado es lo real.** Lo que el repo declara de la infraestructura se compara cada cierto tiempo con lo que hay de verdad.
  - Porqué: Un registro que nadie compara con la realidad acaba mintiendo, y se decide con datos falsos.
  - Fuentes: [I] `scripts/verificar-estado.mjs`
  - Viene de: I8
- `emergency-access` — **Acceso de emergencia.** Una guía escrita y probada permite operar sin Claude y restaurar la base desde una copia.
  - Porqué: Si el día que algo falla solo sabe arreglarlo una herramienta que no está, no hay arreglo.
  - Fuentes: [I] `docs/ops/SIN-CLAUDE.md`
  - Viene de: I10
- `least-short-lived-permissions` — **Permisos mínimos y cortos.** Cada identidad y cada clave tiene los permisos mínimos para su uso, vive poco y llega solo a donde se usa.
  - Porqué: Una clave con más alcance o más vida de la necesaria convierte una fuga pequeña en una grande.
  - Fuentes: [I] `.claude/skills/alta-de-secreto/SKILL.md`
  - Viene de: I2
- `own-identity` — **Cada agente, su identidad.** Cada agente actúa con su propia identidad, distinta de la de cualquier persona, sin acceso a credenciales ajenas.
  - Porqué: Con la identidad de una persona, lo que hace un agente no se distingue de lo que hace ella y hereda todos sus permisos.
  - Fuentes: [I] `.claude/skills/github/referencias/app-sesiones.md`
  - Viene de: I1
- `owned-expiring-resources` — **Recursos con dueño y caducidad.** Cada recurso, sea una clave, una skill o un servicio, tiene dueño y caducidad, y avisa antes de caducar.
  - Porqué: Lo que no tiene dueño nadie lo renueva, y lo que caduca sin aviso se rompe un día cualquiera.
  - Fuentes: [I] `ops/recursos.json`
  - Viene de: I9
- `plan-evaluated-before-apply` — **El plan se evalúa antes.** Cada cambio en la base o en la infraestructura se ensaya antes de aplicarlo, y lo aplica quien tiene permiso.
  - Porqué: Solo hay una base y es producción, así que lo que se aplica sin ensayo se prueba sobre datos de familias.
  - Fuentes: [I] `scripts/apply-migration.mjs`
  - Detalle: `CLAUDE.md#base-de-datos`
  - Viene de: I5
- `progressive-deploy-with-rollback` — **Despliegue progresivo con vuelta atrás.** Lo que llega a producción pasa antes por staging y por main con el CI en verde, y tiene una vuelta atrás probada.
  - Porqué: Un despliegue sin paso previo ni vuelta atrás convierte cualquier error en una caída para las familias.
  - Fuentes: [I] `.claude/skills/vercel/SKILL.md`
  - Detalle: `CLAUDE.md#ramas-y-flujo`
  - Viene de: I7
- `public-repo-no-sensitive-detail` — **Repo público sin detalle.** El repo público dice qué se pide y quién lo vigila, sin explicar cómo se salta un control ni dar datos de familias.
  - Porqué: Cualquiera lee los issues, los PR y el historial, y lo que se publica no se retira del todo.
  - Fuentes: [I] `CLAUDE.md`
  - Detalle: `CLAUDE.md#cuando-algo-falla-hasta-el-problema-de-fondo`
- `rehearsal-undone-and-expires` — **El ensayo se deshace.** Un ensayo no deja ningún cambio y caduca pronto, así que uno viejo ya no vale.
  - Porqué: Un ensayo que deja rastro ya no es un ensayo, y uno viejo no dice nada del estado de hoy.
  - Fuentes: [I] `scripts/apply-migration.mjs`
  - Viene de: I6
- `untamperable-trail` — **Rastro que nadie reescribe.** Cada acción de un agente deja un rastro que ese mismo agente no puede editar ni borrar.
  - Porqué: Un rastro que se puede reescribir no sirve para saber qué pasó justo cuando más falta hace.
  - Fuentes: [I] `.claude/hooks/eventos.mjs`
  - Viene de: N2
- `user-does-not-widen-permission` — **Nadie amplía su propio permiso.** Una persona cambia los permisos, los secretos y los ajustes de los servicios, nunca quien los usa.
  - Porqué: Si quien actúa puede darse más permisos, cualquier límite que tenga es solo una sugerencia.
  - Fuentes: [I] `CLAUDE.md`
  - Detalle: `CLAUDE.md#qué-se-le-pregunta-a-pablo-y-qué-no`
  - Viene de: I3

## Datos (`data`)

La base: tablas, migraciones, roles y cada dato que guarda.

- `closed-vocabulary` — **Vocabulario cerrado.** Todo lo que se agrupa toma sus valores de un vocabulario cerrado con su test, y un valor retirado dice a cuál pasa.
  - Porqué: Con texto libre cada uno escribe lo mismo de otra forma, y un valor reutilizado descuadra los recuentos viejos.
  - Fuentes: [I] `src/lib/vocabularios.js`
  - Detalle: `docs/datos/PRINCIPIOS.md#4-vocabularios-cerrados`, `docs/entidades/N0-principios.md#12-un-vocabulario-tiene-ciclo-de-vida`
  - Viene de: C4, claude:vocabulario-cerrado
- `days-hours-zones` — **Días, horas y zonas.** Un instante es un timestamptz, un día es una date y la hora se calcula con la zona de la casa.
  - Porqué: La casa, el bot y los servidores viven en zonas distintas, y una hora sin zona sale con horas de error.
  - Fuentes: [I] `docs/datos/PRINCIPIOS.md`
  - Detalle: `docs/datos/PRINCIPIOS.md#20-días-horas-y-zonas`
- `expand-and-contract` — **Expandir y contraer.** Cada migración convive con el código de antes y de después, y el código funciona aunque la migración aún no esté aplicada.
  - Porqué: La rama se despliega antes de que alguien aplique su migración, y staging y producción comparten base.
  - Fuentes: [I] `docs/datos/PRINCIPIOS.md`
  - Detalle: `docs/datos/PRINCIPIOS.md#10-migraciones`, `CLAUDE.md#base-de-datos`
- `fk-declares-on-delete` — **Borrado declarado en cada FK.** Cada clave ajena declara qué pasa al borrar lo que apunta y tiene un índice que empieza por sus columnas.
  - Porqué: El valor por defecto es una decisión que nadie tomó, y una cascada mal puesta borra en silencio.
  - Fuentes: [I] `docs/datos/PRINCIPIOS.md`
  - Detalle: `docs/datos/PRINCIPIOS.md#2-toda-fk-dice-qué-pasa-al-borrar`
- `health-data-apart` — **Datos de salud aparte.** Las alergias, las intolerancias, las dietas médicas y las medidas del cuerpo se marcan como datos de salud y se tratan aparte.
  - Porqué: Son categoría especial del RGPD, y exponerlos o copiarlos de más es el daño más grave que puede hacer el producto.
  - Fuentes: [F] https://gdpr-info.eu/art-9-gdpr/
  - Detalle: `docs/datos/PRINCIPIOS.md#17-datos-de-salud`
- `household-owns-data` — **Todo cuelga de la casa.** Cada tabla de dominio cuelga de la casa con su household_id, que encabeza su índice principal.
  - Porqué: La casa es la unidad de acceso, de borrado y de consulta de cada dato de una familia.
  - Fuentes: [I] `docs/datos/PRINCIPIOS.md`
  - Detalle: `docs/datos/PRINCIPIOS.md#1-todo-cuelga-de-la-casa`
- `json-or-table` — **JSON o tabla.** Lo que se filtra, se referencia o editan varios va a una tabla, y lo que un solo escritor lee entero va a JSON.
  - Porqué: Un JSON que se filtra en el servidor o que editan varios a la vez pierde datos y no se puede consultar.
  - Fuentes: [I] `docs/datos/PRINCIPIOS.md`
  - Detalle: `docs/datos/PRINCIPIOS.md#5-json-o-tabla`
- `normalised-tables` — **Tablas normalizadas.** Cada tabla nueva nace en tercera forma normal, con un valor por celda y referencias en vez de copias.
  - Porqué: Una copia de un nombre o un precio en otra tabla se queda vieja sin que nada lo avise.
  - Fuentes: [I] `docs/datos/PRINCIPIOS.md`
  - Detalle: `docs/datos/PRINCIPIOS.md#13-normalización`
- `one-fact-one-place` — **Un dato, un sitio.** Cada dato y cada regla vive en un solo sitio con su lector, y cada copia es una proyección generada que un test compara.
  - Porqué: Dos copias escritas a mano acaban diciendo cosas distintas, y nadie sabe cuál vale.
  - Fuentes: [I] `CLAUDE.md`
  - Detalle: `docs/datos/PRINCIPIOS.md#6-un-dato-un-sitio`, `docs/entidades/N0-principios.md#7-una-fuente-de-verdad-por-dato-y-por-vocabulario`, `CLAUDE.md#base-de-datos`
  - Viene de: C3
- `pure-transformations` — **Transformaciones en módulos puros.** Cada transformación del dominio vive en un módulo puro con tests, y la base la deriva en vez de duplicarla.
  - Porqué: Dos implementaciones de la misma cuenta acaban dando resultados distintos.
  - Fuentes: [I] `docs/datos/PRINCIPIOS.md`
  - Detalle: `docs/datos/PRINCIPIOS.md#11-transformaciones`
- `self-describing-catalog` — **Diccionario en la base.** Cada tabla nueva dice en su comentario qué guarda y quién la escribe, y el código pide las columnas que usa.
  - Porqué: El catálogo de la base es la documentación que no se queda vieja, y un select de todo esconde quién lee qué.
  - Fuentes: [I] `docs/datos/PRINCIPIOS.md`
  - Detalle: `docs/datos/PRINCIPIOS.md#16-diccionario-y-lectura`
- `status-is-state-machine` — **El estado es una máquina.** Cada columna de estado es una máquina con vocabulario cerrado, una fecha por estado importante y sus saltos escritos.
  - Porqué: Un estado que se escribe sin reglas acaba en combinaciones imposibles que nadie sabe interpretar.
  - Fuentes: [I] `docs/datos/PRINCIPIOS.md`
  - Detalle: `docs/datos/PRINCIPIOS.md#21-estados`
- `table-has-owner-module` — **Una tabla, un módulo dueño.** Cada tabla se lee y se escribe desde un solo módulo, y el resto del código llama a sus funciones.
  - Porqué: Una tabla tocada con textos sueltos desde cualquier sitio se rompe en cuanto cambia, aunque la base esté bien.
  - Fuentes: [I] `docs/datos/PRINCIPIOS.md`
  - Detalle: `docs/datos/PRINCIPIOS.md#15-cableado-del-código-a-la-tabla`
- `types-and-nulls` — **Tipos justos y nulos decididos.** Cada columna tiene el tipo justo y es not null, salvo que su comentario diga qué significa el nulo.
  - Porqué: Un nulo sin significado se lee de tres formas distintas, y un tipo flojo deja entrar datos imposibles.
  - Fuentes: [I] `docs/datos/PRINCIPIOS.md`
  - Detalle: `docs/datos/PRINCIPIOS.md#14-tipos-y-nulos`
- `versioned-concurrency` — **Concurrencia con versión.** El estado compartido de la casa se escribe con funciones que comprueban y suben una versión.
  - Porqué: La app, el bot y otro miembro escriben la misma casa, y sin versión gana el último sin que nadie se entere.
  - Fuentes: [I] `docs/datos/PRINCIPIOS.md`
  - Detalle: `docs/datos/PRINCIPIOS.md#7-concurrencia`

## Catálogo (`catalog`)

El catálogo de recetas y alimentos que vive en git.

- `curated-catalog-only` — **Solo catálogo revisado.** El menú propone solo recetas que una persona revisó y marcó con estrella y foto, sin rellenos ni combinaciones automáticas.
  - Porqué: Un plato que nadie revisó en el menú de una familia cuesta su confianza, y eso se nota más que un menú corto.
  - Fuentes: [I] `.claude/rules/catalogo.md`
  - Detalle: `.claude/rules/catalogo.md#catálogo-alimentos-y-nutrición`

## Producto (`product`)

Qué hace bien HoMenu y Lola para las familias.

Lo trae el catálogo delegado `ops/principios-producto/`, con su detalle en `docs/producto/PRINCIPIOS.md`. Los principios de producto con fuente (#606), con su test y la skill principios-de-producto. Los que no cita ninguna norma: Principio de producto con su fuerza y su control en su propio catálogo; su paso a norma va a #620 (techo 32).

- `abuse-of-business-flows-limited` — **Flujos de negocio limitados.** Cuando una función puede dañar al negocio si se usa en masa (crear cuentas, comentar, pedir menús), el producto DEBE limitarla por persona o por origen.
  - Porqué: El spam y el abuso automatizado son el riesgo típico de un flujo abierto, y cuestan dinero o reputación.
  - Fuentes: [F] https://api-security.owasp.org/editions/2023/en/0xa6-unrestricted-access-to-sensitive-business-flows
- `authenticate-machine-callers` — **Autenticar a las máquinas.** Cuando quien llama a un endpoint es una máquina (webhook, disparador de la base, cron), el producto DEBE autenticarla con una firma o un secreto compartido comparado en tiempo constante, y responder 401 sin detalle si falta.
  - Porqué: Que no haya una persona detrás no quita la necesidad de credencial: sin ella, cualquiera puede hacerse pasar por el disparador.
  - Fuentes: [F] https://api-security.owasp.org/editions/2023/en/0xa2-broken-authentication/ ; [F] https://docs.stripe.com/webhooks
- `bounded-loops-and-timeouts` — **Bucles y tiempos acotados.** Cuando encadena pasos o herramientas en un turno, el bot DEBE limitar las vueltas, el tiempo y el tamaño de la entrada.
  - Porqué: Los errores se acumulan en cada vuelta y el coste no tiene techo.
  - Fuentes: [F] https://www.anthropic.com/engineering/building-effective-agents ; [F] https://genai.owasp.org/llmrisk/llm102025-unbounded-consumption/
- `buttons-and-free-text` — **Botones y texto libre.** Cuando las opciones son pocas y conocidas, el bot DEBE ofrecer botones además del texto libre.
  - Porqué: Los usuarios piden opciones ya preparadas y escriben menos.
  - Fuentes: [F] https://www.nngroup.com/articles/chatbots/
- `calibrate-not-maximise-trust` — **Calibrar la confianza.** Cuando muestra una respuesta cuya fiabilidad no es pareja, el bot DEBE dejar claro qué es estimado y qué está confirmado, sin inducir confianza ciega.
  - Porqué: Señalar el posible error baja la confianza en ese dato, pero evita la sobreconfianza después.
  - Fuentes: [F] https://pair.withgoogle.com/chapter/explainability-trust/
- `caller-pays-quota` — **El cupo, a quien llama.** Cuando un endpoint gasta IA, el producto DEBE atribuir el gasto a quien llama y, si no se sabe quién es, darle un cupo pequeño y propio.
  - Porqué: Sin identidad no se puede limitar por persona, y un cupo compartido deja que un anónimo agote el de todos.
  - Fuentes: [F] https://genai.owasp.org/llmrisk/llm102025-unbounded-consumption/ ; [S] https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption
- `data-minimisation` — **Minimización de datos.** Cuando se pide o se guarda un dato personal, el producto DEBE limitarlo a lo necesario para un fin concreto.
  - Porqué: Lo que no se guarda no se filtra ni se puede usar mal.
  - Fuentes: [F] https://gdpr-info.eu/art-5-gdpr/ ; [F] https://gdpr-info.eu/art-25-gdpr/
- `easy-correction-and-undo` — **Corregir y deshacer fácil.** Cuando se equivoca o la persona cambia de idea, el bot DEBE dejar corregir o deshacer lo hecho con un solo gesto.
  - Porqué: El control y la libertad del usuario son una de las heurísticas básicas de usabilidad.
  - Fuentes: [F] https://www.microsoft.com/en-us/research/articles/guidelines-for-human-ai-interaction-eighteen-best-practices-for-human-centered-ai-design/ ; [F] https://www.nngroup.com/articles/ten-usability-heuristics/
- `escalate-by-explicit-triggers` — **Escalado por disparadores escritos.** Cuando la conversación toca un riesgo alto (alergia grave, pagos, datos personales), el bot DEBE seguir un disparador escrito de escalado y pasar el contexto completo.
  - Porqué: Un traspaso vago obliga a la persona a empezar de cero justo cuando más lo necesita.
  - Fuentes: [F] https://www.intercom.com/learning-center/ai-human-collaboration-procedures-handoffs
- `escape-hatch-when-lost` — **Salida cuando se pierde.** Cuando no entiende o falla varias veces seguidas, el bot DEBE admitirlo y ofrecer otra vía: botones, la app o una persona.
  - Porqué: Los usuarios valoran que el bot admita que no entiende y penalizan la respuesta repetida, segura pero errónea.
  - Fuentes: [F] https://www.nngroup.com/articles/chatbots/ ; [F] https://www.intercom.com/learning-center/ai-human-collaboration-procedures-handoffs ; [F] https://pair.withgoogle.com/chapter/errors-failing/
- `explain-data-use` — **Explicar el uso de datos.** Cuando personaliza una respuesta con datos de la familia, el bot DEBE decir qué datos usa, para que la persona pueda corregirlos o borrarlos.
  - Porqué: Saber qué sabe el sistema de uno calibra la confianza y permite corregirlo.
  - Fuentes: [F] https://pair.withgoogle.com/chapter/explainability-trust/
- `explain-why` — **Explicar el porqué.** Cuando toma una decisión que la persona no esperaba, el bot DEBE poder decir por qué en una frase.
  - Porqué: Sin motivo, el error es opaco y la persona no puede corregirlo.
  - Fuentes: [F] https://www.microsoft.com/en-us/research/articles/guidelines-for-human-ai-interaction-eighteen-best-practices-for-human-centered-ai-design/ ; [F] https://pair.withgoogle.com/chapter/explainability-trust/
- `fail-closed-for-safety-filters` — **Filtro que falla cerrado.** Cuando un filtro de seguridad o de moderación no puede ejecutarse, el producto DEBE retener el contenido para revisión en vez de aprobarlo por defecto.
  - Porqué: Si el filtro falla abierto, en la práctica no hay filtro: basta con agotarlo.
  - Fuentes: [S] https://www.cisa.gov/securebydesign ; [S] https://genai.owasp.org/llmrisk/llm102025-unbounded-consumption/
- `fixed-appetite-variable-scope` — **Apetito fijo, alcance variable.** Cuando se decide hacer una mejora, toda decisión de producto DEBE fijar antes cuánto tiempo merece y recortar el alcance si no cabe, en vez de estirar el plazo.
  - Porqué: Obliga a separar lo central de lo periférico antes de empezar.
  - Fuentes: [F] https://basecamp.com/shapeup/1.2-chapter-03
- `graceful-degradation` — **Degradación elegante.** Cuando el modelo falla, tarda o se agota el cupo, el producto DEBE seguir ofreciendo lo esencial sin IA y decirlo en llano.
  - Porqué: El fallo debería ser seguro y aburrido, no un callejón sin salida.
  - Fuentes: [F] https://genai.owasp.org/llmrisk/llm102025-unbounded-consumption/ ; [F] https://pair.withgoogle.com/chapter/errors-failing/ ; [F] https://pair.withgoogle.com/chapter/mental-models/
- `hard-spend-cap` — **Límite de gasto en IA.** Cuando un endpoint de api/ llama a un modelo de pago, el producto DEBE pasar por un límite diario global que corte antes de gastar y falle cerrado si no puede contar.
  - Porqué: El abuso puede disparar la factura (denial of wallet) sin que nadie haya entrado en el sistema.
  - Fuentes: [F] https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption ; [F] https://genai.owasp.org/llmrisk/llm102025-unbounded-consumption/
- `human-approval-high-impact` — **Confirmación humana en lo grave.** Cuando una acción es irreversible o sale fuera de la casa (borrar, escribir a terceros, comprar), el bot DEBE pedir confirmación explícita a la persona antes de ejecutarla y decirle las consecuencias.
  - Porqué: El modelo puede equivocarse o ser manipulado, y una acción que no se puede deshacer no admite el error.
  - Fuentes: [F] https://genai.owasp.org/llmrisk/llm062025-excessive-agency/ ; [F] https://www.microsoft.com/en-us/research/articles/guidelines-for-human-ai-interaction-eighteen-best-practices-for-human-centered-ai-design/
- `idempotent-writes` — **Escrituras repetibles.** Cuando una llamada del bot o de un webhook puede llegar dos veces, el bot DEBE poder repetirse sin escribir ni avisar dos veces.
  - Porqué: Las redes fallan y los avisos llegan dos veces; sin esto, un reintento duplica efectos.
  - Fuentes: [F] https://docs.stripe.com/api/idempotent_requests
  - Detalle: `docs/datos/PRINCIPIOS.md#19-cada-orden-una-vez`
- `keep-context-no-reask` — **No repetir preguntas.** Cuando la persona ya dio un dato en la conversación o en su ficha, el bot NO DEBE volver a pedírselo.
  - Porqué: En los estudios de NN/g, los bots que repetían preguntas cansaban a la gente.
  - Fuentes: [F] https://www.nngroup.com/articles/chatbots/ ; [F] https://www.microsoft.com/en-us/research/articles/guidelines-for-human-ai-interaction-eighteen-best-practices-for-human-centered-ai-design/
- `least-privilege-for-the-model` — **Mínimo privilegio para el modelo.** Cuando el modelo puede ejecutar herramientas, el bot DEBE darle solo las herramientas y los permisos mínimos, y dejar que la base, no el prompt, decida qué está autorizado.
  - Porqué: Una alucinación o una inyección convierten cualquier permiso de más en daño real.
  - Fuentes: [F] https://genai.owasp.org/llmrisk/llm062025-excessive-agency/ ; [F] https://www.anthropic.com/engineering/building-effective-agents
- `log-what-happens` — **Dejar rastro contable.** Cuando ocurre un fallo, un bloqueo o un gasto relevante, el producto DEBE dejar una línea estructurada que un script pueda contar, sin datos de la familia.
  - Porqué: Lo que no se mide no mejora, y el registro sirve también para detectar un uso anómalo.
  - Fuentes: [F] https://genai.owasp.org/llmrisk/llm102025-unbounded-consumption/
  - Detalle: `docs/entidades/N0-principios.md#10-un-evento-lleva-campos-fijos`
  - Viene de: C11, claude:cada-cosa-deja-una-linea
- `model-output-validated` — **Salida del modelo validada.** Cuando la salida de un modelo alimenta código o la base de datos, el producto DEBE validarla con código contra un esquema cerrado antes de usarla.
  - Porqué: Una salida sin validar es una entrada sin validar: llega a la base con la forma que el modelo quiera.
  - Fuentes: [F] https://genai.owasp.org/llm-top-10/ ; [F] https://www.anthropic.com/engineering/writing-tools-for-agents
- `no-pretend-human` — **No hacerse pasar por humano.** Cuando conversa con una persona, el bot NO DEBE hacerse pasar por humano ni exagerar lo que puede hacer.
  - Porqué: Los personajes con aire humano hacen sobrestimar al sistema.
  - Fuentes: [F] https://pair.withgoogle.com/chapter/mental-models/
- `no-secrets-in-prompts-or-client` — **Secretos fuera del prompt.** Cuando el producto tiene claves o reglas internas, el producto NO DEBE ponerlas en el prompt de un modelo ni en el código que llega al navegador.
  - Porqué: Un prompt puede filtrarse y el código del cliente lo ve cualquiera.
  - Fuentes: [F] https://genai.owasp.org/llm-top-10/
- `no-sensitive-data-in-chat-by-default` — **Sin datos sensibles de más.** Cuando la conversación pasa por un canal de terceros (Telegram, WhatsApp), el bot NO DEBE pedir datos sensibles que no necesita para su tarea.
  - Porqué: En los estudios de NN/g los usuarios dudaban de dar datos sensibles a un bot, y el canal no es nuestro.
  - Fuentes: [F] https://www.nngroup.com/articles/chatbots/ ; [F] https://gdpr-info.eu/art-25-gdpr/
- `onboard-in-stages` — **Presentarse por etapas.** Cuando se presentan las funciones a una persona nueva, el producto DEBE hacerlo por etapas cortas, cuando cada función es relevante y con acciones reversibles de poco riesgo.
  - Porqué: Una lista larga al principio no se retiene.
  - Fuentes: [F] https://pair.withgoogle.com/chapter/mental-models/
- `privacy-by-default` — **Privado por defecto.** Cuando una opción puede exponer datos de una familia, el producto DEBE venir con la opción más privada por defecto.
  - Porqué: Los datos no deben quedar accesibles a otros sin que la persona intervenga.
  - Fuentes: [F] https://gdpr-info.eu/art-25-gdpr/
- `public-endpoint-justified` — **Endpoint público justificado.** Cuando un endpoint responde sin sesión, el producto DEBE tener escrito por qué es público y qué lo protege en lugar de la credencial, en un registro de endpoints con motivo.
  - Porqué: Un endpoint sin identidad es un flujo de negocio abierto a cualquiera, y lo que no está inventariado no se protege ni se retira.
  - Fuentes: [F] https://api-security.owasp.org/editions/2023/en/0xa9-improper-inventory-management/ ; [S] https://api-security.owasp.org/editions/2023/en/0xa6-unrestricted-access-to-sensitive-business-flows
- `purpose-limitation` — **Limitación de la finalidad.** Cuando un dato se recogió para un fin, el producto NO DEBE usarlo para otro fin incompatible.
  - Porqué: Es la base de la confianza: la familia dio el dato para algo y espera que sea solo para eso.
  - Fuentes: [F] https://gdpr-info.eu/art-5-gdpr/
- `recoverable-errors` — **Errores recuperables.** Cuando algo falla, el producto DEBE decir en llano qué pasó y cómo seguir, sin códigos crudos.
  - Porqué: Un error claro convierte un fallo en continuidad.
  - Fuentes: [F] https://www.nngroup.com/articles/ten-usability-heuristics/ ; [F] https://pair.withgoogle.com/chapter/errors-failing/
- `scope-when-in-doubt` — **Acotar ante la duda.** Cuando no está seguro de lo que se le pide, el bot DEBE preguntar o proponer lo más acotado antes de actuar a lo grande.
  - Porqué: Un malentendido pequeño cuesta poco; uno grande, un menú entero estropeado.
  - Fuentes: [F] https://www.microsoft.com/en-us/research/articles/guidelines-for-human-ai-interaction-eighteen-best-practices-for-human-centered-ai-design/
- `secure-by-default` — **Seguro de serie.** Cuando se crea una tabla nueva, la base de datos DEBE negar su acceso a anon desde el primer momento, sin que nadie tenga que configurarlo.
  - Porqué: Lo seguro de serie no depende de que alguien se acuerde de activarlo; lo inseguro debe costar un paso consciente.
  - Fuentes: [F] https://www.cisa.gov/securebydesign
  - Detalle: `docs/datos/PRINCIPIOS.md#8-seguridad`
- `simple-first-agents` — **Lo simple primero.** Cuando se diseña la lógica del bot, el bot DEBE empezar por lo más simple y añadir un paso, una herramienta o un agente solo si mejora lo medido.
  - Porqué: La complejidad cuesta tokens, errores y mantenimiento, y rara vez se nota en la conversación.
  - Fuentes: [F] https://www.anthropic.com/engineering/building-effective-agents ; [F] https://www.anthropic.com/engineering/writing-tools-for-agents
- `state-capabilities-and-limits` — **Capacidades y límites visibles.** Cuando una persona empieza a usarlo, el bot DEBE decirle qué sabe hacer, qué no sabe y con qué fiabilidad.
  - Porqué: Con expectativas realistas la persona no se frustra ni se fía de lo que el bot no puede hacer.
  - Fuentes: [F] https://www.microsoft.com/en-us/research/articles/guidelines-for-human-ai-interaction-eighteen-best-practices-for-human-centered-ai-design/ ; [F] https://pair.withgoogle.com/chapter/mental-models/
- `storage-limitation` — **Limitación del plazo.** Cuando un dato personal deja de servir a su fin, el producto DEBE borrarlo o anonimizarlo.
  - Porqué: Lo que se conserva de más es riesgo sin beneficio.
  - Fuentes: [F] https://gdpr-info.eu/art-5-gdpr/
- `untrusted-text-is-data` — **El texto ajeno es dato.** Cuando un texto de una persona o de un tercero llega a un modelo, el producto DEBE tratarlo como dato delimitado y aparte de las instrucciones, y no como una orden.
  - Porqué: Quien escribe el texto controla lo que el modelo lee, y el modelo no distingue por sí solo entre dato e instrucción.
  - Fuentes: [F] https://genai.owasp.org/llmrisk/llm01-prompt-injection/
  - Viene de: N5
  - Puente entre ejes: Vale igual en el producto (lo que Lola lee de una familia o de una web) y en el trabajo (issues, webs y mensajes de otros agentes)
- `use-existing-channel-first` — **Aportar más que la app.** Cuando se propone un canal o un bot nuevo, toda decisión de producto DEBE comprobar que aporta algo que la app ya no da.
  - Porqué: Los bots que solo duplican la web o la app tienen una propuesta de valor débil.
  - Fuentes: [S] https://www.nngroup.com/articles/chatbots/
- `value-before-signup` — **Valor antes del registro.** Cuando alguien llega por primera vez, el producto DEBE dejarle probar el valor antes de pedirle cuenta o datos.
  - Porqué: Retrasar el registro subió la actividad en un caso conocido, según esa fuente.
  - Fuentes: [S] https://taplytics.com/blog/duolingo-ab-test-onboarding
- `visibility-of-status` — **Estado visible.** Cuando una acción tarda o sigue en curso, el producto DEBE indicar su estado.
  - Porqué: Sin estado, la persona repite la acción o abandona.
  - Fuentes: [F] https://www.nngroup.com/articles/ten-usability-heuristics/
- `wcag-pour` — **Accesible para todos.** Cuando se diseña una pantalla, el producto DEBE poner texto alternativo a las imágenes, poder usar todo con teclado y cuidar el contraste del texto.
  - Porqué: WCAG es el estándar de accesibilidad y llega a más gente, incluida la que usa lector de pantalla.
  - Fuentes: [F] https://www.w3.org/WAI/standards-guidelines/wcag/glance/

## Proceso (`process`)

Cómo se trabaja: issues, fondos, PR, sesiones, agentes, jueces y cifras.

- `builder-does-not-merge` — **Quien construye no fusiona.** La fusión de un cambio con el CI en verde la decide alguien distinto de quien lo construyó.
  - Porqué: Quien construye tiene prisa por cerrar, y otra mirada antes de fusionar para el error que el constructor no ve.
  - Fuentes: [I] `CLAUDE.md`
  - Detalle: `CLAUDE.md#ramas-y-flujo`
  - Viene de: N3
- `calibrated-distinct-judge` — **Juez distinto y calibrado.** El juez, en otro contexto que el constructor, dice pasa o no pasa con su motivo y puede decir «no sé».
  - Porqué: Un juez que no puede dudar inventa un veredicto, y uno sin calibrar con ejemplos marcados por Pablo aprueba todo o nada sin que se note.
  - Fuentes: [I] `.claude/agents/revisor.md`
  - Viene de: N4, claude:el-juez-llm
- `class-not-case` — **La clase, no el caso.** Cada fallo se arregla en su caso y en su problema de fondo, con una barrera que cubre la clase entera.
  - Porqué: Tapar solo el caso deja vivos a sus hermanos, y el mismo fallo vuelve con otra cara.
  - Fuentes: [I] `docs/ops/FLUJO.md`
  - Detalle: `CLAUDE.md#cuando-algo-falla-hasta-el-problema-de-fondo`
  - Viene de: C12, claude:la-clase-no-el-caso
- `highest-mechanism` — **El mecanismo más alto.** Cada norma usa el escalón más alto posible de la escalera de durabilidad y baja de escalón solo con su motivo.
  - Porqué: Lo que obliga es el hook y no el texto, porque una norma solo escrita depende de que alguien se acuerde.
  - Fuentes: [I] `ops/mecanismos.json`
  - Viene de: claude:el-mecanismo-mas-alto
- `know-when-to-stop` — **Saber parar.** Tras varios fallos seguidos, un gasto anómalo o el presupuesto agotado, el agente se detiene, lo registra y devuelve el control.
  - Porqué: Un bucle que no para gasta dinero y tiempo y agranda el daño de un error.
  - Fuentes: [I] `ops/presupuestos.json`
  - Viene de: N6
- `no-number-without-question` — **Ninguna cifra sin pregunta.** Cada cifra responde a una pregunta, tiene un script que la lee y va con otra cifra que la vigila.
  - Porqué: Una cifra que nadie lee es coste sin uso, y una que se persigue sola deja de medir lo que medía.
  - Fuentes: [I] `ops/metricas.json`
  - Viene de: claude:ninguna-cifra-sin-pregunta, claude:ninguna-cifra-es-objetivo-sola
- `number-before-and-after` — **La cifra antes y después.** Cada arreglo se mide con la misma cifra antes y después, y mejora solo si la diferencia supera lo que varía sola.
  - Porqué: Sin la cifra de partida nadie sabe si un arreglo sirvió, y una diferencia pequeña puede ser solo ruido.
  - Fuentes: [I] `ops/metricas.json`
  - Viene de: claude:la-cifra-antes-y-despues
- `person-over-the-loop` — **Persona sobre el bucle.** Pablo no aprueba cada paso, sino que lee una muestra periódica y ajusta las reglas.
  - Porqué: Pedir el sí en cada paso interrumpe y acaba en un sí a todo, y mirar una muestra mantiene el control sin frenar.
  - Fuentes: [I] `CLAUDE.md`
  - Detalle: `CLAUDE.md#qué-se-le-pregunta-a-pablo-y-qué-no`
  - Viene de: N7
- `reversibility-decides-autonomy` — **La reversibilidad decide la autonomía.** El agente hace solo lo reversible, y lo irreversible se vuelve reversible o lo hace una persona.
  - Porqué: Un error reversible cuesta un rato, y uno irreversible puede costar datos de familias o producción.
  - Fuentes: [I] `CLAUDE.md`
  - Detalle: `CLAUDE.md#qué-se-le-pregunta-a-pablo-y-qué-no`
  - Viene de: N1
- `three-check-layers` — **Tres capas de comprobación.** Cada comprobación es formal, material o subjetiva, y lo subjetivo repetido pasa a mecánico salvo que el test salga frágil.
  - Porqué: Un juicio repetido cuesta y varía cada vez, y volver de un test frágil a un juicio deja escrito su porqué.
  - Fuentes: [I] `ops/forja/`
  - Viene de: claude:tres-capas
- `top-down` — **De arriba abajo.** La forja define qué hace buena a una pieza, la plantilla de su tipo la concreta y cada pieza sigue a su plantilla.
  - Porqué: Una pieza escrita antes que su plantilla fija una forma que luego se deshace en todas las demás.
  - Fuentes: [I] `ops/forja/`
  - Viene de: claude:de-arriba-abajo

## Redacción (`writing`)

Cómo se escribe una regla o un principio de la casa.

Lo trae el catálogo delegado `ops/redaccion.json`, con su detalle en `docs/ops/REDACCION.md`. La guía de redacción de reglas (#493), con su test. Los que no cita ninguna norma: Regla de escritura con su fuerza y su control en ops/redaccion.json: se aplica al redactar cada norma (techo 16).

- `castellano-siempre` — **Castellano siempre.** Cada regla de la casa DEBE escribirse en castellano, salvo los nombres propios, el código y las citas.
  - Porqué: Las palabras de fuerza de RFC 2119 se traducen: debe, no debe y conviene; no se deja MUST ni SHOULD
  - Fuentes: [I] `CLAUDE.md`
- `un-termino-por-concepto` — **Un término por concepto.** Cada regla de la casa DEBE llamar a cada concepto con su término de ops/glosario/, sin sinónimos.
  - Porqué: Mezclar sinónimos hace creer que son cosas distintas; el glosario fija una palabra y la lista de las prohibidas
  - Fuentes: [F] https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
- `sin-anglicismos-con-termino` — **Sin anglicismos con término.** Cada regla de la casa NO DEBE usar un anglicismo cuando el glosario ya tiene su término en castellano.
  - Porqué: Lo que no tiene término en el glosario (hook, staging, lint) se deja como está y se añade al glosario si se repite
  - Fuentes: [I] `ops/glosario/`
- `fuerza-segun-rfc-2119` — **Fuerza según RFC 2119.** La fuerza de cada regla DEBE ser debe, no_debe o conviene, con el sentido de MUST, MUST NOT y SHOULD de RFC 2119.
  - Porqué: Debe y no_debe son absolutas; conviene admite una razón válida para no cumplirla, que se dice en la nota
  - Fuentes: [F] https://www.rfc-editor.org/rfc/rfc2119
- `mayusculas-solo-normativas` — **Mayúsculas solo normativas.** La exigencia de cada regla NO DEBE llevar DEBE, NO DEBE ni CONVIENE en mayúsculas: la fuerza solo la pone el campo fuerza.
  - Porqué: RFC 8174: las palabras en mayúsculas tienen sentido normativo y las mismas en minúsculas son lenguaje corriente
  - Fuentes: [F] https://www.rfc-editor.org/rfc/rfc8174
- `condicion-estilo-ears` — **Condición estilo EARS.** La condición de cada regla DEBE empezar por «cuando» o «si» y nombrar el disparador, en una línea y sin punto final.
  - Porqué: El test vigila solo que empiece por cuando o si y que vaya en una línea sin punto final; que nombre un disparador es de juicio. EARS (Mavin et al., 2009) pone el disparador delante: «Cuando <disparador>, <sujeto> debe <respuesta>». Una regla que vale siempre no lleva condición
  - Fuentes: [F] https://alistairmavin.com/ears/
- `exigencia-en-infinitivo` — **Exigencia en infinitivo.** La exigencia de cada regla DEBE empezar por un verbo en infinitivo y en minúscula, sin sujeto: el sujeto ya lo pone el campo sujeto.
  - Porqué: La frase generada une sujeto, fuerza y exigencia; repetir el sujeto la rompe. Con conviene la frase empieza por «Para <sujeto>,», así que la exigencia tampoco es reflexiva ni pasiva: «usar frases», no «escribirse en frases». El test comprueba la terminación del verbo; que no lleve sujeto es de juicio
  - Fuentes: [I] `scripts/lib/regla.mjs`
- `exigencia-sin-punto-final` — **Exigencia sin punto final.** La exigencia de cada regla NO DEBE acabar en punto, dos puntos ni punto y coma, ni ocupar más de una línea.
  - Porqué: La frase generada añade su propio punto; uno más deja dos
  - Fuentes: [I] `scripts/lib/regla.mjs`
- `exigencia-corta-y-unica` — **Exigencia corta y única.** La exigencia de cada regla DEBE caber en 160 caracteres y pedir una sola cosa que se pueda comprobar.
  - Porqué: El test vigila solo el tope de 160 caracteres; que pida una sola cosa comprobable es de juicio. Si hay dos cosas, son dos reglas, y lo que sobra del tope va a la nota. La guía de requisitos de INCOSE pide lo mismo: un requisito, una necesidad
  - Fuentes: [I] `scripts/lib/regla.mjs`
- `nombre-corto-y-nominal` — **Nombre corto y nominal.** El nombre de cada regla DEBE ser un sustantivo de 2 a 5 palabras, con mayúscula inicial y sin punto final.
  - Porqué: El test vigila el número de palabras, la mayúscula inicial y el punto final; que sea un sustantivo es de juicio. Es una sola idea, la forma de la etiqueta con la que se cita la regla, y no se repite en el catálogo
  - Fuentes: [I] `scripts/lib/regla.mjs`
- `dato-contable-en-campo` — **Dato contable en campo.** Cada dato de una regla que se vaya a contar, filtrar o agrupar DEBE ir en un campo de vocabulario cerrado y no en texto libre.
  - Porqué: El texto libre solo se admite en un hueco declarado, y el hueco se cuenta aparte; lo que no es un campo discreto no se puede contar
  - Fuentes: [I] `CLAUDE.md`
- `nota-solo-para-el-matiz` — **Nota solo para el matiz.** La nota de cada regla DEBE recoger solo el matiz, la cifra o la heurística que la exigencia no admite, en una línea de 400 caracteres como mucho.
  - Porqué: El test vigila solo la forma (una línea, 15 a 400 caracteres); que la nota sea un matiz y no la exigencia es de juicio: si quitarla cambia lo que se exige, esa parte va en la exigencia o en otra regla
  - Fuentes: [I] `scripts/lib/regla.mjs`
- `frases-cortas` — **Frases cortas.** Para la nota de cada regla, CONVIENE usar frases de menos de 25 palabras y párrafos de cinco frases como mucho.
  - Porqué: Vale también para la prosa de las guías y las skills; los topes de palabras son de la casa, no de la fuente
  - Fuentes: [F] https://www.plainlanguage.gov/guidelines/
- `fuente-marcada` — **Fuente marcada.** La fuente de cada regla DEBE empezar por [F] con una dirección https, o por [I] con una ruta del repo que exista.
  - Porqué: [F] está en una fuente externa; [I] es inferencia o decisión de la casa. Que la dirección [F] responda lo mide npm run forja -- --urls. Lo vigila forja.test.js en los criterios y redaccion.test.js en estos principios
  - Fuentes: [I] `docs/ops/FORJA.md`
- `control-declarado` — **Control declarado.** El control de cada regla DEBE ser el fichero que vigila la regla o el valor juicio, y no quedar vacío.
  - Porqué: Una regla sin control es un deseo: si no hay fichero todavía, se declara juicio y se apunta el encargo que lo construye. Lo vigila forja.test.js en los criterios y redaccion.test.js en estos principios
  - Fuentes: [I] `CLAUDE.md`
- `catalogo-declara-su-estado` — **Catálogo declara su estado.** Cada catálogo de reglas DEBE figurar en la lista de catálogos como cumple, o como pendiente con el encargo que lo pone al día.
  - Porqué: La lista de pendientes solo baja: un catálogo nuevo nace cumpliendo la guía
  - Fuentes: [I] `ops/redaccion.json`

## Entidades (`entities`)

Cómo se nombra, se identifica y se registra cada cosa del proyecto.

- `axis-language-bridge` — **Cada eje, su lenguaje.** Cada eje usa su lenguaje en su contexto, y una palabra que cruza de eje se declara puente una sola vez.
  - Porqué: La misma palabra con dos sentidos en dos ejes confunde justo donde los ejes se juntan.
  - Fuentes: [I] `ops/entidades.json`
  - Detalle: `docs/entidades/N0-principios.md#13-cada-eje-tiene-su-lenguaje-y-se-traduce-en-la-frontera`
  - Sin norma: Principio del N0 de entidades: su norma la pone el N1 de cada entidad, que aún no está escrito
- `deprecate-not-delete` — **Se retira, no se borra.** Un id, un campo, un valor o un término sin uso se marca retirado y dice qué lo sustituye.
  - Porqué: Borrar o reutilizar un nombre deja sin sentido los recuentos y las referencias viejas sin que nadie se entere.
  - Fuentes: [I] `ops/vocabularios-vida.json`
  - Detalle: `docs/entidades/N0-principios.md#11-se-depreca-no-se-borra`
- `discrete-first` — **Discreto primero.** Lo que se cuenta, se filtra o se agrupa toma valores discretos, y el texto libre ocupa solo un hueco declarado.
  - Porqué: Lo discreto se cuenta y se compara solo, y el texto libre se lee entero cada vez.
  - Fuentes: [F] https://google.aip.dev/126
  - Detalle: `docs/entidades/N0-principios.md#3-valores-discretos-en-los-atributos-texto-libre-solo-de-respaldo`
  - Viene de: claude:discreto-primero
- `entity-has-registry` — **Registro con definición.** Cada entidad tiene un registro con su id, su fuente de verdad y su ficha de glosario.
  - Porqué: Un nombre sin definición no basta, porque cada uno lo entiende a su manera y nadie comprueba su uso.
  - Fuentes: [I] `ops/entidades.json`
  - Detalle: `docs/entidades/N0-principios.md#6-toda-entidad-tiene-un-registro-con-definición`
- `names-have-form` — **Los nombres tienen forma.** Cada nombre de tabla, campo, id, valor o evento sigue un mismo patrón ASCII, con su separador y el sufijo de su tipo.
  - Porqué: Con un solo patrón, leer una tabla o un registro es leerlos todos, y con varios cada lectura es una adivinanza.
  - Fuentes: [I] `docs/entidades/N0-principios.md`
  - Detalle: `docs/entidades/N0-principios.md#5-los-nombres-tienen-forma-caracteres-separador-y-espacio-de-nombres`, `docs/datos/PRINCIPIOS.md#12-nombres`
  - Sin norma: Principio del N0 de entidades: su norma la pone el N1 de cada entidad, que aún no está escrito
- `one-word-one-meaning` — **Una palabra, un significado.** Cada concepto tiene un solo nombre y cada nombre un solo concepto, y el glosario anota los sinónimos prohibidos.
  - Porqué: Con siete nombres para lo mismo nada se cuenta ni se busca, y una palabra con dos sentidos confunde a quien la lee.
  - Fuentes: [F] https://google.aip.dev/190
  - Detalle: `docs/entidades/N0-principios.md#1-un-nombre-por-concepto-y-un-concepto-por-nombre`, `docs/entidades/N0-principios.md#2-los-sinónimos-prohibidos-se-escriben-una-vez`
  - Viene de: claude:una-palabra-un-significado
- `person-vs-identity` — **Persona e identidad distintas.** Quien responde y la cuenta con la que actúa son entidades distintas, y cada registro de acción guarda la identidad.
  - Porqué: Si se confunden, una App o una sesión parecen una persona, y nadie sabe quién responde de qué.
  - Fuentes: [F] https://www.w3.org/TR/prov-o/
  - Detalle: `docs/entidades/N0-principios.md#9-la-persona-y-la-identidad-son-entidades-distintas`
  - Sin norma: Principio del N0 de entidades: su norma la pone el N1 de cada entidad, que aún no está escrito
- `stable-unique-id` — **Id estable y único.** Cada entidad y cada fila lleva un id propio, único en su registro, que no cambia ni se reutiliza.
  - Porqué: Un id que cambia o se reutiliza rompe cada referencia que lo apuntaba, también las de los recuentos viejos.
  - Fuentes: [I] `docs/entidades/N0-principios.md`
  - Detalle: `docs/entidades/N0-principios.md#4-cada-entidad-tiene-un-id-estable-único-y-con-forma`, `docs/datos/PRINCIPIOS.md#3-claves-primarias`
- `who-what-when` — **Quién, qué y cuándo.** Todo lo que cambia guarda quién lo cambió, qué cambió y cuándo, con una identidad, un valor de vocabulario y un instante.
  - Porqué: Sin autor ni fecha nadie sabe desde cuándo consta un dato ni quién lo puso, y un error no se puede deshacer.
  - Fuentes: [F] https://www.w3.org/TR/prov-o/
  - Detalle: `docs/entidades/N0-principios.md#8-todo-lo-que-cambia-lleva-quién-qué-y-cuándo`, `docs/datos/PRINCIPIOS.md#9-fechas-de-cada-fila`, `docs/datos/PRINCIPIOS.md#18-quién-y-por-dónde`
