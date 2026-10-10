---
name: plan-de-arreglo
description: Úsala cuando un fondo ya tiene diagnóstico y hay que decidir cómo se arregla, con las palabras «plan», «encargos», «cómo lo arreglamos para que no vuelva», «en cuántos trozos», «qué mecanismo», «ventana de observación»; o al pasar una ficha de diagnosticado a plan. No para: averiguar la causa (causa-raiz), registrar casos o etiquetas (issues), ni construir el arreglo (el agente del dominio).
metadata:
  tipo: oficio
  dueno: gobierno
  comprobado: 2026-10-10
---

# Plan de arreglo

## Cuándo y para qué

Para convertir un diagnóstico en pocos encargos que cierran la **clase** y no
solo el caso, con el mecanismo más duradero posible y una forma de saber si
aguantó. Es el paso 6 (Plan) de `docs/ops/FLUJO.md`: entra un fondo en
`diagnosticado` (con `mecanismo`, `causa_escape` y `clase`) y sale el fondo en
`plan`, con sus encargos colgados. Cubre P06.2 (dependencias, constructor y
juez), P06.3 (el escalón más alto) y P06.4 (tres encargos como mucho, uno
preventivo y automático).

No es para:
- un fondo sin diagnóstico: primero la skill `causa-raiz` (sin `mecanismo` y
  `causa_escape`, el CI niega los PR de sus encargos);
- construir ni juzgar: el plan dice quién construye y quién juzga; quien
  construye no juzga.

## Método

1. **Lee el diagnóstico y lo apuntado.** `gh issue view <fondo> --comments`
   (ficha, comentario del bot y del diagnóstico) y `npm run issues` (encargos
   que ya cuelgan o que alguien lleva). Si ya hay encargos, el plan los
   reutiliza o los cierra; no se suman.
2. **Define la clase** en una frase «todo X que Y» a partir de la de la ficha,
   y comprueba que incluye el caso y excluye lo que funciona bien. Una clase
   que solo cubre los casos conocidos se queda corta (`no-aguanto-corto`).
3. **Barre las instancias** antes de arreglar: busca en el repo con `rg` o el
   script que corresponda (`npm run normas`, `npm run issues`, el test de la
   zona) cuántos sitios caen en la clase. Apunta la cifra y dónde en `barrido`
   de la ficha («12 sitios en 5 ficheros, buscado con …»). Es la cifra
   «antes»; la de después la da la verificación.
4. **Elige el mecanismo, el más alto posible.** `npm run mecanismos` → el
   catálogo `ops/mecanismos.json` por escalones, de bloqueo a texto, con
   cuándo conviene cada uno, qué cuesta y hasta qué veredicto llega. Empieza
   por arriba y baja solo con un motivo: no se puede (el proveedor no lo
   permite), cuesta más que el daño, o alcanza a menos gente de la que debe.
   Ese motivo va a `por_que_no_mas_alto` del encargo. Un fondo de severidad
   `alto` o repetido se cierra en `bloqueo` o `test_ci`.
5. **Parte en encargos: como mucho tres**, y al menos uno `preventivo` cuyo
   mecanismo sea automático (lo que es automático lo dice
   `docs/ops/FLUJO.md` y `docs/ops/ENCARGO.md`). Uno por superficie (base,
   scripts, bot, app) si el cambio vive en sitios distintos; uno solo con un
   juez por superficie si es una pieza común, porque partirla da dos fuentes.
   Lo típico: un preventivo automático, un detectivo si el preventivo no lo
   ve todo, y un correctivo para el barrido.
6. **Grafo de dependencias.** Cada encargo dice `depende_de` (o `ninguno`);
   sin ciclos. Si el plan pasa de dos encargos, pon el grafo en el cuerpo del
   fondo en un bloque `yaml` con `id` y `depende_de`, como el plan de #334.
7. **Constructor, juez y presupuesto.** El constructor es el agente del
   dominio (o `sesión`); el juez, distinto. `npm run presupuesto -- <alcance>
   <tipo_causa>` dice los jueces mínimos, los obligatorios por causa y el tope
   de rondas. En la respuesta, cada encargo con su `tipo_accion`, `mecanismo`,
   `depende_de`, `constructor` y `juez`: un plan sin ellos no se puede lanzar.
8. **Verificación y ventana.** El preventivo lleva un test de **la clase**
   (todas las instancias del barrido, y una nueva que se añadiera), que se ve
   fallar antes de creérselo. En la ficha: `barrera` = el escalón del
   mecanismo del preventivo, `verificacion` = la ruta de ese fichero, y al
   fusionar, `ventana_desde` (el día de la fusión, AAAA-MM-DD, con `npm run
   hora`) y `ventana_hasta` (90 días como mucho; más larga si el fallo es
   raro). Propón las dos fechas. La ventana la vigila el workflow `fondos`.
9. **Escríbelo.** Cada encargo con `npm run issues -- --nuevo "…" --tipo
   encargo --area <a> --cuerpo <f.md> --padre <fondo>`, y el cuerpo con el
   «Qué» y el bloque `encargo` de `docs/ops/ENCARGO.md`. La ficha del fondo,
   a `estado: plan` con `encargos: #a, #b`. Repo público (#300): ni en el plan
   ni en los encargos va cómo se salta una barrera. Crear los encargos y editar
   la ficha es rutina: no pide el OK de Pablo.

Sale bien si: el comentario del bot del fondo no lleva `plan-grande` ni
`ficha-desactualizada`, cada encargo lleva su bloque `encargo` completo, y uno
de ellos es preventivo con mecanismo de los escalones automáticos.

## Técnicas

- **Generalizar la clase**: quita del caso lo accidental (el fichero, la
  orden, el día) hasta que la frase cubra a sus hermanos; luego comprueba que
  no cubre lo que funciona.
- **Barrido**: la clase convertida en una búsqueda; si no se puede buscar, la
  clase está mal definida.
- **Escalera de durabilidad**: la de `docs/ops/FLUJO.md`, con los mecanismos
  de `ops/mecanismos.json` en cada escalón.
- **Partir por superficie o por pieza común**, sin dejar dos versiones de lo
  mismo.
- **Grafo de dependencias**: lo que bloquea va primero; lo independiente va en
  paralelo con su propia carpeta.

## Ejemplo resuelto

Fondo (abstracto, a partir de #325): una norma de «buscar parecidos antes de
crear un issue» solo se hacía cumplir en una de las vías de entrada; por otra
vía se crearon issues sin la búsqueda. Diagnóstico: `tipo_causa:
vigilante-hueco`; clase «toda norma que se hace cumplir en una sola puerta
cuando hay varias».

- Barrido: `npm run normas` y el registro `ops/normas.json`, normas cuyo
  ejecutor es la guardia (solo ve a las sesiones de Claude): cuántas tienen
  otra vía de entrada.
- Escalera: impedir crear un issue a quien tiene acceso no lo permite el
  proveedor, así que el bloqueo total no cabe; sí cabe que una sesión no pueda
  usar la otra vía (hook) y que cualquier vía quede revisada después.
- Encargos (tres):
  - E1 `preventivo`, `mecanismo: hook` (las herramientas de escritura de la
    otra vía, en la guardia), juez `revisor`, `depende_de: ninguno`;
  - E2 `detectivo`, `mecanismo: workflow_evento` (búsqueda de parecidos en
    cada issue nuevo, venga de donde venga), `por_que_no_mas_alto: el
    proveedor no deja impedir crear un issue`, `depende_de: ninguno`;
  - E3 `correctivo`, `mecanismo: ci`: un test sobre el registro que exige a
    cada norma de una sola puerta decir sus otras vías, `depende_de: E1`.
- Ficha: `barrera: bloqueo`, `verificacion` el test de la guardia; ventana de
  60 días al fusionar E1.

## Lo que falló y por qué

Sin entradas todavía: es la primera versión. Cuando un plan no aguante
(`no-aguanto-corto` en un fondo que salió de aquí), la lección se apunta en
esta sección con fecha, causa y arreglo.

## Registro de cambios

- **2026-10-10** · Primera versión: clase y barrido, escalón con el catálogo de mecanismos, tres encargos como mucho, grafo, verificación y ventana (#338).

## Fuentes y comprobación

- La especificación del paso: `docs/ops/FLUJO.md` (Plan, la escalera y
  «Proporcionalidad»).
- La ficha del fondo y sus controles: skill `issues`.

Comprobado el 2026-10-10: `npm run mecanismos`, el catálogo con `ops/mecanismos.test.js`, el formato del encargo con `scripts/encargo.test.js`, la forma con `.claude/skills.test.js` y los casos con `npm run skills-prueba -- plan-de-arreglo` (resultado en `ops/skills-prueba/plan-de-arreglo.json`: disparo 5 de 5, comprobaciones 10 de 13 y 7 de 13 en dos pasadas seguidas, con ruido entre ellas; falla en concretar el test de clase sin ver el repo). Sin comprobar: un plan real de punta a punta, ni que el workflow `fondos` lea el bloque `encargo` (hoy no lo lee).
