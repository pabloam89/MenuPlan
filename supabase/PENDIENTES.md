# Constraints NOT VALID por validar

Un constraint `not valid` vigila lo que entra pero no lo que ya había. Hasta
que se valida, la base no garantiza nada sobre las filas viejas. Aquí va cada
uno que alguna migración dejó así y ninguna posterior valida, con cuándo se
puede validar y la consulta que tiene que dar 0 antes.

Validar recorre la tabla, pero con un bloqueo que no frena lecturas ni
escrituras (`share update exclusive`), y va bien dentro de una transacción. Se
valida con una migración nueva, no a mano en el SQL editor, para que el repo
sepa que está hecho:

```sql
set lock_timeout = '5s';
alter table public.<tabla> validate constraint <nombre>;
```

En el mismo commit se borra de aquí y se apunta en `ESTADO.md`.
`supabase/principios.test.js` falla si alguna migración (vieja o nueva) deja un
NOT VALID sin validar que no está en esta lista.

## 0080 · tareas v2 (aplicada el 8 oct 2026)

Condición para todos: 0080 aplicada y el bot con `BOT_TAREAS_V2` desplegado
una semana sin errores.

`bot_tareas_status_check` — no está en la lista de la cabecera de la 0080, pero
también entra NOT VALID.
```sql
select count(*) from public.bot_tareas
 where status not in ('abierta','aplazada','hecha','descartada','caducada','rechazada');
```

`bot_tareas_tipo_check`
```sql
select count(*) from public.bot_tareas
 where tipo is not null and tipo not in ('espera','falta_saber','decision','seguimiento');
```

`bot_tareas_campo_check`
```sql
select count(*) from public.bot_tareas
 where campo is not null and campo not in ('alergias','etapaBebe');
```

`bot_tareas_resultado_check`
```sql
select count(*) from public.bot_tareas
 where resultado is not null and resultado not in ('aceptada','mantenida');
```

`bot_tareas_objetivo_check`
```sql
select count(*) from public.bot_tareas
 where objetivo is not null and objetivo not in ('ideas_plato','calorias','generar_menu');
```

`bot_tareas_cierre_check`
```sql
select count(*) from public.bot_tareas
 where (status in ('hecha','descartada','caducada','rechazada')) <> (closed_at is not null);
```

`bot_tareas_v2_reglas_check`
```sql
select count(*) from public.bot_tareas
 where not coalesce(
       (vuelve_at is null or status = 'aplazada')
   and (objetivo is null or tipo = 'espera')
   and (valor is null or tipo = 'decision')
   and (resultado is null or tipo = 'decision')
   and ((tipo = 'decision' and status = 'hecha') is not true or resultado is not null)
   and (pedido is null or length(pedido) <= 240), true);
```

`bot_reminders_tarea_fk` (tabla `bot_reminders`)
```sql
select count(*) from public.bot_reminders r
 where r.tarea_id is not null and r.household_id is not null
   and not exists (select 1 from public.bot_tareas t
                    where t.household_id = r.household_id and t.id = r.tarea_id);
```

## 0083 · tareas → persona (aplicada el 8 oct 2026)

La 0089 la sustituye (abajo): mientras no se aplique la 0089, vale esta. Su
comentario («una baja lógica no borra la fila») no era verdad: la
sincronización por clave (0081) borra la fila de quien sale de la familia, y
con `on delete cascade` se llevaba sus tareas.

`bot_tareas_persona_fk` — condición: 0081, 0082 y 0083 aplicadas y el bot nuevo
una semana sin errores.
```sql
select count(*) from public.bot_tareas t
 where t.persona_id is not null
   and not exists (select 1 from public.persona p
                    where p.household_id = t.household_id and p.id = t.persona_id);
```

## 0089 · tareas → persona, sin cascada (sin aplicar)

`bot_tareas_persona_fk` rehecha con `on delete set null (persona_id)`, NOT
VALID: quitar a alguien de la familia borra su fila de persona y su salud,
pero no sus tareas (el código las descarta como «sin_persona»). Condición:
0089 aplicada, la consulta de arriba en 0 y una semana de guardados sin
WARNING `_personas_al_guardar` en los logs.
```sql
alter table public.bot_tareas validate constraint bot_tareas_persona_fk;
```

## 0086 · vocabulario de la app (aplicada el 8 oct 2026)

Condición para todos: 0086 aplicada, las consultas en 0 y ningún error 23514
en los logs durante una semana. Ojo: aun sin validar, un UPDATE de una fila
vieja con un valor fuera de lista falla (por eso las consultas se corren
también ANTES de aplicar).

`user_menu_weeks_active_days_vocabulario`
```sql
select count(*) from public.user_menu_weeks
 where not (active_days <@ array['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']::text[]);
```

`user_pantry_pack_kind_vocabulario`
```sql
select count(*) from public.user_pantry
 where pack_kind not in ('bote','lata','paquete','bolsa','brick','botella','carton');
```

`user_recipes_required_appliances_vocabulario`
```sql
select count(*) from public.user_recipes
 where not (required_appliances <@ array['Airfryer','Horno','Microondas','Olla rápida','Thermomix','Vaporera']::text[]);
```

`user_recipes_usage_tags_vocabulario`
```sql
select count(*) from public.user_recipes
 where not (usage_tags <@ array['plato_unico','plato_normal','guarnicion']::text[]);
```

`recipe_collections_collection_id_vocabulario`
```sql
select count(*) from public.recipe_collections
 where collection_id not in ('dia_a_dia','ocasion_especial','cena_rapida','hijos')
   and collection_id not like 'fld\_%';
```

## 0085 · vocabulario del bot (aplicada el 8 oct 2026)

Aún no está en esta rama; se apuntan para que no se pierdan al entrar.
Condición: 0085 aplicada y el bot nuevo una semana sin errores.

`bot_messages_channel_check`, `bot_reminders_channel_check`,
`bot_tareas_channel_check`, `bot_cola_channel_check`
```sql
select 'bot_messages' t, count(*) from public.bot_messages where channel not in ('telegram','whatsapp')
union all select 'bot_reminders', count(*) from public.bot_reminders where channel not in ('telegram','whatsapp')
union all select 'bot_tareas',    count(*) from public.bot_tareas    where channel not in ('telegram','whatsapp')
union all select 'bot_cola',      count(*) from public.bot_cola      where channel not in ('telegram','whatsapp');
```

`bot_reminders_tipo_check`
```sql
select count(*) from public.bot_reminders where tipo not in ('libre','vispera');
```

# Transiciones declaradas (no son constraints)

Datos que hoy viven en un sitio provisional a sabiendas. Cada uno dice dónde
tiene que acabar, cuándo y qué lo lee mientras tanto.

## «Quién soy» en la familia: `accountMemberIdByUser` → `household_members.persona_id`

Hoy: `state.data.accountMemberIdByUser[userId]` en el JSON de la casa
(`household_state`), leído por `miembroDeCuentaId` en `src/lib/stages.js`.
Sustituye a `data.accountMemberId`, que era uno solo para toda la casa y
titular y cotitular se pisaban; ese valor viejo queda de respaldo solo para el
titular.

Destino: una columna `household_members.persona_id` con FK compuesta
`(household_id, persona_id) → persona (household_id, id)`, con su `on delete
set null`. Cuándo: DESPUÉS de que persona.id pase a `uuid` (la transición de
abajo), para no crear una FK sobre un tipo que va a cambiar. Ese día se copia
el mapa a la columna y el mapa deja de escribirse. Hasta entonces el mapa es una
caché declarada.

## Ids de persona y grupo: valores UUID (0091) → columnas `uuid`

La 0091 se aplicó el 9 oct 2026: los valores ya son UUID (163 ids viejos
mapeados). Los TIPOS siguen siendo `text`: persona.id, grupo.id, sus FK (`persona_alergia`,
`persona_intolerancia`, `persona_estado`, `persona_perfil_salud`,
`grupo_persona`, `bot_tareas.persona_id`, y, desde la 0097 (si se aplica antes del paso 2),
`sobre.persona_id` y `cambio.persona_id`, con su FK compuesta a `persona`) y
`bot_tareas.para_member` / `asignado_member`.
`src/lib/ids.js` acepta las formas viejas a propósito.

Paso 1: la 0091 pasa los VALORES a UUID en toda la base, con el mapa en
`ids_uuid_equivalencias`. Paso 2, otra migración: los TIPOS de esas columnas a
`uuid` (soltar y volver a poner las FK compuestas; `persona_sincronizar_casa` y
`_persona_filas_de_estado` tienen que convertir `x->>'id'` a uuid, y saltar un
id que no lo sea en vez de tumbar la copia). En ese mismo paso,
`supabase/idsPersonaGrupo.test.js` se retira o se reescribe: su barrera es «toda
columna con ids de persona o grupo está en el INVENTARIO de la 0091», y con
columnas `uuid` la que vale es que sean `uuid` con FK. Paso 3: `ids.js` deja de
aceptar `VIEJO_PERSONA` y `VIEJO_GRUPO`, y en esa misma tanda se borra
`ids_uuid_equivalencias` con una migración `-- CONTRAE:`: sin formas viejas que
repasar se queda sin lector (decidir antes si se guarda fuera una copia del mapa
para poder deshacer).

Condición para el paso 2: una semana sin que reaparezca un id viejo (como
pronto, el 16 oct 2026) (una PWA antigua guarda sin `p_bot_rev` y puede devolverlos). Mira persona
y grupo y TAMBIÉN el JSON de la casa: con `activeRosterId` distinto de `default`
el trigger de la 0089 no copia nada, y persona daría 0 aunque el JSON tuviera
ids viejos. Son las mismas listas que lee `_ids_de_estado` en la 0091 (familia,
grupos y fotos de los rosters, sin invitados). Debe dar 0:
```sql
with u(re) as (select '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
rosters as (
  select hs.household_id, r.value as v
    from public.household_state hs,
         jsonb_each(case when jsonb_typeof(hs.state->'data'->'rosters') = 'object'
                         then hs.state->'data'->'rosters' else '{}'::jsonb end) r),
listas(l) as (
  select state->'data'->'members' from public.household_state
  union all select state->'data'->'groups' from public.household_state
  union all select v->'snapshot'->'members' from rosters
  union all select v->'snapshot'->'groups' from rosters),
json_ids as (
  select x->>'id' as id
    from listas, jsonb_array_elements(case when jsonb_typeof(l) = 'array' then l else '[]'::jsonb end) x
   where jsonb_typeof(x) = 'object' and x->'invitado' is distinct from 'true'::jsonb
     and nullif(btrim(x->>'id'), '') is not null and x->>'id' not like 'inv\_%')
select (select count(*) from public.persona, u where id !~* u.re)
     + (select count(*) from public.grupo, u where id !~* u.re)
     + (select count(*) from json_ids, u where id !~* u.re);
```
Si no da 0, se vuelve a lanzar la 0091 tal cual (es idempotente y reutiliza
el mismo UUID de `ids_uuid_equivalencias` para cada id viejo). Las columnas que
guardan estos ids están en el INVENTARIO de la 0091, vigilado por
`supabase/idsPersonaGrupo.test.js`.
