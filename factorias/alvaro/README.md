# Factoría de Álvaro

Tres hooks que hacen que, al tocar pantallas o Lola, **la sesión no se cierre
sin los jueces que tocan**. Solo se activan en la configuración de Álvaro
(`~/.claude/settings.json`), no en la de Pablo. El repo es público: aquí no hay
nada sensible; el registro vive fuera, en `~/.claude/factoria-alvaro/`.

| Hook | Evento | Qué hace |
|---|---|---|
| `hooks/arranque.mjs` | SessionStart | Dice «Factoría de Álvaro activa». Si no la ves, no está funcionando |
| `hooks/registro.mjs` | SubagentStop, PostToolUse de `SubagentHandback` y de `Agent` | Apunta qué juez corrió y su veredicto, por rama. El informe del juez sale de `last_assistant_message` (SubagentStop) o de `tool_input.message` (SubagentHandback); el aviso de un juez lanzado en segundo plano (`async_launched`) solo apunta «lanzado» |
| `hooks/cierre.mjs` | Stop | Mira los ficheros cambiados contra `origin/staging`; si falta un juez o dijo «no pasa», bloquea el cierre (una vez) y enseña el cuadro |

Qué juez toca (`lib/reglas.mjs`): `qa` si cambia una pantalla de `src/`;
`evaluador` si cambia Lola (`api/_bot/`, `api/bot/`, `api/_prompts.js`);
`revisor` si cambia cualquier código. Un juez «lanzado» que aún no ha informado bloquea el cierre igual que uno que falta («lanzado, sin informe»). Los tests y snapshots no piden
evaluador. Un juez solo vale si corrió **después** del último cambio.

## Activar

Pegar el contenido de `settings.snippet.json` en `~/.claude/settings.json`
(fusionando con lo que haya). Cada comando comprueba que existe
`factorias/alvaro/` en la carpeta de la sesión; en otros proyectos no hace nada.

## Comprobar que funciona

1. Al abrir una sesión sale «Factoría de Álvaro activa».
2. Prueba de fallo: toca una pantalla y di «ya está». La sesión tiene que
   pedir `qa` y `revisor`. Si te deja cerrar, está rota.
3. Apagar: `FACTORIA_ALVARO_OFF=1` (el cierre lo dice).

`npx vitest run factorias` lo comprueba solo, con una prueba de fallo incluida.

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
- El veredicto se lee del texto del juez (la última línea `Veredicto:` con UNA sola opción; la línea del encargo, con `|`, no cuenta);
  los agentes de Pablo no tienen ese formato escrito, así que hoy un juez sin
  esa línea sale como «⚠️ sin veredicto claro» y no bloquea.
- La comprobación en el CI del PR (que el PR lleve el cuadro) no existe: tocaría
  `.github/`, que pide juez y es de Pablo.
- La regla de `api/_prompts.js` no tiene test propio (los tests no pueden
  nombrar ficheros reales de HoMenu, `ops/vigilante-lados.test.js`).
