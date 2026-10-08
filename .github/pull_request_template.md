
<!--
«Closes #n» por cada encargo o problema de fondo que cierra este PR, una
línea por issue. Al fusionar se cierra solo y queda enlazado: npm run issues
saca de ahí quién lo arregló, cuánto tardó y si aguantó.

Si arregla un problema de fondo, di qué test cubre la clase entera, no solo
los casos conocidos. Si un fallo vuelve, no se abre otro fondo: se cuelga el
caso del mismo (npm run issues -- --colgar) y el fondo se reabre.

Agente: el que lo construyó (gobierno, datos, diseno o lola), o «sesión» si
lo hizo la sesión principal sin agente.

Runbook (obligatoria si el PR toca ficheros de un dominio con skill: supabase,
github, vercel, 1password, telegram; el mapa está en .claude/dominios-skills.json
y el CI lo comprueba). Escribe una de estas dos, a la derecha de «Runbook:»:
  actualizado (skill <nombre>)   → has actualizado ese runbook EN ESTE PR
  sin novedades                  → no has aprendido nada que merezca quedar escrito
Si este PR arregla un fallo, la lección tiene que haber quedado en un test, en
la guardia o en la skill: el revisor lo mira. Si no toca ningún dominio, déjala
como está.
-->

Closes #

Agente: sesión

Runbook:
