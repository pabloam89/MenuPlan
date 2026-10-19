---
paths:
  - "supabase/**"
---

# Migraciones

Solo hay una base y es producción: cada migración es un cambio en producción.
Las reglas de estructura de las tablas están en `docs/datos/PRINCIPIOS.md`
(con test); esto es el procedimiento.

1. **Número**: el «siguiente libre» que da el arranque de la sesión (cuenta
   staging, los otros worktrees y los PR abiertos). Vuelve a mirarlo justo
   antes del PR. `supabase/migrations.test.js` vigila los repetidos.
2. **Ensayo**: `node scripts/apply-migration.mjs <nombre>` (hace ROLLBACK).
   Necesita la URL de administrador (`SUPABASE_DB_URL`), que las sesiones no
   tienen desde #328 (solo `SUPABASE_DB_URL_LECTURA`): hasta E5 (#331) lo
   lanza Pablo; la sesión le deja el comando listo.
3. **Juez y aplicar**: el juez `auditor-datos` la revisa y su veredicto va a
   la cabecera (`-- AUDITADA: auditor-datos AAAA-MM-DD OK`). Con eso, en
   staging y con un ensayo de menos de una hora, el script deja lanzar `--si`.
   Hasta E5 (#331) lo lanza **Pablo**, desde una PowerShell aparte con
   `$env:MENUPLAN_OP_PABLO="1"`, por la misma razón que el ensayo. Si además
   trae `CONTRAE` o toca RLS o permisos de lo que ya existía, añade `--pablo`
   (una sesión no puede: no tiene la URL de administrador, y la guardia
   mínima le niega `MENUPLAN_OP_PABLO` y `op` fuera de `npm run op`). Un caso no cuenta como permisos
   de lo que ya existía (#440): quitar a `anon` la plantilla de tablas y
   secuencias nuevas, con `alter default privileges for role postgres in
   schema public revoke … on tables|sequences from anon` y nada más
   (`permisoAplicar.mjs`); cualquier otra variante la lanza Pablo. La 0096
   tiene una autoprueba con `truncate` y `execute`, así que esa la lanza él.
4. **Registro**: en el mismo PR o justo después, la migración va a
   `supabase/ESTADO.md` con su objeto testigo; cada NOT VALID, a
   `supabase/PENDIENTES.md`. ¿Está aplicada? `node scripts/verificar-estado.mjs`.

Además:

- Una migración aplicada **no se edita nunca**: se escribe otra. Lo vigila el
  CI del PR (paso «Migraciones del PR», `scripts/migraciones-pr.mjs`), que
  también falla si una nueva repite el número de otro PR abierto.
- **El código no puede depender de que la migración ya esté**: la rama se
  despliega antes de aplicarla. Plan B siempre.
- Todo `when others` lleva un `raise` de nivel warning o superior (o que
  relance) en el nivel de arriba del manejador, o `-- a propósito: <porqué>`; lo vigila
  `supabase/errores.test.js`.
- `drop constraint` **sin** `if exists`, con el nombre leído de
  `pg_constraint`.
- Vocabulario cerrado: CHECK + la lista en una constante JS. La paridad SQL↔JS
  la lleva una vez `src/lib/vocabularios.test.js`, por columna (una línea en
  `COLUMNAS_VOCABULARIO` de `scripts/lib/columnasVocabulario.mjs`, que vigila
  también quién la escribe); un valor retirado sigue en el CHECK. Enum de
  Postgres, solo con su porqué (PRINCIPIOS §4).
- Ids generados en cliente: `src/lib/ids.js`.
- **Ningún campo ni tabla sin lector**; antes de exponer un dato, mide su
  cobertura.
- Dónde vive un dato: lo curado, en JSON en git; lo que escriben los usuarios,
  en SQL; los dos solo si uno se genera del otro.
- Cambios de modelo: primero el modelo (entidades, `on delete`, ciclo de vida,
  invariantes) y luego el código. Lo lleva el `constructor` y lo juzga `auditor-datos`.
- Una tabla, un módulo dueño: `node scripts/cableado.mjs` da el mapa.
