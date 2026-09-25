# Estado de las migraciones

Verificado contra el esquema vivo de producción (`mdzwbrworucnummibxrq`) el
**17 sep 2026**, comprobando que existe un objeto testigo de cada migración
(su tabla, su columna o su esquema) — no leyendo ningún registro, porque no hay
ninguno fiable. Ver «El registro miente» más abajo.

## Resumen

| | |
|---|---|
| Ficheros en `supabase/migrations/` | **56** |
| Comprobadas contra producción | 32 |
| Aplicadas | **32** |
| **Sin aplicar** | **1** — `0021_store_products` (la `0055_recipe_share_links` se aplicó el 24 sep 2026; la `0056_menu_share_links`, el 25 sep 2026) |
| Registradas en `supabase_migrations.schema_migrations` | **12** |

## La 0056, aplicada el 25 sep 2026

`0056_menu_share_links` — enlaces con llave para mandar una SEMANA, hermana de
la 0055. Aplicada en transacción contra producción y verificada en vivo:

| | |
|---|---|
| `public.menu_share_links` | creada, con RLS activo y 1 política de lectura |
| `menu_share_token` / `menu_share_revoke` / `menu_from_link` | las tres, creadas |
| `menu_from_link` con un uuid inexistente, como `anon` | devuelve `{"status":"gone"}` |
| `menu_share_token` sin sesión | rechaza con «sin sesión» |

**Y algo que salió al verificarla y afecta también a la 0055:** `revoke all on
function … from public` **no le quita el permiso a `anon`**. Supabase trae un
`alter default privileges` que concede EXECUTE a `anon` y `authenticated` sobre
las funciones nuevas del esquema `public`, y eso es una concesión DIRECTA que
revocarle a `public` no toca.

No es un agujero: las tres funciones de escritura empiezan mirando `auth.uid()`
y responden «sin sesión». Pero la concesión dice lo contrario de lo que se
pretendía. En la 0056 se ha añadido un `revoke execute … from anon` explícito;
**`recipe_share_token` (0055) sigue con `anon = true`** y convendría hacerle lo
mismo.

## La única sin aplicar

**`0021_store_products`** — la tabla `store_products` no existe en producción.

**No es un problema, y no hay que correr a aplicarla.** La propia migración lo
dice: *"Client reads bundled JSON in `public/store/`; this table is optional for
server-side queries, analytics, and future multi-store support"*. Comprobado:
**ningún fichero de `src/`, `api/` o `scripts/` la consulta**. Los precios de
Mercadona se leen del JSON del bundle.

Queda escrito para que nadie asuma que está ahí. Si algún día se quiere el
catálogo de productos en servidor, se aplica entonces.

## El registro miente, y por eso esto se verifica a mano

`supabase_migrations.schema_migrations` —la tabla de la CLI de Supabase—
contiene **12 filas para 54 ficheros**, y con otro esquema de nombres:

```
20260704154726  user_pantry
20260710112331  multiweek_menus
...
20260911074059  0051_ops_reader
```

Son *timestamps* de la CLI, no los `00NN_` del repo, y los nombres tampoco
coinciden con los ficheros. La causa está escrita en las propias migraciones:
casi todas llevan «Run this in: Supabase Dashboard → SQL Editor», o sea que se
han ido aplicando **a mano**, sin pasar por la CLI que alimenta esa tabla.

Consecuencia práctica, que ya señalaba la auditoría de agosto: **el repo no
reconstruye producción y el registro tampoco lo cuenta.** La única fuente de
verdad es el esquema vivo. De ahí este fichero.

## Números repetidos

Tres, y se quedan como están:

| Número | Ficheros |
|---|---|
| `0003` | `analytics_feedback_votes` + `user_data` |
| `0006` | `catalog_meta` + `pantry_quantity` |
| `0051` | `ops_reader` + `recipe_base_mode_and_nutrients` |

**No se renumeran.** Los seis están aplicados, y `0051_ops_reader` está
registrado en la tabla de control **por su nombre**: renombrarlo rompería la
única trazabilidad que queda entre repo y base, a cambio de que `ls` se vea
mejor. `migrations.test.js` impide que aparezca un cuarto.

No rompían el despliegue (`supabase db push` ordena por nombre y desempata de
forma determinista). Rompían a las personas: «aplica la 0051» no significaba
nada, y así se quedó sin aplicar durante meses la de `base_mode`.

## Convención

1. **Número nuevo = el siguiente libre.** Sin reutilizar, sin sufijos.
2. **Aditiva y nullable** siempre que se pueda: una columna nueva con `NULL`
   significa «como antes», y no hace falta backfill ni ventana de parada.
3. **Encabezado con el porqué**, no con el qué: el `alter table` ya dice qué
   hace. Lo que no se ve en el SQL es qué se rompía sin él.
4. **Comprobar antes de escribir.** Media docena de columnas de este repo ya
   existían en producción cuando alguien fue a añadirlas.

## Aviso: aplicada ≠ con datos

Las cinco columnas de `0051_recipe_base_mode_and_nutrients` llevan aplicadas
desde septiembre y están **vacías en las 1002 filas**, porque el catálogo no se
ha vuelto a subir a Supabase desde entonces. Una migración aplicada solo
garantiza la forma, no el contenido.

Es la razón de que `aporte` (el campo de `lib/aporte.js`) **no tenga columna
todavía**: se deriva en runtime y ninguna receta lo declara, así que una columna
hoy sería una sexta columna vacía. Está declarado en `NO_VIAJAN`
(`src/data/recipeRow.test.js`) con esa razón y con lo que hay que hacer el día
que se cure a mano.
