# Lo generado al fusionar staging (#551)

Los documentos que salen enteros de un catálogo (FORJA.md, REDACCION.md, NORMAS.md,
ESTANDARES.md, ENCARGO.md y los moldes de `.claude/plantillas-skill/`) y las anclas JSON de
la forja y de la redacción llevan en `.gitattributes` un driver de fusión. La lista manda en
`GENERADOS` de `scripts/lib/generados.mjs`; `ops/generados.test.js` la cruza con
`.gitattributes` y con toda cabecera «Generado desde … No se edita a mano».

| Driver | Qué hace al fusionar | Qué te toca |
|---|---|---|
| `generado` (documentos) | deja la versión de HEAD y no para la fusión | tras traer staging, `node scripts/generados.mjs --escribir` antes de empujar, y commitea lo que cambie |
| `json-claves` (anclas) | fusiona clave a clave contra la base común | nada; si los dos lados cambian la misma clave, choca con las marcas de git y se resuelve a mano |

**HEAD no es por fuerza tu rama.** En un `git merge`, sí. En un rebase o un cherry-pick, HEAD es la
rama sobre la que se aplica, así que el documento queda con la versión de la otra. En los dos
casos el arreglo es el mismo: regenerar.

## Instalar y comprobar

- `npm run tarea` los instala en la configuración de git de la carpeta principal, que comparten
  todas las carpetas de trabajo. A mano: `node scripts/generados.mjs --instalar`; para quitarlos,
  `--desinstalar` (solo quita los nuestros).
- El comando lleva rutas absolutas: el `node` que instaló y el `scripts/merge-driver.mjs` de la
  carpeta principal del clon, que solo avanza con `git pull --ff-only` desde staging. Una rama no
  cambia el código que corre al fusionar. Si la carpeta principal aún no tiene el script, no se
  instala nada.
- Si al fusionar el driver no se puede lanzar (node desinstalado o movido, el script borrado), el
  comando sigue con `git merge-file`: el fichero queda con marcas de conflicto, no queda resuelto en
  falso. Reinstala con `--instalar`.
- Si ya había otro driver con el mismo nombre en la configuración, no se pisa: sale un aviso.
- `node scripts/generados.mjs` lista lo generado, dice qué node y qué script usaría y
  `drivers: instalados` o cuáles faltan.

## Lo que deja escrito

Una línea por fichero en la salida de `git merge`:

```
generado ruta: docs/ops/FORJA.md driver: generado resultado: version-de-HEAD regenera: node scripts/forja.mjs --escribir (antes de empujar)
generado ruta: ops/forja-capas.json driver: json-claves resultado: fusionado
generado ruta: ops/forja-capas.json driver: json-claves resultado: choque motivo: las dos ramas cambian .capas.x
```

Si sale `resultado: version-de-HEAD`, regenera antes de empujar; si no, el CI lo dirá en el test
«está al día» del documento.

## Sin los drivers (GitHub, otro clon, la nube)

GitHub no tiene la configuración local de los drivers: `gh pr update-branch` y el botón de fusionar usan la fusión
normal de git. O chocan, y entonces se trae staging en local (`git merge origin/staging`), donde
el driver sí corre; o salen limpias con un documento desfasado (dos ramas que suben la misma
cifra a la vez lo dejan así), y el test «está al día» del CI lo para. Tras un `update-branch`
limpio, si el CI da rojo en uno de esos tests: trae la rama, `node scripts/generados.mjs
--escribir`, commit y push.

Medido con dos ramas que añaden un criterio cada una (`ops/generados.test.js`): sin drivers,
18 líneas en conflicto en 9 ficheros (criterios vecinos) y 14 en 7 (lejanos); con drivers, 0.
