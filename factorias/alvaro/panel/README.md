# Panel local de la factoría de Álvaro (v0)

Una página que enseña cómo funciona la factoría: qué hooks se activan y cuáles no, cuánto
tarda cada cosa y dónde se pierde tiempo. Sin dependencias: Node y un HTML.

```
node factorias/alvaro/panel/servir.mjs      # y abrir http://127.0.0.1:5177
```

Variables: `PANEL_PUERTO` (5177), `PANEL_DIAS` (7: solo mira ficheros modificados en esos días),
`FACTORIA_ALVARO_DIR` (dónde está el registro de jueces, igual que en los hooks).

## Qué enseña (tablas y números, sin gráficos)

1. **Estado**: hora del último evento visto, sesiones en la ventana, bandera verde/roja de
   «copia instalada = repo» (hash sha256 de `~/.claude/factoria/{hooks,lib}` contra
   `factorias/alvaro/{hooks,lib}`), aviso si el registro de jueces es del hook viejo.
2. **Qué se activa y qué no**: por hook, veces, última vez, duración media y máxima, bloqueos.
   Un hook declarado en `~/.claude/settings.json` sin activaciones sale «sin huella visible»
   (en rojo solo si es de Stop: los demás eventos casi no dejan huella en la transcripción).
3. **Tiempos**: por sesión (las 15 últimas) total, API, herramientas, hooks y «total − API −
   herramientas» (un cálculo, no una medida; puede ser negativo o de horas); y, para los jueces
   con `agent_id`, el tiempo entre «lanzado» e informe.
4. **Ineficiencias**: bloqueos por hook con los 3 motivos más repetidos (80 caracteres), jueces
   relanzados, coste mínimo por sesión y tokens por modelo, subagentes lanzados por tipo.
5. **Qué NO sabe este panel**.

## Qué NO hace

- **Solo lee.** No escribe nada: ni en `~/.claude`, ni en el repo, ni en disco (la caché de lectura vive en memoria).
- No manda nada fuera del PC. Escucha solo en `127.0.0.1`, solo atiende `GET`, y rechaza
  peticiones cuyo `Host` no sea `127.0.0.1`/`localhost` (protege de páginas web que apunten su nombre a tu PC).
- No enseña el contenido de los mensajes. **Lo que sí sale**, y se ve en el navegador local:
  nombres de rama y de carpeta de tus sesiones, el modelo y el tipo de subagente (solo letras,
  cifras, `.`, `:`, `_` y `-`, 40 como mucho), nombres de hooks y de agentes, y los motivos de
  bloqueo cortados a 80 caracteres.
- No lee `~/.claude/menuplan-fabrica/` ni los hooks del proyecto (`.claude/settings.json` del repo
  donde corre cada sesión): solo `hooks` de `~/.claude/settings.json`.
- Un fichero que no se puede leer **se muestra** en una franja roja con su nombre y el motivo; nunca se sustituye por un 0.

## De dónde saca cada cosa

| Dato | Fuente |
|---|---|
| Activaciones de hooks | `stop_hook_summary` (cierre de turno) y adjuntos `hook_success` de los demás eventos, de `~/.claude/projects/*/*.jsonl` |
| Bloqueos | adjuntos `hook_blocking_error` (traen el comando y el texto). Los `hookErrors` del resumen de cierre solo se cuentan aparte: no dicen qué hook fue |
| Coste y tiempos | `cost-state` (la última foto de cada sesión): ver abajo, **es una foto** |
| Tokens | `message.usage` del asistente, una vez por `message.id` (los modelos sintéticos no salen) |
| Subagentes | bloques `tool_use` de la herramienta `Agent` (`subagent_type`) |
| Jueces | `~/.claude/factoria-alvaro/<rama>.jsonl` |

Las transcripciones se leen en streaming, una línea rota se salta y se cuenta, y se cachean por
fichero (fecha y tamaño): si un fichero cambia se relee entero; los que salen de la ventana se olvidan.

## Sin comprobar

- **`cost-state` es una foto esporádica de Claude Code, no un contador final.** Hay sesiones sin
  ninguna, con coste 0 (el panel las enseña como «sin dato», nunca «$0.00») y con la última foto a
  mitad de sesión (el panel las marca con `*`). El coste y los tiempos son mínimos. «Total − API −
  herramientas» solo se calcula si hay API y herramientas, y no equivale a «espera de persona».
- **Navegador:** la comprobó qa en un Chrome real sin interfaz (1280, 420 y 375 px, claro y oscuro, sin
  peticiones externas). **No** se ha probado en un móvil físico ni en Safari o Firefox. Las sombras de
  desplazamiento de las tablas, la franja fija de aviso y el repintado que conserva el scroll y el foco
  (cambios posteriores a esa prueba) solo se han probado con un DOM de pruebas.
- Que `hook_success` aparezca para todos los eventos con hooks (se ha visto para SessionStart, PreToolUse y PostToolUse; para el PostToolUse de `registro.mjs` no hay ninguno: puede ser que no se active o que no deje huella).
- Las transcripciones de subagentes en subcarpetas no se leen; no se ha comprobado si existen.
- El registro de jueces del PC viene del hook viejo (apunta también a constructores y lee veredictos falsos): sus cifras no son fiables hasta que se instale la copia nueva.

Los tests (`npx vitest run factorias/alvaro/panel`) usan transcripciones sintéticas con un
marcador secreto sembrado y comprueban que no sale por `/datos.json`.
