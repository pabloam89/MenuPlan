-- La ficha Trato en el registro (plan fichas con estado, trozo 16; #1037): tratoRitmo, tratoProfundidad, tratoFotos y
-- tratoLargo ganan su fila en registro_campo, con por = 'persona' y ficha 'trato'. Es cómo quiere la persona de cada
-- cuenta que le hable Lola; se guarda en el sobre de la persona de esa cuenta (accountMemberIdByUser). Sin fila,
-- sobre.campo (FK a registro_campo) no admite ninguno y ficha_casa no los devuelve.
-- AUDITADA: auditor-datos 2026-11-02 OK
--   (un agente independiente, que no la escribió: encaja con los CHECK de registro_campo, sobre_valor_valido y ficha_casa
--   v2 sin tocarlas; sin duplicados; lector y escritor reales; plan B cierto; sin RLS, permisos ni datos de familias.
--   Matices: ficha_casa da el trato también a quien no tiene cuenta, filas que nadie lee; la autoprueba fija 30 filas)
--
--   · registro_campo se regenera entera desde REGISTRO_CAMPOS (src/lib/registroCampos.js), como en la 0105, la 0112,
--     la 0113 y la 0114: las 26 filas de hoy quedan igual (la 0118 ya quitó `presupuesto`, que aquí no está) y
--     entran 4. El INSERT de aquí lo compara registroCampos.test.js.
--   · Los vocabularios viven en src/lib/vocabularios.js (registro_campo.vocabulario guarda su nombre, sin FK ni CHECK
--     de valores): ritmos_trato (directo, guiado), profundidades_trato (nada, poco, mucho, preguntar) y largos_trato
--     (corto, largo). escribirDato.js pasa cada valor por su lista. tratoFotos es bool.
--   · Defectos: ritmo guiado, profundidad preguntar, fotos sí, largo corto (los del plan, trozo 16).
--   · politica 'nunca' en las 4: ninguna tarea las pregunta (bot_tareas.campo, 0080, no cambia).
--   · ficha 'trato' ya está en el CHECK registro_campo_ficha_vocabulario (0105).
--
-- NO hace: no toca sobre, household_state ni ningún dato de familias (todas las cuentas empiezan con el defecto);
-- no cambia columnas, CHECK, funciones, RLS ni permisos.
--
-- Plan B (regla migraciones): la rama se despliega antes. Sin esta, ficha_casa no trae la ficha «trato» y Lola usa
-- los defectos del registro (api/_bot/trato.js); guardar un trato falla en la FK de sobre.campo y vuelve como
-- `invalido`, que Lola dice. Va tras la 0114 (columna ambito) y la 0118 (sin `presupuesto`), que comprueba abajo.
--
-- Lectores (principio «ningún campo sin lector»): ficha_casa v2 (0116) devuelve todo campo por = 'persona' de cada
-- persona con su sobre o su defecto, agrupado en su ficha («trato»); aplicar_operacion (0115) los valida al
-- escribir; en el código, api/_bot/trato.js (tratoDeFicha) para Lola en cada turno.
--
-- Consulta previa (debe dar 26 y 0):
--   select (select count(*) from public.registro_campo),
--          (select count(*) from public.registro_campo where ficha = 'trato');
-- Consulta después (debe dar 30 y 4). Sin objeto testigo (solo filas): verificar-estado no la ve; se mira con la
-- consulta de después.
set lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'registro_campo' and column_name = 'ambito') then
    raise exception 'Falta la 0114 (registro_campo sin ambito): aplícala antes que la 0119';
  end if;
  if exists (select 1 from public.registro_campo where id = 'presupuesto') then
    raise exception 'registro_campo aún tiene presupuesto: aplica la 0118 antes que la 0119';
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

-- Autoprueba: las 30 filas, las 4 del trato por persona con su defecto; si no, se deshace todo.
do $$
declare v_total int; v_trato int;
begin
  select count(*) into v_total from public.registro_campo;
  select count(*) into v_trato from public.registro_campo
   where ficha = 'trato' and por = 'persona' and politica = 'nunca' and cardinality(ambito) = 0
     and (id, defecto) in (('tratoRitmo', '"guiado"'::jsonb), ('tratoProfundidad', '"preguntar"'::jsonb),
                           ('tratoFotos', 'true'::jsonb), ('tratoLargo', '"corto"'::jsonb));
  if v_total <> 30 or v_trato <> 4 then
    raise exception '0119 autoprueba: registro_campo tiene % filas (% del trato); se esperaban 30 y 4', v_total, v_trato;
  end if;
end $$;
