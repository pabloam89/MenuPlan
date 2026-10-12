# Contrato proyecto–factoría

Qué necesita saber la factoría (el proceso: hooks, guardia, normas, skills de oficio, flujo) de un proyecto (HoMenu hoy; el panel y otros mañana), y qué le promete a cambio. Es la línea 3 del programa #652. **Hoy es un diseño con una parte medida**: no existe ningún `factoria.json`; lo que sí existe es la separación por zonas (`ops/zonas.json`), el campo `proyecto` en los eventos y las métricas, el actor nombrado y el evento `intervencion_humana`. Nada se ha movido de sitio.

Origen: el informe de diseño de `gobierno` del 12 oct 2026 (sección e), corregido con lo que se comprobó al construir esta línea (tabla al final). Comprobado = leído o contado con el comando citado; Creo = inferencia sin comprobar.

## Cómo se mide la separación

`npm run zonas-proyecto` cuenta cuántos ficheros del repo son de cada zona, según `ops/zonas.json` (reglas por prefijo, patrón y excepción; `ops/zonas.test.js` falla si un fichero versionado no cae en ninguna, o si lo mixto pasa de su tope, que solo baja). Una línea por zona (`zonas-proyecto zona: <zona> ficheros: n`) y una de total (`zonas-proyecto total: n sin_zona: n`). Las tres zonas:

- `factoria`: el proceso (hooks, normas, skills de oficio, scripts de flujo, su documentación).
- `producto`: HoMenu (app, Lola, catálogo, base, imágenes y sus scripts).
- `mixto`: sirve a los dos o es la puerta entre ambos. Es lo que falta por separar; por eso su tope solo baja.

La clasificación es por nombre y por la lectura de algunas cabeceras, no fichero a fichero (±30 ficheros de margen, como ya avisaba el informe). Se corrige moviendo una regla.

## Lo que debe aportar el proyecto

Un fichero por proyecto en su raíz (`factoria.json`, nombre provisional) que la factoría lee y un test de la factoría valida. **Es todo lo que la factoría necesita saber del proyecto**; lo que no esté ahí, no lo supone. «Hoy» dice dónde vive cada dato ahora; «lector» dice quién lo usa. Un campo sin lector hoy no entra en el fichero hasta que lo tenga (ningún campo sin lector).

| Bloque | Campos | Hoy vive en | Lector hoy |
|---|---|---|---|
| Identidad | `id` (vocabulario `eventos.proyecto`: `homenu`, `panel`, `factoria`), `repo`, `rama_integracion`, `rama_produccion` | `repo` como literal en 30 ficheros (constantes `REPO` en `scripts/rulesets.mjs` y `scripts/lib/tokenSesion.mjs`); `staging` en 76 ficheros; `id` solo en el campo `proyecto` de eventos y métricas | rulesets, token de sesión, `tarea`, `retirar`, guardia |
| Comandos | `test`, `test_vecinos`, `build`, `lint`, `lint_base`, `arranque_local` | `package.json` (62 scripts) y `.github/workflows/tests.yml` | el CI y `npm run vecinos` |
| Zonas | reglas de `ops/zonas.json` | ya están ahí | `scripts/zonas-proyecto.mjs` y su test; la guardia todavía no las lee |
| Rutas de riesgo | `datos`, `secretos`, `produccion`, `migraciones`, `lo_que_lee_el_bot` | `.claude/dominios-skills.json` y la guardia (11 líneas de `guardia.mjs` nombran `supabase` o `apply-migration`) | la guardia y `scripts/runbook-pr.mjs` |
| Acciones irreversibles | los gateways del proyecto | texto de `CLAUDE.md` («Qué se le pregunta a Pablo») y reglas de la guardia | la guardia y `pendientes.mjs` |
| Servicios y claves | servicio, variable, bóveda, caducidad (nunca valores) | `ops/recursos.json` e `ops/INVENTARIO.md` | `scripts/lib/recursos.mjs` |
| Entornos | `{id, tipo, plataforma, datos}` | texto de `CLAUDE.md` y de la skill `vercel` (una sola base compartida) | los planos |
| Dueño y decisiones | `dueno`, `quien_decide` | texto de `CLAUDE.md` | las decisiones se asignan a Pablo (`scripts/lib/issues.mjs`) |
| Glosario propio | ruta de los términos de dominio | `ops/glosario/` (mezclado con el de proceso) | `npm run glosario` |
| Avisos e ingesta | canal de avisos y vía de ingesta | grupo «HoMenu avisos» (vigía); la tarea de Windows (`/ingest/fabrica`) | `vigia-lola.yml`, el panel |
| Versión de la factoría | `factoria` (etiqueta o hash) | no existe | nadie: aplazado hasta que haya un segundo consumidor |

## Lo que da la factoría

Un agente por rol y su estándar por tarea; las skills de oficio (`causa-raiz`, `plan-de-arreglo`, `forja-de-skills`, `higiene-de-skills`, `estilo-de-respuesta`) y las de servicio genéricas (`github`, `issues`, `1password`, `alta-de-secreto`); la guardia y los hooks (`arranque`, `avisos`, `pendientes`, `voz`, `eventos`); el flujo rama → PR → rama de integración, los workflows de proceso, `rulesets.mjs` y `tokenSesion`; la taxonomía de issues y las líneas del PR; planos, normas, mecanismos y presupuestos; `fabrica` y el panel.

## Lo que la factoría mide de cada proyecto

Desde #652 cada línea del registro local de eventos (`~/.claude/menuplan-fabrica/eventos.jsonl`, fuera del repo) lleva:

- `proyecto`: de qué proyecto es (`homenu`, `panel`, `factoria`; por defecto `homenu`, o el de la variable `MENUPLAN_PROYECTO` si es uno de los tres). Las líneas anteriores no lo llevan y `npm run fabrica` las cuenta como `sin_dato`: el formato antiguo sigue leyéndose.
- `actor`: quién está detrás de la sesión (`pablo`, `alvaro`, `app`, `desconocido`). Antes valía `homenu-sesiones[bot]` o `null`; 83 de 85 eventos recientes salían `null` porque los hooks no ven el entorno del shell de Bash, que es donde el arranque pone la identidad de la App. Ahora el arranque deja una marca por sesión con la identidad que consiguió (`marcas/<sesion>.actor`), y los hooks la leen; sin marca, sale del usuario de git de la carpeta; si tampoco, `desconocido`. Solo se anota la palabra del vocabulario, nunca un nombre ni un correo.
- `intervencion_humana`: una vez que una persona tuvo que intervenir, con `quien` (a quién se le pide, que es el usuario de git del PC aunque la sesión vaya con la identidad de la App), `motivo` (`permiso`, `decision`, `rescate`, `secreto`, `produccion`, `otro`), `entidad_exigida` (el id de la norma de `ops/normas.json` que lo exige) y `evitable` (`si` solo cuando la guardia preguntó porque no pudo leer el estado, no porque hiciera falta una decisión). Hoy lo escriben dos puntos que ya existían: la guardia al preguntar (`permiso_pedido`) y `pendientes.mjs` al frenar por una decisión sin issue. **No** lo escriben el `!` de Pablo ni `--pablo`: instrumentarlos exige tocar `.claude/settings.json`, que es ampliar permisos (decisión de Pablo).

Las cifras salen de `npm run fabrica` como líneas `campo: valor` (`actor-evento actor:`, `proyecto-evento proyecto:`, `intervencion-motivo motivo:`, `intervencion-humana total:`), registradas con su pregunta y su lector en `ops/metricas.json` (#480). Las métricas del registro llevan además `proyecto` (hoy todas son de `factoria`, porque miden el proceso).

## Extensiones: solo añaden, nunca relajan

Cada pieza de un proyecto (norma, regla, skill, agente, término) llevaría `origen: factoria | proyecto`, y un test de conformidad en el CI del proyecto fallaría si una pieza `proyecto`:

- baja la severidad o el ejecutor de una norma de la factoría, o añade una excepción a una norma dura;
- redefine una palabra del glosario común (una palabra, un significado);
- quita un gateway de la lista;
- renombra o tapa un agente o una skill de la factoría.

**Aún no existe**: `ops/normas.json` ya tiene `ejecutor`, dura o blanda y la lista de excepciones que solo baja, pero no el campo `origen` ni el test. Por ámbito (`ambito` de cada norma) 91 de 183 normas son de producto o de datos (bot, data, api, catalog, product, ui) y 92 de proceso (process, infra, code, writing); el ámbito `code` mezcla ambos.

## Conformidad

Un comando local y sin red, `npm run conformidad`, recorrería el contrato y lanzaría los tests de la factoría contra el proyecto, con una línea por regla (`conformidad proyecto: homenu regla: <id> resultado: ok|falla`). **No existe todavía.** Se construye cuando haya un contrato escrito y un segundo proyecto que lo use (regla de los tres casos: con uno solo, el contrato saldría a la medida de HoMenu).

## Corregido respecto al informe (comprobado el 12 oct 2026)

| Dato | Informe | Comprobado | Cómo |
|---|---|---|---|
| Ficheros por zona (factoría / mixto / producto) | 596 / 74 / 2.052 (estimado por nombre, 2.722 ficheros) | 596 / 49 / 2.099 (2.744 ficheros, ninguno sin zona; la cifra viva sale de `npm run zonas-proyecto`). La estimación del informe se pasaba en 25 ficheros de mixto (74 frente a 49) y se quedaba corta en 47 de producto; la factoría coincide | reglas de `ops/zonas.json` sobre `git ls-files` |
| Ficheros con el nombre del repo | 29 | 30 (sin `public`) | `git grep -l "pabloam89/MenuPlan"` |
| Ficheros con ruta `C:\dev` en `.claude`, `scripts`, `.github`, `ops` | 19 | 29 | `git grep -lE 'C:\\\\dev\|C:/dev'` |
| Scripts de `package.json` | 61 | 62 | `package.json` |
| Líneas de `guardia.mjs` | 863 | 866 | `wc -l` |
| Normas de producto | 82 de 183 | 91 de 183 por ámbito (el ámbito `code` es dudoso: 10 más) | `ops/normas.json`, campo `ambito` |
| Eventos del registro local | 815 líneas, 124 KB | 824 líneas, 128.840 bytes | `eventos.jsonl` |
| Permisos de `settings.json` | 41 `allow`, 5 `deny` | igual (41, 5 y 0 `ask`) | `.claude/settings.json` |
| Agentes por zona | 3 de factoría, 5 mixtos, 1 de producto | 1 de factoría (`gobierno`), 2 mixtos (`revisor`, `seguridad`) y 6 de producto | reglas de `ops/zonas.json`: los jueces genéricos son mixtos, los de dominio son del producto |
| Zonas del contrato | dos: `producto` y `proceso` | tres: `factoria`, `producto`, `mixto` | `ops/zonas.json` |

Lo que no se ha comprobado aquí y sigue siendo del informe (marcado «Creo» o «No sé» allí): que una sesión de la nube no instala los plugins del repo, el ritmo de crecimiento de la factoría, el uso de Postgres por el panel, los workflows reutilizables entre repos con cuenta personal y el plan de claude.ai de Pablo.

## Lo que no se sabe

- Si el arranque anota la marca de la sesión en una sesión real de Claude Code: la función está probada y el hook la llama (test estructural), pero no se ha visto un `actor: app` salir de un hook en una sesión viva.
- Cuántas intervenciones reales quedan fuera: `!` y `--pablo` no se registran; la cifra de `intervencion_humana` es un mínimo.
- Qué parte del mixto (`tope_mixto`) es separable sin partir un fichero (la guardia, `package.json`, `tests.yml`).
