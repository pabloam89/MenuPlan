-- Las franjas de fuera del menú en el registro (plan fichas con estado, trozo 19, primera parte; #1037): desayuno,
-- merienda y postre dejan el objeto data.extraMeals del documento de la casa y pasan a un dato por franja con ámbito
-- día (un sobre por día que la tiene), como el trozo 13 hizo con el horario. Ganan su fila en registro_campo, con
-- por = 'casa' y ficha 'rutina': desayunoDias, meriendaDias y postreDias (ámbito {dia}) y desayunoRepite (sin
-- ámbito). Sin fila, sobre.campo (FK a registro_campo) no admite ninguno y ficha_casa no los devuelve.
--
--   · Solo filas: registro_campo se regenera entera desde REGISTRO_CAMPOS (src/lib/registroCampos.js), como en la
--     0105, la 0112, la 0113, la 0114 y la 0119: las 30 filas de hoy quedan igual y entran 4. El INSERT de aquí lo
--     compara registroCampos.test.js. No hace falta columna, CHECK ni función nueva: sobre (0114) ya tiene `dia`
--     con el CHECK de DIAS, sobre_valor_valido exige el ámbito de cada campo y su tipo (bool, o texto en un enum),
--     y aplicar_operacion (0115) y ficha_casa (0116) leen el ámbito del registro.
--   · Los vocabularios viven en src/lib/vocabularios.js (registro_campo.vocabulario guarda su nombre, sin FK ni
--     CHECK de valores; escribirDato.js pasa cada valor por su lista): repite_desayuno (variado, findes, igual) y
--     postre_en (comida, cena, ambas). «off» no es valor: un día sin la franja es un día sin sobre.
--   · desayunoDias y meriendaDias (bool, {dia}): true el día que hay desayuno o merienda. postreDias (enum
--     postre_en, {dia}): a qué comida va el postre ese día. Sin defecto: sin sobres, ninguna franja (lo de una casa
--     nueva, EXTRAS_POR_DEFECTO). desayunoRepite (enum, sin ámbito): cómo se repite el desayuno; defecto variado.
--   · politica 'nunca' en las 4: ninguna tarea las pregunta (bot_tareas.campo, 0080, no cambia).
--   · postreTipo y postreInmediato, los otros dos valores de extraMeals, no entran: son preferencias sobre los ejes
--     esfuerzoPostre y tipoPostre (src/data/axisRegistry.js) y van a la tabla preferencia, no a registro_campo.
--
-- NO hace: no toca sobre, household_state ni ningún dato de familias (sin repoblar: con la rama desplegada y esta
-- aplicada, las casas estrenan las franjas vacías, «sin convivencia» del plan); no cambia columnas, CHECK,
-- funciones, RLS ni permisos. Sin CONTRAE.
--
-- Plan B (regla migraciones): la rama se despliega antes. Sin esta, ficha_casa no trae las cuatro y la app y Lola
-- siguen leyendo y guardando desayuno, merienda y postre en data.extraMeals (CON_PLAN_B, src/lib/estadoDeDato.js).
-- Va tras la 0119 (las filas del trato), que comprueba abajo: si no, la 0132 metería también esas 4.
--
-- Lectores (principio «ningún campo sin lector»): ficha_casa v2 (0116) devuelve todo campo por = 'casa' con su
-- base y un elemento por sobre vigente, agrupado en su ficha («rutina»); aplicar_operacion (0115) los valida al
-- escribir; en el código, leidosConSobre (src/lib/estadoDeDato.js) para la app (casaDatos.js) y Lola
-- (api/_bot/casa.js), y src/lib/extras.js, que los vuelve la vista data.extraMeals que leen el motor, la pizarra y
-- el asistente.
--
-- Consulta previa (debe dar 30 y 0):
--   select (select count(*) from public.registro_campo),
--          (select count(*) from public.registro_campo where id in ('desayunoDias','desayunoRepite','meriendaDias','postreDias'));
-- Consulta después (debe dar 34 y 4). Sin objeto testigo (solo filas): verificar-estado no la ve; se mira con la
-- consulta de después.
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
