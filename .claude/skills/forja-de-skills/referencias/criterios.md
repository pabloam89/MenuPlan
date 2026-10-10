# Los doce criterios de una skill ganadora

Marca: **[F]** está en la fuente citada; **[I]** es inferencia nuestra. Fuentes
(las URL, en `SKILL.md`, «Fuentes y comprobación»): **BP** = guía de buenas
prácticas de skills de Anthropic; **CC** = documentación de skills de Claude
Code; **DESC** = «optimizing descriptions» de agentskills.io; **EVAL** =
«evaluating skills» de agentskills.io; **CE** = ingeniería de contexto de
Anthropic; **BEA** = «building effective agents»; **SB** = SkillsBench (arXiv
2602.12670; las cifras vienen de resúmenes, no del artículo).

«Lo vigila» dice quién lo comprueba: el código de `scripts/lib/skillsForja.mjs`
(o la regla del nivel 1 que ya existía), `skills-prueba`, o el `revisor`.

## 1. La descripción dice qué hace y cuándo, con las palabras de quien pide

- **Fuente:** [F] BP, «writing effective descriptions»; DESC.
- **Lo vigila:** la forma (`Úsala …`, `No para:`, 81 a 600 caracteres) la regla
  `frontmatter`; que dispare de verdad, `skills-prueba` (disparo); que use las
  palabras de quien pide, el `revisor`.
- **Error contrario:** «Ayuda con documentos»: no se abre jamás.
- **Decisión sobre «Úsala» (tensión entre fuentes).** El test pide que empiece
  por «Úsala »; BP aconseja la tercera persona («Procesa …; úsala cuando …») y
  DESC el imperativo («Use this skill when …»). Se **mantiene «Úsala»**:
  1. pone el *cuándo* primero, que es lo que piden CC y DESC (el listado se
     trunca y manda lo del principio) [F];
  2. la razón de BP para la tercera persona es no mezclar puntos de vista en el
     texto que se inyecta en el sistema [F]; el riesgo es la mezcla, y las once
     descripciones de hoy usan la misma forma, que el test garantiza [I];
  3. cambiarlo obliga a reescribir las once y a repetir el disparo de cada una
     sin ninguna cifra que diga que mejora [I];
  4. el disparo medido con la forma actual es bueno (por ejemplo 6 de 6 en
     `causa-raiz`).
  Se revisa si `skills-prueba` muestra un disparo que cae por la forma; entonces
  se cambia el test y las once a la vez, con la cifra antes y después.

## 2. Frontera explícita («No para:») y probada con casi-fallos

- **Fuente:** [F] DESC («near-misses»: negativas que se parecen).
- **Lo vigila:** `No para:` en `frontmatter`; **al menos tres casos de frontera**
  en `casos-negativos`; que sean casi-fallos y no obvios, el `revisor`; que el
  modelo barato no dude, `skills-prueba`.
- **Error contrario:** descripción amplia que dispara de más; casos negativos
  del tipo «¿qué tiempo hace?», que cualquier descripción separa.

## 3. Lo esencial primero: el listado se trunca

- **Fuente:** [F] CC (el listado se trunca en 1.536 caracteres); DESC (el
  estándar pone el techo en 1.024).
- **Lo vigila:** límite de la casa de 600 caracteres (`MAX_DESCRIPCION`), por
  debajo del estándar de 1.024 (un test lo comprueba); que el disparador vaya en
  los primeros 250 caracteres, el `revisor`.
- **Error contrario:** el disparador clave al final, cortado.

## 4. `SKILL.md` corto, con el detalle en ficheros a un solo nivel

- **Fuente:** [F] BP («under 500 lines», «one level deep»).
- **Lo vigila:** `tamano` (220 líneas, más estricto que las 500 de BP) y
  `estructura` (capas conocidas, ficheros citados con su ruta, ninguno huérfano
  ni anidado en otro).
- **Error contrario:** un monolito que compite con la conversación por la
  atención del modelo.

## 5. Solo lo que el modelo no sabe

- **Fuente:** [F] BP («concise is key»); CE (contexto de más degrada).
- **Lo vigila:** el `revisor` y el A/B (paso 2 del método). No hay test: un
  párrafo útil y uno de relleno se parecen igual.
- **Error contrario:** explicar lo que el modelo ya hace bien. Cada párrafo
  tiene que justificar su coste en cada sesión.

## 6. Libertad ajustada a la fragilidad

- **Fuente:** [F] BP («degrees of freedom»).
- **Lo vigila:** el `revisor`. En herramientas, `formato` pide el comando con su
  «Debe salir».
- **Error contrario:** pasos rígidos en lo abierto y vaguedad en lo frágil (un
  borrado, una clave). Pasos exactos y scripts donde un error cuesta caro;
  heurísticas donde no.

## 7. Un camino por defecto, no un menú

- **Fuente:** [F] BP («too many options»).
- **Lo vigila:** el `revisor` (contar «o … o …» no distingue un menú de una
  alternativa legítima, y por eso no es test).
- **Error contrario:** «usa A, o B, o C» sin decir cuál; la sesión elige al azar.
  Se escribe el camino por defecto y, aparte, la salida para el caso raro.

## 8. Cada paso con su comprobación y un criterio de parada

- **Fuente:** [F] BP («feedback loops»); BEA («stopping conditions»).
- **Lo vigila:** `sin-parada` (el «Método» de los tipos que no son herramienta
  dice «Sale bien si», «Sale:», «Debe salir», «Hecho cuando» o «Parar si»);
  `formato` (la tabla de una herramienta no tiene «Debe salir» vacío).
- **Error contrario:** una skill sin cierre: la sesión no sabe cuándo ha
  acabado ni cuándo parar y preguntar. «Comprueba que esté bien» no es un paso.

## 9. Un vocabulario y nada fechado en el cuerpo

- **Fuente:** [F] BP («consistent terminology», «time-sensitive information»).
- **Lo vigila:** `fechas` (una fecha en el cuerpo fuera de «Lo que falló»,
  «Registro de cambios» y «Fuentes y comprobación»; los trozos de código no
  cuentan); la unicidad del vocabulario, el `revisor`.
- **Error contrario:** «desde el 8 de octubre» que dentro de un trimestre ya
  miente; mezclar «caso», «incidente» y «fallo» para lo mismo.

## 10. Pocos ejemplos, canónicos y que no se contradigan

- **Fuente:** [F] CE («diverse, canonical examples»); BP.
- **Lo vigila:** `ejemplos` (como mucho tres por sección de ejemplos); que sean
  canónicos y no choquen con la norma de la propia skill, el `revisor`.
- **Error contrario:** una lista de casos límite; un ejemplo que viola la norma
  que la skill enseña.

## 11. Evaluación primero: casos antes que texto, medidos y repetidos

- **Fuente:** [F] BP («build evaluations first»); EVAL (con y sin la skill, más
  de una ejecución).
- **Lo vigila:** que existan los casos y su forma, `casos`; el mínimo de tres de
  frontera, `casos-negativos`; el efecto, `skills-prueba` (hoy sin A/B ni
  varianza: ver «Cómo se prueba» en `SKILL.md`).
- **Error contrario:** «a mí me funcionó una vez». Una asserción que pasa igual
  con y sin la skill no mide nada y se retira.

## 12. Enfocada y sin solape: el saber vive en un sitio

- **Fuente:** [F] SB (pocos módulos enfocados rinden más que documentación
  exhaustiva, según resúmenes); CE («si una persona no sabe qué herramienta
  usar, el agente tampoco»). Que se mida con vocabulario común es [I].
- **Lo vigila:** párrafos copiados entre skills, `copiado`; descripciones que
  comparten demasiadas palabras, `solape` (heurística, umbral `MAX_SOLAPE`);
  dudas reales entre dos skills, `skills-prueba`.
- **Error contrario:** dos skills que reclaman la misma petición; el mismo
  procedimiento copiado y arreglado solo en una.
