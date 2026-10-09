# Planos del entorno de desarrollo

Cada plano responde a una pregunta. Para cada uno: el nivel de hoy, el que
hace falta para lanzar con los primeros usuarios reales y el que hará falta
para escalar, qué agente lo cuida y el siguiente paso.

**Escala**: 0 no existe · 1 existe pero es manual · 2 obliga (algo bloquea si
falla) · 3 mide y avisa solo · 4 previene (el error no se puede ni escribir).

## Cómo se mide (#248)

El nivel no se pone a ojo: sale de comprobaciones.

- **`ops/planos.json`** dice, para cada plano y cada nivel, qué criterios se
  tienen que cumplir, con un tipo de vocabulario cerrado: `fichero_existe`,
  `fichero_contiene`, `test_existe`, `workflow_activo`, `regla_github`,
  `cifra_umbral`, `a_juicio` (con quién y cuándo) y `por_definir` (lo que el
  nivel pide y aún no existe). El nivel de un plano es el más alto con todos
  sus criterios cumplidos, y los de debajo.
- **`npm run planos`** lo calcula y enseña qué falta para el siguiente nivel.
  Sin red, lo de GitHub sale «sin comprobar» y nunca cuenta como cumplido;
  con `--red` lo mira con `gh`. `--json` para máquinas.
- **La tabla de abajo se genera** desde `ops/planos.json` (`npm run planos --
  --red --escribir` guarda una medición nueva y la reescribe). No se edita a
  mano: `ops/planos.test.js` falla si no coincide, si el texto de «Por qué»
  dice otro nivel, o si lo guardado ya no es posible con lo que hay en el repo.
- **Cada lunes** el workflow `planos-semanal.yml` vuelve a medir (sin tokens
  de Claude) y abre o actualiza un issue si un nivel ya no cuadra o si un
  juicio tiene más de 30 días. El repaso cualitativo va en `/revision-issues`.
- Subir un nivel = cambiar un `por_definir` por un criterio comprobable que
  se cumple, y guardar la medición en el mismo PR que lo construye.

<!-- planos:tabla:inicio (la genera `npm run planos -- --escribir` desde ops/planos.json; no se edita a mano) -->
Medido el 2026-10-09 por `gobierno`, con GitHub.

| # | Plano | Pregunta | Hoy | Lanzar | Escalar | Agentes |
|---|---|---|---|---|---|---|
| 1 | Flujo | ¿Dónde vive el código y cómo llega a producción? | 3 | 3 | 4 | gobierno |
| 2 | Reglas y contexto | ¿Qué sabe cada sesión antes de tocar nada? | 3 | 3 | 4 | gobierno, revisor |
| 3 | Guardarraíles | ¿Qué es imposible hacer mal? | 3 | 3 | 4 | gobierno |
| 4 | Verificación | ¿Cómo sé, sin mirar, que no he roto nada? | 2 | 3 | 4 | revisor, qa, gobierno |
| 5 | Entornos | ¿Dónde pruebo sin riesgo? | 1 | 3 | 4 | gobierno, datos |
| 6 | Observabilidad | ¿Cómo me entero de que algo falla en producción? | 1 | 3 | 4 | (vigía, cuando exista la herramienta) |
| 7 | Seguridad | ¿Quién puede ver o romper qué? | 2 | 3 | 4 | seguridad, gobierno |
| 8 | Datos | ¿Están bien modelados y puedo recuperarlos? | 1 | 3 | 4 | datos, auditor-datos |
| 9 | Calidad de la IA | ¿Lola responde bien tras cada cambio? | 1 | 2 | 3 | lola, evaluador |
| 10 | Coste | ¿Cuánto gasto y quién lo gasta? | 1 | 3 | 4 | lola, evaluador |
| 11 | Entrada del trabajo | ¿Cómo pasa una idea a tarea bien definida? | 3 | 2 | 3 | (la sesión principal con `/orquestar`) |
| 12 | Release y vuelta atrás | ¿Cómo subo y cómo deshago? | 1 | 3 | 4 | gobierno |
| 13 | Diseño y experiencia | ¿Se ve, se siente y responde como debe? | 1 | 3 | 4 | diseno, qa |
<!-- planos:tabla:fin -->

El mapa de módulos del producto (qué hace cada uno, sus tablas, ficheros,
grado de desarrollo y métricas) está en `ops/MODULOS.json`; lo vigila
`ops/modulos.test.js` y lo leerá el panel de la factoría (#158).

## Por qué cada nivel, y el siguiente paso

Medido el 9 oct 2026 con `npm run planos -- --red` (GitHub leído con la sesión
de Pablo). El detalle de cada criterio, en `ops/planos.json`.

**1 · Flujo (3).** `main` exige `tests` y no admite push forzado; desde el
9 oct `staging` también exige `tests` por un ruleset (id 24770007, PR #240),
sin excepción para Pablo. La guardia niega el push a `main` y el directo a
`staging`; `tests` corre en cada push a `staging`; el arranque avisa de otras
sesiones y `podar` cuenta las ramas. *Siguiente* (4): que nada llegue rojo a
`staging`. Hoy el cron de Mercadona se salta el ruleset con su deploy key, y
el 9 oct su commit `be7ca05` dejó `staging` en rojo (run 37888775813,
`src/data/productoBuscado.test.js`), y Vercel lo desplegó igual. Y decidir el
método de paso a `main` (pendiente 9).

**2 · Reglas y contexto (3).** `CLAUDE.md`, `specs/`, `PRINCIPIOS.md`;
agentes, skills y rutas citadas con test; la línea «Runbook:» exigida en el
CI; la puerta de lectura de las skills y los avisos de issues al editar.
*Siguiente* (4): que la deriva de `specs/` respecto al código se detecte
sola, no solo cuando alguien pasa `/update-specs`.

**3 · Guardarraíles (3).** Guardia enchufada y con test para la base, las
migraciones aplicadas, los merges (#223) y la carpeta principal;
`pendientes.mjs` frena si quedan decisiones sin issue. Desde el 9 oct la regla
de `tests` en `staging` vale también fuera de Claude (ruleset), que era lo que
faltaba el 8 oct. *Siguiente* (4): que cada negación de la guardia deje una
línea contable (hoy no queda rastro de cuántas veces salta cada regla) y que
vea el SQL dentro de un fichero, no solo el texto del comando.

**4 · Verificación (2).** Tests, lint con línea base y build en cada PR y en
cada push a `staging`, obligatorios en las dos ramas. El lint viejo baja: 132
errores el 9 oct (133 el 8). *Siguiente* (3): piloto de `checkJs` con tipos
generados de Supabase en un dominio.

**5 · Entornos (1).** Previews de Vercel por PR y el entorno
`staging-menuplan` (vistos en los despliegues de GitHub el 9 oct). Una sola
base, que es producción; `apply-migration` exige un ensayo con ROLLBACK, que
no es lo mismo que otra base. *Siguiente* (2): base de pruebas (Supabase
branching u otra) para ensayar migraciones sin datos reales.

**6 · Observabilidad (1).** El agente diario de fallos y `bot-fallos`; un
test vigila que no se traguen errores. Nada en tiempo real. *Siguiente* (2):
captura de errores (Sentry o similar) en app y `api/`. Cuando exista, nace el
agente `vigía`.

**7 · Seguridad (2).** Secret scanning y push protection activos, alertas de
Dependabot, revokes de funciones con test (PRINCIPIOS §8) y, desde el 9 oct,
el rol de solo lectura `consulta_lectura` (0092, #233, #241) con su test.
Dependabot abre los PR de seguridad solo. *Siguiente* (3): cerrar los
críticos de coste de `specs/AUDIT-REPORT.md` (juicio de `gobierno` del
9 oct, sin revisar uno a uno) y decidir si el repo pasa a privado.

**8 · Datos (1, baja de 2).** Principios con test sobre las migraciones
nuevas, trinquete de cableado, `verificar-estado` y la guardia que no deja
editar una migración aplicada. Baja porque la mitad de la pregunta es
«¿puedo recuperarlos?» y **no hay ninguna copia de la base de producción**
(plan Free de Supabase, visto en el panel el 8 oct): una copia que se hace
sola y se ha restaurado una vez es requisito del nivel 2. El 8 oct ya se
dejó escrito que el 2 era discutible. *Siguiente* (2): la copia nocturna
cifrada (#247, en marcha) con una restauración ensayada; luego, el mapa de
verdades por `auditor-datos`.

**9 · Calidad de la IA (1).** `bot-evals`, `router-evals`,
`/revision-semanal` y el juez `evaluador`, todo a mano. *Siguiente* (2):
evals de Lola en CI cuando un PR toca `api/_bot/`.

**10 · Coste (1).** `scripts/bot-coste.mjs` y el límite mensual del bot
(`api/_bot/uso.js`), que no tiene test. Sin cuota por usuario ni alerta de
gasto. *Siguiente* (2): un test del límite mensual; después, coste por turno
medido y alerta de gasto diario en Anthropic.

**11 · Entrada del trabajo (3, sube de 1).** Desde el 9 oct: issues con
problemas de fondo, casos, encargos y decisiones, una sola clasificación con
test (`scripts/lib/issues.mjs`) y formularios que salen de ella; la guardia
niega `gh issue create` a pelo y un PR sin su `Closes`; `pendientes.mjs` y
`avisos.mjs` avisan solos y `npm run issues` lo cuenta cada semana en
`/revision-issues`. Ya pasa del objetivo de lanzar (2) y llega al de escalar
(3). *Siguiente* (4): que ningún encargo pueda empezar sin criterios de
aceptación.

**12 · Release y vuelta atrás (1).** Vercel permite volver atrás y la skill
lo escribe; `main` solo entra por PR con `tests`. No hay proceso de paso a
producción ni vuelta atrás ensayada. La app iOS sale por
`ios-testflight.yml`, a mano. *Siguiente* (2): decidir el paso de `staging` a
producción (pendiente 9) y ensayar una vuelta atrás.

**13 · Diseño y experiencia (1).** `DESIGN_SYSTEM.md` describe lo observado,
pero no hay tokens: 764 colores distintos, 29 tamaños de letra, 3.781 estilos
inline, catálogo de 6,45 MB en el chunk inicial. Diagnóstico completo en
`docs/diseno/ESTADO.md`. *Siguiente* (2): decidir el color de marca, crear los
tokens y la regla de lint con línea base que solo baja.
