-- Las franjas de fuera del menú en el registro (plan fichas con estado, trozo 19, primera parte; #1037): desayuno,
-- merienda y postre dejan data.extraMeals del documento de la casa y pasan a un dato por franja con ámbito día (un
-- sobre por día que la tiene), como el trozo 13 con el horario. Ganan su fila en registro_campo (por = 'casa', ficha
-- 'rutina'): desayunoDias, meriendaDias y postreDias (ámbito {dia}) y desayunoRepite (sin ámbito).
-- AUDITADA: auditor-datos 2026-11-05 OK
--   (un agente que no la escribió: las 30 filas de antes, iguales; encaja con los CHECK, sobre_valor_valido,
--   aplicar_operacion y ficha_casa sin tocarlas; SQL válido en PG17; plan B real; sin datos de familias, RLS ni permisos)
--
--   · Solo filas: registro_campo se regenera entera desde REGISTRO_CAMPOS (src/lib/registroCampos.js), como en la
--     0119: las 30 de hoy igual y entran 4 (registroCampos.test.js lo compara). Ni columna, ni CHECK, ni función:
--     sobre (0114) ya tiene `dia`, sobre_valor_valido exige el ámbito y el tipo, y la 0115 y la 0116 leen el ámbito.
--   · Vocabularios en src/lib/vocabularios.js (registro_campo.vocabulario guarda su nombre): repite_desayuno
--     (variado, findes, igual) y postre_en (comida, cena, ambas). «off» no es valor: un día sin franja, sin sobre.
--   · desayunoDias y meriendaDias (bool): true el día que la hay. postreDias: a qué comida va ese día. Sin defecto
--     (sin sobres, ninguna franja). desayunoRepite: cómo se repite el desayuno; defecto variado. Política 'nunca'.
--   · postreTipo y postreInmediato no entran: son preferencias sobre los ejes esfuerzoPostre y tipoPostre
--     (src/data/axisRegistry.js) y van a la tabla preferencia.
--
-- NO hace: no toca sobre, household_state ni datos de familias (sin repoblar: las casas estrenan las franjas
-- vacías, «sin convivencia» del plan); ni columnas, CHECK, funciones, RLS ni permisos. Sin CONTRAE.
--
-- Plan B: la rama se despliega antes. Sin esta, ficha_casa no trae ninguna de las cuatro y la app y Lola siguen con
-- data.extraMeals en el documento (CON_PLAN_B, src/lib/estadoDeDato.js). Va tras la 0119, que comprueba abajo.
--
-- Lectores: ficha_casa v2 (0116); aplicar_operacion (0115) al escribir; leidosConSobre (estadoDeDato.js) para la
-- app (casaDatos.js) y Lola (api/_bot/casa.js), y extras.js, que monta la vista data.extraMeals que lee el motor.
--
-- Consulta previa (debe dar 30 y 0); después, 34 y 4. Sin objeto testigo (solo filas):
--   select (select count(*) from public.registro_campo),
--          (select count(*) from public.registro_campo where id in ('desayunoDias','desayunoRepite','meriendaDias','postreDias'));
set lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from public.registro_campo where id = 'tratoRitmo') then
    raise exception 'Falta la 0119 (registro_campo sin tratoRitmo): aplícala antes que la 0132';
  end if;
end $$;

-- Generado desde REGISTRO_CAMPOS; registroCampos.test.js falla si no coincide.
insert into public.registro_campo
  (id, tipo, vocabulario, minimo, maximo, politica, seguridad, por, aplica, columna, caduca_dias, ficha, clase, defecto, suposicion, minimo_para_generar, peso_menu, escribe, choque, ambito) values
  ('edad',                        'int',        null,                  0,    120,  'nunca',           false, 'persona', 'todos', 'persona.edad',             null, 'persona', 'hecho', null,                       true,  false, null, 'familia', 'ultimo_gana',     '{}'::text[]),
  ('nacimiento',                  'fecha',      null,                  null, null, 'nunca',           false, 'persona', 'todos', 'persona.fecha_nacimiento', null, 'persona', 'hecho', null,                       true,  false, null, 'familia', 'ultimo_gana',     '{}'::text[]),
  ('alergias',                    'lista_enum', 'alergenos',           null, null, 'una_vez',         true,  'persona', 'todos', 'persona_alergia',          30,   'persona', 'hecho', null,                       false, true,  90,   'familia', 'mas_restrictivo', '{}'::text[]),
  ('sexo',                        'enum',       'sexo',                null, null, 'nunca',           false, 'persona', 'todos', null,                       null, 'persona', 'hecho', null,                       true,  false, null, 'familia', 'ultimo_gana',     '{}'::text[]),
  ('colegio',                     'texto',      null,                  null, null, 'nunca',           false, 'persona', 'todos', null,                       null, 'persona', 'hecho', null,                       true,  false, null, 'familia', 'ultimo_gana',     '{}'::text[]),
  ('patronSemanas',               'enum',       'patron_semanas',      null, null, 'nunca',           false, 'persona', 'todos', null,                       null, 'persona', 'hecho', null,                       true,  false, null, 'familia', 'ultimo_gana',     '{}'::text[]),
  ('tratoRitmo',                  'enum',       'ritmos_trato',        null, null, 'nunca',           false, 'persona', 'todos', null,                       null, 'trato',   'hecho', '"guiado"'::jsonb,          true,  false, null, 'familia', 'ultimo_gana',     '{}'::text[]),
  ('tratoProfundidad',            'enum',       'profundidades_trato', null, null, 'nunca',           false, 'persona', 'todos', null,                       null, 'trato',   'hecho', '"preguntar"'::jsonb,       true,  false, null, 'familia', 'ultimo_gana',     '{}'::text[]),
  ('tratoFotos',                  'bool',       null,                  null, null, 'nunca',           false, 'persona', 'todos', null,                       null, 'trato',   'hecho', 'true'::jsonb,              true,  false, null, 'familia', 'ultimo_gana',     '{}'::text[]),
  ('tratoLargo',                  'enum',       'largos_trato',        null, null, 'nunca',           false, 'persona', 'todos', null,                       null, 'trato',   'hecho', '"corto"'::jsonb,           true,  false, null, 'familia', 'ultimo_gana',     '{}'::text[]),
  ('menuModel',                   'enum',       'modelo_menu',         null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'casa',    'hecho', '"same"'::jsonb,            true,  false, null, 'familia', 'ultimo_gana',     '{}'::text[]),
  ('etapaBebe',                   'enum',       'etapa_bebe',          null, null, 'antes_de_usarlo', true,  'casa',    'bebe',  null,                       21,   'persona', 'hecho', null,                       false, false, null, 'familia', 'ultimo_gana',     '{}'::text[]),
  ('meals',                       'lista_enum', 'comidas',             null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'rutina',  'hecho', '["Comida","Cena"]'::jsonb, true,  false, 85,   'familia', 'ultimo_gana',     '{}'::text[]),
  ('desayunoDias',                'bool',       null,                  null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'rutina',  'hecho', null,                       true,  false, null, 'familia', 'ultimo_gana',     '{dia}'::text[]),
  ('desayunoRepite',              'enum',       'repite_desayuno',     null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'rutina',  'hecho', '"variado"'::jsonb,         true,  false, null, 'familia', 'ultimo_gana',     '{}'::text[]),
  ('meriendaDias',                'bool',       null,                  null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'rutina',  'hecho', null,                       true,  false, null, 'familia', 'ultimo_gana',     '{dia}'::text[]),
  ('postreDias',                  'enum',       'postre_en',           null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'rutina',  'hecho', null,                       true,  false, null, 'familia', 'ultimo_gana',     '{dia}'::text[]),
  ('schedule',                    'enum',       'donde_come',          null, null, 'nunca',           false, 'persona', 'todos', null,                       null, 'rutina',  'hecho', '"casa"'::jsonb,            true,  false, null, 'familia', 'ultimo_gana',     '{dia,comida}'::text[]),
  ('slotType',                    'enum',       'tipo_hueco',          null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'rutina',  'hecho', null,                       true,  false, null, 'familia', 'ultimo_gana',     '{dia,comida}'::text[]),
  ('mealStructure',               'enum',       'estructura_platos',   null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'rutina',  'hecho', '"primero_segundo"'::jsonb, true,  false, 55,   'familia', 'ultimo_gana',     '{}'::text[]),
  ('mealStructureCena',           'enum',       'estructura_platos',   null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'rutina',  'hecho', '"1_plato"'::jsonb,         true,  false, null, 'familia', 'ultimo_gana',     '{}'::text[]),
  ('mealStructureByGroup',        'enum',       'estructura_platos',   null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'rutina',  'hecho', null,                       true,  false, null, 'familia', 'ultimo_gana',     '{grupo}'::text[]),
  ('mealStructureCenaByGroup',    'enum',       'estructura_platos',   null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'rutina',  'hecho', null,                       true,  false, null, 'familia', 'ultimo_gana',     '{grupo}'::text[]),
  ('menuWeekDays',                'lista_enum', 'dias',                null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'rutina',  'hecho', null,                       true,  true,  null, 'familia', 'ultimo_gana',     '{semana}'::text[]),
  ('menuScheduleSameForAllWeeks', 'bool',       null,                  null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'rutina',  'hecho', 'true'::jsonb,              true,  false, null, 'familia', 'ultimo_gana',     '{}'::text[]),
  ('cookLevel',                   'enum',       'nivel_cocina',        null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'casa',    'hecho', '"normal"'::jsonb,          true,  false, 35,   'familia', 'ultimo_gana',     '{}'::text[]),
  ('kitchenTools',                'lista_enum', 'aparatos_casa',       null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'casa',    'hecho', null,                       true,  false, 30,   'familia', 'ultimo_gana',     '{}'::text[]),
  ('kitchenToolsNota',            'texto',      null,                  null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'casa',    'hecho', null,                       true,  false, null, 'familia', 'ultimo_gana',     '{}'::text[]),
  ('tandaMinutos',                'int',        null,                  30,   240,  'nunca',           false, 'casa',    'todos', null,                       null, 'rutina',  'hecho', null,                       true,  false, null, 'familia', 'ultimo_gana',     '{}'::text[]),
  ('diaTanda',                    'enum',       'dias',                null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'rutina',  'hecho', null,                       true,  false, null, 'familia', 'ultimo_gana',     '{}'::text[]),
  ('pantryMode',                  'enum',       'modo_despensa',       null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'casa',    'hecho', '"only"'::jsonb,            true,  false, 10,   'familia', 'ultimo_gana',     '{}'::text[]),
  ('supermarkets',                'lista_enum', 'supermercados',       null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'casa',    'hecho', null,                       true,  false, null, 'familia', 'ultimo_gana',     '{}'::text[]),
  ('supermarketsNota',            'texto',      null,                  null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'casa',    'hecho', null,                       true,  false, null, 'familia', 'ultimo_gana',     '{}'::text[]),
  ('wantsPriceEstimates',         'bool',       null,                  null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'casa',    'hecho', 'false'::jsonb,             true,  false, null, 'familia', 'ultimo_gana',     '{}'::text[])

on conflict (id) do update set
  tipo = excluded.tipo, vocabulario = excluded.vocabulario,
  minimo = excluded.minimo, maximo = excluded.maximo, politica = excluded.politica,
  seguridad = excluded.seguridad, por = excluded.por,
  aplica = excluded.aplica, columna = excluded.columna, caduca_dias = excluded.caduca_dias,
  ficha = excluded.ficha, clase = excluded.clase, defecto = excluded.defecto, suposicion = excluded.suposicion,
  minimo_para_generar = excluded.minimo_para_generar, peso_menu = excluded.peso_menu,
  escribe = excluded.escribe, choque = excluded.choque, ambito = excluded.ambito;

-- Autoprueba: las 34 filas, y las 4 de las franjas con su tipo, su lista, su ámbito y su defecto; si no, se deshace todo.
do $$
declare v_total int; v_franjas int;
begin
  select count(*) into v_total from public.registro_campo;
  select count(*) into v_franjas from public.registro_campo
   where ficha = 'rutina' and por = 'casa' and politica = 'nunca'
     and (id, tipo, coalesce(vocabulario, ''), ambito, coalesce(defecto, 'null'::jsonb)) in (
       ('desayunoDias',   'bool', '',                '{dia}'::text[], 'null'::jsonb),
       ('desayunoRepite', 'enum', 'repite_desayuno', '{}'::text[],    '"variado"'::jsonb),
       ('meriendaDias',   'bool', '',                '{dia}'::text[], 'null'::jsonb),
       ('postreDias',     'enum', 'postre_en',       '{dia}'::text[], 'null'::jsonb));
  if v_total <> 34 or v_franjas <> 4 then
    raise exception '0132 autoprueba: registro_campo tiene % filas (% de las franjas); se esperaban 34 y 4', v_total, v_franjas;
  end if;
end $$;
