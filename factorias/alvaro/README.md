# Factoría de Álvaro

Tres hooks que hacen que, al tocar pantallas o Lola, **la sesión no se cierre
sin los jueces que tocan**. Solo se activan en la configuración de Álvaro
(`~/.claude/settings.json`), no en la de Pablo. El repo es público: aquí no hay
nada sensible; el registro vive fuera, en `~/.claude/factoria-alvaro/`.

| Hook | Evento | Qué hace |
|---|---|---|
| `hooks/arranque.mjs` | SessionStart | Dice «Factoría de Álvaro activa». Si no la ves, no está funcionando |
| `hooks/registro.mjs` | SubagentStop, PostToolUse de `SubagentHandback` y de `Agent` | Apunta qué juez corrió y su veredicto, por rama. El informe del juez sale de `last_assistant_message` (SubagentStop) o de `tool_input.message` (SubagentHandback); el aviso de un juez lanzado en segundo plano (`async_launched`) solo apunta «lanzado». Cada apunte lleva el `agent_id` del evento (SubagentStop y SubagentHandback lo traen como `agent_id`; la respuesta del lanzamiento, como `agentId`). El script tiene 20 líneas, con su cabecera; la lógica está en `apunteDe` y se prueba aparte |
| `hooks/cierre.mjs` | Stop | Mira los ficheros cambiados contra `origin/staging`; si falta un juez, dijo «no pasa» o informó sin acabar en una línea `Veredicto:` legible, bloquea el cierre (una vez) y enseña el cuadro |

Qué juez toca (`lib/reglas.mjs`): `qa` si cambia una pantalla de `src/`;
`evaluador` si cambia Lola (`api/_bot/`, `api/bot/`, `api/_prompts.js`);
`revisor` si cambia cualquier código (también `factorias/`: editar estos hooks pide revisor). Un juez «lanzado» que aún no ha informado bloquea el cierre igual que uno que falta («lanzado, sin informe»). Los tests y snapshots no piden
evaluador. Un juez solo vale si fue **lanzado después** del último cambio (lo que juzga es el código que vio
al arrancar, no el de cuando llegó su informe): el momento del juicio es el del apunte «lanzado» con el mismo
`agent_id`; sin `agent_id`, el del propio apunte.

## Solo lo de esta sesión

El cierre solo cuenta los apuntes de jueces con el `session_id` de la sesión que se cierra (el registro sigue siendo por rama). Si la transcripción (`transcript_path`) muestra que la sesión no usó Edit, Write, MultiEdit ni NotebookEdit y ningún fichero cambiado se tocó después de su arranque, no exige jueces aunque la rama traiga cambios de otra sesión. Una línea que repite el encargo («pasa | no pasa», «elige una») no se apunta como informe.

## El veredicto: última línea, estricta, y lo ilegible bloquea

El veredicto es la **última línea no vacía** del informe del juez, tras quitarle solo la decoración (espacios,
`*`, `_`, `` ` ``, `>`, `#`, `|`, viñetas `-`/`•`, emojis como ✅❌⚠️🔴, `\r`). Esa línea tiene que empezar por
`Veredicto`, un separador (`:`, `-`, `–`, `—` o `|`) y, como primera palabra, `pasa`, `no pasa` o `no sé`
(«no se» sin tilde solo si es todo el valor). El resto de la línea (reservas, motivos, «, pero B1 rompe») se
ignora, salvo que traiga a la vez un «pasa» suelto y un «no pasa»: eso es el eco del encargo y no vale.

**Cualquier otra cosa es `sin_veredicto` y no se interpreta**: ni «sin bloqueantes», ni «aprobado», ni
«Veredicto final:», ni «1. Veredicto:», ni una respuesta en la línea de debajo del encabezado. Un juez que
informó así **bloquea el cierre** con «el informe del juez no acaba en una línea Veredicto: pasa | no pasa |
no sé: pídele que lo repita en la última línea» (fallar en alto: un error se ve; nunca se cambia por un valor
por defecto). «no sé» sigue sin bloquear (solo avisa); un «lanzado» sin informe bloquea con su propio mensaje.
Si un juez tiene un informe ilegible y otro anterior o posterior legible sobre la misma versión del código,
manda el legible; entre legibles, un «no pasa» domina a cualquier «pasa».

## Activar

Pegar el contenido de `settings.snippet.json` en `~/.claude/settings.json`
(fusionando con lo que haya). Cada comando comprueba que existe
`factorias/alvaro/` en la carpeta de la sesión; en otros proyectos no hace nada.

## Comprobar que funciona

1. Al abrir una sesión sale «Factoría de Álvaro activa».
2. Prueba de fallo: toca una pantalla y di «ya está». La sesión tiene que
   pedir `qa` y `revisor`. Si te deja cerrar, está rota.
`npx vitest run factorias` lo comprueba solo, con una prueba de fallo incluida.

## Cómo se sale de un bloqueo

El cierre bloquea **una vez** por intento. Salidas, de la más limpia a la más bruta:

1. Hacer lo que pide el mensaje: lanzar el juez que falta, o pedirle al que informó mal que repita el
   informe acabando en `Veredicto: pasa | no pasa | no sé` (ÚLTIMA línea, solo una de las tres opciones).
2. Si un juez dijo «no pasa» y es un falso «no pasa» (el «no pasa» domina para siempre sobre la misma
   versión del código): **tocar o editar un fichero que exige ese juez** invalida el apunte (el juez solo vale
   si se lanzó después de la última edición) y se relanza.
3. Segundo intento de cerrar: con `stop_hook_active` el cierre avisa («segundo aviso») y deja salir.
4. Borrar el registro de la rama: `~/.claude/factoria-alvaro/<rama>.jsonl` (con `/` cambiado por `_`).
5. Apagarlo: `FACTORIA_ALVARO_OFF=1`. Es una variable de entorno: **exige reiniciar la sesión** (y el cierre lo dice).

## Sin comprobar

- Los tres eventos (`SubagentStop`, `PostToolUse` de `SubagentHandback` y de `Agent`) están
  documentados en la referencia de hooks de Claude Code (campos `agent_type`,
  `last_assistant_message`, `tool_input.message`, `status: "async_launched"`), pero los
  tests simulan la entrada: no se ha visto en una sesión real. Si el informe de un juez en
  segundo plano no llega, el cierre dirá «lanzado, sin informe» y no lo dejará pasar como «pasa».
- Que el `PostToolUse` de `SubagentHandback` traiga `agent_type`: la documentación lo da para
  cualquier hook que corre dentro de un subagente, pero no lo dice para esa herramienta. Sin él,
  ese informe no se apunta (el juez queda «lanzado» o con el texto de `Agent`).
- Un juez de segundo plano no tiene más «hook de fin» documentado que `SubagentStop`. Si el
  subagente entrega su informe por `SubagentHandback`, `last_assistant_message` NO es el informe
  (lo dice la documentación): por eso se escuchan los dos.
- `SubagentHandback`: la documentación dice que Claude Code la proporciona en modo auto (desde la v2.1.271); no
  dice que solo exista ahí. Donde no se llame, el informe del subagente viaja en
  `last_assistant_message` de `SubagentStop`: cubierto, pero con el mismo aviso de que no se ha visto en real.
- NO está documentado que `agentId` (la respuesta de `Agent`) y `agent_id` (`SubagentStop` y `SubagentHandback`)
  sean el mismo identificador. Si no coinciden, la corrección del momento del juicio (contar desde el lanzamiento)
  queda inerte, en silencio: el informe cuenta desde el instante en que llega, como antes.
- `SubagentStop` para agentes lanzados en segundo plano, y el campo `isAsync` de la respuesta de `Agent`,
  están sin comprobar: la documentación oficial no los documenta. Si `isAsync` no llega, el
  `status: "async_launched"` es la otra señal; si tampoco, el aviso se leería como informe en primer plano
  (sin línea `Veredicto:` en la última línea sale «sin veredicto» y bloquea con el mensaje del informe ilegible).
- Los agentes de Pablo no tienen escrito el formato `Veredicto:` en su última línea: hasta que lo tengan, un juez
  que lo olvide bloqueará el cierre y habrá que pedirle que repita (la línea de arranque ya se lo pide a la sesión).
  Es el coste de no interpretar texto libre; no se arregla con heurísticas.
- El informe de `Agent` en primer plano (`PostToolUse`) puede traer líneas añadidas tras el texto del juez
  (identificador, uso). No se ha visto en real. Si las trae, ese apunte sale «sin veredicto»; no estorba mientras
  el `SubagentStop` del mismo juez traiga su última línea limpia (un veredicto legible gana a uno ilegible).
- La comprobación en el CI del PR (que el PR lleve el cuadro) no existe: tocaría
  `.github/`, que pide juez y es de Pablo.
- La regla de `api/_prompts.js` no tiene test propio (los tests no pueden
  nombrar ficheros reales de HoMenu, `ops/vigilante-lados.test.js`).
