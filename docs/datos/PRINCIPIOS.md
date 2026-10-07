# Principios de las tablas

Reglas de estructura para todo lo que se cree a partir de la migración 0087.
Lo anterior no se reescribe por cumplirlas: se arregla cuando se toca.

Cada regla dice por qué existe y cómo se hace cumplir:

- **[auto]**: lo comprueba `supabase/principios.test.js` sobre el SQL de las
  migraciones ≥ 0087 (y, donde se dice, sobre todas). Falla el CI.
- **[revisión]**: no hay test que lo vea; lo mira quien revisa la migración.

Si una regla no encaja, se rompe a la vista: un comentario en la migración que
diga cuál y por qué. Lo que no vale es saltársela sin decirlo.

## 1. Todo cuelga de la casa

- Las tablas de dominio llevan `household_id uuid not null references
  public.households(id) on delete cascade`, y su índice principal empieza por
  `household_id`. **[revisión]**
  Por qué: la casa es la unidad de acceso (RLS), de borrado (RGPD) y de
  consulta; con el índice así, cada lectura de una casa es un rango.
- Los hijos de una entidad de la casa la referencian con FK compuesta
  `(household_id, x_id) → (household_id, id)`. **[revisión]**
  Por qué: así la base impide que una fila cuelgue de algo de otra casa
  (ver `bot_reminders_tarea_fk` en 0080 y `bot_tareas_persona_fk` en 0083).
- Las tablas por usuario heredadas (`user_pantry`, `user_menus`,
  `user_recipes`…) son excepciones congeladas: no se crean tablas nuevas por
  usuario para datos de la casa. **[revisión]**

## 2. Toda FK dice qué pasa al borrar

- Cada `references` declara `on delete` (`cascade`, `restrict` o `set null`).
  **[auto]** Por qué: el valor por defecto (`no action`) es una decisión que
  nadie tomó; con cascadas hacia `persona`, borrar mal se lleva tareas en
  silencio (ver 0081).
- Una columna `*_id` o `*_by` sin FK lleva `comment on column` con la razón:
  catálogo del bundle, polimórfica o externa (Telegram, Mercadona).
  **[revisión]** Por qué: sin el comentario no se distingue un olvido de una
  decisión.

## 3. Claves primarias

| Caso | Clave |
|---|---|
| La genera el servidor | `uuid default gen_random_uuid()` |
| La genera el cliente | `text`, prefijo de tipo + 12 caracteres base36 de CSPRNG, con CHECK de formato |
| Registro o cola de solo añadir | `bigserial` |
| Entidad de la casa | compuesta `(household_id, id)` |

**[auto en el código, revisión en el SQL]** Por qué: los ids de cliente
(personas, grupos, carpetas `fld_…`, menús `menu_…`) se fabricaban cada uno
a su manera con `Math.random`. Ahora todos salen de `src/lib/ids.js`
(`ids.<tipo>.nuevo()`, `ids.<tipo>.es()` acepta el formato nuevo y los viejos),
y `src/lib/ids.guard.test.js` falla si alguien genera un id fuera de él. Los
ids viejos no se reescriben nunca. El CHECK de formato en la base usa las
regex que exporta `ids.js`.

## 4. Vocabularios cerrados

- `text` + CHECK llamado `<tabla>_<col>_vocabulario`. La lista vive en una
  constante JS, y un test compara SQL y JS (como `src/lib/vocabularioApp.test.js`
  con la 0086). Los `enum` de las herramientas de Lola salen de esa misma
  constante. **[revisión]** el nombre y la paridad; el test de paridad es
  **[auto]** una vez escrito.
  Por qué: añadir un valor en JS sin migración es el fallo típico, y solo un
  test lo ve antes que el usuario.
- Nada de `create type … as enum` ni `alter type … add value`. **[auto]**
  Por qué: un enum de Postgres no se puede encoger, y el valor que añade
  `add value` no se puede usar en la misma transacción (la 0070 tuvo que ir
  sola por eso). Los trece enums que hay se quedan; no se suma ninguno.
- Tabla de consulta (lookup) solo si los valores llevan atributos que alguien
  lee. **[revisión]**
- Residual `'otro'` solo cuando sirva: con columna `<col>_otro text` y
  `check ((<col> = 'otro') = (<col>_otro is not null))`. **[revisión]**

## 5. JSON o tabla

| Tabla si… | JSON si… |
|---|---|
| se filtra o agrega en el servidor, o entre casas | un solo escritor lo lee y escribe entero |
| otra fila la referencia por FK, o necesita integridad | es una foto: snapshot, deshacer, historial |
| varios escritores editan partes a la vez | la forma es heterogénea o versionada, y la valida zod |
| cada parte necesita RLS distinta | es un payload externo tal cual llega |
| crece sin tope o guarda historia | es estado de la UI |
| tiene ciclo de vida propio | es configuración pequeña y acotada |

Híbridos que valen:

- Una fila por entidad con cuerpo `jsonb` (lo indexable en columnas).
- Tabla como verdad + proyección JSON servida por RPC para cargar rápido.
- Versión por sección del documento, para no pisarse entre secciones.

Lo que no vale: sincronizar con DELETE + INSERT cuando hay FK en cascada que
cuelgan de esas filas. Se hace diff y upsert por clave (la lección de 0079 →
0081). **[revisión]**

Toda columna `jsonb` nueva lleva al menos `check (jsonb_typeof(col) = 'object')`
(o `'array'`) y un `comment on column` que nombra el fichero JS que la valida.
**[revisión]** Por qué: sin eso, la forma del JSON solo está en la cabeza de
quien lo escribió.

## 6. Un dato, un sitio

Cada hecho vive en un solo lugar. Cualquier otra copia es una proyección
calculada, y se documenta de dónde sale y quién la recalcula. **[revisión]**
Por qué: dos copias acaban diciendo cosas distintas (los comensales en el
JSON de la casa y en `persona` mientras dure la transición son la excepción
declarada, no el modelo).

## 7. Concurrencia

El estado compartido de la casa se escribe con RPC que comprueban y suben una
versión (`bot_rev`, 0057/0068). En funciones nuevas, el cliente no lee el
documento entero, lo modifica y lo vuelve a escribir. **[revisión]**
Por qué: la app, el bot y otro miembro escriben la misma casa; sin versión,
gana el último y nadie se entera.

## 8. Seguridad

- `enable row level security` en la misma migración que crea la tabla.
  **[auto]** Por qué: entre una migración y la siguiente la tabla queda abierta
  a `anon` por la API.
- Tabla sin políticas (solo servidor): además `revoke all on table … from
  anon, authenticated`. **[auto]** Por qué: RLS sin políticas ya cierra, pero
  el revoke deja escrita la intención y protege si alguien desactiva RLS.
- Funciones `security definer`: `set search_path = public, pg_temp`,
  `revoke all on function … from public, anon, authenticated` y `grant execute`
  explícito a quien la use. **[auto]** Por qué: Supabase concede EXECUTE a
  `anon` y `authenticated` por defecto, y revocar a `public` no lo quita (lo
  que se vio con la 0055/0056).
- Las políticas usan `(select auth.uid())`, no `auth.uid()` a pelo.
  **[revisión]** Por qué: así se evalúa una vez por consulta y no por fila
  (0011).

## 9. Fechas

`created_at timestamptz not null default now()`. `updated_at` solo si lleva el
trigger `set_updated_at` (0001); una columna que nadie actualiza miente.
**[revisión]**

## 10. Migraciones

Producción y staging comparten base: cada migración tiene que convivir con el
código desplegado de antes y de después.

- **Expandir y contraer.** Primero se añade; lo que se quita va en un despliegue
  posterior, cuando ningún código desplegado lo usa. Un `drop table` o
  `drop column` exige una línea de cabecera `-- CONTRAE: <qué y por qué ya
  nadie lo usa>`. **[auto]** la línea; **[revisión]** que sea verdad.
- **Constraints sobre tablas existentes, `not valid`**, y el `validate` después.
  Cada `validate` pendiente se apunta en `supabase/PENDIENTES.md` con su
  condición y su consulta previa. **[auto]**, y la comprobación de que todo
  NOT VALID sin validar está en PENDIENTES.md corre sobre **todas** las
  migraciones. Por qué: validar recorre la tabla con bloqueo; y un NOT VALID
  olvidado no protege lo que ya había.
- **`set lock_timeout`** al principio (p. ej. `'5s'`). **[auto]** Por qué: un
  `alter table` que espera un bloqueo pone en cola todas las lecturas detrás.
- **Nada no transaccional.** Sin `begin`/`commit`, sin `concurrently`, sin
  `vacuum`. Un índice concurrente va a `supabase/manual/` con el mismo número y
  sufijo (`0080b_indice_concurrente.sql`). **[auto]**
- **Precondiciones con `raise exception`** en un bloque `do`: si falta una
  migración previa o hay datos que la romperían, falla antes de tocar nada
  (ver 0083). **[revisión]**
- **Cada migración aparece en `supabase/ESTADO.md`**, con su estado real.
  **[auto]**

## 11. Transformaciones

Cada transformación del dominio vive en un módulo puro con tests
(`src/lib/nutricionPlato.js`, `src/data/axisRegistry.js`). La base no la
duplica: si la necesita, la deriva con una vista o una columna generada a
partir del dato de origen. **[revisión]** Por qué: dos implementaciones de la
misma cuenta divergen. Y nada de un framework genérico de calculadoras: un
módulo por transformación.

## 12. Nombres

- Tablas nuevas en plural. **[revisión]**
- Columnas estructurales en inglés: `id`, `*_id`, `created_at`, `updated_at`,
  `status`. Las de dominio pueden ir en español. **[revisión]**
- Sufijos y prefijos de constraints e índices: `_fk`, `_vocabulario`, `uq_`,
  `idx_`. **[revisión]**

## Qué comprueba el test

`supabase/principios.test.js`, sobre las migraciones ≥ 0087:

1. todo `references` lleva `on delete`;
2. todo `create table` tiene su `enable row level security` en el fichero;
3. tabla sin `create policy` → `revoke all on table … from anon, authenticated`;
4. `security definer` → `search_path` con `pg_temp` (o vacío) y revoke a
   `public, anon, authenticated`;
5. ni `create type … as enum` ni `alter type … add value`;
6. `add constraint … check | foreign key` sobre tabla existente → `not valid`;
7. cada `not valid` está en `supabase/PENDIENTES.md`;
8. ni `concurrently`, ni `begin`/`commit`, ni `vacuum`;
9. `drop table | column` → cabecera `-- CONTRAE:`;
10. el número aparece en `supabase/ESTADO.md`;
11. `set lock_timeout` presente.

Y sobre todas las migraciones: cada NOT VALID sin un `validate` posterior está
en PENDIENTES.md. El test se prueba a sí mismo con SQL de ejemplo, bueno y
malo, para cada regla.
