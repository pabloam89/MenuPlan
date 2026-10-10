# Repaso del glosario

Parte del repaso periódico de la higiene (#481, fondo #479): el glosario
(`ops/glosario.json`) no crece si nadie lo pide, y sus excepciones solo bajan si
alguien las baja. Esto es lo que hace un agente en cada repaso. Gratis: no llama
a ningún modelo.

## 1. Bajar excepciones

`npm run glosario -- --medir` da la cifra (`glosario medida: n
excepciones_admitidas: m nuevas: a bajadas: b`) y una línea `BAJA` por cada par
«ruta: sinónimo» que ya cumple. Baja esa cifra en
`ops/glosario-excepciones.json` (o borra la línea) y no subas ninguna. Si te
sobra tiempo, arregla uno o dos pares más escribiendo el término canónico: la
cifra `excepciones` de la cabecera es la que se pone antes y después en el PR.

## 2. Juzgar los candidatos

`npm run glosario -- --candidatos` saca una cabecera
(`glosario candidatos palabras: n pares: m a_juzgar: k juzgados: j …`) y una
línea por candidato:

```
candidato: <x> apariciones: <n> ficheros: <k>
```

Son palabras y pares de palabras que se repiten en muchas zonas del glosario y
no están como término ni como sinónimo. El umbral y su porqué, en la cabecera de
`scripts/lib/glosarioCandidatos.mjs`. Para cada uno, un juicio del vocabulario
`JUICIOS`:

| Juicio | Cuándo | Qué se hace además |
|---|---|---|
| `termino_nuevo` | es una palabra de proceso con un significado propio que dos sesiones podrían entender distinto | añade el término a `ops/glosario.json`: estado, clase, definición con la forma «un/una X que Y» y sus relaciones |
| `sinonimo` | dice lo mismo que un término que ya existe | pon `sinonimo_de`; si no se usa en el repo con otro sentido, añádelo a sus `sinonimos_prohibidos` y escribe el término donde salga |
| `nada` | es de uso general, un nombre propio o jerga de un servicio | nada más |

Cada juicio va a `ops/glosario-candidatos.json` con un motivo cerrado de su
juicio (`MOTIVOS_JUICIO`: para `nada`, `uso_general`, `nombre_propio`,
`jerga_de_servicio` o `gramatical`; para `sinonimo`, `mismo_significado`,
`nombre_largo` o `variante_de_forma`; para `termino_nuevo`,
`significado_propio` o `dos_sentidos`) y un `detalle`, que es el hueco: una
frase que diga por qué, no «no aplica». Ejemplo:

```json
{ "candidato": "problema de fondo", "juicio": "sinonimo", "sinonimo_de": "fondo", "motivo": "nombre_largo", "detalle": "Es el nombre largo de fondo, ya dicho en su nota", "fecha": "2026-10-10" }
```

Lo juzgado deja de salir; la siguiente pasada trae los siguientes.

## 3. De juicio repetido a regla

La cabecera cuenta `reglas_propuestas`: el mismo juicio con el mismo motivo
cerrado en tres candidatos o más. No sigas juzgando uno a uno: propón la regla en el PR (por
ejemplo, si salen tres `nada: uso_general`, esos verbos van a
`PALABRAS_VACIAS` y dejan de salir). Y `termino_nuevo_sin_termino` cuenta los
juicios `termino_nuevo` que aún no están en el glosario: se añaden en el mismo PR.

## Cuándo se acaba

Con `excepciones_por_bajar: 0`, cada candidato de la lista juzgado y
`ops/glosario.test.js` en verde. En el PR: la cifra de excepciones, cuántos
candidatos se juzgaron de cada tipo y las reglas propuestas.
