-- El dato con sobre, 1 de 3 (plan fichas con estado, trozo 7; #1037): el registro gana sus columnas del
-- eje, el sobre su estado de uso, y nace la tabla operacion. La escritura (aplicar_operacion y
-- escribir_dato) va en la 0106 y la lectura (ficha_casa v2, que quita sobre.ref_tipo/ref_id) en la 0107:
-- el plan las pedía en una sola 0105, y se parte para que cada PR sea una idea que se revise de una vez.
--
--   · registro_campo gana ficha, clase, defecto, suposicion, minimo_para_generar, peso_menu, escribe y
--     choque, con CHECK contra FICHAS, CLASES_DATO, ESCRITORES y CHOQUES (src/lib/vocabularios.js), y se
--     regenera entero desde REGISTRO_CAMPOS (src/lib/registroCampos.js), como la 0097. El INSERT de aquí lo
--     compara registroCampos.test.js.
--   · sobre gana peso, caduca_at, updated_at (con set_updated_at) y operacion_id (FK compuesta a operacion,
--     on delete set null). ref_tipo y ref_id siguen hasta la 0107 (ficha_casa v1 los lee).
--   · operacion: toda escritura de una ficha, con autor, canal, ref, acción, pedido, hecho, sin_hacer,
--     choques, estado y sus fechas, inversa y clave de idempotencia única por casa. La leen los de la casa;
--     ningún usuario la escribe (solo aplicar_operacion, 0106).
--
-- NO hace (plan, trozo 7, «Not done»): no repuebla nada (sin convivencia: las filas nacen vacías), no toca
-- persona ni persona_* ni el trigger 0089 (trozo 10), no crea preferencia, señal ni historiales (trozo 14)
-- ni la retención de operaciones (trozo 35). Ningún dato de familias: solo estructura.
--
-- Plan B (regla migraciones): ningún código lee ni escribe estas columnas ni la tabla; desplegar la rama
-- antes que la migración no rompe nada.
--
-- Lectores (principio «ningún campo sin lector»): las columnas nuevas de registro_campo y sobre las leen
-- aplicar_operacion (0106: clase, suposicion, escribe, choque) y ficha_casa v2 (0107: ficha, defecto,
-- minimo_para_generar, peso_menu, y peso, caduca_at, updated_at y operacion_id del sobre); operacion, la
-- 0106 y, por RLS, los de la casa. El lector de código llega con el trozo 8.
--
-- Consulta previa (debe dar 0, 7 y 0):
--   select (select count(*) from public.sobre), (select count(*) from public.registro_campo),
--          (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'operacion');
-- Objeto testigo: la tabla public.operacion y la columna public.registro_campo.ficha.
set lock_timeout = '5s';

do $$
begin
  if to_regclass('public.sobre') is null or to_regclass('public.registro_campo') is null then
    raise exception 'Falta la 0097 (registro_campo, sobre): aplícala antes que la 0105';
  end if;
  if to_regclass('public.operacion') is not null then
    raise exception 'operacion ya existe: ¿la 0105 ya está aplicada?';
  end if;
end $$;

-- 1. registro_campo: las columnas del eje ---------------------------------------
-- Sin default: el INSERT de abajo es su único escritor; después pasan a not null.

alter table public.registro_campo
  add column ficha text,
  add column clase text,
  add column defecto jsonb,
  add column suposicion boolean,
  add column minimo_para_generar boolean,
  add column peso_menu integer,
  add column escribe text,
  add column choque text;

alter table public.registro_campo
  add constraint registro_campo_ficha_vocabulario
    check (ficha in ('persona', 'grupo', 'casa', 'rutina', 'preferencia', 'regla', 'trato', 'semana', 'compra', 'despensa', 'receta', 'tarea', 'senal')) not valid,
  add constraint registro_campo_clase_vocabulario check (clase in ('hecho', 'derivado', 'marca', 'historial')) not valid,
  add constraint registro_campo_escribe_vocabulario check (escribe in ('familia', 'sistema', 'ambos')) not valid,
  add constraint registro_campo_choque_vocabulario check (choque in ('ultimo_gana', 'mas_restrictivo', 'suma')) not valid,
  add constraint registro_campo_peso_menu_rango check (peso_menu is null or peso_menu >= 0) not valid;

-- Generado desde REGISTRO_CAMPOS; registroCampos.test.js falla si no coincide.
insert into public.registro_campo
  (id, tipo, vocabulario, minimo, maximo, politica, seguridad, por, aplica, columna, caduca_dias, ficha, clase, defecto, suposicion, minimo_para_generar, peso_menu, escribe, choque) values
  ('edad',          'int',        null,             0,    120,  'nunca',           false, 'persona', 'todos', 'persona.edad',             null, 'persona', 'hecho', null, true,  false, null, 'familia', 'ultimo_gana'),
  ('nacimiento',    'fecha',      null,             null, null, 'nunca',           false, 'persona', 'todos', 'persona.fecha_nacimiento', null, 'persona', 'hecho', null, true,  false, null, 'familia', 'ultimo_gana'),
  ('alergias',      'lista_enum', 'alergenos',      null, null, 'una_vez',         true,  'persona', 'todos', 'persona_alergia',          30,   'persona', 'hecho', null, false, true,  90,   'familia', 'mas_restrictivo'),
  ('sexo',          'enum',       'sexo',           null, null, 'nunca',           false, 'persona', 'todos', null,                       null, 'persona', 'hecho', null, true,  false, null, 'familia', 'ultimo_gana'),
  ('colegio',       'texto',      null,             null, null, 'nunca',           false, 'persona', 'todos', null,                       null, 'persona', 'hecho', null, true,  false, null, 'familia', 'ultimo_gana'),
  ('patronSemanas', 'enum',       'patron_semanas', null, null, 'nunca',           false, 'persona', 'todos', null,                       null, 'persona', 'hecho', null, true,  false, null, 'familia', 'ultimo_gana'),
  ('etapaBebe',     'enum',       'etapa_bebe',     null, null, 'antes_de_usarlo', true,  'casa',    'bebe',  null,                       21,   'persona', 'hecho', null, false, false, null, 'familia', 'ultimo_gana')
on conflict (id) do update set
  tipo = excluded.tipo, vocabulario = excluded.vocabulario,
  minimo = excluded.minimo, maximo = excluded.maximo, politica = excluded.politica,
  seguridad = excluded.seguridad, por = excluded.por,
  aplica = excluded.aplica, columna = excluded.columna, caduca_dias = excluded.caduca_dias,
  ficha = excluded.ficha, clase = excluded.clase, defecto = excluded.defecto, suposicion = excluded.suposicion,
  minimo_para_generar = excluded.minimo_para_generar, peso_menu = excluded.peso_menu,
  escribe = excluded.escribe, choque = excluded.choque;

-- Siete filas: validar es inmediato.
alter table public.registro_campo
  validate constraint registro_campo_ficha_vocabulario;
alter table public.registro_campo
  validate constraint registro_campo_clase_vocabulario;
alter table public.registro_campo
  validate constraint registro_campo_escribe_vocabulario;
alter table public.registro_campo
  validate constraint registro_campo_choque_vocabulario;
alter table public.registro_campo
  validate constraint registro_campo_peso_menu_rango;

alter table public.registro_campo
  alter column ficha set not null,
  alter column clase set not null,
  alter column suposicion set not null,
  alter column minimo_para_generar set not null,
  alter column escribe set not null,
  alter column choque set not null;

comment on column public.registro_campo.ficha is 'La ficha del plan a la que pertenece el campo (FICHAS, vocabularios.js); ficha_casa v2 agrupa por ella.';
comment on column public.registro_campo.clase is 'Hecho, derivado, marca o historial (CLASES_DATO); aplicar_operacion solo escribe hechos.';
comment on column public.registro_campo.defecto is 'Valor cuando nadie ha dicho nada, con el tipo del campo (por eso sin check de objeto); null = sin defecto. ficha_casa v2 lo da con estado por_defecto. Lo comprueba el inventario de la ficha (scripts/lib/inventarioFicha.mjs) contra INITIAL_DATA.';
comment on column public.registro_campo.suposicion is 'false: solo lo da la familia (la salud nunca se supone); aplicar_operacion rechaza un origen del sistema.';
comment on column public.registro_campo.minimo_para_generar is 'true: sin él no se genera, se pregunta (plan, decisión B); ficha_casa v2 lo da en «faltan».';
comment on column public.registro_campo.peso_menu is 'Cuánto cambia el menú (el orden de las preguntas); null = sin pesar. No es el peso de una persona. ficha_casa v2 lo da en «faltan».';
comment on column public.registro_campo.escribe is 'Quién lo escribe: familia, sistema o ambos (ESCRITORES); aplicar_operacion rechaza lo que dice la familia en un campo del sistema.';
comment on column public.registro_campo.choque is 'Si dos escrituras chocan (CHOQUES): el último gana, el más restrictivo (listas de salud: añadir gana a quitar en el mismo minuto) o se suman (números); lo aplica aplicar_operacion.';

-- 2. operacion -------------------------------------------------------------------

create table public.operacion (
  household_id     uuid not null references public.households(id) on delete cascade,
  id               uuid not null default gen_random_uuid(),
  clave            text not null,
  accion           text not null,
  autor_user_id    uuid references auth.users(id) on delete set null,
  autor_persona_id text,
  canal            text not null,
  ref_tipo         text not null,
  ref_id           text not null,
  estado           text not null,
  pedido           jsonb not null,
  hecho            jsonb not null default '[]'::jsonb,
  sin_hacer        jsonb not null default '[]'::jsonb,
  choques          jsonb not null default '[]'::jsonb,
  inversa          jsonb,
  pedida_at        timestamptz not null default now(),
  ejecutada_at     timestamptz,
  deshecha_at      timestamptz,
  created_at       timestamptz not null default now(),
  primary key (household_id, id),
  constraint operacion_canal_vocabulario check (canal in ('app', 'telegram', 'whatsapp', 'sistema')),
  constraint operacion_ref_tipo_vocabulario check (ref_tipo in ('mensaje', 'pantalla', 'tarea', 'cron', 'motor')),
  constraint operacion_estado_vocabulario check (estado in ('pendiente', 'hecha', 'rechazada', 'deshecha')),
  constraint operacion_accion_forma check (accion ~ '^[a-z][a-z0-9_]*$' and char_length(accion) <= 60),
  constraint operacion_clave_forma check (clave = btrim(clave) and clave <> '' and char_length(clave) <= 200),
  constraint operacion_ref_id_forma check (ref_id = btrim(ref_id) and ref_id <> '' and char_length(ref_id) <= 200),
  -- Cada estado con su fecha (PRINCIPIOS §21): se ejecutó si está hecha o deshecha; deshecha si y solo si deshecha_at.
  constraint operacion_ejecutada check ((estado in ('hecha', 'deshecha')) = (ejecutada_at is not null)),
  constraint operacion_deshecha check ((estado = 'deshecha') = (deshecha_at is not null)),
  constraint operacion_pedido_objeto check (jsonb_typeof(pedido) = 'object'),
  constraint operacion_hecho_lista check (jsonb_typeof(hecho) = 'array'),
  constraint operacion_sin_hacer_lista check (jsonb_typeof(sin_hacer) = 'array'),
  constraint operacion_choques_lista check (jsonb_typeof(choques) = 'array'),
  constraint operacion_inversa_objeto check (inversa is null or jsonb_typeof(inversa) = 'object'),
  -- La persona autora sale de la operación si se borra (set null solo de su columna): la operación es de la casa.
  constraint operacion_autor_persona_fk foreign key (household_id, autor_persona_id)
    references public.persona(household_id, id) on delete set null (autor_persona_id)
);

-- Cada orden, una vez (PRINCIPIOS §19): la clave es el mid del mensaje o el id de la pantalla.
create unique index uq_operacion_clave on public.operacion (household_id, clave);
-- Un índice por FK (PRINCIPIOS §2).
create index idx_operacion_autor_persona on public.operacion (household_id, autor_persona_id);
create index idx_operacion_autor_user on public.operacion (autor_user_id);

comment on table public.operacion is
  'SALUD: cada escritura de una ficha, venga de Lola, de la app, de una tarea, de un cron o del motor: quién, por dónde, a raíz de qué, qué se pidió, qué se hizo y qué no (con su motivo), cómo se deshace y su clave de idempotencia. Puede llevar datos de salud en pedido, hecho e inversa (una alergia dicha). La escribe solo aplicar_operacion (0105); la leen los de la casa. Se borra con la casa; la retención la fija el barrido del trozo 35.';
comment on column public.operacion.clave is 'Clave de idempotencia, única por casa: el mid del mensaje, el id de la pantalla o de la ejecución del cron. La misma clave dos veces es la misma operación.';
comment on column public.operacion.accion is 'El id de la capacidad (src/lib/capacidades.js) que la pidió. Sin CHECK de lista: la lista vive en JS y cambia con cada herramienta; la comprueba la tubería (trozo 26).';
comment on column public.operacion.autor_user_id is 'La cuenta que la pidió. null = el sistema (cron, motor) o una cuenta ya borrada (on delete set null).';
comment on column public.operacion.autor_persona_id is 'La persona de la casa que la pidió, si se sabe; null = no se sabe o se borró. persona.id sigue siendo text (PENDIENTES.md).';
comment on column public.operacion.ref_id is 'Id de lo que la originó, polimórfico según ref_tipo (mensaje, pantalla, tarea, cron o motor): sin FK a propósito.';
comment on column public.operacion.pedido is 'Lo que se pidió, tal cual llegó a aplicar_operacion (que valida la forma); por defecto, sus datos.';
comment on column public.operacion.hecho is 'Lo que se escribió: [{campo, persona_id, sobre_id}]. Lo escribe aplicar_operacion.';
comment on column public.operacion.sin_hacer is 'Lo que no se escribió: [{campo, persona_id, motivo}], motivo de MOTIVOS_SIN_HACER_DATO (vocabularios.js), más lo que traiga la tubería.';
comment on column public.operacion.choques is 'Choques resueltos al escribir: [{campo, persona_id, regla}], regla de CHOQUES.';
comment on column public.operacion.inversa is 'Cómo se deshace: {datos: [{campo, persona_id, antes}]}, antes = el sobre de antes (null si no había). null en las que no escribieron.';
comment on column public.operacion.pedida_at is 'Cuándo se pidió (la hora del mensaje o del botón, nunca futura); created_at es cuándo se apuntó.';

alter table public.operacion enable row level security;
revoke all on table public.operacion from anon, authenticated;
grant select on table public.operacion to authenticated;
-- Como las demás tablas de la casa (0017): is_household_member es definer y authenticated no lee household_members.
create policy operacion_lectura_casa on public.operacion for select to authenticated
  using (public.is_household_member(household_id));

-- 3. sobre: estado de uso y la operación de la que sale -----------------------------

alter table public.sobre
  add column peso numeric,
  add column caduca_at timestamptz,
  add column updated_at timestamptz not null default now(),
  add column operacion_id uuid;

alter table public.sobre
  add constraint sobre_peso_rango check (peso is null or peso >= 0) not valid,
  add constraint sobre_operacion_fk foreign key (household_id, operacion_id)
    references public.operacion(household_id, id) on delete set null (operacion_id) not valid;
-- sobre tiene 0 filas (lo dice la consulta previa; ningún código la escribe): validar es inmediato.
alter table public.sobre
  validate constraint sobre_peso_rango;
alter table public.sobre
  validate constraint sobre_operacion_fk;

create index sobre_operacion on public.sobre (household_id, operacion_id);

create trigger sobre_updated_at before update on public.sobre
  for each row execute function public.set_updated_at();

comment on column public.sobre.peso is 'Contador que olvida (plan, «Las fichas»): cuánto pesa el dato aprendido; null = sin contar. Lo escribe aplicar_operacion y lo lee ficha_casa v2.';
comment on column public.sobre.caduca_at is 'Hasta cuándo vale el dato; null = no caduca. Pasada la fecha, ficha_casa v2 lo da como vacío (o por defecto). No es registro_campo.caduca_dias, que es la vida de la pregunta abierta.';
comment on column public.sobre.updated_at is 'Cuándo cambió por última vez (set_updated_at); confirmado_at es cuándo lo confirmó la familia.';
comment on column public.sobre.operacion_id is 'La operación de la que sale (y por ella de qué mensaje o pantalla y de quién). null si la operación se purgó (on delete set null).';
