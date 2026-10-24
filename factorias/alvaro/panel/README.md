# Panel local de la factoría de Álvaro (v0)

Una página que enseña cómo funciona la factoría: qué hooks se activan, cuánto tarda cada cosa y dónde
se pierde tiempo (hooks, tiempos por sesión y por juez, bloqueos, relanzados, coste, tokens, subagentes).
Sin dependencias: Node y un HTML.

```
node factorias/alvaro/panel/servir.mjs      # y abrir http://127.0.0.1:5177
```

Variables: `PANEL_PUERTO` (5177), `PANEL_DIAS` (7: solo mira ficheros modificados en esos días),
`FACTORIA_ALVARO_DIR` (el registro de jueces, igual que en los hooks).

## Qué NO hace

- **Solo lee**: no escribe en `~/.claude`, ni en el repo, ni en disco (la caché vive en memoria). No manda nada fuera del PC.
  Escucha solo en `127.0.0.1`, solo `GET`, y rechaza un `Host` que no sea `127.0.0.1`/`localhost` (DNS rebinding).
- No enseña el contenido de los mensajes. **Lo que sí sale** (en tu navegador local): nombres de rama y de carpeta
  de tus sesiones, modelo y tipo de subagente (letras, cifras y `.:_-`, 40 como mucho), nombres de hooks y de agentes,
  y motivos de bloqueo cortados a 80 caracteres. De un `settings.json` roto solo sale la posición del error.
- No lee `~/.claude/menuplan-fabrica/` ni los hooks del proyecto (`.claude/settings.json` del repo): solo `hooks` de `~/.claude/settings.json`.
- **Un error de lectura nunca se vuelve un 0, y eso se decide en los datos, no en la página.** Cada error lleva su fuente
  (transcripciones, settings, copia o registro) y `/datos.json` deja **`null`** todo lo derivado de la fuente caída; la página solo
  pinta `null` como «sin dato». Un fallo de settings no mata costes ni tiempos. Una franja roja dice qué fichero falló y por qué.

Los datos salen de `~/.claude/projects/*/*.jsonl` (cada transcripción se cachea por fecha y tamaño: si cambia se relee entera) y de
`~/.claude/factoria-alvaro/<rama>.jsonl` (jueces). Los bloqueos con su hook salen de los adjuntos `hook_blocking_error`.

## Sin comprobar

- **`cost-state` es una foto esporádica de Claude Code, no un contador final**: hay sesiones sin ninguna, con coste 0 (sale «sin dato») y con la
  última foto a mitad de sesión (marca `*`). Si su duración supera la vida observada de la sesión + 10 min, el total sale «total no fiable» (el coste, la API y las herramientas se conservan). Coste y tiempos son mínimos.
  **No se sabe** qué cuenta exactamente `totalDuration` ni si una sesión reanudada hereda coste y duración (si lo hereda, el coste podría duplicarse).
- **Navegador:** qa probó la página en un Chrome real sin interfaz (1280, 420 y 375 px, claro y oscuro, sin peticiones externas); **no** en móvil
  físico, Safari ni Firefox. La lógica JS (cifras «sin dato», no repintar sin cambios, selección, «hace N s») tiene test con un navegador simulado;
  **la franja fija, las sombras de desplazamiento y el atenuado no tienen test automático.**
- `hook_success` solo se ha visto para SessionStart, PreToolUse y PostToolUse; el PostToolUse de `registro.mjs` no deja ninguno (¿no se activa o no deja huella?).
- Las transcripciones de subagentes en subcarpetas no se leen; no se sabe si existen.
- El registro de jueces del PC viene del hook viejo (apunta también a constructores y lee veredictos falsos): no es fiable hasta instalar la copia nueva.
