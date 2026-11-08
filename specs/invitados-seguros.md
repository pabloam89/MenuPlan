# Invitados con restricciones, aplicadas por el motor

Propuesta de Álvaro (2 oct 2026), **pendiente de decidir con Pablo**: toca el
modelo de reglas y el motor.

## El caso

Staging, 2 oct: «cenamos con amigos, una está embarazada y otro es celíaco».
`anadir_invitado` no guarda restricciones y `proponer_platos` solo filtraba por
la casa: «sin gluten» y «apto para embarazo» los ponía Lola de memoria. Propuso
«Ensalada de garbanzos, chorizo crujiente y pimientos», que el motor quita para
el embarazo.

## Lo que ya está (PR «invitados seguros»)

`proponer_platos` y `cambiar_plato` aceptan `de_fuera` (alergias UE,
intolerancias, embarazo/lactancia). Para esa llamada se añade un comensal
adulto «de fuera» al grupo que come, y el motor filtra con sus reglas de siempre
(`src/lib/intolerances.js`, `src/lib/allergens.js`). No se guarda nada.
Probado con el catálogo real: mismas candidatas que si esa persona fuera de la
casa (cena de un viernes: 189 → 107 con embarazo y celiaquía).

**Límite:** depende de que Lola pase `de_fuera` en cada llamada de esa comida.
La descripción se lo exige y hay dos casos en `bot-evals.json`, pero lo recuerda
el modelo, no la casa.

## Lo que falta: que lo recuerde la casa

Dos restricciones del diseño actual que hay que respetar:

1. `src/lib/reglas.js`: «Las alergias no pasan por aquí. […] Una regla no puede
   crear, aflojar ni sustituir una alergia». Y los invitados SON reglas.
2. `aiPlanner.buildGroupContext` agrega alergias y estados **por grupo y para
   toda la semana**, sin mirar el horario. Materializar al invitado celíaco como
   miembro con alergia dejaría a la familia sin gluten toda la semana.

### Propuesta

- **Dónde se guarda:** en el sujeto del invitado, no como efecto:
  `sujeto: { tipo: "invitado", n, nombre, seguridad: { alergias, intolerancias, estados } }`.
  No es un efecto nuevo, así que respeta el punto 1: una regla sigue sin poder
  crear alergias para la casa; solo describe a alguien de fuera. Solo AÑADE
  restricciones, nunca afloja.
- **Dónde se aplica:** por hueco, no por grupo. Al planificar o reemplazar un
  hueco (`pickCatalogReplacement` y la generación), se unen las restricciones de
  los invitados con `presente` en ese día y comida. Es el único cambio en el
  motor: un contexto de grupo que admite «extras del hueco».
- **Herramientas:** `anadir_invitado` acepta `seguridad`; `de_fuera` deja de ser
  necesario en propuestas y cambios de esa comida (se lee de la regla).
- **App:** la tarjeta del hueco enseña «invitada embarazada · celíaco».

### Preguntas para decidir

1. ¿`seguridad` en el sujeto del invitado, o un efecto nuevo con su aviso?
2. ¿Generar la semana con un invitado celíaco el sábado cambia solo el sábado
   (por hueco) o se acepta lo estricto por grupo con un aviso `de_mas`?
3. Las reglas de embarazo de `intolerances.js` (tortilla poco cuajada, quesos de
   leche cruda, curados): ¿están revisadas contra la AESAN? Hoy son las mismas
   para la casa y para los invitados.
