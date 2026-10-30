---
name: pr-con-juez
description: Úsala cuando vayas a escribir el cuerpo de un PR de MenuPlan, el juez del CI (`revisor`) haya dicho «no», salga un `revisor` en rojo que no entiendes, o quieras saber qué clase de «no» se repite. No para: el CI de `tests` ni los workflows (github), ni el estándar en sí (vive en la Fábrica, `standards/code.md`).
metadata:
  tipo: guia
  opera_proveedor: false
  juzga_artefacto: false
  encadena: false
  pasos_fijos: false
  sintoma_a_causa: true
  elige_opciones: false
  dueno: pablo
  comprobado: "2026-10-31"
---

# PR con juez

El juez lee el diff y el cuerpo, y cada pregunta del estándar (C5…C17) debe salir `sí` o `no aplica`. El cuerpo sale de `npm run pr:cuerpo -- --salida cuerpo.md`; esto es lo que sus TODO deben llevar. Orden: de lo que más «no» da a lo que menos, medido con `npm run rondas-juez` (cuenta los «no» por criterio; desde Node, lánzalo con `node scripts/token-sesion.mjs -- npm run rondas-juez`). Vuelve a medir antes de reordenar.

## Lo que pide, por lo que más falla

- **C15, Decisions.** Toda elección que el encargo no impone (un tope, una regex, un orden, un plan B) va en una línea `- principio N | eligió: … | descartó: … | motivo: decidido`. La descartada tiene que **romper** ese principio (los seis, en `.fabrica/CLAUDE.md` de la Fábrica: 1 Verdad, 2 Evidencia, 3 Fallar en alto, 4 Una idea un sitio, 5 La máquina comprueba, 6 Preguntar antes de un atajo).
  Mal (#1065): `MAX_VALOR_JSON = 4000` en el código y fuera de Decisions. Mal (#1034): todas las líneas citan «principio 1» y lo descartado no lo rompe.
  Bien (#1065): `principio 3 | … | descartó: devolver vacío como si se hubiera guardado` (eso es tragarse un fallo).
- **C9, cada cifra con su comando y su salida, medidos sobre la cabeza del PR.** Tras cada commit, se vuelve a lanzar; no afirmes lo que el comando no mide.
  Mal (#1064): salidas de otros SHA, «las líneas 122 y 139» cuando ya eran 147 y 164. Mal (#1067): «la forma no se copia aquí» y el diff la copia.
  Bien (#1066): `grep -n "npm test" .github/workflows/tests.yml` → `48: run: npm test`; lo no comprobado, en «Not verified».
- **C8 y C14, nada escrito dos veces.** Un dato, una regex o una lista vive en un sitio y se importa; si no se puede (SQL y JS), un test compara las dos copias. En planes, un dato va en un solo trozo y los demás dicen «la migración del trozo N», no el número.
  Mal (#1067): una regex de uuid nueva en `api/operacion.js` en vez de `RE_UUID` de `src/lib/ids.js`. Mal (#1060): el trozo cambia y otra línea del plan sigue diciendo lo de antes.
  Bien (#1062): `ESTADO_DE_ORIGEN` en `vocabularios.js` y un test con `toEqual(ESTADO_DE_ORIGEN)` contra el `case` del SQL.
- **C6, rojo que falla por la regla.** Rompe la regla a propósito (cambia una línea del código) y pega la salida en rojo de cada test nuevo. «Módulo no existe», «no tests» o el `(saltado)` de `pr:cuerpo` con el árbol sucio no valen.
  Mal (#1034): «Red before» con `código -1 / El árbol no está limpio`.
  Bien (#1067): siete reglas rotas, cada una con `× un lector no escribe datos de la casa … Tests 1 failed | 15 passed`.
- **C17, un check nuevo lo dispara algo automático** (`npm test`, `tests.yml`) y el rojo entra por ahí, no llamando a la función a mano.
  Mal (#1064): una prueba e2e que `npm test` excluye y ningún workflow corre. Mal (#1055): el caso malo solo llama a `erroresDeCasos([...])`.
- **C7, tests sin azar, reloj ni red; C5, ningún fallo cambiado por un valor por defecto.**
  Mal (#1034): el test llama 15×14 veces a una función que elige con `Math.random` sin fijarlo. Mal (#1040): `saveUserState` falla con un `console.warn` y se devuelve `{ ok: true }`.
- **C16**, si cambias un plan: cumple cada pregunta del revisor de `.fabrica/standards/plan.md` (Done que falla antes, Not done concreto…).
- **C12, todo lo que añades tiene lector.** Un export, un parámetro o un campo sin quien lo lea, fuera; si lo leerá el siguiente trozo, dilo. Un fichero tocado que no está en Files del trozo, dilo y por qué.
  Mal (#1000): `conPlazo(..., { duracionMs })` y nadie pasa `duracionMs`.
- **C11, una idea por PR.** No cambies el plan dentro del PR que construye un trozo, ni metas refactors de paso.
  Mal (#1064): la prueba del trozo 37 más meterla en la puerta del CI, que el plan apartaba.
- **C13** si tocas `.github/workflows/`, el estándar, `.claude/` o `CLAUDE.md`: di en el cuerpo qué comprobación queda igual o más estricta.

## Leer el veredicto y relanzar

- Veredicto: `gh run list --workflow revisor --branch <rama> --limit 3` y `gh run view <id> --log | grep -o 'SALIDA: {.*'` (el JSON con `prueba` de cada «no»). Las líneas `C9: no` siguen a `veredicto: no`. La ejecución sale `success` aunque el veredicto sea «no»: mira el check, no la ejecución.
- Un `revisor` en rojo puede ser de una ejecución vieja o cancelada (`la cabeza del PR ya no es el SHA juzgado`): mira que el check sea del último commit antes de arreglar nada.
- Fallo del propio juez (los motivos con `fallaElJuez` de `MOTIVOS_SIN_VEREDICTO`, en `scripts/rondas-del-juez.mjs`): no es tu contenido. El token de la App no puede `gh run rerun`; relánzalo editando el cuerpo con una nota nueva (`gh pr edit <n> --body-file cuerpo.md`, con una línea más en «Not verified»).
