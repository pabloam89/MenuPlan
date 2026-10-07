# Planos del entorno de desarrollo

Cada plano responde a una pregunta. Para cada uno: el nivel de hoy, el que
hace falta para lanzar con los primeros usuarios reales y el que hará falta
para escalar, qué agente lo cuida y el siguiente paso. Lo revisa `gobierno`
cuando se le pregunta «¿cómo está la casa?»; los niveles se cambian con
evidencia, no a ojo.

**Escala**: 0 no existe · 1 existe pero es manual · 2 obliga (algo bloquea si
falla) · 3 mide y avisa solo · 4 previene (el error no se puede ni escribir).

Estado medido el 7 oct 2026 sobre `staging`.

| # | Plano | Pregunta | Hoy | Lanzar | Escalar | Agentes |
|---|---|---|---|---|---|---|
| 1 | Flujo | ¿Dónde vive el código y cómo llega a producción? | 3 | 3 | 4 | gobierno |
| 2 | Reglas y contexto | ¿Qué sabe cada sesión antes de tocar nada? | 3 | 3 | 4 | gobierno, arquitecto |
| 3 | Guardarraíles | ¿Qué es imposible hacer mal? | 3 | 3 | 4 | gobierno |
| 4 | Verificación | ¿Cómo sé, sin mirar, que no he roto nada? | 2 | 3 | 4 | revisor, qa, arquitecto |
| 5 | Entornos | ¿Dónde pruebo sin riesgo? | 1 | 3 | 4 | gobierno, datos |
| 6 | Observabilidad | ¿Cómo me entero de que algo falla en producción? | 1 | 3 | 4 | (vigía, cuando exista la herramienta) |
| 7 | Seguridad | ¿Quién puede ver o romper qué? | 1 | 3 | 4 | seguridad, gobierno |
| 8 | Datos | ¿Están bien modelados y puedo recuperarlos? | 2 | 3 | 4 | datos, auditor-datos |
| 9 | Calidad de la IA | ¿Lola responde bien tras cada cambio? | 1 | 2 | 3 | lola, evaluador |
| 10 | Coste | ¿Cuánto gasto y quién lo gasta? | 1 | 3 | 4 | rendimiento, lola |
| 11 | Entrada del trabajo | ¿Cómo pasa una idea a tarea bien definida? | 1 | 2 | 3 | (la sesión principal con `/orquestar`) |
| 12 | Release y vuelta atrás | ¿Cómo subo y cómo deshago? | 1 | 3 | 4 | gobierno |
| 13 | Diseño y experiencia | ¿Se ve, se siente y responde como debe? | 1 | 3 | 4 | diseno, qa, rendimiento |

## Por qué cada nivel, y el siguiente paso

**1 · Flujo (3).** Ramas protegidas, PR, worktrees, CI. *Siguiente*: exigir
PR también en `staging` (el cron de Mercadona tiene que abrir PR; ver
`ops/INVENTARIO.md`, pendiente 11).

**2 · Reglas y contexto (3).** `CLAUDE.md`, `specs/`, `docs/datos/PRINCIPIOS.md`,
agentes con plantilla y test. *Siguiente*: que la deriva de las specs se
detecte sola, no solo cuando alguien pasa `/update-specs`.

**3 · Guardarraíles (3).** Guardia con tests, protección de ramas. Solo cubre
sesiones de Claude. *Siguiente*: lo del plano 1.

**4 · Verificación (2).** Tests y build bloquean el merge. Sin tipos, sin lint
en CI. *Siguiente*: `npm run lint` en `tests.yml`; piloto de `checkJs` con
tipos generados de Supabase en un dominio.

**5 · Entornos (1).** Previews de Vercel, pero una sola base, que es
producción. *Siguiente*: base de pruebas (Supabase branching) para ensayar
migraciones sin datos reales.

**6 · Observabilidad (1).** El agente diario de fallos. Nada en tiempo real.
*Siguiente*: captura de errores (Sentry o similar) en app y `api/`. Cuando
exista, nace el agente `vigía`.

**7 · Seguridad (1).** RLS y una auditoría hecha, pero repo público, sin secret
scanning ni alertas de dependencias, y críticos de coste abiertos en
`specs/AUDIT-REPORT.md`. *Siguiente*: secret scanning + Dependabot; decidir
repo privado.

**8 · Datos (2).** Agentes `datos` y `auditor-datos`; 16 principios en
`docs/datos/PRINCIPIOS.md`, con 13 comprobaciones automáticas sobre las
migraciones nuevas; trinquete de cableado (40 tablas, 99 pares tabla-fichero
el 7 oct; objetivo uno por tabla); `verificar-estado`. Copias de seguridad sin
comprobar. *Siguiente*: el mapa de verdades (cada hecho, dónde vive y sus
copias) por `auditor-datos`; confirmar PITR/backups de Supabase y hacer una
restauración de prueba.

**9 · Calidad de la IA (1).** `bot-evals`, `router-evals`, `/revision-semanal`,
todo a mano. *Siguiente*: evals de Lola en CI cuando un PR toca `api/_bot/`.

**10 · Coste (1).** `scripts/bot-coste.mjs` y límite mensual del bot. Sin cuota
por usuario ni alerta de gasto. *Siguiente*: coste por turno medido y alerta
de gasto diario en Anthropic.

**11 · Entrada del trabajo (1).** Pendientes repartidos en `.md`.
*Siguiente*: plantilla de issue/encargo con objetivo, criterios de aceptación
y fuera de alcance, que es lo que `/orquestar` necesita para el brief.

**12 · Release y vuelta atrás (1).** Vercel permite volver atrás; no hay
proceso escrito ni probado. *Siguiente*: decidir el paso de `staging` a
producción (pendiente 9) y ensayar una vuelta atrás.

**13 · Diseño y experiencia (1).** `DESIGN_SYSTEM.md` describe lo observado,
pero no hay tokens: 764 colores distintos, 29 tamaños de letra, 3.781 estilos
inline, catálogo de 6,45 MB en el chunk inicial. Diagnóstico completo en
`docs/diseno/ESTADO.md`. *Siguiente*: decidir el color de marca, crear los
tokens y la regla de lint con línea base que solo baja.
