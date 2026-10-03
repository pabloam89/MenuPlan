# Mejora semanal de Lola

Cómo se mide Lola cada semana y cómo cada fallo real acaba siendo una prueba
que no se vuelve a romper. Propuesta de Álvaro, 2 oct 2026.

## La idea en una frase

El modelo no aprende solo. Lo que mejora es lo que lo rodea —lo que encuentra
al buscar, lo que se le dice, sus herramientas— y cada fallo real se convierte
en un caso de `scripts/bot-evals.json` que se pasa antes de cada cambio.

## Las piezas

| Pieza | Qué hace | Dónde |
|---|---|---|
| Medir cada turno | Tiempos, tokens, herramientas (Pablo, 1 oct) | `bot_route` en `user_events` |
| Señal «corregida» | El turno siguiente fue «no, eso no» o deshacer | `api/_bot/senales.js` → `corrige` en `bot_route` |
| Señal «búsqueda floja» | Qué se buscó, por dónde y cuánto se parecía lo mejor | `bot_busqueda` en `user_events` |
| Objetivos | Los límites del semáforo | `scripts/bot-objetivos.json` |
| Informe semanal | Esta semana contra la anterior y los objetivos. Solo números | `scripts/bot-semanal.mjs`, cada lunes en el issue «Lola: informe semanal» |
| Huecos | Los turnos que salieron mal, con su frase. Solo en local | `scripts/lola-feedback.mjs` → `scripts/bot-evals-candidatos.json` (no se sube) |
| Huecos del enrutador | Lo mismo para la vía rápida | `scripts/router-feedback.mjs` (Pablo) |
| Pruebas | Lola y el enrutador contra sus casos | `scripts/bot-evals.mjs`, `scripts/router-evals.mjs` |

## Las medidas

- **¿Es rápido?** Primer texto que ve la persona (p95, vía rápida y Lola) y
  turno entero de Lola (p95).
- **¿Acierta?** Turnos corregidos, «no te he entendido», supervisor, «dijo que
  guardó sin guardar», modelo de reserva, búsquedas vacías o flojas.
- **¿Cuánto cuesta?** USD por turno, con lo cancelado estimado.

El umbral de «búsqueda floja» (`busquedaParecidoMinimo`) empieza en `null`: no
se sabe aún qué parecido es bajo con nuestro modelo de vectores. Se fija tras
dos semanas mirando el p10/p50 que da el informe.

## El ciclo, cada lunes (~30 min)

1. **Leer el informe** en el issue. ¿Qué está en rojo? ¿Qué empeoró?
2. **Sacar los huecos** (local, necesita `SUPABASE_DB_URL` y
   `ANTHROPIC_API_KEY` en `.env.local`):
   `node scripts/lola-feedback.mjs --sugerir` y `node scripts/router-feedback.mjs --sugerir`.
   Antes de 15 días: después la retención borra las frases.
3. **Revisar** `scripts/bot-evals-candidatos.json`: por cada hueco, el
   `destino` (dónde se arregla), el `caso` con la frase **reescrita** sin
   nada de la familia, y `aprobado: true`. Nada entra sin que lo mire alguien.
4. **Pasar los aprobados a pruebas:** `node scripts/lola-feedback.mjs --anadir`.
5. **Medir antes:** `node scripts/bot-evals.mjs` → los casos nuevos deben fallar.
6. **Arreglar** en el destino: vectores (descripciones + `build-vectores.mjs`),
   `conocimiento.md`, instrucciones de Lola o código.
7. **Medir después:** los nuevos pasan y **ninguno de los antiguos falla**. Si
   alguno antiguo falla, el arreglo rompe otra cosa: no se sube.
8. **PR contra staging.** El informe del lunes siguiente dice si se notó.

El paso 2-4 se puede hacer con `/revision-semanal` en Claude Code.

## Hacia más automático

En orden, cada paso solo cuando el anterior funcione unas semanas:

1. Ahora: medir y detectar solo; revisar y aprobar, a mano.
2. Pasar `bot-evals` en el workflow cada lunes (necesita `ANTHROPIC_API_KEY`;
   unos céntimos) para ver si un cambio de modelo empeora algo sin tocar código.
3. Un agente (como `agente-fallos.yml`) que, con los huecos ya aprobados, abra
   un PR en borrador con el arreglo y la prueba. La aprobación sigue siendo
   humana.
4. Nunca automático: lo que toca alergias, salud o bebés.

## Privado o grupo

Cada evento del bot dice dónde ocurrió: `esGrupo` (y `variosAutores` en los
turnos). En grupo cambian las reglas —la vía rápida hace menos
(`router.js`, POLITICA), escriben varias personas y Lola tiene que saber a
quién contesta—, así que se mide aparte:

- el informe semanal trae la tabla «Privado frente a grupo»;
  `node scripts/bot-semanal.mjs --solo=grupo` (o `privado`) da el semáforo
  entero de uno de los dos;
- el panel (`npm run bot:panel`) tiene el filtro Todos / Privado / Grupo y la
  columna «Dónde»;
- los huecos de `lola-feedback.mjs` llevan `_lugar`.

Lo que no trae el dato (lo anterior al 3 oct 2026 que no sea `bot_route`) no se
supone: se cuenta aparte como «sin dato». Los turnos que contesta Lola sin
pasar por el enrutador (apagado, en sombra o en inglés) también se apuntan,
con `sin_enrutador`.

## Límites

- El repo es público: el informe solo lleva números; las frases reales solo
  viven en la base de datos (15 días) y en `bot-evals-candidatos.json` local.
- Solo se mide lo que pasa por el enrutador (`BOT_ROUTER` en `sombra` u `on`):
  con `off` no se escribe `bot_route`.
- Los turnos anteriores al 1 oct 2026 no traen medidas; `corrige` y
  `bot_busqueda`, desde que se suba este cambio.
