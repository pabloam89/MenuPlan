---
name: higiene-de-vocabulario
description: Úsala para repasar el glosario y sus dominios y devolver una lista de defectos con su arreglo: «repasa el glosario», «¿qué términos no tienen entidad?», «¿choca este término con la base?», «¿puedo redefinir X en el glosario de datos?», «¿qué palabras faltan?», «baja las excepciones del glosario». No para: arreglar una skill (higiene-de-skills), añadir un término (es una edición de ops/glosario/terminos/) ni contar migraciones (datos).
metadata:
  tipo: revision
  opera_proveedor: false
  juzga_artefacto: true
  encadena: false
  pasos_fijos: false
  sintoma_a_causa: false
  elige_opciones: false
  dueno: constructor
  comprobado: 2026-10-12
  normas: [glosario-sin-sinonimos-nuevos, entidad-con-registro]
---

# Higiene de vocabulario

## Cuándo y para qué

Para repasar el glosario (`ops/glosario/`) cuando ya tiene dos pisos: la base y los
dominios (campo `dominio`), y cada término conectado a las entidades del registro
(`ops/entidades.json`). Entra «repasa el glosario», un término que alguien quiere
añadir a un dominio o una duda de si dos palabras chocan; sale la lista de defectos
con su arreglo y una cifra. Hermana de `higiene-de-skills`, que le cedió el repaso
del glosario (F1 de #652).

No es para:
- arreglar una skill: `higiene-de-skills`;
- crear un término: es una edición de `ops/glosario/terminos/`, que vigila
  `ops/glosario.test.js`; esta skill lo repasa después;
- crear una skill o decidir si hace falta: `forja-de-skills`.

Se poda (se funde en `higiene-de-skills`) si en 90 días nadie la abre o si el CI
pasa a ejecutar `--higiene` en cada PR y nadie la lanza a mano.

## Qué mira

El script junta los controles de `scripts/lib/glosarioMapeo.mjs`,
`scripts/lib/glosarioDominios.mjs` y `scripts/lib/glosario.mjs`; el test de forma
(`ops/glosario.test.js`) ya vigila el resto (clase, estado, forma de la definición).

| Código | Señal | Capa | Gravedad |
|---|---|---|---|
| `termino-sin-entidad` | artefacto que ni nombra una entidad ni dice su `sin_entidad` | formal | falta |
| `entidad-sin-termino` | entidad activa no vertical que ningún término nombra | formal | falta |
| `sinonimo-nuevo` | sinónimo prohibido nuevo en las zonas (lo que mide `--medir`) | formal | falta |
| `dominio-redefine-base` | un término de dominio con el nombre o el sinónimo prohibido de uno de la base, o la base colgando de un dominio | formal | falta |
| `definicion-choca-con-base` | definición de dominio casi igual a una de la base con otro nombre | material | aviso |
| `equivoco-entre-dominios` | el mismo nombre en dos dominios con definiciones distintas | material | aviso |

La relación con la entidad la fija la clase del término (`RELACION_POR_CLASE`): un
artefacto `denota`, un campo es `campo_de`, un estado `valor_de`, un rol `rol_de`,
una acción `accion_sobre` y un lugar `ubicacion_de`. Un artefacto sin entidad dice
por qué con un motivo cerrado (`MOTIVOS_SIN_ENTIDAD`). El invariante de dominios
es uno: **un dominio solo añade o estrecha, nunca redefine uno de la base**; estrecha
con `amplio` hacia la base. La pieza mala a propósito que da los seis códigos está
en `scripts/higiene-vocabulario.test.js`.

## Cómo puntúa

- **Falta**: un código formal. Se arregla; el CI no deja pasarlo con la lista de
  excepciones al alza.
- **Aviso**: un código material, una heurística con el parecido de las palabras de
  contenido. Se mira y se decide; si es un falso positivo, se dice por qué en el PR.
- **La cifra**: `higiene vocabulario: glosario terminos: n faltas: a avisos: b`. Se pone
  antes y después en el PR; las faltas no suben.
- Si un aviso sale en tres términos seguidos, la regla está mal puesta: se ajusta
  el umbral en `scripts/lib/glosarioDominios.mjs` (`MAX_PARECIDO`), no se repite el arreglo en cada término.

## Método

1. **Lanza el script**: `npm run glosario -- --higiene`. Gratis, sin red. Sale la
   cifra y una línea `código (capa, gravedad): texto → arreglo` por hallazgo.
2. **Separa faltas de avisos** como dice «Cómo puntúa».
3. **Arregla con el arreglo que trae**. Un artefacto sin entidad: nombra la que
   es (si existe en `ops/entidades.json`) o elige el motivo de `sin_entidad` que
   dice qué es; no cambies su clase para que encaje.
4. **Antes de escribir un término de un dominio**, `npm run glosario -- <nombre>`:
   si existe en la base, o es un sinónimo prohibido suyo, no se redefine; se
   estrecha con `amplio` hacia el de la base o se le da otro nombre.
5. **En el repaso periódico**, baja las excepciones con `npm run glosario -- --medir`
   y juzga los candidatos a término de `npm run glosario -- --candidatos`; el
   método, en `.claude/skills/higiene-de-vocabulario/referencias/glosario.md`.
6. **Vuelve a lanzar** `--higiene` y `npx vitest run ops/glosario.test.js
   ops/glosario-dominios.test.js ops/glosario-mapeo.test.js`. Pon la cifra antes
   y después en el PR.

Sale bien si: `faltas: 0`, los tres tests en verde, cada aviso arreglado o
explicado y la lista de excepciones del glosario sin subir.

## Lo que falló y por qué

- **2026-10-12 · retirar el término «criterio» sin retirar su entidad rompía siete
  comprobaciones del registro.** Causa: el término retirado dejaba de ser activo y
  la entidad `criterion` seguía apuntando a él, con cuatro relaciones y lectores.
  Arreglo: se retiran a la vez (`replaced_by: norm`), el test del registro admite
  una entidad retirada sin `term`, y el mapeo comprueba que el `term` de una
  entidad activa la nombre. Antes: 7 problemas; después: 0.
- **2026-10-12 · retirar «criterio» dejó 75 usos en 29 ficheros fuera de la ley.**
  Causa: el nombre de un retirado cuenta como sinónimo prohibido de su `pasa_a` y
  casi todos los usos eran castellano corriente («criterio de parada»). Arreglo:
  reescribirlos (condición de parada, norma de la forja) sin subir ninguna excepción.

## Registro de cambios

- **2026-10-12** · Primera versión: seis códigos, `npm run glosario -- --higiene`,
  su test con un glosario malo hecho a propósito y el método del repaso periódico
  que antes era el paso 7 de `higiene-de-skills` (F1 de #652).

## Fuentes y comprobación

- https://www.w3.org/TR/skos-reference/ (SKOS: términos genéricos y específicos).
- ISO 25964-1 (tesauros: términos genéricos, específicos y relacionados), la base de las relaciones del glosario.
- `docs/ops/BASE-FORJA.md`, secciones 9, 10 y 12.

Comprobado el 2026-10-12: `npm run glosario -- --higiene` sobre el glosario de hoy (0 faltas, 0 avisos) y su test con un glosario malo hecho a propósito, visto fallar sin cada código. Sin comprobar: `npm run skills-prueba -- higiene-de-vocabulario` (cuesta tokens) y el A/B con y sin skill.
