---
description: Lanza 3 agentes en paralelo (seguridad, eficiencia, integridad) a revisar los cambios de backend recientes
---

Vas a auditar los cambios de **backend** más recientes en busca de vulnerabilidades e ineficiencias, usando el mismo patrón que ya se usó en `specs/AUDIT-REPORT.md` (pipeline de agentes independientes, sin contexto compartido entre ellos, severidad + fix propuesto por hallazgo) pero acotado al diff actual en vez de una auditoría completa del repo.

## 1. Determina el alcance

Backend = `api/**`, `supabase/migrations/**`, y cualquier fichero en `src/lib/**` o `src/data/**` que hable con Supabase, maneje auth, RLS, dinero, o llame a un LLM externo (Anthropic/Gemini).

Para encontrar el diff a revisar, en este orden de prioridad:
1. Si hay cambios sin commitear (`git status`) que toquen backend → revisa esos (staged + unstaged).
2. Si no hay cambios sin commitear, compara `staging` contra `origin/main` (`git diff origin/main...staging`) y usa los ficheros de backend ahí.
3. Si el usuario pasó un argumento (rango de commits, nombre de rama, o ruta concreta), úsalo en vez de lo anterior.

Si tras esto no hay ningún fichero de backend en el diff, dilo y para aquí — no audites el repo entero, este comando es incremental.

Lista los ficheros de backend afectados y muéstraselos al usuario en una frase antes de lanzar los agentes.

## 2. Lanza 3 agentes en paralelo, en un solo mensaje

Usa la herramienta Agent (subagent_type: general-purpose) para lanzar simultáneamente — batched en una sola respuesta, sin que se vean el trabajo entre ellos:

- **Seguridad**: inyección, autorización rota (IDOR, RLS ausente o mal formada, `SECURITY DEFINER` sin `search_path`), secretos hardcodeados, validación de entrada ausente en endpoints de `api/`, prompts de LLM sin sanitizar antes de interpolar, exposición de PII.
- **Eficiencia**: N+1 queries, llamadas repetidas a Supabase/LLM que se podrían cachear o batchear, falta de índices para queries nuevas, rate limiting/cuotas ausentes o mal calibrados, payloads innecesariamente grandes, trabajo duplicado cliente/servidor.
- **Integridad**: invariantes de datos rotos, migraciones sin rollback claro o que puedan perder datos, condiciones de carrera entre escritura cliente y servidor, casos donde un fallo silencioso deja al usuario con datos inconsistentes.

Cada agente recibe en su prompt (autocontenido, sin dar por hecho que ha visto esta conversación):
- La lista exacta de ficheros del diff y el diff mismo (o instrucciones de cómo obtenerlo con `git diff`).
- Que lea también el spec de dominio relevante en `/specs/*.md` si el fichero tocado cae dentro de un dominio documentado (auth, menu-generation, receipt-ocr, recipe-catalog, pagos), para saber qué es comportamiento esperado y qué es deriva.
- Que tiene disponibles las herramientas MCP de Supabase (`mcp__ef741307-...`) para verificar en vivo contra el esquema/RLS real cuando el hallazgo lo requiera (igual que se hizo en la auditoría previa) — el repo puede no reflejar el estado real de producción.
- Que reporte cada hallazgo con: severidad (CRÍTICO/ALTO/MEDIO/BAJO), fichero:línea, descripción concreta con escenario de explotación o de fallo real (no genérico), y fix propuesto.
- Que **no aplique ningún cambio** — solo reporta.
- Que descarte explícitamente lo que revisó y no es un problema (evita ruido tipo "podría añadir más validación" sin caso concreto).

## 3. Verifica antes de reportar

Antes de presentar el resultado al usuario, para cualquier hallazgo CRÍTICO o ALTO: verifícalo tú mismo (leyendo el código citado, o consultando en vivo vía MCP de Supabase si aplica) antes de incluirlo. Si un agente reporta algo que no logras confirmar, inclúyelo igualmente pero márcalo `[SIN VERIFICAR]`.

## 4. Reporta

Une los 3 informes en una única tabla ordenada por severidad (mismo formato que `specs/AUDIT-REPORT.md`), sin duplicar hallazgos que dos agentes hayan visto igual. Al final, una sección corta de "descartado sin problema" con lo que se revisó y no dio nada.

No apliques ningún fix todavía — pregunta al usuario cuáles quiere que aborde, uno a uno o todos, antes de tocar código.
