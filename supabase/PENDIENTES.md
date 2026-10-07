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

## 0080 · tareas v2 (sin aplicar)

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

## 0083 · tareas → persona (sin aplicar)

`bot_tareas_persona_fk` — condición: 0081, 0082 y 0083 aplicadas y el bot nuevo
una semana sin errores.
```sql
select count(*) from public.bot_tareas t
 where t.persona_id is not null
   and not exists (select 1 from public.persona p
                    where p.household_id = t.household_id and p.id = t.persona_id);
```

## 0086 · vocabulario de la app (sin aplicar)

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

## 0085 · vocabulario del bot (rama `datos/sistematizar`, sin aplicar)

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
