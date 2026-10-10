---
name: forja-de-skills
description: Úsala al crear, reestructurar, revisar o podar una skill de .claude/skills: «hazme una skill para…», «¿hace falta una skill nueva?», «esta skill no se abre cuando toca», «está muy larga», «el test de skills falla con forja», «¿la borro?». Dice cuándo NO crearla, cómo se forja paso a paso, qué comprueba el test y qué solo juzga una persona. No para: operar un servicio (su skill), escribir o cambiar un agente (PLANTILLA-AGENTE) ni medir una skill ya hecha sin tocarla (npm run skills-prueba).
metadata:
  nivel: 0
  dueno: gobierno
  comprobado: 2026-10-10
---

# Forja de skills

## Cuándo y para qué

Para que una skill nueva, o una cambiada, sea buena de verdad y no «según quién
la escriba ese día» (fondo #408). Entra una idea («quiero una skill para X») o
una skill que no rinde; sale una skill que pasa el nivel 1, o la decisión
escrita de no crearla o de podarla. La forma de cada tipo es de
`.claude/PLANTILLA-SKILL.md`; aquí está lo que la plantilla no dice: qué hace
ganadora a una skill y qué la hace mala, con su fuente.

No es para:
- operar el servicio que describe una skill: la skill de ese dominio;
- añadir una lección o un dato a una skill que ya existe (una entrada en «Lo
  que falló», un comando nuevo): la skill de ese dominio; la forma de la
  entrada la vigila el nivel 1. Esta skill entra si cambia la estructura, la
  descripción o si hay dudas de que deba existir;
- escribir un agente: `.claude/PLANTILLA-AGENTE.md`;
- medir una skill ya escrita sin tocarla: `npm run skills-prueba -- <skill>`
  (esta skill dice cuándo lanzarlo y cómo leerlo).
- revisar una skill ya escrita y sacar su lista de defectos con su arreglo:
  `higiene-de-skills` (`npm run higiene-skills -- <skill>`, gratis).

## Método

1. **¿Hace falta?** Una skill nueva solo se crea si cumple las tres de la
   regla de parada de `ops/flujo.json` (`regla_de_parada`, texto en
   `docs/ops/FLUJO.md`): se va a usar **dos veces o más**, **no repite** nada
   que ya esté en otra y **tiene dueño y test**. Antes, tres preguntas:
   - ¿Lo hace ya bien el modelo sin la skill? Si sí, no se escribe (se
     comprueba en el paso 2).
   - ¿Es un cambio a una skill que ya existe? Se cambia esa; dos skills que
     reclaman la misma petición son un defecto (`solape`).
   - ¿Es una regla que importa? Entonces es un test o una guardia, no un texto
     (CLAUDE.md, «Cuando algo falla»).
   Sale: «sí, porque …» o «no, porque …» escrito en el PR o el issue. Si es
   no, aquí se para.
2. **Ver el fallo sin la skill.** Pon la petición real a una sesión sin la skill
   y anota en qué falla (comando que inventa, paso que se salta). Sale: una
   lista de fallos reales; si está vacía, no hay skill (paso 1).
3. **Escribir los casos antes que el texto** (`casos.json`): tres o más que
   deben cargarla, con `debe_salir` comprobable, y **tres o más de frontera**
   (peticiones parecidas que son de otra skill o de ninguna; los casi-fallos,
   no los obvios). En las palabras de quien pide. Sale: `casos.json` que pasa
   `faltasDeCasos` y que, sin la skill, falla en algún `debe_salir`.
4. **La descripción** (lo único que se lee en cada sesión): `Úsala <cuándo, con las
   palabras de quien pide>. No para: <lo que es de otra>.` El disparador
   principal va en los primeros 250 caracteres. Por qué «Úsala» y no otra forma:
   `.claude/skills/forja-de-skills/referencias/criterios.md`, criterio 1.
   Sale: una descripción que `npm run skills-prueba` acierta en todos los casos.
   Un ejemplo, mala y buena:
   - Mala: «Úsala con claves y secretos. No para: otras cosas.» No dice cuándo,
     no usa las palabras de quien pide y su frontera no nombra nada.
   - Buena: «Úsala al dar de alta o rotar una clave o token («nuevo token», «ha
     caducado»), de punta a punta. No para: leer una clave desde un script
     (1password).» Dice el cuándo con palabras de quien pide y la frontera
     nombra la skill vecina.
5. **Escribir lo mínimo que arregla los fallos del paso 2.** Solo lo que el
   modelo no sabe; un camino por defecto y una salida para el caso raro; cada
   paso con lo que sale; el detalle largo a una capa que `SKILL.md` cita con su
   ruta. Nada de fechas fuera de «Lo que falló», «Registro de cambios» y
   «Fuentes». Cada forma en su sitio (tabla, lista, negrita, código): ver
   `.claude/skills/forja-de-skills/referencias/presentacion.md`. El estándar de
   cada tipo (qué lo hace bueno, errores típicos y un ejemplo) está en
   `.claude/PLANTILLA-SKILL.md`. Sale: un `SKILL.md` por debajo del límite y
   sin párrafos que el modelo ya sabe.
6. **Pasar el nivel 1** (`npm test -- .claude/skills.test.js`). Si falla la
   regla `forja`, se arregla la skill: la lista `EXCEPCIONES_FORJA` de
   `scripts/lib/skillsForja.mjs` **solo baja** y no se le añade nada.
7. **Medir** (`npm run skills-prueba -- <skill>`, cuesta tokens): disparo en
   todos los casos y comprobaciones cumplidas. Dos pasadas seguidas, porque
   entre una y otra hay ruido. Sale: la cifra antes y después en el PR.
8. **Revisión**: el juez `revisor` mira lo que ningún test ve (tabla de abajo).
   Quien escribe la skill no la juzga.

Para por criterio: se acaba cuando el nivel 1 pasa, el disparo es completo, los
`debe_salir` de los casos propios se cumplen y el `revisor` no deja nada
abierto. Si tras dos pasadas de medida una skill no mejora sobre el modelo
solo, se para y se va a «Cuándo se poda», no se sigue alargando el texto.

## Cómo se prueba

Cada criterio de `.claude/skills/forja-de-skills/referencias/criterios.md` tiene
quien lo vigila. El reparto:

| Quién | Qué mira | Cuesta |
|---|---|---|
| `.claude/skills.test.js` (nivel 1, en el CI) | forma, tipo, dueño, secciones, límite de líneas y de descripción, rutas, capas, copiado, casos (mínimos propios y **tres de frontera**), fechas en el cuerpo, criterio de parada en «Método», límite de ejemplos, solape entre descripciones y presentación mecánica (comandos en código, tablas bien formadas, cabeceras sin saltos) | nada |
| `npm run skills-prueba` (nivel 2) | si la descripción dispara (también en los casi-fallos) y si el `SKILL.md` hace decir lo que pide `debe_salir` | tokens |
| El `revisor` | si cada párrafo justifica su coste, si la libertad es la adecuada (pasos exactos donde hay riesgo), si hay un camino por defecto y no un menú, si los ejemplos son canónicos y no se contradicen, si el vocabulario es uno solo, si los casos de frontera son casi-fallos de verdad | una revisión |

Lo que **no** se comprueba hoy, dicho claro: el A/B con y sin la skill (si
mejora sobre el modelo solo) y la varianza entre ejecuciones. `skills-prueba`
mide la skill con ella, no contra el modelo solo, y no repite: hasta que lo
haga, el paso 2 y dos pasadas seguidas son la comprobación manual.

Los controles automáticos viven en `scripts/lib/skillsForja.mjs`, con un código
cada uno (`casos-negativos`, `fechas`, `sin-parada`, `ejemplos`, `solape` y los
de presentación `comando-suelto`, `tabla` y `cabeceras`) y su
porqué en `.claude/skills/forja-de-skills/referencias/defectos.md`. Cada uno se
ve fallar en `.claude/skills.test.js`. El test de la plantilla comprueba que
`.claude/PLANTILLA-SKILL.md` no contradice estos números.

## Cuándo se poda

Una skill se quita (o se funde en otra) si se cumple alguna:
- **No mejora sobre el modelo solo**: en el A/B manual del paso 2, la sesión sin
  ella acierta lo mismo. Pesa en cada sesión y no aporta.
- **Solapa con otra**: el test de `solape` salta, o `skills-prueba` muestra
  dudas entre las dos en un mismo caso. Manda una; la otra la cita por nombre y
  se queda con lo suyo.
- **Caduca sin dueño**: pasa el plazo de `metadata.comprobado` y nadie la
  vuelve a comprobar, o su dueño ya no la carga.
- **Nadie la abre**: cero usos en 90 días (la cuenta de uso de skills, si
  existe; si no, se pregunta antes de borrar).

Podar es borrar una carpeta, y los borrados los lanza una persona: la sesión
prepara el PR con el inventario (qué decía, quién la citaba, a dónde pasa lo
útil) y los comandos. Se actualizan `.claude/dominios-skills.json`, la lista de
`CLAUDE.md` y el `skills:` de su dueño; los tests de esos tres fallan si no.

## Lo que falló y por qué

- **2026-10-10 · las skills sin un estándar escrito de calidad (#408).**
  Causa: el test de skills miraba la forma del fichero y no su calidad, y no
  había una definición de «buena» con la que comparar. Arreglo: esta skill y la
  regla `forja` del nivel 1. Antes: 10 de 11 skills con menos de tres casos de
  frontera y 9 de 11 con fechas en el cuerpo; ambas en `EXCEPCIONES_FORJA`
  hasta que #410 y #411 las arreglaron (hoy vacía).
- **2026-10-10 · skills que no hacen decir lo que piden sus casos.** Causa:
  se escriben sin ver antes qué falla la sesión sin ellas, y aguantan 10 de 14
  comprobaciones (`causa-raiz`). Arreglo: el paso 2 del método y el A/B manual;
  la medida automática con y sin skill está pendiente.

## Registro de cambios

- **2026-10-10** · Las 7 excepciones de fechas que quedaban se arreglan y la lista queda vacía; la revisión de una skill concreta pasa a `higiene-de-skills` (#411).
- **2026-10-10** · Presentación (`.claude/skills/forja-de-skills/referencias/presentacion.md`) con tres controles mecánicos, el estándar de cada tipo en la plantilla con su test, y 12 de las 19 excepciones quitadas (#410).
- **2026-10-10** · Primera versión: doce criterios con fuente, defectos con su señal, método con regla de parada, y la regla `forja` del nivel 1 con su lista de excepciones que solo baja (#409).

## Fuentes y comprobación

- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
- https://code.claude.com/docs/en/skills
- https://agentskills.io/skill-creation/optimizing-descriptions
- https://agentskills.io/skill-creation/evaluating-skills
- https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- https://www.anthropic.com/engineering/building-effective-agents
- https://arxiv.org/html/2602.12670v1

Cada afirmación de los criterios y los defectos va marcada: [F] está en la fuente citada, [I] es inferencia nuestra y no se toma por hecho.

Comprobado el 2026-10-10: el nivel 1 con `.claude/skills.test.js` (cada control de la forja visto fallar con una skill de mentira) y las cifras de las excepciones sobre las 11 skills del repo. Comprobado el 2026-10-10 (#410): los tres controles de presentación y el estándar de cada tipo de la plantilla, cada uno visto fallar en `.claude/skills.test.js`. Sin comprobar: las fuentes se recogieron de la investigación del encargo y no se han releído al escribir; las cifras de SkillsBench vienen de resúmenes, no del artículo; el solape entre descripciones y el valor de `MAX_SOLAPE` son inferencia (no hay fuente oficial); el A/B con y sin skill no existe aún; `npm run skills-prueba -- forja-de-skills` no se ha lanzado (cuesta tokens).
