# Núcleo de la factoría

**Borrador** (Álvaro, 17 oct 2026; rama `ops/factoria`). Sustituye al
borrador largo del 14 oct, que añadía capas. Norma de las reglas de la
llamada del 15 oct: pocas piezas fundamentales muy buenas; quitar antes que
poner; cero dificultad para quien da las órdenes; un sistema que se cuida
solo; gasto bajo control. Todo lo de abajo es **propuesta**: nada está
aplicado al catálogo de Pablo.

## La cadena (una línea)

Principio → norma → agente → tarea → test. Cuando algo falla, el arreglo
cambia **una de esas piezas** (o el mecanismo que la hace cumplir); si no
cambia ninguna, es un arreglo a medias. La parte de arriba ya existe y está vigilada
(`ops/uniones.test.js`); lo demás de este documento es lo que se propone
recortar o fijar.

## 1. Principios: de 54 a 9 (8 + el de simplicidad)

Regla 1: solo los que sirven a agentes que tocan código y base de datos.
Regla 2: el 20 % que da el 90 % del impacto. Cada uno absorbe a los que
dicen lo mismo con otro ángulo. (La elección es por razonamiento, no medida:
la norma de impacto lo confirma o lo corrige una persona.)

| # | Principio núcleo | Absorbe | Estándar de mercado que lo respalda |
|---|---|---|---|
| 0 | **Simple primero: una pieza nueva quita otra o demuestra su valor medido** | (nuevo) | Ley de Gall, YAGNI; Anthropic, *Building effective agents* (añadir complejidad solo si mejora de forma demostrable) |
| 1 | **Lo irreversible lo hace una persona; todo cambio se ensaya, tiene vuelta atrás y la copia de la base se ha restaurado** | `reversibility-decides-autonomy`, `plan-evaluated-before-apply`, `progressive-deploy-with-rollback`, `expand-and-contract`, `rehearsal-undone-and-expires`, `emergency-access` | Continuous Delivery (Humble y Farley), regla de copias 3-2-1 con restauración probada, paridad de entornos de 12-factor |
| 2 | **Quien construye no juzga ni fusiona** | `builder-does-not-judge`, `builder-does-not-merge`, `calibrated-distinct-judge` | Separación de funciones (SOX, ISO 27001), revisión de código obligatoria |
| 3 | **Un test o un eval es el contrato**: se ve fallar antes de creerlo y nunca se afloja; lo que hace la IA se mide con evals antes y después | `test-is-the-contract`, `tests-are-not-relaxed` | Anthropic y OpenAI: evals como base del desarrollo con LLM; TDD |
| 4 | **Todo lo que gasta o escribe tiene un límite de daño y un presupuesto de error**; al rozarlo, se para | `bounded-blast-radius`, `know-when-to-stop` | SRE de Google (SLO y presupuesto de error), OWASP LLM10 (consumo sin límite), *jidoka* de Toyota |
| 5 | **Permisos mínimos, identidad propia, ante la duda se cierra, y el texto que llega de fuera es dato, nunca instrucción** | `least-short-lived-permissions`, `own-identity`, `user-does-not-widen-permission`, `deny-when-in-doubt` | Mínimo privilegio (NIST), OWASP LLM01 (inyección de prompt) y LLM06 (agencia excesiva) |
| 6 | **Cada verdad vive en un solo sitio y se lee allí**; lo no comprobado se dice «sin comprobar» | `one-fact-one-place`, `context-in-repo`, `one-word-one-meaning`, `state-read-at-source`, `declared-is-real` | *Single source of truth*, todo en control de versiones (CD) |
| 7 | **Cada fallo se arregla en su clase, sin culpables, con el mecanismo más duro posible** | `class-not-case`, `highest-mechanism` | Postmortem sin culpa (SRE), 5 porqués, *poka-yoke* |
| 8 | **Se miden resultados, no actividad**: cuatro cifras DORA más coste, antes y después de cada cambio | `number-before-and-after`, `no-number-without-question` | DORA / *Accelerate* (frecuencia, tiempo de entrega, tasa de fallo, tiempo de recuperación) |

Fuera del núcleo, a un **paquete de datos de HoMenu** (no es de la
factoría, se carga solo en proyectos con base de datos): `normalised-tables`,
`types-and-nulls`, `fk-declares-on-delete`, `json-or-table`,
`status-is-state-machine`, `days-hours-zones`, `versioned-concurrency`,
`table-has-owner-module`, `self-describing-catalog`, `health-data-apart`,
`pure-transformations`, `closed-vocabulary`, `discrete-first`, y los 7 de
entidades y nombres.

Quedan sin sitio, para decidir con Pablo: `one-change-one-intent` (7 normas;
ya lo impone la guardia, que es mejor que ser principio),
`person-over-the-loop`, `public-repo-no-sensitive-detail`,
`untamperable-trail`, `owned-expiring-resources`,
`explicit-over-clever` y los de metacalidad (`three-check-layers`,
`top-down`, `no-number-without-question`).

Nota: los 54 son solo los principios propios; `ops/principios/_catalogo.json`
delega más (producto, redacción), que no he contado.

## 2. Cadena de agentes: cuatro roles

| Rol (regla de la llamada) | Hoy en HoMenu | Hueco |
|---|---|---|
| Arquitecto (planifica) | `orquestador` clasifica y reparte; `analista` diagnostica. El `arquitecto` está aparcado desde el 8 oct | Ninguno hoy: se reactiva cuando toque un refactor grande |
| Implementer | `constructor` (299 líneas de instrucciones) | Demasiado largo: candidato a recorte |
| Reviewer | `revisor`, más cuatro jueces de zona: `seguridad`, `auditor-datos`, `qa`, `evaluador` | Quizá los cuatro jueces sean checklists del revisor y no agentes (a comprobar con el uso real) |
| Deployer | Vercel despliega staging solo; a `main` solo fusiona Pablo | Propuesta: **Pablo o Álvaro**, siempre una persona, por el botón del PR, con el CI en verde y vuelta atrás probada. Cambia la regla de `CLAUDE.md` «a main solo fusiona Pablo»: decisión de Pablo |

El CI/CD es `tests.yml` y los workflows; no pertenece a ningún agente.

**Estándar único de código (propuesta, 5 líneas, a validar):** funciones de
menos de 100 líneas · todo cambio lleva un test visto fallar · ningún dato ni
regla escritos en dos sitios · nombres enteros, sin nada montado en
ejecución · el lint con línea base solo baja. El revisor comprueba esas 5
contra el diff. Comprobado hoy: `eslint.config.js` **no** tiene regla de
tamaño de función (sin `max-lines`, `max-lines-per-function` ni
`complexity`), así que la primera línea sería nueva.

## 3. Mantenimiento con dos palabras

Diez tareas con orden corta. Cada una hace todo lo que puede sola y
devuelve **como mucho 3 acciones**, empezando por las que quitan algo
(principio 0). «Hoy» es lo que ya existe (leído por nombre, sin ejecutarlo).

| Orden | Cada cuánto | Qué mira | Hoy |
|---|---|---|---|
| revisa código | cada PR (automática) | diff contra el estándar de 5 líneas, tests vistos fallar | `revisor`, `tests.yml` |
| revisa fallos | diaria (automática) | fallos de producción, clasificados y con PR en borrador si el arreglo es claro | `agente-fallos.yml` |
| revisa despliegue | diaria (automática) + ensayo mensual de vuelta atrás | salud de staging y producción; que el *rollback* funcione | `salud-despliegue.yml`; el ensayo, no |
| revisa seguridad | semanal | secretos, permisos, endpoints sin credencial, dependencias, inyección de prompt | agente `seguridad`, Dependabot; sin orden corta |
| revisa datos | semanal + antes de cada migración | modelo, RLS, copia diaria y restauración mensual | `auditor-datos`; copia restaurada, no (#247) |
| revisa Lola | cada cambio de Lola + semanal | evals antes y después; calidad de respuestas | `evaluador`, `vigia-lola.yml` |
| revisa coste | semanal | gasto por modelo, agente y usuario contra presupuesto | **no existe** |
| revisa fondos | semanal | fondos abiertos (hoy 35), ventanas vencidas, encargos parados | `/revision-issues`, `fondos.yml` |
| revisa planos | semanal (automática) | nivel de cada plano medido | `planos-semanal.yml` |
| revisa higiene | semanal | degradación del propio sistema (skill de abajo) | **no existe**: borrador en `docs/ops/HIGIENE-DEL-SISTEMA.md` |

Una sola orden las agrupa: **«revisa todo»** lanza las semanales y junta un
informe de una pantalla.

## 4. Coste

| Qué | Hoy |
|---|---|
| Modelo por agente | `seguridad` y `auditor-datos` en opus; `evaluador` y `qa` en sonnet; el resto hereda el de la sesión |
| Precios | `ops/precios-modelos.json` (estimación a precio de API, comprobado el 9 oct) |
| Presupuestos | `ops/presupuestos.json`, por alcance y causa |
| Medición | `npm run fabrica`, a mano y por PC |

Reglas: fijar modelo explícito en los agentes que hoy heredan, y decidir si
los dos de opus lo necesitan (seguridad probablemente sí; datos, a revisar).
No sé cuánto cuesta hoy el sistema: falta lanzar `npm run fabrica` con las
transcripciones de cada PC.

## 5. Aparcado (no se construye todavía)

- Campo `exito` en las 76 tareas y su test (la última propuesta del borrador
  largo): añade una capa; se retoma solo si el núcleo lo pide.
- Segunda dimensión de causa («qué eslabón falló»): sobrevive solo como una
  etiqueta en la ficha del fondo. Ensayo del 14 oct sobre 5 fondos: se
  clasificaron todos y tres con la misma causa salieron en tres eslabones
  distintos (#595 mecanismo, #525 test, #314 norma). Lo clasificó una sola
  persona: falta una segunda opinión.
- Los 10 invariantes y la subida de nivel de los 13 planos.
- Mover el contrato factoría–proyecto del papel al código (necesita un
  segundo proyecto).

## 6. Lo que no se sabe

- Si 8 principios bastan: se prueba pidiendo a un agente que resuelva 5
  fondos viejos solo con ellos.
- Qué normas de las 168 quedan huérfanas al cambiar de 54 a 8: hay que
  remapear `principio` en `ops/normas.json`, y lo vigila `ops/uniones.test.js`.
  Es cambio de Pablo, con PR.
- Cuánto se usa cada agente y cada skill de verdad.
