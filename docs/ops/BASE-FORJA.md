# Base común, forja de estándares y glosario: diseño

Línea 2 del programa #652. **Solo diseño**: no cambia `ops/normas.json`, `ops/glosario/`, `ops/entidades.json` ni ningún id. Cada cifra sale de `node scripts/base-forja-medir.mjs [glosario|dominios|mapeo|normas|reglas|tareas|conexion]` (solo lee el repo, sin red) o del fichero que se cita. Lo que no se ha podido comprobar está en la última sección. Datos leídos el 12 oct 2026 sobre `origin/staging`.

## 1. Resumen

1. Hay una **base** que toda forja hereda, con tres partes: redacción, metas y fuente de industria. Los pasos se llaman, no se numeran: `base` → `forja` de la familia → `plantilla` por tipo → `pieza`.
2. **Estándar** pasa a significar solo la ejecución de una tarea de un agente. La forja de estándares tiene una entrada por tipo de tarea; el tipo de tarea es la `accion` que ya existe (siete valores).
3. La unidad exigible se llama **norma**, con ámbito y acción. Los 75 criterios de la forja y las 175 reglas de estándar pasan a ser normas; los 183 ids de hoy no se tocan.
4. El glosario tiene dos pisos: la base y los dominios. Basta un campo `dominio`; carpetas, cuando haya un segundo proyecto.
5. Cada término se mapea a 0..N entidades con una relación que fija su `clase`. Un repaso propio, la skill `higiene-de-vocabulario`, nace cuando existan campo y mapeo.

## 2. Lo que hay hoy (comprobado)

| Cosa | Cifra | Comando o fichero |
|---|---|---|
| Normas | 183; 0 con más de un ámbito; 16 con `concepto` explícito | `base-forja-medir.mjs normas` |
| Principios | 111 (56 propios, 40 de producto, 15 de redacción); 108 citados por alguna norma | ídem |
| Principios con una sola norma | **75** (35 producto, 25 propios, 15 redacción); 3 sin norma | ídem |
| Criterios de la forja | 75 (formal 43, material 16, subjetiva 16); 0 citan principio; 0 chocan de id con una norma | `base-forja-medir.mjs reglas` |
| Tareas de agente | 66 de 9 agentes (5 jueces, 4 constructores); 16 con más de un ámbito | `base-forja-medir.mjs tareas` |
| Reglas de estándar | 156 propias + 19 en tareas comunes = 175; 143 con control `juicio`, 32 con fichero | `base-forja-medir.mjs reglas` |
| Fuentes del catálogo de estándares | 66 (49 externas) | `ops/estandares-agentes.json` |
| Términos del glosario | 85 activos, todos con `aplica_a: ["todas"]`, 80 con relaciones | `base-forja-medir.mjs dominios` |
| Entidades | 41; 33 con término; las 8 sin término son verticales de producto | `base-forja-medir.mjs conexion` |
| Campos de las 5 fichas de la forja | 44; solo 3 se llaman como un término | ídem |

Dos usos de «nivel» chocan hoy: el 0/1/2 de la forja (pieza meta, plantilla, pieza) y el nivel 1/2 de las pruebas de skills (forma en el CI, medida con modelo). `base-forja-medir.mjs glosario` cuenta 46 usos de «nivel 0/1/2» en 13 ficheros de las zonas; no se ha separado a mano cuántos son de cada sentido.

## 3. La base común

### 3.1 Qué contiene

| Parte | Qué fija | Dónde vive hoy | Propuesta |
|---|---|---|---|
| Redacción | Para cada tipo de texto: voz, modo, tiempo, persona y sintaxis | `forma_practica` (solo para la práctica de un estándar), `scripts/lib/regla.mjs` (EARS y RFC 2119) y 15 normas de ámbito `writing` | Un bloque `redaccion` en la base, una fila por tipo de texto (tabla 3.2) |
| Metas | Seis objetivos que toda norma sirve (3.3) | `precedencia.concepts` en `ops/principios/_catalogo.json`: 4 conceptos | Ampliar a seis y hacerlos explícitos en cada norma |
| Fuente de industria | Cada meta, cada forja de tipo y cada norma nueva lleva al menos una fuente `[F]` | `MARCAS_FUENTE` ya distingue las marcas de fuente | Regla de la base: una forja sin `[F]` no se acepta |

### 3.2 Redacción por tipo de texto

La heurística de voz, modo, tiempo y persona ya existe (`scripts/lib/forjaForma.mjs`) pero solo mira la práctica de un estándar. La base la declara para todos los tipos de texto y las forjas pueden endurecerla, nunca relajarla.

| Tipo de texto | Voz | Modo y tiempo | Persona | Sintaxis |
|---|---|---|---|---|
| Norma | activa | indicativo con DEBE, NO DEBE o CONVIENE; exigencia en infinitivo | tercera | EARS: `[condición,] sujeto DEBE exigencia` (`regla.mjs`) |
| Principio o porqué | activa | presente de indicativo | tercera | una frase de 25 palabras como mucho, sin palabras de fuerza |
| Práctica de una forja | activa | imperativo | segunda | regla · porqué · ejemplo bueno · ejemplo malo · fuente |
| Cuerpo de una skill | activa | imperativo | segunda | pasos con su salida observable |
| Respuesta a Pablo | activa | presente | primera y segunda | la forma de `estilo-de-respuesta` |

### 3.3 Metas

Propuesta de seis valores cerrados. Las cuatro primeras ya existen como `concepts` y su orden decide qué gana cuando dos normas chocan (`precedencia.clash`); las dos últimas son las de Pablo.

| Meta | Qué defiende | Fuente de industria (a contrastar) |
|---|---|---|
| seguridad | que nadie ajeno entre ni haga más de lo que le toca | OWASP ASVS, ya en el catálogo (`owasp-asvs`) |
| datos de familias | que no se pierdan, mezclen ni enseñen a quien no toca | `owasp-idor`, `pg-rls`, ya en el catálogo |
| coste | que el gasto no se descontrole | `an-cache` y `an-choose-model`, ya en el catálogo |
| intervención humana evitable: 0 % | que una persona solo intervenga donde CLAUDE.md lo exige (8 puertas irreducibles) | Google SRE, «Eliminating Toil»; **no está en el catálogo y no la he abierto** |
| UX por y para agentes | que lo que usa un agente tenga salida con forma fija, error con causa y arreglo y ninguna pregunta a mitad | `an-tools-agents` (Anthropic, herramientas para agentes), ya en el catálogo |
| velocidad | que el trabajo avance | la de hoy (cede ante las demás) |

El orden de las dos metas nuevas es una propuesta mía: entre coste y velocidad, para que reducir intervenciones nunca debilite la seguridad. Falta decidirlo.

«0 % de intervención humana evitable» se puede medir solo si existe el evento `intervencion_humana` con su campo `evitable`. Eso lo propone `docs/entidades/analisis/agentes.md` (decisiones 2 y 3) y es de otra línea; sin él la meta de la base queda declarada pero sin cifra. Es la regla «ninguna cifra sin pregunta».

### 3.4 Pasos con nombre

Sin números negativos ni escala nueva. El campo `nivel` (0, 1, 2) se sustituye por `paso`, de vocabulario cerrado, y el 0/1/2 queda como alias hasta que nadie lo lea.

| Paso | Qué es | Hoy | Hereda de |
|---|---|---|---|
| base | lo común a toda forja | disperso (3.1) | nada |
| forja | lo que hace buena a una pieza de una familia | `ops/forja/` (skills, estándares); la de estándares aún sin pieza meta | base |
| plantilla | el molde por tipo | 7 tipos de skill en `.claude/plantillas-skill/`; el tipo de tarea (4.1) | forja |
| pieza | una skill, una tarea de un agente | 15 skills, 66 tareas | plantilla |

Regla de herencia: cada paso declara `hereda` (el paso de arriba) y solo puede endurecer. Una norma que la base marca DEBE no pasa a CONVIENE en una forja.

## 4. Forja de estándares por tipo de tarea

### 4.1 El tipo de tarea es la acción

No hace falta vocabulario nuevo: `accion` ya tiene siete valores y las normas ya los usan en `acciones`. Medido en el catálogo:

| Tipo (acción) | Tareas | Agentes | Reglas | Fuentes distintas (externas) | Más citadas |
|---|---|---|---|---|---|
| construir | 20 | 4 | 76 | 35 (25) | an-evals 10, casa-design-system 9, casa-lola-regla 9 |
| juzgar | 22 | 5 | 76 | 34 (25) | casa-principios-datos 11, casa-plantilla-agente 8, gg-estandar 6 |
| medir | 6 | 4 | 30 | 9 (4) | an-evals 13, casa-lola-regla 6 |
| documentar | 6 | 6 | 25 | 16 (6) | casa-plantilla-agente 4 |
| diagnosticar | 4 | 4 | 21 | 8 (5) | sre-troubleshooting 6, sre-postmortem 5 |
| operar | 6 | 2 | 16 | 11 (9) | casa-claude 2, gh-protected-branches 2, owasp-secrets 2 |
| decidir | 2 | 1 | 7 | 4 (2) | casa-principios-datos 3 |

«Constructor → generación de código» corresponde a `construir` (20 tareas, solo de constructores). `juzgar` es solo de jueces (22 de 22). Los demás tipos mezclan constructores y jueces.

### 4.2 Qué lleva una forja de tipo y una pieza

| Elemento | Forja de tipo (plantilla) | Pieza: estándar de un agente en una tarea |
|---|---|---|
| Identidad | el tipo (`accion`) | agente + id de tarea (66 hoy) |
| Buenas prácticas | de 2 a 5, con la forma de `forma_practica` y una fuente `[F]` obligatoria | las hereda; no las repite |
| Normas | las que tienen ese tipo en `acciones` (consulta) | las de sus ámbitos y su acción, por consulta; `normas` solo para citar una más |
| Específico de la pieza | nada | `tarea`, `ambitos`, `origen`, `no_hace`, `rondas` |
| Reglas propias | no | **desaparecen**: pasan a normas (sección 6) |

Hoy las buenas prácticas están repartidas por ámbito dentro de las 175 reglas y no hay una por tipo. Las 3 rondas de investigación de la forja (buscar, contrastar, destilar) hay que hacerlas por tipo; no las he hecho. Como semilla, las fuentes más citadas de la tabla anterior, sin haber leído cada fuente.

## 5. «Estándar» solo es la ejecución de una tarea de agente

Hoy el glosario lo usa también para el tipo de skill. Nombre propuesto para ese segundo uso: **plantilla del tipo** (término `plantilla`, que la forja ya usa). El apartado «El estándar de cada tipo» de `.claude/PLANTILLA-SKILL.md` pasa a «La plantilla de cada tipo» y, en el molde generado, «El estándar de este tipo» a «La plantilla de este tipo». Los ids no cambian (por ejemplo `tipo-sin-estandar`): son identificadores.

Para que lo cumpla un test, el glosario prohíbe las frases viejas como sinónimos de `plantilla`: nueve variantes (`FRASES_ESTANDAR_DE_TIPO` en el script). Se miden con el propio `medir()` del glosario:

| Dónde | Usos |
|---|---|
| Zonas del glosario (lo que vería el test) | 7 en 6 ficheros: «estándar de cada tipo» 4, «de un tipo» 2, «por tipo» 1 |
| Fuera de las zonas (tests y scripts, que el test no lee) | 27 (16 en `.claude/`, 11 en `scripts/`) |

Las otras acepciones de la palabra no se tocan: la entrada y la salida estándar (3 en las zonas) y el estándar abierto de skills (5). La clasificación por sentido del script es una heurística por línea; la cifra firme es la de la tabla de arriba.

## 6. Una sola palabra para lo exigible: norma

### 6.1 Cuánto toca cada palabra

| Palabra | Usos en la prosa de las zonas | Como unidad exigible |
|---|---|---|
| criterio / criterios | 75 + 53 = 128 en 29 ficheros (36 en `docs/ops/FORJA.md`, que se regenera) | 16 usos en frases como «criterios de la forja» o «de calidad» |
| regla / reglas | 348 + 135 = 483 en 56 ficheros | 43 usos en frases como «regla de la casa» (28) o «reglas propias» (13) |
| norma / normas | 175 + 82 | ya es la unidad |

Retirar `criterio` entero es mecánico pero toca 128 usos, de los que unos 112 son castellano corriente («criterio de parada»). Retirar `regla` entera toca 483 y no es razonable. De ahí que se proponga retirar `criterio` y dejar `regla` como el fichero de `.claude/rules/` (decisión pendiente 2 del informe).

### 6.2 Los 75 criterios

Cada criterio ya tiene casi los campos de una norma (nombre, sujeto, fuerza, exigencia, control, fuente). Propuesta de mapeo:

| Campo del criterio | Campo de la norma | Nota |
|---|---|---|
| `id` | `id` | sin cambios; 0 choques con los 183 |
| `aplica_a` (skill 51, estandar 23, ambos 1) | `ambito` y `acciones` | ámbito `process`; acciones `construir` y `juzgar` |
| `tipos` | `tipos` (campo nuevo, opcional) | qué tipos de skill alcanza |
| `capa` | derivada de `control_tipo` y de si tiene lista de excepciones | formal: test sin excepciones; material: heurística con excepciones; subjetiva: `juicio` |
| `sujeto` | `sujeto` | se funden los vocabularios: 11 sujetos de la forja pasan a `ops/normas.json` |
| `fuente` | `fuente` | se mantienen las marcas de `MARCAS_FUENTE` |
| `principio` | `meta` | los 75 criterios no citan principio hoy; se les da la meta por defecto de su ámbito y se revisa |
| `casos_calibracion`, `cumple`, `no_cumple` | igual | solo los 16 subjetivos |

### 6.3 Las 175 reglas de estándar

| Cuestión | Dato | Consecuencia |
|---|---|---|
| Ids | `kebab(nombre)`: 0 choques con normas o criterios; 1 nombre repetido (`sin-navegador-dicho`, 2 reglas) | prefijar solo ese caso con la tarea |
| Tareas con más de un ámbito | 16 de 66; 42 reglas propias están en ellas | la norma tiene un solo ámbito: hay que elegir uno por regla |
| Alcance al pasar de «esta tarea» a «ámbito × acción» | 18 reglas no llegarían a ninguna otra tarea; 138 llegarían a otras, con mediana 4 y máximo 12 (en el ámbito más estrecho) | falta un limitador: campo opcional `tareas` (lista de ids) que restringe la consulta |
| Parecido a una norma | 4 en `reglas_que_no_son_norma` y 15 citas explícitas | las parecidas se funden con su norma antes de migrar |
| Control | 143 de 175 son `juicio` | quedan como normas con `control: juicio`; no empeora nada, pero tampoco mejora |

Resultado esperado: de 183 normas se pasaría a un máximo de 433 (183 + 75 + 175), menos las que se fundan por parecidas.

## 7. Plan de migración de las normas y los principios

### 7.1 Los ids que no se pueden perder

| Quién cita | Cifra | Qué obliga |
|---|---|---|
| La guardia (`.claude/hooks/avisos-guardia.mjs`, campo `codigo`) | 42 avisos, **27 normas distintas** (lista exacta al final del informe de `normas`) | el id de esas 27 es estable sí o sí |
| Skills (`metadata.normas`) | 48 normas distintas | ídem |
| Marcas `<!-- norma:id -->` | 28 marcas, 18 normas, 14 ficheros | ídem |
| Eventos (`norma: <id>`) y la línea `Excepción: <id>` del PR | 3 ficheros de hooks que escriben el id | un id desaparecido rompe el conteo |
| Cualquier otro fichero | 142 normas se citan por id fuera de los catálogos; **41 no las cita nadie** | los 183 ids se congelan igual: más simple que decidir caso a caso |

Los 75 principios de una sola norma: 70 se citan por id fuera de su catálogo (docs 69, ops 38, skills 10, CLAUDE.md y reglas 6). Ninguno se cita en un hook. 9 los cita la skill `principios-de-producto`, y 35 de los 75 son principios de producto.

### 7.2 Qué se hace con los 75

Propuesta (decisión pendiente 1 del informe): se pliegan los 40 de proceso (25 propios y 15 de redacción) y los 35 de producto se quedan.

| Grupo | Nº | Qué pasa | Qué id se conserva |
|---|---|---|---|
| Proceso, de una norma | 40 | su `porque` y sus fuentes pasan a la norma que los cita (`porque`, `fuente`); el principio se retira con `pasa_a` la meta de esa norma | el id de la norma no cambia; el del principio queda en `origen_principio` de la norma y como retirado en `ops/vocabularios-vida.json` |
| Producto, de una norma | 35 | se quedan en `ops/principios-producto/`: son conocimiento para decidir, los lee la skill `principios-de-producto` y la recomendación «cita su principio por id» | ambos |
| Proceso, de varias normas | 28 propios (2 a 7 normas cada uno) | cada norma recibe su `porque` propio; el principio se retira igual | ambos |
| Sin norma | 3 | se quedan como están hasta que decida Pablo (`principios_sin_norma`, techo que solo baja) | el del principio |

Las normas pasan a llevar `meta` (seis valores, 3.3) en vez de `principio`. Hoy 16 normas llevan `concepto` explícito y el resto lo hereda del ámbito; con `meta` explícita en las 183 la herencia desaparece y la precedencia lee un campo, no una tabla.

### 7.3 Orden de los PR

| Fase | Contenido | Puerta (test) |
|---|---|---|
| F1 | Glosario: términos de la sección 8, campo `dominio`, campo de mapeo | `ops/glosario.test.js` y los dos nuevos de la sección 11 |
| F2 | Base y pasos: `ops/forja/base.json`, `paso` en lugar de `nivel`, rename del apartado de la plantilla | `ops/base.test.js` |
| F3 | Normas: campos nuevos (`meta`, `porque`, `fuente`, `origen_principio`, `tipos`, `tareas`) sin quitar nada | `ops/normas.test.js` + test de ids congelados |
| F4 | Criterios → normas (75), sin cambiar ids | ídem, y `ops/forja.test.js` lee de normas |
| F5 | Reglas de estándar → normas (175) y retirada de `reglas` en las tareas | `ops/estandares-agentes.test.js` y `ops/uniones.test.js` |
| F6 | Plegar los 40 principios y pasar a `meta` | `ops/principios.test.js`, `ops/precedencia.test.js` |

Cada fase es reversible hasta fusionar; ninguna borra un id.

## 8. Glosario: cambios exactos (sin aplicar)

Cifras de «usos» = apariciones en la prosa de las zonas, medidas con `medir()` de `scripts/lib/glosario.mjs`. Un término no se borra: se retira con `pasa_a` (`problemasDeVidaGlosario`). Cambiar la definición de un término activo no lo bloquea ese control (lo leí en su cabecera, no lo he probado).

| Término | Definición actual | Definición nueva | Sinónimos prohibidos | Usos que toca |
|---|---|---|---|---|
| estándar | «El conjunto de criterios que dice qué es hacer bien una tarea de agente o un tipo de skill, con qué comprueba, qué no hace y su fuente.» | «El modo en que un agente ejecuta una tarea suya, que fija las normas que la rigen, con qué se comprueba, qué no hace y su fuente.» Nota: «El de un tipo de skill es la plantilla del tipo.» Relacionado: norma, tarea de agente, plantilla (sale criterio) | ninguno | 0 por sí mismo; los 7 van por plantilla |
| plantilla | «El molde de una forma común que se repite: la de skills, la de agentes, la del encargo y los formularios de issue.» | «El molde de una forma común que se repite y hereda de la base y de la forja de su familia: el de cada tipo de skill, el de agente, el del encargo y los formularios.» | los dos actuales y las nueve frases «estándar de cada tipo», «de un tipo», «del tipo», «de este tipo», «por tipo», «para cada tipo», «de los tipos», «por tipos», «estándares de los tipos» | 7 en zonas, 27 fuera |
| norma | «Una obligación del proceso que está registrada en ops/normas.json, con quién la hace cumplir, su dureza y su test.» | «Una obligación exigible del proceso que declara su ámbito, su acción, su fuerza y su control y se registra una sola vez en ops/normas.json; absorbe al criterio y a la regla propia.» | las 11 frases «criterio de la forja», «criterios de la forja», «de calidad», «de juicio», «de skill», «de la skill», «de las skills»; y las 10 «regla propia», «reglas propias», «de la casa», «del estándar», «de un estándar», «de la forja» | 16 (criterio) + 43 (regla) |
| criterio | «Una condición de calidad que lleva id, fuente y quién la vigila (un control o un juez).» | retirado, `pasa_a: norma` | su nombre pasa a prohibido de `norma` | 128 en 29 ficheros (36 en FORJA.md, que se regenera) |
| regla | «Una condición concreta que hay que cumplir, escrita donde se aplica: un fichero de .claude/rules/, la guardia o un test.» | «Un fichero de .claude/rules/ que Claude Code carga al tocar una zona y que recuerda normas; no es una unidad exigible.» | se mantienen «directriz» y «pauta» | 0 (las 43 frases ya van por norma) |
| principio | «Una razón de fondo que dice por qué se pide algo, con su fuente; vive en la lista única de ops/principios/ y de ella salen las normas.» | «Una razón de fondo del producto, con su fuente, que decide cómo se diseña algo para las familias; la de una norma de proceso es su porqué.» | ninguno | 0 |
| tarea de agente | «Un tipo de trabajo que repite un agente, con su estándar, en ops/estandares-agentes.json.» | «Un tipo de trabajo que repite un agente, con su tipo de tarea, sus ámbitos y su estándar, en ops/estandares-agentes.json.» | ninguno | 0 |
| control | «Una comprobación automática concreta con su código de vocabulario cerrado, que da falta, aviso o bien.» | sin cambio de texto; se anota que `norma.control` es el fichero que la ejecuta | ninguno | 0 (choque conocido, ver decisión pendiente en el análisis de conocimiento) |

Términos nuevos (todos con su `en` para `ops/entidades.test.js`):

| Término | Clase | Definición propuesta |
|---|---|---|
| meta | campo | «Un objetivo de la base que una norma sirve y que ordena qué gana cuando dos normas chocan; hay seis, de vocabulario cerrado.» |
| base | artefacto | «La parte común que toda forja hereda: su redacción, sus metas y la obligación de una fuente de industria.» |
| forja | artefacto | «El catálogo de una familia de piezas que dice qué las hace buenas, hereda de la base y da su plantilla por tipo.» |
| pieza | artefacto | «Una cosa concreta que cumple una forja: una skill, un agente o la tarea de un agente.» |
| tipo de tarea | campo | «La acción de una tarea de agente (construir, juzgar, diagnosticar, operar, medir, documentar o decidir) cuya forja da sus buenas prácticas.» |
| ámbito | campo | «La parte del trabajo a la que pertenece una norma o un principio, de un vocabulario cerrado de once valores.» |
| acción | campo | «Lo que se hace en una tarea, de un vocabulario cerrado de siete valores; con el ámbito, decide qué normas le llegan.» |
| fuerza | campo | «El grado de exigencia de una norma: debe, no debe o conviene.» |
| veredicto | campo | «Cuánto se hace cumplir una norma hoy, con un valor de `VEREDICTOS` de `scripts/lib/escalas.mjs`.» |
| dominio | campo | «El área de la factoría a la que pertenece un término del glosario, de vocabulario cerrado; no es la zona donde se busca.» |
| paso | campo | «El peldaño de herencia de una pieza: base, forja, plantilla o pieza.» |

Salen de la lista de pendientes del glosario por esto: `ámbito`, `acción`, `fuerza` y `veredicto` son campos que hoy usan las normas y no tienen término.

## 9. Glosario conectado a entidades, campos y forjas

### 9.1 Lo que ya existe y lo que falta

| Parte | Estado |
|---|---|
| Entidad → término | `ops/entidades.json` tiene `term` y `ops/entidades.test.js` lo comprueba: 33 de 41 (las 8 sin término son verticales) |
| Campo del molde → término | **0 vigilados**: de 44 campos de las fichas de la forja, 3 se llaman como un término. Al irse la ficha `criterio` quedan 36 |
| Forja → término | **0**: ninguna forja nombra el suyo |

Propuesta: cada campo de `ops/forja/campos_ficha/` lleva `termino` (el de lo que contiene; varios campos pueden compartirlo, como `nombre`, `nota` o `fecha`, que irían a unos pocos términos genéricos) y cada forja lleva el suyo. Test `ops/glosario-conexion.test.js`: el término existe, está activo y su clase es coherente con el campo. Cuántos términos nuevos hacen falta exactamente, sin implementarlo, no lo sé.

### 9.2 Dos pisos, no tres

Piso 1: la base del glosario (qué es un término, la forma «un X que Y», estado y retirada, el test). Piso 2: los dominios y los proyectos, que solo añaden o estrechan. Un proyecto (HoMenu, el panel) es un valor más de `dominio`, no un piso.

Campo propuesto: `dominio`, de vocabulario cerrado (`base`, `ops`, `datos`, `producto`, `diseno`, y los proyectos que vengan). No es `aplica_a`, que sigue diciendo en qué zonas de ficheros se buscan los sinónimos.

Cuenta propuesta (mi clasificación, a revisar):

| Dominio | Términos | Ejemplos |
|---|---|---|
| base | 57 | agente, juez, norma, principio, comprobar, hook, skill, vocabulario |
| ops | 24 | rama, pr, issue, fondo, encargo, despliegue, staging, clave |
| datos | 3 | migración, tabla, fuente de datos |
| producto | 1 | persona de la casa |
| diseño | 0 | aún no hay glosario de diseño |

De las 138 relaciones entre términos, 24 cruzan de dominio. Cada forja declara `dominios` (la base va siempre).

Invariante, con test (`ops/glosario-dominios.test.js`): un término de dominio no puede tener el nombre de uno de la base, ni el de un sinónimo prohibido de la base, ni una definición que el test de forma marque como choque. Puede estrechar con `amplio` hacia un término de la base. Nunca lo contrario.

**¿Carpetas ya o basta el campo?** Basta el campo. Con 85 términos y un fichero por término ya partido (`ops/glosario/terminos/`), mover a subcarpetas no añade nada y no he comprobado si `componer` de `scripts/lib/catalogos.mjs` acepta subcarpetas de un catálogo con `$partida`. Se parte cuando un dominio pase de unos 100 términos o llegue el glosario de otro proyecto con su propio repo. El diseño de la familia de diseño (base → forja de diseño → tipos → subtipos opcionales → referencia concreta) es horizontal; HoMenu y el panel serían referencias de proyecto con `dominio: producto` o el propio.

## 10. Mapeo término → entidad

### 10.1 Regla

Cada término puede nombrar entre 0 y N entidades; la relación la fija su `clase` y se guarda como dato en el propio término (`entidades: [{ entidad, relacion }]`), con la entidad leída de `ops/entidades.json` (solo lectura aquí).

| Clase del término | Relación | Términos | Los nombra hoy una entidad en `term` |
|---|---|---|---|
| artefacto | denota | 42 | 24 |
| campo | campo_de | 7 | 2 |
| estado | valor_de | 3 | 0 |
| rol | rol_de | 10 | 5 |
| acción | acción_sobre | 16 | 0 |
| lugar | ubicación_de | 7 | 2 |

Test `ops/glosario-mapeo.test.js` (propuesto): la relación es la de la clase; la entidad existe; toda entidad no vertical tiene al menos un término; un artefacto sin entidad declara un motivo cerrado (`componente`, `salida`, `paso`, `meta`, `retirado`, `candidato`). El campo `term` de `entidades.json` queda como está hasta el registro v2.

### 10.2 Primer caso: los 18 artefactos que ninguna entidad nombra

Lista comprobada con `base-forja-medir.mjs mapeo`: arreglo, capa, caso de prueba, control, criterio, defecto, entidad, estándar, evidencia, ficha, guardia, hallazgo, informe, juicio de skill, plantilla, tarea de agente, tarea, test.

| Grupo | Términos | Propuesta |
|---|---|---|
| Deberían ser entidad (o nombrar una) | **tarea de agente**: la entidad `agent-task` (hijo del agente; en el análisis de agentes, 66 ids únicos); **estándar**: nombra la misma entidad, es su pieza; **guardia**: nombra `hook` (es un hook); **caso de prueba**: nombra `eval` (el de skill); **tarea**: nombra `session` (una sesión = una tarea); **criterio**: se retira y pasa a `norm` | `agent-task` es la única entidad nueva y es del registro v2 |
| Son campo de otra entidad | **control**: campo de `norm` (cambiar su clase a campo); **ficha**: campo de `root-problem` y de `assignment` (dos entidades: el 0..N); **arreglo**: campo de `root-problem`; **evidencia**: campo de los juicios y los casos | cambiar la clase de cuatro términos |
| Candidato a entidad | **hallazgo** y **juicio de skill**: el análisis de agentes dice que lo que sí es entidad es el juicio; hoy no hay registro | nombrar `judgment` cuando exista; mientras, motivo `candidato` |
| No son nada | **capa** (parte de una skill), **plantilla** (un paso de herencia), **informe** (salida efímera de un agente), **defecto** (salida de una comprobación), **test** (el fichero de un control), **entidad** (el concepto mismo) | motivo cerrado (`componente`, `paso`, `salida`, `meta`) |

Recuento: 6 + 4 + 2 + 6 = 18.

## 11. Qué se automatiza con test

| Test propuesto | Qué vigila | Reutiliza |
|---|---|---|
| `ops/base.test.js` | la base tiene redacción para cada tipo de texto, las seis metas con su fuente `[F]`, y cada paso declara `hereda` y no relaja | `forjaForma.mjs`, `regla.mjs` |
| `ops/ids-normas.test.js` | los ids de `origin/staging` siguen existiendo (o se retiran con `pasa_a`), y las 27 normas de la guardia nunca desaparecen | como `problemasDeVidaGlosario` |
| `ops/normas.test.js` ampliado | cada norma tiene `meta` y `porque`; `meta` es de las seis; `tareas` apunta a ids que existen | `scripts/lib/normas.mjs` |
| `ops/glosario-conexion.test.js` | cada campo de ficha y cada forja nombran un término activo | `leerGlosario` |
| `ops/glosario-dominios.test.js` | `dominio` cerrado, invariante «solo añade», dominios que declara cada forja | `problemasDeGlosario` |
| `ops/glosario-mapeo.test.js` | relación por clase, entidad existente, artefacto sin entidad con motivo | `ops/entidades.json` |
| frases del glosario | «estándar de cada tipo» y las frases de criterio y regla fallan como sinónimos de `plantilla` y `norma` | `ops/glosario.test.js` tal como está |
| métrica de la meta | cuando exista el evento `intervencion_humana`, la cifra de evitables por encargo | otra línea |

Cada test nuevo se ve fallar una vez antes de creerlo.

## 12. La skill `higiene-de-vocabulario`

**¿Ya o cuando existan dominios?** Propongo crearla en el PR de F1 (campo `dominio` y mapeo), no antes: hoy su trabajo es el paso 7 de `higiene-de-skills` con `npm run glosario -- --medir` y `--candidatos`, y solo se justifica separarla cuando haya un segundo piso y el mapeo (`forja-de-skills`: dos usos o más, sin repetir, con dueño y test). Dueño: `gobierno`. Tipo: revisión (juzga un artefacto que ya existe). Hermana de `higiene-de-skills`, que cede el paso 7.

Qué revisa:

| Código | Señal | Capa |
|---|---|---|
| `termino-sin-entidad` | artefacto sin entidad ni motivo | formal |
| `entidad-sin-termino` | entidad no vertical sin término | formal |
| `sinonimo-nuevo` | sinónimo prohibido nuevo (lo que ya mide `--medir`) | formal |
| `definicion-choca-con-base` | definición de dominio casi igual a una de la base con otro género | material |
| `dominio-redefine-base` | mismo nombre o sinónimo prohibido de la base | formal |
| `equivoco-entre-dominios` | el mismo nombre en dos dominios con definiciones distintas | material |

Casos de prueba (`casos.json`): tres que la cargan y tres de frontera.

| Petición | Debe salir |
|---|---|
| «repasa el glosario y dime qué términos no tienen entidad» | corre el mapeo y lista los artefactos sin entidad con su propuesta |
| «he añadido un término `token` en diseño y ya existe en ops, ¿choca?» | marca `equivoco-entre-dominios` |
| «¿puedo redefinir `norma` en el glosario de datos?» | responde que no: `dominio-redefine-base` |
| «arregla esta skill, le falta la sección de método» | frontera: es `higiene-de-skills` |
| «añade el término `cola` al glosario» | frontera: crear un término es una edición, no un repaso |
| «¿cuántas migraciones hay sin aplicar?» | frontera: es de `datos` |

## 13. NO COMPROBADO

- Ninguna URL de fuente externa se ha abierto en esta sesión. La de Google SRE «Eliminating Toil» no está en el catálogo de fuentes: es la que propongo para la meta de intervención humana y hay que contrastarla.
- La clasificación de los 85 términos en dominios y la de los 18 artefactos son mías; no las ha visto Pablo ni el revisor.
- El reparto de «nivel 0/1/2» entre sus dos sentidos (solo el total, 46 usos).
- Que `componer` de `scripts/lib/catalogos.mjs` acepte subcarpetas en un catálogo partido.
- Que cambiar la definición de un término activo no choque con ningún otro test del glosario o de vocabularios (solo he leído `problemasDeVidaGlosario`).
- Que las 27 normas de la guardia sean las únicas cuyo id lee un hook: he contado el campo `codigo` de `avisos-guardia.mjs` y la aparición literal del id en `.claude/hooks/`.
- El comportamiento del campo `capa` frente a `veredicto` y a `problemasDeDureza` cuando un criterio pase a norma.
- El orden de precedencia de las dos metas nuevas.
- La cifra de «138 reglas que llegarían a otras tareas» supone que la regla pasa a un solo ámbito (el más estrecho) y la misma acción; no he simulado el efecto en `uniones.test.js`.
- Cuántos términos nuevos pedirían los 36 campos de ficha sin término.
