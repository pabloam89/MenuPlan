# Defectos que hacen mala a una skill

Cada defecto, con su **señal detectable**. «Código» es el control automático de
`scripts/lib/skillsForja.mjs` (o la regla que ya había); sin código, lo
detecta `skills-prueba` o el `revisor`. **[F]** está en la fuente; **[I]** es
inferencia, también la aplicada por analogía desde CE y BEA (las fuentes están en `SKILL.md`).

| # | Defecto | Señal | Código / quién | Fuente |
|---|---|---|---|---|
| 1 | No dispara | La tasa de disparo en sus propios casos es baja; la descripción no lleva las palabras de quien pide | `skills-prueba` | [F] DESC |
| 2 | Dispara de más | Falsos positivos en los casos de frontera | `casos-negativos` (que haya tres) y `skills-prueba` (que no fallen) | [F] DESC |
| 3 | Solapa con otra | Dos descripciones con vocabulario común por encima de `MAX_SOLAPE`; el modelo barato duda entre las dos | `solape`; `skills-prueba` | [I], apoyada en CE sobre herramientas ambiguas |
| 4 | Demasiado larga o con relleno | Líneas por encima del límite; párrafos que el modelo ya sabe; un A/B que no mejora ni un punto | `tamano`; el `revisor`; A/B manual | [F] BP; [I] por analogía, CE |
| 5 | Instrucción vaga | Pasos sin salida observable; «Método» sin nada que diga cuándo está hecho | `sin-parada`; `formato` | [F] BP; la señal es [I] |
| 6 | Ejemplos de más o que se contradicen | Más de tres ejemplos en una sección; un ejemplo que viola la norma de la misma skill | `ejemplos`; el `revisor` (la contradicción) | [I] por analogía, CE; la señal es [I] |
| 7 | Sin criterio de parada ni de escalada | No hay «cuándo parar» ni «cuándo preguntar» | `sin-parada`; «Qué requiere el OK» en herramientas | [I] por analogía, BEA; la señal es [I] |
| 8 | Información caducada | Fecha de comprobación pasada; rutas o comandos que ya no existen; fechas en el cuerpo | `fechas`; `rutas`; `caducada` | [F] BP |
| 9 | Menú sin valor por defecto | «o … o …» sin recomendación | el `revisor` (aviso, no test) | [F] BP |
| 10 | Autogenerada sin contrastar | «Lo que falló» sin ningún fallo real; no se vio fallar sin la skill | `formato` (una herramienta pide entradas); el paso 2 del método | [F] SB; la señal es [I] |
| 11 | Referencias huérfanas o anidadas | Un fichero que `SKILL.md` no cita, o que cita a otro | `estructura`; `rutas` | [F] BP |
| 12 | Pocos casos de frontera | Menos de tres peticiones parecidas que no son suyas | `casos-negativos` | [F] DESC pide muchos negativos; el tres es [I] |

## Presentación (#410)

Tres controles más, sobre la forma del texto (criterio nuestro [I], sin fuente
oficial que los mida; el porqué y lo que solo juzga una persona, en
`.claude/skills/forja-de-skills/referencias/presentacion.md`):

| Código | Señal | Por qué |
|---|---|---|
| `comando-suelto` | Un comando de la casa (`npm run …`, `gh …`, `git …`) en prosa, fuera de comillas invertidas o de bloque | Se copia mal y no se distingue del texto [I] |
| `tabla` | Una fila con más o menos columnas que la cabecera, o una celda vacía | Se rompe al pintarla; un `\|` sin escapar dentro de código parte la celda [I] |
| `cabeceras` | Un salto de nivel (de `##` a `####`) | La estructura deja de leerse como índice [I] |

## Cómo se lee la lista de excepciones

`EXCEPCIONES_FORJA` (en `scripts/lib/skillsForja.mjs`) apunta, por skill, los
códigos que hoy incumple. Solo baja: un código nuevo en una skill falla el test, y
uno ya arreglado también hasta que se quita. El encargo de arreglar las que
quedan es de #411, que la deja vacía.

## Lo que ningún test ve (juzga el `revisor` o `skills-prueba`)

- Si cada párrafo justifica su coste (defecto 4, criterio 5).
- Si la libertad es la adecuada a la fragilidad (criterio 6).
- Si hay un menú sin valor por defecto (defecto 9).
- Si los ejemplos son canónicos y coherentes (defecto 6).
- Si los casos de frontera son casi-fallos de verdad (criterio 2).
- Si mejora con respecto al modelo solo, y con cuánta varianza (criterio 11).
- Si la descripción dispara (defecto 1).
