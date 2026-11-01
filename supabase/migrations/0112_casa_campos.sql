-- Los campos de la ficha Casa en el registro (plan fichas con estado, trozo 12, PR 2; #1037): menuModel,
-- kitchenTools (con su nota), cookLevel, supermarkets (con su nota), presupuesto, wantsPriceEstimates y
-- pantryMode ganan su fila en registro_campo, con por = 'casa' y ficha 'casa'. Sin fila, sobre.campo (FK a
-- registro_campo) no admite ninguno de ellos y la casa no puede guardarlos con sobre.
-- AUDITADA: auditor-datos 2026-11-01 OK
--
--   · registro_campo se regenera entero desde REGISTRO_CAMPOS (src/lib/registroCampos.js), como en la 0097
--     y la 0105: las 7 filas de antes quedan igual y entran 9. El INSERT de aquí lo compara
--     registroCampos.test.js.
--   · Los vocabularios viven en JS (registro_campo.vocabulario guarda su nombre, sin FK ni CHECK de valores):
--     aparatos_casa, supermercados y modo_despensa son nuevos en src/lib/vocabularios.js; modelo_menu y
--     nivel_cocina ya estaban. escribirDato.js pasa cada valor por su lista antes de llamar a aplicar_operacion.
--   · kitchenToolsNota y supermarketsNota (texto): el nombre de lo que va como «Otro» en su lista.
--   · presupuesto (int, mínimo 0): euros por semana; sin sobre = sin presupuesto. Junta hasBudget y budget.
--   · politica 'nunca' en las 9: ninguna tarea las pregunta (bot_tareas.campo, 0080, no cambia).
--
-- NO hace: no toca household_state, sobre ni ningún dato de familias (sin repoblar: las casas estrenan estos
-- campos vacíos o con su defecto); no cambia columnas, CHECK, funciones ni permisos.
--
-- Plan B (regla migraciones): ningún código escribe todavía estos campos con sobre (lo hacen los PR 3 a 9 del
-- trozo 12, cada uno con su plan B por carga). Desplegar la rama antes que la migración no rompe nada.
--
-- Lectores (principio «ningún campo sin lector»): ficha_casa v2 (0107) devuelve todo campo por = 'casa' con
-- su sobre o su defecto; aplicar_operacion (0106) los valida al escribir. El lector de código llega con el
-- PR 3 del trozo 12 (casaDatos.js).
--
-- Consulta previa (debe dar 7 y 0):
--   select (select count(*) from public.registro_campo),
--          (select count(*) from public.registro_campo where ficha = 'casa');
-- Consulta después (debe dar 16 y 9). Sin objeto testigo (solo filas): verificar-estado no la ve; se mira
-- con la consulta de después.
set lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'registro_campo' and column_name = 'ficha') then
    raise exception 'Falta la 0105 (registro_campo.ficha): aplícala antes que la 0112';
  end if;
end $$;

-- Generado desde REGISTRO_CAMPOS; registroCampos.test.js falla si no coincide.
insert into public.registro_campo
  (id, tipo, vocabulario, minimo, maximo, politica, seguridad, por, aplica, columna, caduca_dias, ficha, clase, defecto, suposicion, minimo_para_generar, peso_menu, escribe, choque) values
  ('edad',                'int',        null,             0,    120,  'nunca',           false, 'persona', 'todos', 'persona.edad',             null, 'persona', 'hecho', null,              true,  false, null, 'familia', 'ultimo_gana'),
  ('nacimiento',          'fecha',      null,             null, null, 'nunca',           false, 'persona', 'todos', 'persona.fecha_nacimiento', null, 'persona', 'hecho', null,              true,  false, null, 'familia', 'ultimo_gana'),
  ('alergias',            'lista_enum', 'alergenos',      null, null, 'una_vez',         true,  'persona', 'todos', 'persona_alergia',          30,   'persona', 'hecho', null,              false, true,  90,   'familia', 'mas_restrictivo'),
  ('sexo',                'enum',       'sexo',           null, null, 'nunca',           false, 'persona', 'todos', null,                       null, 'persona', 'hecho', null,              true,  false, null, 'familia', 'ultimo_gana'),
  ('colegio',             'texto',      null,             null, null, 'nunca',           false, 'persona', 'todos', null,                       null, 'persona', 'hecho', null,              true,  false, null, 'familia', 'ultimo_gana'),
  ('patronSemanas',       'enum',       'patron_semanas', null, null, 'nunca',           false, 'persona', 'todos', null,                       null, 'persona', 'hecho', null,              true,  false, null, 'familia', 'ultimo_gana'),
  ('menuModel',           'enum',       'modelo_menu',    null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'casa',    'hecho', '"same"'::jsonb,   true,  false, null, 'familia', 'ultimo_gana'),
  ('etapaBebe',           'enum',       'etapa_bebe',     null, null, 'antes_de_usarlo', true,  'casa',    'bebe',  null,                       21,   'persona', 'hecho', null,              false, false, null, 'familia', 'ultimo_gana'),
  ('cookLevel',           'enum',       'nivel_cocina',   null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'casa',    'hecho', '"normal"'::jsonb, true,  false, 35,   'familia', 'ultimo_gana'),
  ('kitchenTools',        'lista_enum', 'aparatos_casa',  null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'casa',    'hecho', null,              true,  false, 30,   'familia', 'ultimo_gana'),
  ('kitchenToolsNota',    'texto',      null,             null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'casa',    'hecho', null,              true,  false, null, 'familia', 'ultimo_gana'),
  ('pantryMode',          'enum',       'modo_despensa',  null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'casa',    'hecho', '"only"'::jsonb,   true,  false, 10,   'familia', 'ultimo_gana'),
  ('supermarkets',        'lista_enum', 'supermercados',  null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'casa',    'hecho', null,              true,  false, null, 'familia', 'ultimo_gana'),
  ('supermarketsNota',    'texto',      null,             null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'casa',    'hecho', null,              true,  false, null, 'familia', 'ultimo_gana'),
  ('presupuesto',         'int',        null,             0,    null, 'nunca',           false, 'casa',    'todos', null,                       null, 'casa',    'hecho', null,              true,  false, 20,   'familia', 'ultimo_gana'),
  ('wantsPriceEstimates', 'bool',       null,             null, null, 'nunca',           false, 'casa',    'todos', null,                       null, 'casa',    'hecho', 'false'::jsonb,    true,  false, null, 'familia', 'ultimo_gana')
on conflict (id) do update set
  tipo = excluded.tipo, vocabulario = excluded.vocabulario,
  minimo = excluded.minimo, maximo = excluded.maximo, politica = excluded.politica,
  seguridad = excluded.seguridad, por = excluded.por,
  aplica = excluded.aplica, columna = excluded.columna, caduca_dias = excluded.caduca_dias,
  ficha = excluded.ficha, clase = excluded.clase, defecto = excluded.defecto, suposicion = excluded.suposicion,
  minimo_para_generar = excluded.minimo_para_generar, peso_menu = excluded.peso_menu,
  escribe = excluded.escribe, choque = excluded.choque;

-- Autoprueba: las 16 filas y las 9 de la casa; si no, se deshace todo.
do $$
declare v_total int; v_casa int;
begin
  select count(*), count(*) filter (where ficha = 'casa' and por = 'casa') into v_total, v_casa from public.registro_campo;
  if v_total <> 16 or v_casa <> 9 then
    raise exception '0112 autoprueba: registro_campo tiene % filas (% de la casa); se esperaban 16 y 9', v_total, v_casa;
  end if;
end $$;
