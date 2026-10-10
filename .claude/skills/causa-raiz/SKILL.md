---
name: causa-raiz
description: Úsala cuando algo ha fallado y hay que saber por qué antes de arreglarlo, con las palabras «por qué ha pasado», «diagnostica», «causa raíz», «se repite», «no aguantó», «nadie lo vio venir»; o al rellenar mecanismo y causa_escape en la ficha de un fondo. No para: partir el arreglo en encargos (plan-de-arreglo), registrar el caso o las etiquetas (issues), ni operar un servicio (su skill de herramienta).
metadata:
  tipo: diagnostico
  dueno: gobierno
  comprobado: 2026-10-10
---

# Causa raíz

## Cuándo y para qué

Para pasar de «esto falló» a una causa que se puede cambiar, sin inventarse
la cadena. Es el paso 4 (Diagnosticar) de `docs/ops/FLUJO.md`: entra un caso
registrado y sale el diagnóstico que pide la ficha del fondo (`mecanismo`,
`causa_escape`, `clase`, `tipo_causa`, `alcance`), o una hipótesis marcada como
tal. Cubre las obligaciones P04.3 (llegar a algo cambiable y decir por qué nada
lo detectó) y P04.4 (lo no comprobado es hipótesis).

No es para:
- registrar el caso o elegir su análisis (nuevo, abierto, no aguantó, puntual):
  skill `issues`;
- decidir los encargos, el mecanismo del arreglo y la ventana: skill
  `plan-de-arreglo`, que empieza donde esta acaba;
- un fallo que se arregla en una línea y no puede repetirse: eso es un caso
  `puntual`, con su porqué, y no necesita técnica.

## Método

1. **Mira lo que ya está apuntado** antes de pensar nada (caso #320: se
   presentaron como nuevos hallazgos ya registrados).
   `npm run issues` → los fondos abiertos con sus casos; `gh issue view <n>
   --comments` del fondo candidato → su ficha y el comentario del bot. Si el
   fallo ya cuelga de un fondo con diagnóstico, se añade evidencia, no se
   rehace.
2. **Triaje de alcance.** Fija `alcance` (`local`, `modulo` o `transversal`,
   definidos en `ALCANCES_FALLO` de `scripts/lib/flujo.mjs`) y `tipo_causa`
   (una de `causa:` en `scripts/lib/issues.mjs`) con datos: módulos de
   `ops/MODULOS.json` que toca, casos parecidos, y si es un «no aguantó» (sube
   un nivel). Sin evidencia, `sin-comprobar`. Luego
   `npm run presupuesto -- <alcance> <tipo_causa>` → quién diagnostica,
   cuántas hipótesis en paralelo, si toca tabla ES / NO ES y cuántas
   rondas caben. No te pases del presupuesto.
3. **Elige la técnica por el tipo de causa**:
   `npm run tecnica -- <tipo_causa>` → la técnica principal y las de apoyo, con
   sus pasos, del catálogo `ops/tecnicas.json`. Si el presupuesto pide ES / NO
   ES, haz además esa tabla. Si la técnica que sale no encaja (su «no cuando»
   se cumple), usa la de apoyo y di por qué.
4. **Aplícala con evidencia.** Cada afirmación lleva su prueba: comando y
   salida, `fichero:línea`, un run o un PR. La hora, con `npm run hora` (no
   `date`, que en Git Bash da UTC). Lo que no se puede comprobar se escribe `HIPÓTESIS:` con la
   observación que la confirmaría o tumbaría, y no se copia como hecho en la
   ficha.
5. **Para por criterio, no por cansancio.** Tres paradas (vocabulario
   `PARADAS` de `scripts/lib/tecnicas.mjs`):
   - `mecanismo_cambiable`: llegas a algo que un mecanismo de
     `ops/mecanismos.json` puede cambiar (`npm run mecanismos`);
   - `fuera_de_control`: llegas a un proveedor o a alguien de fuera; la causa
     es entonces la barrera que falta de nuestro lado;
   - `sin_evidencia`: se acaba lo comprobable; queda una hipótesis.

   Di cuál de las tres te hizo parar y a qué mecanismo llegaste.
6. **Escribe la causa en tres piezas**: *mecanismo* (qué hace el sistema) +
   *condición* (cuándo falla) + *control ausente* (qué debía pararlo y no
   existe o no lo ve). Plantilla: «<mecanismo> falla cuando <condición>, y
   <control> no lo para porque <motivo>». Va al campo `mecanismo` de la ficha.
   Escríbela entera aunque sea hipótesis (marcada como tal): «sigo la
   plantilla» no es una causa.
7. **Causa de escape, en todo diagnóstico**: por qué ningún test, hook, revisión o
   vigilante lo detectó antes de que llegara. Si la respuesta es «no había
   ninguno», dilo así. Va a `causa_escape`. Sin ella el fondo no pasa a
   `diagnosticado` y el CI niega los PR de sus encargos.
8. **La clase, no el caso**: una frase del tipo «todo X que Y» que incluye este
   caso y sus hermanos, escrita en la respuesta. Va a `clase`; el barrido lo
   hace `plan-de-arreglo`.
9. **Deja el rastro**: en la ficha del fondo (`gh issue edit <n> --body-file
   <f.md>`, skill `issues`), `estado: diagnosticado` con los campos de arriba;
   y un comentario del diagnóstico con dos líneas que se puedan contar:
   `tecnica: <id de ops/tecnicas.json>` y `parada: <id de PARADAS>`, más la
   tabla o cadena que produjo la técnica. Repo público (#300): describe el
   mecanismo y no cómo saltarlo; el detalle explotable va a Pablo en privado. <!-- norma:repo-publico-sin-detalle -->
   Editar la ficha y comentar el issue es rutina: se hace sin preguntar.

Sale bien si: el workflow `fondos` pone `control:ok` y su comentario no lleva
`sin-diagnostico`; y quien lea el diagnóstico puede señalar el mecanismo en el
código sin preguntarte.

## Técnicas

El detalle y los pasos están en `ops/tecnicas.json` (lo enseña `npm run
tecnica`); aquí, para qué sirve cada una:

- **5 porqués**: cadena simple; cada porqué con su evidencia.
- **Kepner-Tregoe (ES / NO ES)**: pasa en un sitio y no en otro; la causa está
  en lo que distingue los dos lados. Lo típico de `entorno`.
- **Espina de pescado**: muchos factores posibles repartidos; para abrir el
  abanico antes de bajar con otra técnica.
- **Árbol de fallos**: hacen falta varias condiciones a la vez (Y) o vale una
  de varias (O); la rama Y del control que falta es la causa de escape.
- **Cronología de factores causales**: varias sesiones o personas y el orden
  importa (`coordinacion`).
- **Hipótesis en competencia**: varias explicaciones y poca evidencia; se
  descarta por lo que contradice, no se elige por lo que confirma
  (`sin-comprobar`).

El encargo que salga del diagnóstico sigue el formato común de
`docs/ops/ENCARGO.md`; lo escribe `plan-de-arreglo`.

## Ejemplo resuelto

Caso (abstracto, a partir de #316): una sincronización entre dispositivos
recibe un error al cargar lo que hay en la nube, lo trata como «no hay nada»,
y sube encima copias viejas.

1. Lo apuntado: hay un fondo abierto de errores que se tragan; el caso cuelga
   de él. `tipo_causa: error-silencioso`, `alcance: modulo` (un módulo de la
   app).
2. `npm run tecnica -- error-silencioso` → árbol de fallos.
3. Árbol: «se pisan datos» = Y(«la carga falla», «el error sale con la misma
   forma que el vacío», «quien llama sube lo que cree que falta»). La rama
   «misma forma» es la que se puede cambiar. Ninguna rama de control: ningún
   test distingue error de vacío en los cargadores → causa de escape.
4. Parada: `mecanismo_cambiable`. Sin reproducir en el navegador: lo de que
   pase con cortes de red reales queda como `HIPÓTESIS:` con su observación.
5. Ficha: `mecanismo: el cargador devuelve vacío cuando falla la carga, y quien
   lo llama sube datos sin distinguirlo porque nada le dice que fue un error`;
   `causa_escape: ningún test pide que un cargador distinga error de vacío`;
   `clase: todo cargador que devuelve lo mismo en error que en vacío y todo
   llamador que escribe fiándose de eso`.

## Lo que falló y por qué

Sin entradas todavía: es la primera versión. Los fallos de esta skill se
apuntan aquí con fecha, causa y arreglo, y la lección va antes a un test o al
catálogo si se puede.

## Registro de cambios

- **2026-10-10** · Primera versión: triaje, técnica por tipo de causa desde el catálogo, criterios de parada, causa en tres piezas y causa de escape (#338).

## Fuentes y comprobación

- Las referencias de cada técnica, en el campo `fuente` de `ops/tecnicas.json`.
- La especificación del paso: `docs/ops/FLUJO.md` (Diagnosticar y
  «Proporcionalidad»).

Comprobado el 2026-10-10: `npm run tecnica` con una causa buena y una inventada, el catálogo con `ops/tecnicas.test.js`, la forma con `.claude/skills.test.js` y los casos con `npm run skills-prueba -- causa-raiz` (resultado en `ops/skills-prueba/causa-raiz.json`: disparo 6 de 6, comprobaciones 10 de 14 en las dos últimas pasadas; falla sobre todo en nombrar el tipo de causa exacto sin abrir el catálogo). Sin comprobar: un diagnóstico real de punta a punta con esta skill y el workflow `fondos` validando la ficha que deja.
