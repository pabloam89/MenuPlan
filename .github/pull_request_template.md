
<!--
Si arregla un issue: «Closes #n», una línea por issue. Al fusionar se cierra
solo y queda enlazado (npm run issues saca de ahí quién lo arregló y cuánto
tardó). Si una lección vuelve a pasar, se reabre la misma, no se abre otra.

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
