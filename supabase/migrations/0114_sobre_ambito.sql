-- El sobre gana ámbito (plan fichas con estado, trozo 55; #1037): un sobre por hueco. sobre gana grupo_id, semana,
-- dia y comida, y su clave única pasa a casa, campo, persona y esas cuatro; registro_campo gana ambito, las
-- dimensiones de cada campo, y sobre_valor_valido exige que el sobre traiga exactamente esas. Entran en el registro
-- los campos de la Rutina con ámbito que tienen forma de valor plano. Escribir y deshacer con ámbito
-- (aplicar_operacion, deshacer_operacion) van en la migración del trozo 56, y leerlo (ficha_casa) en la del 57.
-- AUDITADA: auditor-datos 2026-11-02 OK
--
--   · registro_campo.ambito (text[], not null): lista de DIMENSIONES_AMBITO (vocabularios.js), CHECK
--     registro_campo_ambito_vocabulario. Sin default: el INSERT de abajo es su único escritor (como en la 0105).
--   · sobre gana grupo_id (FK compuesta a grupo, on delete cascade: el dato de un grupo se va con él, como el de
--     una persona; escribir_persona, 0108, actualiza los grupos en sitio y solo borra los que se quitan), semana
--     (date, el lunes: sobre_semana_lunes), dia (CHECK de DIAS) y comida (CHECK de COMIDAS). Nulas: un campo
--     sin esa dimensión no la lleva. Índice de la FK (PRINCIPIOS §2): sobre_grupo.
--   · Clave única: sobre_unico (casa, campo, coalesce(persona_id, '')) pasa a sobre_unico_ambito (casa, campo,
--     persona, grupo, semana, dia, comida) nulls not distinct (Postgres 15+; la base es 17.6). Más fina que la de
--     antes: toda fila de hoy la cumple. aplicar_operacion (0106) crea el sobre con «on conflict do nothing» sin
--     columnas, así que vale con el índice nuevo; escribir_persona (0108) actualiza y borra por campo y persona
--     solo alergias, edad y nacimiento, que no tienen ámbito.
--   · sobre_valor_valido: lo de la 0097 y, además, cada dimensión del sobre presente si y solo si está en el
--     ámbito de su campo (23514 si no).
--   · registro_campo se regenera entero desde REGISTRO_CAMPOS (src/lib/registroCampos.js), como en la 0105, la
--     0112 y la 0113: las 21 filas de antes con ambito '{}' y 6 nuevas de la ficha Rutina, con politica 'nunca':
--     schedule (persona; dia y comida; donde_come; defecto «casa»), slotType (casa; dia y comida; tipo_hueco,
--     lista nueva; defecto «normal»), menuWeekDays (casa; semana; lista de dias), mealStructureByGroup y
--     mealStructureCenaByGroup (casa; grupo; estructura_platos) y menuScheduleSameForAllWeeks (bool, defecto
--     true, sin ámbito). Con ámbito, tipo y defecto son los de un hueco. El INSERT lo compara registroCampos.test.js.
--
-- NO hace: no cambia aplicar_operacion, escribir_dato, deshacer_operacion ni ficha_casa (trozos 56 y 57); no toca
-- RLS ni permisos; no toca datos de familias (sin repoblar: estos campos siguen en el documento hasta los PR del
-- trozo 13).
--
-- Plan B (regla migraciones): ningún código escribe ni lee estos campos con sobre (registroFicha.js no los marca
-- «tabla:sobre»), y el código de staging escribe sobres sin ámbito, que el disparador sigue admitiendo en los
-- campos sin ámbito. Hasta la migración del trozo 56, aplicar_operacion no sabe de ámbito: un sobre de un campo
-- con ámbito escrito por él falla en alto (23514, la operación entera), y nadie lo pide aún. main (producción) no
-- usa ni sobre ni registro_campo.
--
-- Lectores (principio «ningún campo sin lector»): registro_campo.ambito y las columnas de ámbito las lee
-- sobre_valor_valido aquí; la migración del trozo 56 (escribir y deshacer) y la del 57 (ficha_casa) las leen
-- después; en el código, rutina.js (trozo 13).
--
-- Consulta previa (debe dar 21 y 0):
--   select (select count(*) from public.registro_campo),
--          (select count(*) from information_schema.columns where table_name = 'sobre' and column_name = 'dia');
-- Consulta después (debe dar 27 y 5): select count(*), count(*) filter (where cardinality(ambito) > 0) from public.registro_campo;
-- Objeto testigo: la columna public.sobre.dia y el índice public.sobre_unico_ambito.
set lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from public.registro_campo where id = 'meals') then
    raise exception 'Falta la 0113 (registro_campo sin meals): aplícala antes que la 0114';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'sobre' and column_name = 'dia') then
    raise exception 'sobre ya tiene dia: ¿la 0114 ya está aplicada?';
  end if;
end $$;

-- 1. registro_campo.ambito ----------------------------------------------------------

alter table public.registro_campo add column ambito text[];
alter table public.registro_campo
  add constraint registro_campo_ambito_vocabulario check (ambito <@ array['grupo', 'semana', 'dia', 'comida']) not valid;
-- Columna nueva, nula en las 21 filas: validar es inmediato.
alter table public.registro_campo
  validate constraint registro_campo_ambito_vocabulario;

comment on column public.registro_campo.ambito is 'Las dimensiones de cada sobre del campo (DIMENSIONES_AMBITO, vocabularios.js): grupo, semana, dia, comida, en ese orden; vacío = un sobre por sujeto. Lo lee sobre_valor_valido (y, con los trozos 56 y 57, aplicar_operacion y ficha_casa).';

-- Generado desde REGISTRO_CAMPOS; registroCampos.test.js falla si no coincide.
insert into public.registro_campo
  (id, tipo, vocabulario, minimo, maximo, politica, seguridad, por, aplica, columna, caduca_dias, ficha, clase, defecto, suposicion, minimo_para_generar, peso_menu, escribe, choque, ambito) values
  ('edad',                        'int',        null,                0,    120,  'nunca',           false, 'persona', 'todos', 'persona.edad',             null, 'persona', 'hecho', null,                       true,  false, null, 'familia', 'ultimo_gana',     '{}'::text[]),
  ('nacimiento',                  'fecha',      null,                null, null, 'nunca',           false, 'persona', 'todos', 'persona.fecha_nacimiento', null, 'persona', 'hecho', null,                       true,  false, null, 'familia', 'ultimo_gana',     '{}'::text[]),
  ('alergias',                    'lista_enum', 'alergenos',         null, null, 'una_vez',         true,  'persona', 'todos', 'persona_alergia',          30,   'persona', 'hecho', null,                       false, true,  90,   'familia', 'mas_restrictivo', '{}'::text[]),
  ('sexo',                        'enum',       'sexo',              null, null, 'nunca',           false, 'persona', 'todos', null,                       null, 'persona', 'hecho', null,                       true,  false, null, 'familia', 'ultimo_gana',     '{}'::text[]),
  ('colegio',                     'texto',      null,                null, null, 'nunca',           false, 'persona', 'todos', null,                       null, 'persona', 'hecho', null,                       true,  false, null, 'familia', 'ultimo_gana',     '{}'::text[]),
  ('patronSemanas',               'enum',       'patron_semanas',    null, null, 'nunca',           false, 'persona', 'todos', null,                       null, 'persona', 'hecho', null,                       true,  false, null, 'familia', 'ultimo_gana',     '{}'::text[]),
  ('menuModel',                   'enum',       'modelo_menu',       null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'casa',    'hecho', '"same"'::jsonb,            true,  false, null, 'familia', 'ultimo_gana',     '{}'::text[]),
  ('etapaBebe',                   'enum',       'etapa_bebe',        null, null, 'antes_de_usarlo', true,  'casa',    'bebe',  null,                       21,   'persona', 'hecho', null,                       false, false, null, 'familia', 'ultimo_gana',     '{}'::text[]),
  ('meals',                       'lista_enum', 'comidas',           null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'rutina',  'hecho', '["Comida","Cena"]'::jsonb, true,  false, 85,   'familia', 'ultimo_gana',     '{}'::text[]),
  ('schedule',                    'enum',       'donde_come',        null, null, 'nunca',           false, 'persona', 'todos', null,                       null, 'rutina',  'hecho', '"casa"'::jsonb,            true,  false, null, 'familia', 'ultimo_gana',     '{dia,comida}'::text[]),
  ('slotType',                    'enum',       'tipo_hueco',        null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'rutina',  'hecho', '"normal"'::jsonb,          true,  false, null, 'familia', 'ultimo_gana',     '{dia,comida}'::text[]),
  ('mealStructure',               'enum',       'estructura_platos', null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'rutina',  'hecho', '"primero_segundo"'::jsonb, true,  false, 55,   'familia', 'ultimo_gana',     '{}'::text[]),
  ('mealStructureCena',           'enum',       'estructura_platos', null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'rutina',  'hecho', '"1_plato"'::jsonb,         true,  false, null, 'familia', 'ultimo_gana',     '{}'::text[]),
  ('mealStructureByGroup',        'enum',       'estructura_platos', null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'rutina',  'hecho', null,                       true,  false, null, 'familia', 'ultimo_gana',     '{grupo}'::text[]),
  ('mealStructureCenaByGroup',    'enum',       'estructura_platos', null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'rutina',  'hecho', null,                       true,  false, null, 'familia', 'ultimo_gana',     '{grupo}'::text[]),
  ('menuWeekDays',                'lista_enum', 'dias',              null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'rutina',  'hecho', null,                       true,  true,  null, 'familia', 'ultimo_gana',     '{semana}'::text[]),
  ('menuScheduleSameForAllWeeks', 'bool',       null,                null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'rutina',  'hecho', 'true'::jsonb,              true,  false, null, 'familia', 'ultimo_gana',     '{}'::text[]),
  ('cookLevel',                   'enum',       'nivel_cocina',      null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'casa',    'hecho', '"normal"'::jsonb,          true,  false, 35,   'familia', 'ultimo_gana',     '{}'::text[]),
  ('kitchenTools',                'lista_enum', 'aparatos_casa',     null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'casa',    'hecho', null,                       true,  false, 30,   'familia', 'ultimo_gana',     '{}'::text[]),
  ('kitchenToolsNota',            'texto',      null,                null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'casa',    'hecho', null,                       true,  false, null, 'familia', 'ultimo_gana',     '{}'::text[]),
  ('tandaMinutos',                'int',        null,                30,   240,  'nunca',           false, 'casa',    'todos', null,                       null, 'rutina',  'hecho', null,                       true,  false, null, 'familia', 'ultimo_gana',     '{}'::text[]),
  ('diaTanda',                    'enum',       'dias',              null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'rutina',  'hecho', null,                       true,  false, null, 'familia', 'ultimo_gana',     '{}'::text[]),
  ('pantryMode',                  'enum',       'modo_despensa',     null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'casa',    'hecho', '"only"'::jsonb,            true,  false, 10,   'familia', 'ultimo_gana',     '{}'::text[]),
  ('supermarkets',                'lista_enum', 'supermercados',     null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'casa',    'hecho', null,                       true,  false, null, 'familia', 'ultimo_gana',     '{}'::text[]),
  ('supermarketsNota',            'texto',      null,                null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'casa',    'hecho', null,                       true,  false, null, 'familia', 'ultimo_gana',     '{}'::text[]),
  ('presupuesto',                 'int',        null,                0,    null, 'nunca',           false, 'casa',    'todos', null,                       null, 'casa',    'hecho', null,                       true,  false, 20,   'familia', 'ultimo_gana',     '{}'::text[]),
  ('wantsPriceEstimates',         'bool',       null,                null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'casa',    'hecho', 'false'::jsonb,             true,  false, null, 'familia', 'ultimo_gana',     '{}'::text[])
on conflict (id) do update set
  tipo = excluded.tipo, vocabulario = excluded.vocabulario,
  minimo = excluded.minimo, maximo = excluded.maximo, politica = excluded.politica,
  seguridad = excluded.seguridad, por = excluded.por,
  aplica = excluded.aplica, columna = excluded.columna, caduca_dias = excluded.caduca_dias,
  ficha = excluded.ficha, clase = excluded.clase, defecto = excluded.defecto, suposicion = excluded.suposicion,
  minimo_para_generar = excluded.minimo_para_generar, peso_menu = excluded.peso_menu,
  escribe = excluded.escribe, choque = excluded.choque, ambito = excluded.ambito;

-- Toda fila sale del INSERT: si alguna se quedó sin ámbito, no está en REGISTRO_CAMPOS, y falla aquí.
alter table public.registro_campo alter column ambito set not null;

-- 2. sobre: las columnas del ámbito y la clave única ---------------------------------

alter table public.sobre
  add column grupo_id text,
  add column semana date,
  add column dia text,
  add column comida text;

alter table public.sobre
  add constraint sobre_dia_vocabulario check (dia in ('Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom')) not valid,
  add constraint sobre_comida_vocabulario check (comida in ('Desayuno', 'Comida', 'Merienda', 'Cena', 'Postre')) not valid,
  add constraint sobre_semana_lunes check (extract(isodow from semana) = 1) not valid,
  add constraint sobre_grupo_fk foreign key (household_id, grupo_id)
    references public.grupo(household_id, id) on delete cascade not valid;
-- Columnas nuevas, nulas en toda fila: validar es inmediato.
alter table public.sobre
  validate constraint sobre_dia_vocabulario;
alter table public.sobre
  validate constraint sobre_comida_vocabulario;
alter table public.sobre
  validate constraint sobre_semana_lunes;
alter table public.sobre
  validate constraint sobre_grupo_fk;

create index sobre_grupo on public.sobre (household_id, grupo_id);

create unique index sobre_unico_ambito
  on public.sobre (household_id, campo, persona_id, grupo_id, semana, dia, comida) nulls not distinct;
drop index public.sobre_unico;

comment on column public.sobre.grupo_id is 'Ámbito: el grupo del dato (registro_campo.ambito con «grupo»); null si el campo no lo lleva. FK compuesta a grupo, en cascada.';
comment on column public.sobre.semana is 'Ámbito: el lunes de la semana del dato (registro_campo.ambito con «semana»); null si el campo no la lleva.';
comment on column public.sobre.dia is 'Ámbito: el día del dato, de DIAS (registro_campo.ambito con «dia»); null si el campo no lo lleva.';
comment on column public.sobre.comida is 'Ámbito: la comida del dato, de COMIDAS (registro_campo.ambito con «comida»); null si el campo no la lleva.';
comment on table public.sobre is
  'SALUD: la procedencia de cada dato de la ficha (quién lo dijo, cómo lo sabemos, cuándo, por qué canal y de qué operación), uno por casa, campo, persona y ámbito (grupo, semana, día y comida, según registro_campo.ambito; persona nula = la casa). Puede guardar el valor de datos de salud (alergias, etapa del bebé) cuando el campo no tiene columna propia (hoy, etapaBebe). Se borra con la persona, el grupo o la casa (cascada); sin plazo propio de conservación. La escriben aplicar_operacion y escribir_persona y la lee ficha_casa.';

-- 3. sobre_valor_valido: lo de la 0097, y el ámbito del campo -----------------------

create or replace function public.sobre_valor_valido()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  r public.registro_campo;
  v jsonb := new.valor;
  bien boolean;
begin
  select * into r from public.registro_campo where id = new.campo;
  if (r.por = 'persona') <> (new.persona_id is not null) then
    raise exception 'sobre: el campo % es de %, y la persona no cuadra', new.campo, r.por using errcode = '23514';
  end if;
  -- Cada dimensión, si y solo si el campo la tiene en su ámbito.
  if (new.grupo_id is not null) <> ('grupo' = any(r.ambito)) or (new.semana is not null) <> ('semana' = any(r.ambito))
     or (new.dia is not null) <> ('dia' = any(r.ambito)) or (new.comida is not null) <> ('comida' = any(r.ambito)) then
    raise exception 'sobre: el ámbito de % es {%}, y el sobre no cuadra', new.campo, array_to_string(r.ambito, ',') using errcode = '23514';
  end if;
  if r.columna is not null and new.valor is not null then
    raise exception 'sobre: % tiene columna propia (%), su valor no va en sobre', new.campo, r.columna using errcode = '23514';
  end if;
  if v is null or jsonb_typeof(v) = 'null' then return new; end if;
  -- En una variable: dentro de un IF, PL/pgSQL cortaría la condición en el primer THEN del CASE.
  bien := case r.tipo
    when 'int'        then jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric = trunc((v #>> '{}')::numeric)
    when 'decimal'    then jsonb_typeof(v) = 'number'
    when 'bool'       then jsonb_typeof(v) = 'boolean'
    when 'fecha'      then jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^\d{4}-\d{2}-\d{2}$'
    when 'lista_enum' then jsonb_typeof(v) = 'array'
                           and not exists (select 1 from jsonb_array_elements(v) e where jsonb_typeof(e) <> 'string')
    else jsonb_typeof(v) = 'string'      -- enum, ref, texto
  end;
  if not bien then
    raise exception 'sobre: el valor no es de tipo % para %', r.tipo, new.campo using errcode = '23514';
  end if;
  -- Tope de 50 elementos a las listas.
  if jsonb_typeof(v) = 'array' and jsonb_array_length(v) > 50 then
    raise exception 'sobre: más de 50 elementos para %', new.campo using errcode = '23514';
  end if;
  -- Tope de 200 caracteres a cada texto (el valor entero o cada elemento de una lista).
  if exists (select 1 from jsonb_path_query(v, '$.** ? (@.type() == "string")') t where char_length(t #>> '{}') > 200) then
    raise exception 'sobre: texto de más de 200 caracteres para %', new.campo using errcode = '23514';
  end if;
  if r.tipo in ('int', 'decimal') and (
       (r.minimo is not null and (v #>> '{}')::numeric < r.minimo) or
       (r.maximo is not null and (v #>> '{}')::numeric > r.maximo)) then
    raise exception 'sobre: valor fuera de rango para %', new.campo using errcode = '23514';
  end if;
  return new;
end $$;

-- 4. Autoprueba (se deshace siempre) -------------------------------------------------
-- En una casa de prueba que crea aquí: dos días del mismo campo y persona son dos sobres; el mismo hueco dos veces
-- choca con la clave; un sobre sin el ámbito de su campo, con uno que su campo no tiene, con una semana que no
-- empieza en lunes o con un día de fuera de la lista se rechaza; el de un grupo se va con el grupo; y el registro
-- tiene sus 27 filas, 5 con ámbito.
do $$
declare
  v_dueno uuid; v_casa uuid; v_n int; v_total int; v_con int;
begin
  select count(*), count(*) filter (where cardinality(ambito) > 0) into v_total, v_con from public.registro_campo;
  if v_total <> 27 or v_con <> 5 then
    raise exception '0114 autoprueba: registro_campo tiene % filas (% con ámbito); se esperaban 27 y 5', v_total, v_con;
  end if;
  select owner_user_id into v_dueno from public.households order by created_at limit 1;
  if v_dueno is null then raise notice '0114 autoprueba: no hay ninguna casa, no se prueba el sobre'; return; end if;
  begin
    insert into public.households (name, owner_user_id, propia) values ('Autoprueba 0114', v_dueno, false) returning id into v_casa;
    insert into public.persona (household_id, id, nombre) values (v_casa, 'p_autoprueba_0114', 'Prueba');
    insert into public.grupo (household_id, id, nombre) values (v_casa, 'g_autoprueba_0114', 'Peques');
    insert into public.sobre (household_id, persona_id, campo, dia, comida, valor, origen, canal) values
      (v_casa, 'p_autoprueba_0114', 'schedule', 'Lun', 'Comida', '"fuera"', 'dicho', 'sistema'),
      (v_casa, 'p_autoprueba_0114', 'schedule', 'Mar', 'Comida', '"cole"', 'dicho', 'sistema');
    insert into public.sobre (household_id, campo, grupo_id, valor, origen, canal)
      values (v_casa, 'mealStructureByGroup', 'g_autoprueba_0114', '"1_plato"', 'dicho', 'sistema');
    insert into public.sobre (household_id, campo, semana, valor, origen, canal)
      values (v_casa, 'menuWeekDays', date '2026-11-02', '["Lun", "Mar"]', 'dicho', 'sistema');
    insert into public.sobre (household_id, campo, valor, origen, canal)
      values (v_casa, 'menuScheduleSameForAllWeeks', 'false', 'dicho', 'sistema');
    begin
      insert into public.sobre (household_id, persona_id, campo, dia, comida, valor, origen, canal)
        values (v_casa, 'p_autoprueba_0114', 'schedule', 'Lun', 'Comida', '"casa"', 'dicho', 'sistema');
      raise exception '0114 autoprueba: el mismo hueco entró dos veces';
    exception when unique_violation then null;  -- a propósito: la clave única es lo que se prueba
    end;
    begin
      insert into public.sobre (household_id, persona_id, campo, dia, valor, origen, canal)
        values (v_casa, 'p_autoprueba_0114', 'schedule', 'Mié', '"casa"', 'dicho', 'sistema');
      raise exception '0114 autoprueba: entró un sobre sin la comida de su ámbito';
    exception when check_violation then null;  -- a propósito: sobre_valor_valido lo rechaza (23514)
    end;
    begin
      insert into public.sobre (household_id, campo, dia, valor, origen, canal)
        values (v_casa, 'meals', 'Lun', '["Comida"]', 'dicho', 'sistema');
      raise exception '0114 autoprueba: entró un día en un campo sin ámbito';
    exception when check_violation then null;  -- a propósito: sobre_valor_valido lo rechaza (23514)
    end;
    begin
      insert into public.sobre (household_id, campo, semana, valor, origen, canal)
        values (v_casa, 'menuWeekDays', date '2026-11-03', '["Mar"]', 'dicho', 'sistema');
      raise exception '0114 autoprueba: entró una semana que no empieza en lunes';
    exception when check_violation then null;  -- a propósito: sobre_semana_lunes lo rechaza
    end;
    begin
      insert into public.sobre (household_id, persona_id, campo, dia, comida, valor, origen, canal)
        values (v_casa, 'p_autoprueba_0114', 'schedule', 'Lunes', 'Comida', '"casa"', 'dicho', 'sistema');
      raise exception '0114 autoprueba: entró un día de fuera de DIAS';
    exception when check_violation then null;  -- a propósito: sobre_dia_vocabulario lo rechaza
    end;
    delete from public.grupo where household_id = v_casa and id = 'g_autoprueba_0114';
    select count(*) into v_n from public.sobre where household_id = v_casa;
    if v_n <> 4 or exists (select 1 from public.sobre where household_id = v_casa and campo = 'mealStructureByGroup') then
      raise exception '0114 autoprueba: quedan % sobres (se esperaban 4) o el del grupo borrado sigue', v_n;
    end if;

    raise exception 'autoprueba 0114 bien' using errcode = 'MP114';
  exception when sqlstate 'MP114' then
    raise notice '0114 autoprueba: un sobre por hueco, el mismo hueco choca, el ámbito del campo se exige, la semana empieza en lunes, el día es de la lista y el del grupo se va con él (deshecho)';
  end;
end $$;
