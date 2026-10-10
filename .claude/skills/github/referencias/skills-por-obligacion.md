# Las skills, por obligación (detalle)

Detalle de la sección «Qué es y dónde» de la skill `github`; sacado aquí para que el SKILL.md no crezca de más al añadir las respuestas de su ficha (#495).

- **Las skills, por obligación** (#164; mapa `.claude/dominios-skills.json`, cruzado por test con `.claude/skills/`):
  - **Puerta de lectura** (`guardia.mjs`): el primer comando de riesgo de un dominio en la
    sesión (`apply-migration`, `telegram-webhook.mjs set`, `vercel env`, `op item|read`, `ssh`
    al panel, `gh api -X POST`…) se niega con «abre antes la skill X y reintenta»; al
    reintentar pasa, y a la primera si la sesión ya abrió la skill (`Skill` o `Read` de su
    `SKILL.md`; lo anota `skill-abierta.mjs`) o el agente la trae en su `skills:`. Sin registro, no bloquea.
    Un alta (`gh secret set`, `vercel env add`, `op item create`) pide además `alta-de-secreto`
    (#397); listar o leer (`gh secret list`, `vercel env ls`, `op item get`) no. Editar o
    escribir un fichero de las `rutas` de un dominio pasa por la misma puerta (#397), con la
    ruta sacada de la carpeta del fichero, no de la sesión.
  - **Puede avisar de más** («ante la duda, niega»; un reintento; fijado en el test del
    mapa): un `git commit -m` que nombra `apply-migration`, `gh workflow run`, `gh api
    graphql -f`, un `docker … -U panel` local, una `ssh` con la IP.
  - **Línea «Runbook:» del PR** (`scripts/runbook-pr.mjs`, tercer paso del job `tests`): si
    el PR toca rutas de un dominio, `Runbook: actualizado (skill X)` (y tocar esa skill) o
    `Runbook: sin novedades`; todas las líneas valen, las de bloques de código no cuentan.
    Exentos solo los PR de un bot; editar el cuerpo relanza el check.
  - **Línea «Casos:» del PR** (#185; `scripts/casos-pr.mjs`): `Casos: #n, #m` (issues
    `tipo:caso` con `analisis:`) o `Casos: ninguno — <motivo>` (25 caracteres o más). La guardia
    niega `gh pr create` sin ella; el CI consulta la API (`issues: read`) y, **si no responde,
    falla con la causa**: se relanza el check. `npm run issues` la cuenta en los últimos 50 PR.
    Cómo se registra un caso y se analiza hasta su fondo: skill `issues`.
  - **Línea «Closes #n» y «Agente:» del PR**: `Closes #n` por cada encargo o fondo
    que cierra (la guardia lo exige si la rama es de un issue: `npm run tarea --
    ops/x 193`) y `Agente: <nombre>` (o `sesión`); la plantilla de PR los trae.
    De ahí sale quién arregló qué (skill `issues`). Desde #337 también los pide el
    CI (`scripts/fondos-pr.mjs`, paso «Fondos del PR» de `tests`, para cualquiera
    y no solo las sesiones de Claude): `Agente:` con un agente de `.claude/agents/`
    o `sesión`; el `Closes` de la rama `area/<n>-…`; y por cada `Closes #n`, que el
    fondo de un encargo tenga diagnóstico (mecanismo y causa de escape) y que un
    fondo tenga aprendizaje. Bots exentos; si la API no responde, falla con la
    causa y se relanza el check.
