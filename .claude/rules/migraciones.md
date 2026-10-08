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
   Lo puede lanzar la sesión.
3. **Juez y aplicar**: el juez `auditor-datos` la revisa y su veredicto va a
   la cabecera (`-- AUDITADA: auditor-datos AAAA-MM-DD OK`). Con eso, en
   staging y con un ensayo de menos de una hora, la sesión lanza `--si`. Si
   trae `CONTRAE` o toca RLS o permisos de lo que ya existía, la lanza Pablo
   con `!` y `--pablo` (la guardia se lo niega a las sesiones).
4. **Registro**: en el mismo PR o justo después, la migración va a
   `supabase/ESTADO.md` con su objeto testigo; cada NOT VALID, a
   `supabase/PENDIENTES.md`. ¿Está aplicada? `node scripts/verificar-estado.mjs`.

Además:

- Una migración aplicada **no se edita nunca**: se escribe otra.
- **El código no puede depender de que la migración ya esté**: la rama se
  despliega antes de aplicarla. Plan B siempre.
- Todo `when others` lleva un `raise` de nivel warning o superior (o que
  relance) en el nivel de arriba del manejador, o `-- a propósito: <porqué>`; lo vigila
  `supabase/errores.test.js`.
- `drop constraint` **sin** `if exists`, con el nombre leído de
  `pg_constraint`.
- Vocabulario cerrado: CHECK + la lista en una constante JS + un test SQL↔JS
  (como `src/lib/vocabularioApp.test.js`). Enum de Postgres, casi nunca.
- Ids generados en cliente: `src/lib/ids.js`.
- **Ningún campo ni tabla sin lector**; antes de exponer un dato, mide su
  cobertura.
- Dónde vive un dato: lo curado, en JSON en git; lo que escriben los usuarios,
  en SQL; los dos solo si uno se genera del otro.
- Cambios de modelo: primero el modelo (entidades, `on delete`, ciclo de vida,
  invariantes) y luego el código. Lo lleva `datos` y lo juzga `auditor-datos`.
- Una tabla, un módulo dueño: `node scripts/cableado.mjs` da el mapa.
