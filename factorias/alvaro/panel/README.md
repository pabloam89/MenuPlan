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
   Un hook declarado en `~/.claude/settings.json` sin activaciones sale resaltado «no visto».
3. **Tiempos**: por sesión (las 15 últimas) total, API, herramientas, hooks y «espera» (cálculo:
   total − API − herramientas, puede ser negativo); y, para los jueces con `agent_id`, el tiempo
   entre «lanzado» e informe.
4. **Ineficiencias**: bloqueos por hook con los 3 motivos más repetidos (80 caracteres), jueces
   relanzados, coste por sesión y tokens por modelo, subagentes lanzados por tipo.
5. **Qué NO sabe este panel**.

## Qué NO hace

- **Solo lee.** No escribe nada: ni en `~/.claude`, ni en el repo, ni en disco (la caché de lectura vive en memoria).
- No manda nada fuera del PC. Escucha solo en `127.0.0.1`, solo atiende `GET`, y rechaza
  peticiones cuyo `Host` no sea `127.0.0.1`/`localhost` (protege de páginas web que apunten su nombre a tu PC).
- No enseña el contenido de los mensajes: solo cifras, nombres de hooks y de agentes, y los
  motivos de bloqueo cortados a 80 caracteres (esos sí salen en el navegador local).
- No lee `~/.claude/menuplan-fabrica/` ni los hooks del proyecto (`.claude/settings.json` del repo
  donde corre cada sesión): solo `hooks` de `~/.claude/settings.json`.
- Un fichero que no se puede leer **se muestra** en una franja roja con su nombre y el motivo; nunca se sustituye por un 0.

## De dónde saca cada cosa

| Dato | Fuente |
|---|---|
| Activaciones de hooks | `stop_hook_summary` (cierre de turno) y adjuntos `hook_success` de los demás eventos, de `~/.claude/projects/*/*.jsonl` |
| Bloqueos | adjuntos `hook_blocking_error` (traen el comando y el texto). Los `hookErrors` del resumen de cierre solo se cuentan aparte: no dicen qué hook fue |
| Coste y tiempos | `cost-state` (el último de cada sesión): «según Claude Code» |
| Tokens | `message.usage` del asistente, una vez por `message.id` |
| Subagentes | bloques `tool_use` de la herramienta `Agent` (`subagent_type`) |
| Jueces | `~/.claude/factoria-alvaro/<rama>.jsonl` |

Las transcripciones se leen en streaming, una línea rota se salta y se cuenta, y se cachean por
fichero (fecha y tamaño). Si un fichero solo creció, se lee desde donde se quedó.

## Sin comprobar

- **La página en un navegador**: solo se ha ejecutado su script con un DOM de pruebas y con datos reales. Falta verla a 1280 y 420 px, en claro y en oscuro.
- Que `hook_success` aparezca para todos los eventos con hooks (se ha visto para SessionStart, PreToolUse y PostToolUse; para el PostToolUse de `registro.mjs` no hay ninguno: puede ser que no se active o que no deje huella).
- Que las transcripciones solo añadan líneas al final (la lectura incremental lo da por hecho) y que terminen cada línea con salto de línea (la última sin él no se cuenta hasta que lo tenga).
- Las transcripciones de subagentes en subcarpetas no se leen; no se ha comprobado si existen.
- El registro de jueces del PC viene del hook viejo (apunta también a constructores y lee veredictos falsos): sus cifras no son fiables hasta que se instale la copia nueva.

Los tests (`npx vitest run factorias/alvaro/panel`) usan transcripciones sintéticas con un
marcador secreto sembrado y comprueban que no sale por `/datos.json`.
