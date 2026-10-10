---
name: higiene-de-skills
description: Úsala para revisar UNA skill ya escrita y sacar su lista de defectos con el arreglo de cada uno: «revisa la skill de vercel», «¿está al día esta skill?», «¿cuánto le queda para caducar?», «¿cita algo que ya no existe?», «¿solapa con otra?», «higiene de skills», y en el repaso periódico de todas. No para: crear una skill nueva ni decidir si hace falta (forja-de-skills), medir con tokens si dispara (npm run skills-prueba) ni operar el servicio que describe (su skill).
metadata:
  tipo: revision
  dueno: gobierno
  comprobado: 2026-10-10
---

# Higiene de skills

## Cuándo y para qué

Para ponerle una skill concreta a punto contra la forja y la plantilla, y
devolver una lista de defectos con su arreglo (fondo #408). Entra el nombre de
una skill (o «todas») y sale la lista, o la cifra del conjunto. Los controles de
forma y de forja los hace `scripts/lib/skills.mjs` y `scripts/lib/skillsForja.mjs`;
esta skill los junta con lo que el test de forma no ve (el reloj y lo que hay
fuera de la skill) y dice qué hacer con cada resultado.

No es para:
- crear una skill o decidir si hace falta: `forja-de-skills`;
- medir con modelos si la descripción dispara y si el `SKILL.md` hace decir lo
  que piden los casos: `npm run skills-prueba -- <skill> --ensayo` (sin
  `--ensayo` cuesta tokens);
- añadir una lección o un dato a la skill de un servicio: la skill de ese dominio.

## Método

1. **Lanza el script** sobre la skill: `npm run higiene-skills -- <skill>`. Sale
   una línea `higiene skill: <s> faltas: a avisos: b solape: x con: <otra>` y,
   debajo, cada defecto con su `arreglo`. Para el conjunto, `--todas`.
2. **Separa faltas de avisos.** Una `falta` es lo que el nivel 1 negaría sin su
   lista de excepciones (o una fecha caducada): se arregla. Un `aviso` es una
   heurística nuestra, sin fuente: se mira y se decide, y si es un falso positivo
   se dice por qué en el PR. Falso positivo conocido: `caso-en-frontera` en `alta-de-secreto/ficha-equivocada`, por la raíz «scrip» (compartida con la frontera de `1password`); la petición es suya.
3. **Arregla de arriba abajo con el `arreglo` que trae**, sin añadir nada que no
   pida un defecto. Si el arreglo mueve texto (fechas, un bloque largo), nada de
   información se pierde: va a «Lo que falló y por qué», a «Fuentes y
   comprobación» o a una capa citada con su ruta entera.
4. **Mira lo que el script no ve** y deja en el PR lo que encuentres: si cada
   párrafo justifica su coste, si hay un camino por defecto y no un menú, si los
   ejemplos se contradicen, si los casos de frontera son casi-fallos de verdad
   (los criterios, en `.claude/skills/forja-de-skills/referencias/criterios.md`).
5. **Dos skills que reclaman lo mismo**: decide un dueño en el PR (el que opera
   la cosa de punta a punta), deja la descripción, el caso y la fila de
   operaciones de la otra remitiendo a él por su nombre, y no cambies una
   descripción sin pasar el solape.
6. **Vuelve a lanzar** el script y `npx vitest run .claude/skills.test.js`.
   Pon la cifra antes y después en el PR.

Sale bien si: `faltas: 0` en el script, el nivel 1 en verde, cada aviso
arreglado o explicado, y la cifra del conjunto (`Higiene: n skills, … faltas y …
avisos`) no sube. Si un aviso se repite en tres skills, es una regla mal
puesta: se ajusta aquí, no se copia el parche.

## Cómo se prueba

El test es `scripts/higiene-skills.test.js`: una skill mala hecha a propósito
(descripción vaga, fechas, comando, ruta y skill muertos, ejemplos de más, tabla
rota, secreto, párrafo copiado, casos repetidos, caducidad cercana) en la que
tienen que salir todos sus defectos, cada uno con su arreglo; una buena que sale
limpia; y el script sobre el repo. Los códigos que añade esta skill a los de la
forja:

| Código | Señal | Gravedad |
|---|---|---|
| `caduca-pronto` | `metadata.comprobado` a menos de 30 días de caducar (el CI avisa a los 14) | aviso |
| `comando-muerto` | cita un `npm run` que no está en `package.json` | falta |
| `ruta-muerta` | cita una ruta del repo que no existe, también fuera de comillas invertidas | falta |
| `skill-muerta` | nombra entre comillas invertidas una skill que ya no existe (tras la palabra «skill») | falta |
| `descripcion-sin-palabras` | el disparador no trae ninguna frase entre «» | aviso |
| `frontera-vaga` | el «No para:» no nombra skill, agente, comando ni fichero | aviso |
| `solape-cercano` | solape de descripciones a partir del 80 % del límite, con la cifra | aviso |
| `tamano-cerca` | más del 85 % de las líneas permitidas | aviso |
| `caso-duplicado` | dos peticiones casi iguales, de la misma skill o de otra | aviso |
| `caso-en-frontera` | una petición propia usa palabras de lo que el «No para:» deja a otra | aviso |

Los comandos y rutas de «Lo que falló», del registro y de las fuentes son
historia: no se miran. Lo que el script no juzga (coste de cada párrafo,
libertad adecuada, ejemplos canónicos, si dispara) queda para el `revisor` y
`skills-prueba`.

## Cuándo se poda

Se quita o se funde en `forja-de-skills` si:
- el CI pasa a ejecutar el script en cada PR que toca una skill y nadie lo
  lanza ya a mano: esta skill sobra y se queda el script;
- sus avisos son ruido: más de la mitad de los avisos de tres revisiones seguidas
  se dieron por falsos positivos, y se ajusta el código antes que la skill;
- nadie la abre en 90 días.

## Lo que falló y por qué

- **2026-10-10 · mover las fechas del cuerpo dejó dos skills por encima del tope
  de 220 líneas (#411).** Causa: lo que se mueve ocupa líneas, y `1password` e
  `issues` ya estaban en el límite. Arreglo: sacar a una capa un bloque largo con
  su ruta citada (`.claude/skills/1password/referencias/boveda-sesiones.md` y `.claude/skills/issues/referencias/workflow-fondos.md`)
  y dejar un puntero; el aviso `tamano-cerca` lo habría dicho antes.
- **2026-10-10 · la capa nueva chocó con un cambio de otra sesión en el mismo
  bloque (#411).** Causa: se movió un bloque que otro PR editaba a la vez. Arreglo:
  fusionar `origin/staging` antes de mover texto entre ficheros y aplicar a mano
  en la capa el cambio ajeno.

## Registro de cambios

- **2026-10-10** · Primera versión: lista de defectos de una skill con su arreglo, script `npm run higiene-skills`, diez controles propios sobre los de la forja y su test con una skill mala (#411).

## Fuentes y comprobación

- `.claude/skills/forja-de-skills/referencias/defectos.md`: los defectos de la forja, con su señal.
- `.claude/PLANTILLA-SKILL.md`: el estándar por tipo.

Comprobado el 2026-10-10: el script sobre las 12 skills del repo y su test con una skill mala hecha a propósito (cada código visto fallar). Sin comprobar: el A/B con y sin esta skill, y `npm run skills-prueba -- higiene-de-skills` (cuesta tokens).
