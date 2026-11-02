-- Los campos de la ficha Rutina sin ámbito en el registro (plan fichas con estado, trozo 13, PR 1; #1037): meals,
-- mealStructure, mealStructureCena, tandaMinutos y diaTanda ganan su fila en registro_campo, con por = 'casa' y
-- ficha 'rutina'. Sin fila, sobre.campo (FK a registro_campo) no admite ninguno y la casa no puede guardarlos con
-- sobre. Los de la rutina con ámbito (quién come dónde, tiempo por día y comida, días por semana) no van aquí:
-- sobre no tiene ámbito (su clave única es casa, campo y persona) y darle uno es otra migración.
-- AUDITADA: auditor-datos 2026-11-02 OK
--
--   · registro_campo se regenera entero desde REGISTRO_CAMPOS (src/lib/registroCampos.js), como en la 0105 y
--     la 0112: las 16 filas de antes quedan igual y entran 5. El INSERT de aquí lo compara registroCampos.test.js.
--   · Los vocabularios ya viven en src/lib/vocabularios.js (registro_campo.vocabulario guarda su nombre, sin FK
--     ni CHECK de valores): comidas, estructura_platos y dias. escribirDato.js pasa cada valor por su lista.
--   · meals (lista_enum, comidas): las comidas que se planifican; defecto ["Comida","Cena"], como INITIAL_DATA.
--   · mealStructure y mealStructureCena (enum, estructura_platos): uno o dos platos a mediodía y en la cena;
--     defectos primero_segundo y 1_plato, como INITIAL_DATA.
--   · tandaMinutos (int, de 30 a 240): los minutos de manos de la sesión de tanda (TANDA_MIN y TANDA_MAX de
--     cookTime.js); sin defecto.
--   · diaTanda (enum, dias): el día en que se cocina la tanda; sin defecto (sin él, el domingo).
--   · politica 'nunca' en las 5: ninguna tarea las pregunta (bot_tareas.campo, 0080, no cambia).
--
-- NO hace: no toca household_state, sobre ni ningún dato de familias (sin repoblar: mientras el código no los
-- lea del sobre siguen en el documento); no cambia columnas, CHECK, funciones ni permisos.
--
-- Plan B (regla migraciones): ningún código escribe todavía estos campos con sobre (lo harán los PR siguientes del
-- trozo 13, cada uno con su plan B por carga, como en el 12). Desplegar la rama antes que la migración no rompe
-- nada. Va tras la 0112 (lo comprueba abajo): si no, la 0113 metería también las filas de la ficha Casa.
--
-- Lectores (principio «ningún campo sin lector»): ficha_casa v2 (0107) devuelve todo campo por = 'casa' con su
-- sobre o su defecto, agrupado en su ficha («rutina»); aplicar_operacion (0106) los valida al escribir. El lector
-- de código llega con el PR siguiente del trozo 13 (la ficha «rutina» en leerDatosDeCasa, api/_bot/datos.js).
--
-- Consulta previa (debe dar 16 y 0):
--   select (select count(*) from public.registro_campo),
--          (select count(*) from public.registro_campo where ficha = 'rutina');
-- Consulta después (debe dar 21 y 5). Sin objeto testigo (solo filas): verificar-estado no la ve; se mira con la
-- consulta de después.
set lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from public.registro_campo where id = 'menuModel') then
    raise exception 'Falta la 0112 (registro_campo sin menuModel): aplícala antes que la 0113';
  end if;
end $$;

-- Generado desde REGISTRO_CAMPOS; registroCampos.test.js falla si no coincide.
insert into public.registro_campo
  (id, tipo, vocabulario, minimo, maximo, politica, seguridad, por, aplica, columna, caduca_dias, ficha, clase, defecto, suposicion, minimo_para_generar, peso_menu, escribe, choque) values
  ('edad',                'int',        null,                0,    120,  'nunca',           false, 'persona', 'todos', 'persona.edad',             null, 'persona', 'hecho', null,                       true,  false, null, 'familia', 'ultimo_gana'),
  ('nacimiento',          'fecha',      null,                null, null, 'nunca',           false, 'persona', 'todos', 'persona.fecha_nacimiento', null, 'persona', 'hecho', null,                       true,  false, null, 'familia', 'ultimo_gana'),
  ('alergias',            'lista_enum', 'alergenos',         null, null, 'una_vez',         true,  'persona', 'todos', 'persona_alergia',          30,   'persona', 'hecho', null,                       false, true,  90,   'familia', 'mas_restrictivo'),
  ('sexo',                'enum',       'sexo',              null, null, 'nunca',           false, 'persona', 'todos', null,                       null, 'persona', 'hecho', null,                       true,  false, null, 'familia', 'ultimo_gana'),
  ('colegio',             'texto',      null,                null, null, 'nunca',           false, 'persona', 'todos', null,                       null, 'persona', 'hecho', null,                       true,  false, null, 'familia', 'ultimo_gana'),
  ('patronSemanas',       'enum',       'patron_semanas',    null, null, 'nunca',           false, 'persona', 'todos', null,                       null, 'persona', 'hecho', null,                       true,  false, null, 'familia', 'ultimo_gana'),
  ('menuModel',           'enum',       'modelo_menu',       null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'casa',    'hecho', '"same"'::jsonb,            true,  false, null, 'familia', 'ultimo_gana'),
  ('etapaBebe',           'enum',       'etapa_bebe',        null, null, 'antes_de_usarlo', true,  'casa',    'bebe',  null,                       21,   'persona', 'hecho', null,                       false, false, null, 'familia', 'ultimo_gana'),
  ('meals',               'lista_enum', 'comidas',           null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'rutina',  'hecho', '["Comida","Cena"]'::jsonb, true,  false, 85,   'familia', 'ultimo_gana'),
  ('mealStructure',       'enum',       'estructura_platos', null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'rutina',  'hecho', '"primero_segundo"'::jsonb, true,  false, 55,   'familia', 'ultimo_gana'),
  ('mealStructureCena',   'enum',       'estructura_platos', null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'rutina',  'hecho', '"1_plato"'::jsonb,         true,  false, null, 'familia', 'ultimo_gana'),
  ('cookLevel',           'enum',       'nivel_cocina',      null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'casa',    'hecho', '"normal"'::jsonb,          true,  false, 35,   'familia', 'ultimo_gana'),
  ('kitchenTools',        'lista_enum', 'aparatos_casa',     null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'casa',    'hecho', null,                       true,  false, 30,   'familia', 'ultimo_gana'),
  ('kitchenToolsNota',    'texto',      null,                null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'casa',    'hecho', null,                       true,  false, null, 'familia', 'ultimo_gana'),
  ('tandaMinutos',        'int',        null,                30,   240,  'nunca',           false, 'casa',    'todos', null,                       null, 'rutina',  'hecho', null,                       true,  false, null, 'familia', 'ultimo_gana'),
  ('diaTanda',            'enum',       'dias',              null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'rutina',  'hecho', null,                       true,  false, null, 'familia', 'ultimo_gana'),
  ('pantryMode',          'enum',       'modo_despensa',     null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'casa',    'hecho', '"only"'::jsonb,            true,  false, 10,   'familia', 'ultimo_gana'),
  ('supermarkets',        'lista_enum', 'supermercados',     null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'casa',    'hecho', null,                       true,  false, null, 'familia', 'ultimo_gana'),
  ('supermarketsNota',    'texto',      null,                null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'casa',    'hecho', null,                       true,  false, null, 'familia', 'ultimo_gana'),
  ('presupuesto',         'int',        null,                0,    null, 'nunca',           false, 'casa',    'todos', null,                       null, 'casa',    'hecho', null,                       true,  false, 20,   'familia', 'ultimo_gana'),
  ('wantsPriceEstimates', 'bool',       null,                null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'casa',    'hecho', 'false'::jsonb,             true,  false, null, 'familia', 'ultimo_gana')
on conflict (id) do update set
  tipo = excluded.tipo, vocabulario = excluded.vocabulario,
  minimo = excluded.minimo, maximo = excluded.maximo, politica = excluded.politica,
  seguridad = excluded.seguridad, por = excluded.por,
  aplica = excluded.aplica, columna = excluded.columna, caduca_dias = excluded.caduca_dias,
  ficha = excluded.ficha, clase = excluded.clase, defecto = excluded.defecto, suposicion = excluded.suposicion,
  minimo_para_generar = excluded.minimo_para_generar, peso_menu = excluded.peso_menu,
  escribe = excluded.escribe, choque = excluded.choque;

-- Autoprueba: las 21 filas, las 5 de la rutina y las 9 de la casa; si no, se deshace todo.
do $$
declare v_total int; v_rutina int; v_casa int;
begin
  select count(*), count(*) filter (where ficha = 'rutina' and por = 'casa'), count(*) filter (where ficha = 'casa' and por = 'casa')
    into v_total, v_rutina, v_casa from public.registro_campo;
  if v_total <> 21 or v_rutina <> 5 or v_casa <> 9 then
    raise exception '0113 autoprueba: registro_campo tiene % filas (% de la rutina, % de la casa); se esperaban 21, 5 y 9', v_total, v_rutina, v_casa;
  end if;
end $$;
