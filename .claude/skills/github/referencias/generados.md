# Lo generado al fusionar staging (#551)

Los documentos que salen enteros de un catálogo (FORJA.md, REDACCION.md, NORMAS.md,
ESTANDARES.md, ENCARGO.md y los moldes de `.claude/plantillas-skill/`) y las anclas JSON de
la forja y de la redacción llevan en `.gitattributes` un driver de fusión. La lista manda en
`GENERADOS` de `scripts/lib/generados.mjs`; `ops/generados.test.js` la cruza con
`.gitattributes` y con toda cabecera «Generado desde … No se edita a mano».

| Driver | Qué hace al fusionar | Qué te toca |
|---|---|---|
| `generado` (documentos) | se queda con tu versión y no para la fusión | si su test «está al día» falla, `node scripts/generados.mjs --escribir` y commitea |
| `json-claves` (anclas) | fusiona clave a clave contra la base común | nada; si los dos lados cambian la misma clave, choca con las marcas de git y se resuelve a mano |

## Instalar y comprobar

- `npm run tarea` los instala en la configuración de git de la carpeta principal, que comparten
  todas las carpetas de trabajo. A mano: `node scripts/generados.mjs --instalar`.
- `node scripts/generados.mjs` lista lo generado y dice `drivers: instalados` o cuáles faltan.

## Lo que deja escrito

Una línea por fichero en la salida de `git merge`:

```
generado ruta: docs/ops/FORJA.md driver: generado resultado: tu-version regenera: node scripts/forja.mjs --escribir (…)
generado ruta: ops/forja-capas.json driver: json-claves resultado: fusionado
generado ruta: ops/forja-capas.json driver: json-claves resultado: choque motivo: las dos ramas cambian .capas.x
```

Si sale `resultado: tu-version`, regenera antes de empujar; si no, el CI lo dirá en el test
«está al día» del documento.

## Sin los drivers (GitHub, otro clon, la nube)

GitHub no tiene la configuración local de los drivers: `gh pr update-branch` y el botón de fusionar usan la fusión
normal de git. O chocan, y entonces se trae staging en local (`git merge origin/staging`), donde
el driver sí corre; o salen limpias con un documento desfasado (dos ramas que suben la misma
cifra a la vez lo dejan así), y el test «está al día» del CI lo para.

Medido con dos ramas que añaden un criterio cada una (`ops/generados.test.js`): sin drivers,
18 líneas en conflicto en 9 ficheros (criterios vecinos) y 14 en 7 (lejanos); con drivers, 0.
