# Panel local de la factoría de Álvaro (v1)

Una página para tomar decisiones sobre cómo funciona la factoría. De arriba abajo:

1. **Semáforo** (tres lámparas, con forma y palabra además de color): *Hooks vivos* (último evento visto: verde < 10 min, ámbar < 60 min, rojo más; y si la copia instalada coincide con el repo), *Bloqueos hoy* (desde las 00:00 de Madrid, con cuántos tienen hook identificado) y *Rondas abiertas* (jueces lanzados sin informe). Si una fuente de la que depende cae, la lámpara dice «sin dato» en gris, nunca verde.
2. **En directo**: los últimos 30 minutos, lo más nuevo arriba (agente lanzado, juez lanzado, juez informó, hook bloqueó, turno terminado). Los jueces en marcha llevan un temporizador que sigue contando en el navegador; el informe se enlaza con su lanzamiento por `agent_id` («tardó N s»). Las filas nuevas se insertan sin repintar las demás y sin mover el scroll.
3. **Rondas por tarea**: por rama, una marca por informe de juez (✔ pasa, ✖ no pasa, ? no sé, ⚠ ilegible, … lanzado sin informe), con el tiempo y el coste de esa ronda.
4. **Coste estimado**: tokens y coste **a precio de API** por día (gráfico de barras apiladas en SVG con tabla alternativa), por categoría (jueces / constructores y otros / sesión principal), por sesión y por rama, y el reparto en %.
5. Lo de la v0: hooks, tiempos, ineficiencias.

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
  De «En directo» salen solo el tipo de agente, el nombre del hook, el veredicto (lista cerrada), ids cortos y duraciones: ni `description`, ni `prompt`, ni el resumen del registro.
  Del `*.meta.json` de cada subagente solo se toma `agentType`.
- No lee `~/.claude/menuplan-fabrica/` ni los hooks del proyecto (`.claude/settings.json` del repo): solo `hooks` de `~/.claude/settings.json`.
- **Un error de lectura nunca se vuelve un 0, y eso se decide en los datos, no en la página.** Cada error lleva su fuente
  (transcripciones, settings, copia, registro o precios) y `/datos.json` deja **`null`** todo lo derivado de la fuente caída; la página solo
  pinta `null` como «sin dato» (o «sin precio»). Un fallo de settings no mata costes ni tiempos. Una franja roja dice qué fichero falló y por qué.
  Una sola transcripción ilegible deja en `null` todo lo derivado de transcripciones: es lo correcto, porque no se sabe qué faltó (un total «parcial» sería un número que miente).
  Un test recorre el JSON hoja a hoja con cada fuente caída; cada hoja está clasificada por fuente en una lista cerrada, así que un campo nuevo dentro de un grupo ya conocido o en uno nuevo hace fallar el test («hoja sin clasificar») hasta que se clasifique y se enmascare.
  «Sin actividad en los últimos 30 min» (lista vacía) no es lo mismo que «sin dato en directo» (fuente caída).

## De dónde salen los datos

- `~/.claude/projects/*/*.jsonl`: las transcripciones principales (cada una se cachea por fecha y tamaño: si cambia se relee entera).
- **«En directo» no relee todo**: de cada transcripción tocada en los últimos 30 min lee primero el final (256 KB, y más hacia atrás solo si hace falta) y después solo los bytes añadidos, en líneas completas. Un fichero reescrito más corto se vuelve a leer desde el principio.
- `~/.claude/projects/<proyecto>/<sesion>/subagents/agent-<id>.jsonl` y su `.meta.json`: los subagentes (con caché por fecha y tamaño; solo se interpretan las líneas con `usage`). El `<id>` es el `agent_id` del registro de jueces, y de ahí sale el coste de cada ronda. Un juez sin transcripción, o un apunte sin `agent_id`, es «sin dato».
- `~/.claude/factoria-alvaro/<rama>.jsonl`: el registro de jueces. Los bloqueos con su hook salen de los adjuntos `hook_blocking_error` y de los cierres con `hookErrors`; el bloqueo visto por las dos vías (misma sesión, a menos de 5 s) cuenta una vez, y un cierre con errores no es un «turno terminado».
- `precios.json` (en esta carpeta): USD por millón de tokens, con fecha y fuente.

## Coste: qué es y qué no es

- **Es una estimación a precio de API**, con los precios de `precios.json` (fecha y URL de la documentación oficial en el propio fichero). Si usas un plan con límite de sesión (no pagas por token), **no es tu factura**: mide el consumo relativo (qué parte se va en jueces). La página lo dice siempre.
- Cada mensaje del asistente cuenta una vez (por `message.id`, el del subagente antes que el de la principal), con entrada, salida, lectura de caché y escritura de caché; la escritura de 1 h y la de 5 min a su tarifa cuando el `usage` las separa, y si no, todo a la de 5 min.
- Categorías: **jueces** = revisor, qa, evaluador, seguridad, auditor-datos; **constructores y otros** = el resto de subagentes (también los que no tienen meta); **sesión principal** = las transcripciones principales. La rama es la de la sesión padre.
- **Un modelo sin precio (o con `null`) da sus tokens y «sin precio»**; el total pasa a ser «mínimo (modelos sin precio no incluidos)». Para ponerle precio, edita `precios.json`. No se inventa ninguno: si no está en la documentación oficial, va a `null`.
- No usa el `totalCostUSD` de `cost-state` (foto poco fiable). La tabla de tiempos de la v0 y «Coste y tokens» siguen usándolo; retirarlos es decisión pendiente.
- «Tiempo en jueces» de una rama es la suma de «tardó» de las rondas con `agent_id`; las demás no suman.

## Sin comprobar

- **`cost-state` es una foto esporádica de Claude Code, no un contador final**: hay sesiones sin ninguna, con coste 0 (sale «sin dato») y con la
  última foto a mitad de sesión (marca `*`). Si su duración supera la vida observada de la sesión + 10 min, el total sale «total no fiable» (el coste, la API y las herramientas se conservan). Coste y tiempos son mínimos.
  **No se sabe** qué cuenta exactamente `totalDuration` ni si una sesión reanudada hereda coste y duración (si lo hereda, el coste podría duplicarse).
- **Navegador:** la v1 solo se ha visto en un Edge sin interfaz (captura a 375 px y a 1100 px, con datos reales); **no** en móvil físico, Safari ni Firefox, y sin comprobar a ojo el modo oscuro ni el scroll real con filas nuevas. La lógica JS tiene test con un navegador simulado; el aspecto, la franja fija, las sombras de desplazamiento y el atenuado no tienen test automático.
- **Primera lectura en frío**: con ~100 ficheros de subagentes (~370 MB esta semana) tarda 1-3 s; después, con caché, decenas de ms.
- **Retraso real de las transcripciones**: no se sabe cuánto tarda Claude Code en escribir cada línea; «En directo» enseña lo que ya está escrito.
- Que un cierre con `hookErrors` es siempre un bloqueo (no un error no bloqueante) es una suposición: en los datos de esta máquina cada uno iba con su adjunto `hook_blocking_error`.
- Un juez «lanzado» sin informe de hace más de 2 h ya no cuenta como ronda abierta (constante `RONDA_ABIERTA_MAX_MS`): es una decisión mía, no una medida.
- Los jueces lanzados no salen como «agente lanzado»: salen del registro como «juez lanzado»; sin el hook del registro instalado no aparecerían.
- Una última línea de transcripción sin salto de línea final no se ve en «En directo» hasta que se escriba la siguiente.
- `hook_success` solo se ha visto para SessionStart, PreToolUse y PostToolUse; el PostToolUse de `registro.mjs` no deja ninguno (¿no se activa o no deja huella?).
- El registro de jueces del PC viene del hook viejo (apunta también a constructores y lee veredictos falsos): no es fiable hasta instalar la copia nueva. Sus apuntes sin `agent_id` salen como «dato antiguo, no fiable».
- Pendiente (conocido, sin arreglar): un registro de jueces con una línea rota no marca nada (`rotas` no tiene lector); «Faltan en la copia instalada» miente si falta solo `lib/` y existe `hooks/`; la tabla de tiempos a 375 px no enseña ninguna cifra sin deslizar; y el mensaje de error de la franja roja repite la ruta del fichero.
- Con `settings.json` ilegible las filas «declarado y nunca visto» desaparecen de la tabla de hooks; la nota de la tabla lo avisa.
