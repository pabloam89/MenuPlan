
<!--
«Closes #n» por cada encargo o problema de fondo que cierra este PR, una
línea por issue. Al fusionar se cierra solo y queda enlazado: npm run issues
saca de ahí quién lo arregló, cuánto tardó y si aguantó.

Si arregla un problema de fondo, di qué test cubre la clase entera, no solo
los casos conocidos. Si un fallo vuelve, no se abre otro fondo: se cuelga el
caso del mismo (npm run issues -- --colgar) y el fondo se reabre.

Agente (el CI la pide; el nombre solo, sin puntos ni adornos: «Agente: gobierno»): el que lo construyó (gobierno, datos, diseno o lola), o «sesión» si
lo hizo la sesión principal sin agente.

Casos (obligatoria en TODO PR; la guardia y el CI la piden): los fallos del
camino de este trabajo (un test rojo que no era tuyo, un dato falso que se
había copiado, un vigilante que bloqueó algo bueno, algo del entorno) se
registran como issues tipo:caso, cada uno con su problema de fondo
(npm run issues -- --nuevo "…" --tipo caso --analisis …). A la derecha de
«Casos:», una de dos:
  #301, #305                     → los casos que dejas registrados
  ninguno — <por qué>            → no ha habido ningún fallo; el motivo, de verdad
                                   (mínimo 25 caracteres; «n/a» no vale)

Runbook (obligatoria si el PR toca ficheros de un dominio con skill: supabase,
github, issues, vercel, 1password, telegram, hetzner, tailscale; el mapa está en .claude/dominios-skills.json
y el CI lo comprueba). Escribe una de estas dos, a la derecha de «Runbook:»:
  actualizado (skill <nombre>)   → has actualizado ese runbook EN ESTE PR
  sin novedades                  → no has aprendido nada que merezca quedar escrito
Si este PR arregla un fallo, la lección tiene que haber quedado en un test, en
la guardia o en la skill: el revisor lo mira. Si no toca ningún dominio, déjala
como está.
-->

Closes #

Agente: sesión

Casos:

Runbook:
