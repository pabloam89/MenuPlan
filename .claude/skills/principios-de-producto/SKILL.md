---
name: principios-de-producto
description: Úsala al decidir, recomendar o diseñar algo del producto (Lola, la app, una pantalla, un endpoint, un dato de familias, un coste de IA), con «¿qué hacemos con X?» o «recomiéndame una opción». Busca el principio con fuente que manda y lo cita por su id. No para: cómo trabajamos (ops/estandares-agentes.json), cómo se le escribe a Pablo (estilo-de-respuesta), la UI fina (DESIGN_SYSTEM.md) ni elegir tecnología o infraestructura sin efecto en la familia.
metadata:
  tipo: conocimiento
  opera_proveedor: false
  juzga_artefacto: false
  encadena: false
  pasos_fijos: false
  sintoma_a_causa: false
  elige_opciones: false
  dueno: lola
  comprobado: 2026-10-11
---

# Principios de producto

## Cuándo y para qué

Las decisiones de producto se tomaban sin una base escrita: dos endpoints públicos
(#596, #597) esperaban sin un principio que dijera si uno puede serlo. Esta skill
hace que una recomendación cite el principio con fuente que manda, y que lo que se
aprende se acumule en el catálogo en vez de perderse en el chat. Entra una decisión
o un diseño del producto; sale una recomendación con el id del principio en la
opción recomendada.

No es para:
- cómo trabajamos (git, CI, permisos, secretos): `ops/estandares-agentes.json`;
- cómo se le escribe a Pablo: `estilo-de-respuesta` (esta skill pone el contenido
  de la recomendación; aquella, la forma);
- el aspecto fino de una pantalla (color, espaciado, iconos): `DESIGN_SYSTEM.md`.

## Método

1. **Busca los principios del área.** `npm run principios -- <área>` (las áreas:
   `trust-safety`, `privacy`, `conversational-ai`, `onboarding`, `cost-reliability`,
   `ux-clarity`, `accessibility`, `scope`); `npm run principios -- <id>` enseña uno
   entero. Si dudas del área, mira dos. Sale: la lista de ids con su frase.
2. **Elige el que manda y cítalo.** En la línea de la opción recomendada, el id entre
   paréntesis: «A (recomendada, `public-endpoint-justified`): …». Cita solo los que
   cambian la recomendación. Sale: cada id citado existe en el catálogo.
3. **Si dos chocan, dilo.** Nombra los dos ids, di qué cede cada opción y cuál
   recomiendas y por qué. Un choque que afecta a lo irreversible o a lo que sale
   fuera se le presenta a Pablo con las tres opciones; no se resuelve en silencio.
4. **Si no hay principio, o aprendes uno.** Añade un fichero nuevo en
   `ops/principios-producto/principios/<id>.json` copiando uno parecido: id en inglés,
   campos de regla, `porque`, ejemplos aplicados a HoMenu o Lola y al menos una fuente
   que hayas leído (marca F) o tu inferencia (marca I). Luego
   `npm run principios -- --escribir` y
   `npx vitest run ops/principios-producto.test.js ops/redaccion.test.js`.
   Sale: un fichero nuevo y el documento regenerado.

Sale bien si: la recomendación nombra al menos un id real, el choque entre principios
no queda sin decir y el catálogo ganó un fichero cuando se aprendió algo.

## Lo que hay que saber

- El catálogo no es la ley: un principio dice qué hacen bien otros productos, no qué
  manda aquí. Lo que obliga es un test o la guardia; por eso cada principio
  trae su control. [I]
- Solo algunos principios tienen un control de verdad (un test que existe y vigila lo
  que dice). El resto es `juicio`: lo aplica quien decide y lo revisa el `revisor`.
  `npm run principios` cuenta cuántos hay de cada. [I]
- Un control que solo cubre una parte lo dice en su `nota`; no lo des por cubierto
  entero. [I]
- La marca F quiere decir que la fuente lo dice; la I, que es inferencia nuestra o una
  fuente secundaria. Una recomendación que se apoya en una I lo avisa. [I]
- Una cita literal de una fuente no pasa de 15 palabras; el resto se parafrasea. [I]
- Los ids y los valores van en inglés, los textos en castellano (decisión de Pablo,
  `ops/DECISIONES.md`).
- Las preguntas que más se repiten, y dónde buscar: ¿puede ser público este endpoint?
  (`trust-safety`); ¿qué datos pedimos y cuánto los guardamos? (`privacy`); ¿qué hace
  Lola cuando no entiende o se cae el modelo? (`conversational-ai`,
  `cost-reliability`); ¿cuánto cuesta y quién lo paga? (`cost-reliability`). [I]

## Dónde vive el dato

La fuente es `ops/principios-producto/` (un fichero por principio, leído con
`scripts/lib/principiosProducto.mjs`). `docs/producto/PRINCIPIOS.md` se genera de ahí
con `npm run principios -- --escribir`, ordenado por área; no se edita a mano. Las
áreas y los sujetos están en `ops/principios-producto/_catalogo.json`. Esta skill no
copia ningún principio.

## Lo que falló y por qué

- **2026-10-11 · dos endpoints públicos sin una razón escrita (#596, #597).** Causa:
  no había una base de principios de producto con la que contrastar «lo llama un
  disparador» o «lo llama alguien». Arreglo: este catálogo y esta skill, que obliga a
  citar el principio. Sin medir todavía que las recomendaciones lo citen.

## Registro de cambios

- **2026-10-11** · Primera versión: catálogo de 40 principios con fuente, documento generado y esta skill (#606).

## Fuentes y comprobación

- https://genai.owasp.org/llm-top-10/ y https://api-security.owasp.org/editions/2023/en/0x11-t10 (OWASP), https://www.cisa.gov/securebydesign, https://gdpr-info.eu/art-25-gdpr/, https://pair.withgoogle.com/chapter/mental-models/, https://www.nngroup.com/articles/chatbots/ y las demás de cada principio, que están en su fichero.
- La plantilla de regla: `scripts/lib/regla.mjs` y `docs/ops/REDACCION.md`.

Sin comprobar: las fuentes se leyeron en la investigación del encargo (Apple, Duolingo e Intercom no se pudieron leer enteras y van como inferencia); que las recomendaciones citen el principio no se ha medido; `npm run skills-prueba -- principios-de-producto` no se ha lanzado (cuesta tokens).

Comprobado el 2026-10-11: el catálogo con `ops/principios-producto.test.js` (cada comprobación vista fallar con datos malos en una copia), la forma con `.claude/skills.test.js` y el comando `npm run principios`.
