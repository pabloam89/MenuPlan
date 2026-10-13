# Ficha de análisis de una entidad (la forma que pide Pablo)

Orden obligatorio: primero leer cómo se define en el repo, después opinar.

1. **Qué es de verdad.** Una frase, con la fuente (fichero:línea) de su definición actual. Si el repo dice cosas distintas, listarlas.
2. **Quién la lee.** Qué script, test, hook, agente o persona la usa. Sin lector, decirlo.
3. **Nivel de abstracción.** meta / plantilla / pieza: ¿qué son sus piezas y de qué plantilla salen?
4. **Relaciones, cada una con su clase.** es-un (subtipo), parte-de (contención: factoría > proyecto > entorno), padre-hijo (1:N dentro de la misma naturaleza, como fondo→casos) o referencia. Con cardinalidad (1:1, 1:N, N:M) y dónde se guarda el enlace (campo, etiqueta, nada).
5. **Ciclo de vida.** Estados y quién los cambia.
6. **Fuente de verdad y copias.** Dónde vive y dónde está repetida.
7. **Quién la crea y quién la mantiene:** agent / human / automatic, y si hay intervención humana implícita (evitable o irreducible).
8. **Veredicto.** Se queda / se fusiona con X / se parte en X e Y / se retira / pasa a ser campo o tipo de evento, con el dato que lo decide.
9. **Lo que no sé.** Una línea, y cómo se averiguaría.

Reglas: dato antes que opinión; si el reto de Pablo está mal, decirlo con el dato; no inventar; «Comprobado» o «Creo» en cada afirmación no obvia.
