-- Preferencias, señales e historiales (plan fichas con estado, trozo 14; #1037): todo lo que condiciona el menú en
-- una tabla, `preferencia`, con sus conjuntos (`plan_preferencias`), las señales que olvidan (`senal`, trozo 15) y los
-- historiales con poda (`precio_observado`, `ticket`, `cocinado`, trozo 22), para aplicarlo una sola vez. Va tras la
-- 0105 (operacion), que comprueba; no necesita ninguna otra de las que siguen sin aplicar.
-- AUDITADA: auditor-datos 2026-11-02 OK
--   (un agente independiente, que no la escribió: nivel en la firma, comprobaciones de la autoprueba a prueba de nulos, valor corto)
--
--   · registro_eje: los ejes de src/data/axisRegistry.js (EJES), solo id y tipo, generado de allí y comparado por
--     preferencia.test (supabase/preferencia.test.js). Lo leen la FK de preferencia y senal y el disparador.
--   · plan_preferencias: un conjunto con nombre y fechas («semana ligera», un plan de nutrición), de la casa o de una
--     persona. Sus preferencias cuelgan de él y se van con él.
--   · preferencia: quién (la casa, un grupo o una persona), nivel, eje, medida, operador, valor (con el tipo del eje)
--     y cantidad, fuerza, ámbito (días, comidas, semanas, desde, hasta y su salvedad), conjunto, y su sobre en la
--     misma fila (origen, canal, dicho_by, confirmado_at, rechazada_at, operacion_id, updated_at). Una fila por
--     preferencia: dos iguales (mismo sujeto, eje, medida, operador, valor, ámbito y conjunto) son la misma.
--   · escribir_preferencias(p_operacion jsonb), definer, solo la service role: la única escritura de preferencia y
--     plan_preferencias. Una operación (fila en `operacion`, idempotente por casa y clave) con una lista de
--     preferencias (crear o cambiar, borrar, rechazar) y de conjuntos; lo supuesto o visto no pisa lo dicho ni
--     vuelve a suponer lo rechazado; guarda la inversa y sube bot_rev.
--   · preferencias_de_casa(p_casa uuid), definer, para los de la casa y la service role: las preferencias y los
--     conjuntos, de donde la app y Lola montan la libreta (src/lib/preferencias.js).
--   · senal: un contador por (casa, cuenta o la casa, eje, valor) con peso, veces y última vez; senal_decaer() le
--     quita la mitad del peso cada 60 días (de noche, pg_cron `senal-decaer`) y borra lo que ya no pesa.
--   · precio_observado, ticket y cocinado, con historial_podar() de noche (pg_cron `historial-podar`): 90 días los
--     precios y los tickets, un año lo cocinado.
--
-- NO hace: no toca ninguna fila de familias ni repuebla nada (la libreta, las reglas, los topes, el presupuesto y la
-- puerta de cocinas del documento no se copian: cada casa estrena sus preferencias vacías, sin convivencia, Pablo
-- 30 oct). No toca RLS ni permisos de lo que ya existía: las tablas nuevas nacen con RLS y sin permisos de usuario
-- (como operacion y sobre); se leen por preferencias_de_casa. No deshace: deshacer_operacion (0111/0115) solo conoce
-- la inversa de los sobres y ante una operación de preferencias falla en alto; la inversa ya se guarda. No escribe
-- senal ni los historiales (trozos 15 y 22): solo nacen con su poda.
-- Plan B (regla migraciones): la rama se despliega antes. Sin preferencias_de_casa la app y Lola siguen con la
-- libreta del documento; sin escribir_preferencias la tubería contesta rpc_ausente y no guarda.
-- Consulta previa (debe dar 0 y 0): select (select count(*) from pg_class where relname in ('preferencia',
--   'plan_preferencias', 'senal', 'registro_eje', 'precio_observado', 'ticket', 'cocinado')),
--   (select count(*) from cron.job where jobname in ('senal-decaer', 'historial-podar'));
-- Objeto testigo: la tabla public.preferencia y la función public.escribir_preferencias(jsonb).
set lock_timeout = '5s';

do $$
begin
  if to_regclass('public.operacion') is null then
    raise exception 'Falta la 0105 (operacion): aplícala antes que la 0109';
  end if;
  if to_regclass('public.preferencia') is not null then
    raise exception 'preferencia ya existe: ¿la 0109 ya está aplicada?';
  end if;
  if to_regnamespace('cron') is null then
    raise exception 'Falta pg_cron (0062)';
  end if;
end $$;

-- 1. registro_eje -------------------------------------------------------------------------------------------
create table public.registro_eje (
  id         text primary key,
  tipo       text not null,
  created_at timestamptz not null default now(),
  constraint registro_eje_tipo_vocabulario check (tipo in ('enum', 'jerarquico', 'tags', 'numerico', 'booleano', 'derivado'))
);
comment on table public.registro_eje is
  'Los ejes de src/data/axisRegistry.js (EJES): id y tipo (TIPOS_EJE). Se escribe solo desde las migraciones, generado de EJES (supabase/preferencia.test.js lo compara). Lo leen las FK de preferencia y senal y el disparador preferencia_valida.';
alter table public.registro_eje enable row level security;
revoke all on table public.registro_eje from anon, authenticated;

insert into public.registro_eje (id, tipo) values
  ('composicion', 'derivado'), ('subtipoIngrediente', 'jerarquico'), ('densidadNutricional', 'numerico'), ('micronutrientes', 'numerico'),
  ('nova', 'enum'), ('parte', 'enum'), ('formato', 'enum'), ('temperatura', 'enum'),
  ('textura', 'enum'), ('sabor', 'tags'), ('carga', 'numerico'), ('completitud', 'derivado'),
  ('fotogenia', 'booleano'), ('connotacion', 'tags'), ('cocina', 'jerarquico'), ('autenticidad', 'enum'),
  ('epoca', 'enum'), ('festividad', 'tags'), ('estacionalidadIngrediente', 'enum'), ('restriccionReligiosa', 'tags'),
  ('aptoVigilia', 'derivado'), ('aptoAyuno', 'derivado'), ('vegetarianismoReligioso', 'tags'), ('tecnica', 'enum'),
  ('tiempoActivo', 'numerico'), ('esfuerzoMental', 'derivado'), ('conflictoRecursos', 'tags'), ('equipamiento', 'tags'),
  ('progresion', 'numerico'), ('escalabilidadTanda', 'booleano'), ('escalabilidadReal', 'derivado'), ('robustez', 'derivado'),
  ('quienCocina', 'enum'), ('transportabilidad', 'booleano'), ('conLasManos', 'booleano'), ('compartido', 'enum'),
  ('congelabilidad', 'booleano'), ('perecibilidad', 'derivado'), ('coste', 'numerico'), ('huella', 'numerico'),
  ('aprovechamiento', 'derivado'), ('curacionEditorial', 'booleano'), ('objetivoCorporal', 'enum'), ('contextoPeticion', 'tags'),
  ('protocoloDietetico', 'tags'), ('montaje', 'booleano'), ('llevaMasa', 'booleano'), ('gruposSecundarios', 'tags'),
  ('antelacion', 'booleano'), ('perfilNutricional', 'tags'), ('categoria', 'enum'), ('proteinaPrincipal', 'enum'),
  ('proteinasExtra', 'tags'), ('basePrincipal', 'enum'), ('aporte', 'tags'), ('modoBase', 'enum'),
  ('minutosFijos', 'numerico'), ('minutosPorRacion', 'numerico'), ('capacidadMaxima', 'numerico'), ('ocasion', 'enum'),
  ('favoritoNinos', 'booleano'), ('picante', 'enum'), ('saborDominante', 'tags'), ('llevaSalsa', 'booleano'),
  ('etapaBebe', 'enum'), ('guarnicionPosible', 'booleano'), ('compatibilidadSalsa', 'tags'), ('papelEnComida', 'tags'),
  ('tipoPlato', 'enum'), ('tiempoTotal', 'numerico'), ('dificultad', 'enum'), ('temporada', 'enum'),
  ('racionesBase', 'numerico'), ('aptoNinos', 'booleano'), ('alergenos', 'tags'), ('esfuerzoPostre', 'enum'),
  ('tipoPostre', 'enum'), ('calorias', 'enum'), ('esfuerzo', 'enum'), ('familiaTanda', 'enum'),
  ('kcal', 'numerico'), ('protein_g', 'numerico'), ('carbs_g', 'numerico'), ('fat_g', 'numerico'),
  ('fiber_g', 'numerico'), ('sugar_g', 'numerico'), ('saturated_fat_g', 'numerico'), ('sodium_mg', 'numerico'),
  ('calcium_mg', 'numerico'), ('iron_mg', 'numerico'), ('magnesium_mg', 'numerico'), ('phosphorus_mg', 'numerico'),
  ('potassium_mg', 'numerico'), ('zinc_mg', 'numerico'), ('copper_mg', 'numerico'), ('manganese_mg', 'numerico'),
  ('selenium_ug', 'numerico'), ('iodine_ug', 'numerico'), ('retinol_ug', 'numerico'), ('beta_carotene_ug', 'numerico'),
  ('vitamin_d_ug', 'numerico'), ('vitamin_e_mg', 'numerico'), ('vitamin_k_ug', 'numerico'), ('vitamin_c_mg', 'numerico'),
  ('thiamin_mg', 'numerico'), ('riboflavin_mg', 'numerico'), ('niacin_mg', 'numerico'), ('pantothenic_acid_mg', 'numerico'),
  ('vitamin_b6_mg', 'numerico'), ('folate_ug', 'numerico'), ('vitamin_b12_ug', 'numerico'), ('cholesterol_mg', 'numerico');

-- 2. plan_preferencias ---------------------------------------------------------------------------------------
create table public.plan_preferencias (
  household_id uuid not null references public.households(id) on delete cascade,
  id           uuid not null default gen_random_uuid(),
  persona_id   text,
  nombre       text not null,
  desde        date,
  hasta        date,
  activo       boolean not null default true,
  operacion_id uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (household_id, id),
  constraint plan_preferencias_persona_fk foreign key (household_id, persona_id)
    references public.persona(household_id, id) on delete cascade,
  constraint plan_preferencias_operacion_fk foreign key (household_id, operacion_id)
    references public.operacion(household_id, id) on delete set null (operacion_id),
  constraint plan_preferencias_nombre check (char_length(btrim(nombre)) >= 1 and char_length(nombre) <= 80),
  constraint plan_preferencias_fechas check (desde is null or hasta is null or hasta >= desde)
);
create index plan_preferencias_persona on public.plan_preferencias (household_id, persona_id);
create index plan_preferencias_operacion on public.plan_preferencias (household_id, operacion_id);
comment on table public.plan_preferencias is
  'Un conjunto de preferencias con nombre y fechas («semana ligera», un plan de nutrición), de la casa o de una persona (persona_id). No es el plan de trabajo de la Fábrica. Lo escribe solo escribir_preferencias y lo lee preferencias_de_casa. Se borra con la casa o con su persona, y sus preferencias con él.';

-- 3. preferencia ------------------------------------------------------------------------------------------------
create table public.preferencia (
  household_id  uuid not null references public.households(id) on delete cascade,
  id            uuid not null default gen_random_uuid(),
  persona_id    text,
  grupo_id      text,
  plan_id       uuid,
  nivel         text not null,
  eje           text not null references public.registro_eje(id) on delete restrict,
  medida        text not null,
  operador      text not null,
  valor         jsonb,
  cantidad      numeric,
  nota          text,
  fuerza        text not null,
  dias          text[],
  comidas       text[],
  semanas       date[],
  salvo_dias    text[],
  salvo_comidas text[],
  salvo_semanas date[],
  desde         date,
  hasta         date,
  frase         text,
  origen        text not null,
  canal         text not null,
  dicho_by      uuid references auth.users(id) on delete set null,
  confirmado_at timestamptz,
  rechazada_at  timestamptz,
  operacion_id  uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (household_id, id),
  constraint preferencia_persona_fk foreign key (household_id, persona_id)
    references public.persona(household_id, id) on delete cascade,
  constraint preferencia_grupo_fk foreign key (household_id, grupo_id)
    references public.grupo(household_id, id) on delete cascade,
  constraint preferencia_plan_fk foreign key (household_id, plan_id)
    references public.plan_preferencias(household_id, id) on delete cascade,
  constraint preferencia_operacion_fk foreign key (household_id, operacion_id)
    references public.operacion(household_id, id) on delete set null (operacion_id),
  constraint preferencia_un_sujeto check (persona_id is null or grupo_id is null),
  constraint preferencia_nivel_vocabulario check (nivel in ('plato', 'comida', 'dia', 'semana')),
  constraint preferencia_medida_vocabulario check (medida in ('valor', 'suma', 'media', 'cuenta')),
  constraint preferencia_operador_vocabulario check (operador in ('es', 'no_es', 'al_menos', 'como_mucho', 'mas', 'menos')),
  constraint preferencia_fuerza_vocabulario check (fuerza in ('obligatoria', 'alto', 'medio', 'bajo')),
  constraint preferencia_origen_vocabulario check (origen in ('dicho', 'supuesto', 'visto', 'derivado', 'por_defecto', 'delegado', 'no_quiere_decirlo')),
  constraint preferencia_canal_vocabulario check (canal in ('app', 'telegram', 'whatsapp', 'sistema')),
  -- El valor del plato (medida valor) o cuánto (suma, media, cuenta); un tope o un mínimo, siempre con su cantidad.
  constraint preferencia_medida check ((medida = 'valor' and valor is not null) or (medida <> 'valor' and cantidad is not null)),
  constraint preferencia_tope check (operador not in ('al_menos', 'como_mucho') or cantidad is not null),
  constraint preferencia_otro check (nota is null or (valor = '"otro"'::jsonb and length(nota) <= 200)),
  constraint preferencia_frase check (frase is null or length(frase) <= 500),
  -- Entra en preferencia_unica: corto (un nombre de alimento, de cocina o de familia).
  constraint preferencia_valor_corto check (valor is null or length(valor::text) <= 200),
  constraint preferencia_dias_vocabulario check (dias is null or dias <@ array['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']::text[]),
  constraint preferencia_salvo_dias_vocabulario check (salvo_dias is null or salvo_dias <@ array['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']::text[]),
  constraint preferencia_comidas_vocabulario check (comidas is null or comidas <@ array['Desayuno', 'Comida', 'Merienda', 'Cena', 'Postre']::text[]),
  constraint preferencia_salvo_comidas_vocabulario check (salvo_comidas is null or salvo_comidas <@ array['Desayuno', 'Comida', 'Merienda', 'Cena', 'Postre']::text[]),
  -- Un ámbito vacío no es «siempre» (eso es null): no se guarda.
  constraint preferencia_ambito_no_vacio check (cardinality(dias) > 0 and cardinality(comidas) > 0 and cardinality(semanas) > 0
    and cardinality(salvo_dias) > 0 and cardinality(salvo_comidas) > 0 and cardinality(salvo_semanas) > 0),
  constraint preferencia_fechas check (desde is null or hasta is null or hasta >= desde)
);
-- Una preferencia por sujeto, nivel, eje, medida, operador, valor, ámbito y conjunto (con los días y comidas en su orden): la misma dicha dos veces es una fila.
-- Empieza por (household_id, persona_id): sirve también a la FK de persona.
create unique index preferencia_unica on public.preferencia (household_id, persona_id, grupo_id, plan_id, nivel, eje, medida,
  operador, valor, dias, comidas, semanas, salvo_dias, salvo_comidas, salvo_semanas, desde, hasta) nulls not distinct;
create index preferencia_grupo on public.preferencia (household_id, grupo_id);
create index preferencia_plan on public.preferencia (household_id, plan_id);
create index preferencia_eje on public.preferencia (eje);
create index preferencia_operacion on public.preferencia (household_id, operacion_id);
create index preferencia_dicho_by on public.preferencia (dicho_by);
comment on table public.preferencia is
  'Todo lo que condiciona el menú (antes la libreta, los sesgos y vetos de las reglas, los topes por familia, el presupuesto y la puerta de cocinas; plan fichas con estado, trozo 14): quién (la casa, grupo_id o persona_id), nivel, eje (registro_eje), medida, operador, valor con el tipo del eje y cantidad, fuerza, ámbito y conjunto, con su sobre en la fila. Lo escribe solo escribir_preferencias y lo lee preferencias_de_casa. La salud no: sigue en persona_*.';
comment on column public.preferencia.valor is 'El valor del eje (jsonb con su tipo: número, sí/no o texto; «otro» con su nota). null con medida suma o media sobre el eje entero (como mucho 80 € a la semana).';
comment on column public.preferencia.cantidad is 'Cuánto: las veces (cuenta), el total (suma), la media, o el peso de un mas/menos. null con medida valor sin peso.';
comment on column public.preferencia.rechazada_at is 'La familia dijo que no a lo que Lola supuso: no vale y no se vuelve a suponer con la misma cantidad.';
comment on column public.preferencia.dicho_by is 'Quién la dijo (cuenta), si es dicha o delegada.';

-- El valor con el tipo de su eje, y las semanas en lunes (el disparador, porque mira registro_eje y cada fecha).
create function public.preferencia_valida() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_tipo text;
begin
  select tipo into v_tipo from public.registro_eje where id = new.eje;
  if new.valor is not null and jsonb_typeof(new.valor) is distinct from
       (case v_tipo when 'numerico' then 'number' when 'booleano' then 'boolean' else 'string' end) then
    raise exception 'preferencia: el eje % es %, y el valor % no', new.eje, v_tipo, new.valor using errcode = '23514';
  end if;
  if exists (select 1 from unnest(coalesce(new.semanas, '{}') || coalesce(new.salvo_semanas, '{}')) s
              where extract(isodow from s) <> 1) then
    raise exception 'preferencia: una semana es su lunes' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger preferencia_valida before insert or update on public.preferencia
  for each row execute function public.preferencia_valida();

-- Solo el servidor, como operacion y sobre: se leen por preferencias_de_casa y se escriben por escribir_preferencias.
alter table public.plan_preferencias enable row level security;
alter table public.preferencia enable row level security;
revoke all on table public.plan_preferencias, public.preferencia from anon, authenticated;

-- 4. escribir_preferencias ----------------------------------------------------------------------------------
--
-- p_operacion: {casa, clave, accion, canal, ref_tipo, ref_id, autor_user_id?, autor_persona_id?, pedida_at?,
--   planes?: [{id, persona_id?, nombre, desde?, hasta?, activo?}]  (crear o cambiar; van antes que las preferencias),
--   preferencias?: [{id, borrar: true} | {id, rechazar: true}
--     | {id?, persona_id?, grupo_id?, plan_id?, nivel, eje, medida, operador, valor?, cantidad?, nota?, fuerza,
--        dias?, comidas?, semanas?, salvo_dias?, salvo_comidas?, salvo_semanas?, desde?, hasta?, frase?,
--        origen? (dicho por defecto; nunca por_defecto), confirmado?: true}]}
-- Crear o cambiar busca la fila por su id o, si no, por su firma (preferencia_unica): decir dos veces lo mismo no
-- duplica. Lo supuesto o visto no pisa lo dicho (sin_hacer ya_lo_dijo_la_familia) ni repite lo rechazado con la
-- misma cantidad (ya_lo_rechazo); rechazar lo dicho tampoco. Borrar o rechazar lo que no está: no_existe.
-- Devuelve {operacion_id, estado, repetida, hecho, sin_hacer, choques, rev}, como aplicar_operacion. Lo que no
-- cuadra con la tabla (un eje que no existe, un valor de otro tipo, una persona de otra casa) aborta la operación.
create function public.escribir_preferencias(p_operacion jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  -- Como aplicar_operacion (0115): cabe la libreta entera de una casa en una operación.
  c_max constant integer := 400;
  v_casa uuid := nullif(p_operacion->>'casa', '')::uuid;
  v_clave text := p_operacion->>'clave';
  v_canal text := p_operacion->>'canal';
  v_prefs jsonb := coalesce(p_operacion->'preferencias', '[]'::jsonb);
  v_planes jsonb := coalesce(p_operacion->'planes', '[]'::jsonb);
  v_uid uuid := auth.uid();
  v_autor uuid;
  v_id uuid;
  v_rev bigint;
  v_hecho jsonb := '[]'::jsonb;
  v_sin_hacer jsonb := '[]'::jsonb;
  v_inv_prefs jsonb := '[]'::jsonb;
  v_inv_planes jsonb := '[]'::jsonb;
  p jsonb; v_pid uuid; v_antes public.preferencia; v_nueva public.preferencia; v_plan public.plan_preferencias;
  v_habia boolean; v_motivo text; d jsonb;
begin
  if v_casa is null or v_clave is null then
    raise exception 'escribir_preferencias: faltan casa o clave' using errcode = '22023';
  end if;
  if v_uid is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'escribir_preferencias: hace falta sesión' using errcode = '42501';
  end if;
  v_autor := coalesce(v_uid, nullif(p_operacion->>'autor_user_id', '')::uuid);
  if v_autor is not null and not exists (
       select 1 from public.household_members m where m.household_id = v_casa and m.user_id = v_autor) then
    raise exception 'escribir_preferencias: el autor no es de esta casa' using errcode = '42501';
  end if;
  if nullif(p_operacion->>'autor_persona_id', '') is not null and not exists (
       select 1 from public.persona x where x.household_id = v_casa and x.id = p_operacion->>'autor_persona_id') then
    raise exception 'escribir_preferencias: la persona autora no es de esta casa' using errcode = '42501';
  end if;
  if jsonb_typeof(v_prefs) <> 'array' or jsonb_typeof(v_planes) <> 'array'
     or jsonb_array_length(v_prefs) + jsonb_array_length(v_planes) > c_max
     or exists (select 1 from jsonb_array_elements(v_prefs || v_planes) x where jsonb_typeof(x.value) <> 'object')
     or exists (select 1 from jsonb_array_elements(v_planes) x where nullif(x.value->>'id', '') is null)
     or exists (select 1 from jsonb_array_elements(v_prefs) x
                 where (x.value ? 'borrar' or x.value ? 'rechazar') and nullif(x.value->>'id', '') is null)
     or exists (select 1 from jsonb_array_elements(v_prefs) x where x.value->>'id' is not null
                 group by x.value->>'id' having count(*) > 1) then
    raise exception 'escribir_preferencias: preferencias y planes, listas de hasta % objetos, sin ids repetidos; borrar, rechazar y cada plan llevan id', c_max using errcode = '22023';
  end if;
  if jsonb_array_length(v_prefs) + jsonb_array_length(v_planes) = 0 then
    raise exception 'escribir_preferencias: nada que escribir' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(v_prefs) x where x.value->>'origen' = 'por_defecto') then
    raise exception 'escribir_preferencias: un defecto no se guarda (es lo que vale sin preferencia)' using errcode = '22023';
  end if;

  -- La clave primero, como aplicar_operacion: la misma dos veces espera aquí a la primera y no hace nada.
  insert into public.operacion (household_id, clave, accion, autor_user_id, canal, ref_tipo, ref_id, estado, pedido, pedida_at)
  values (v_casa, v_clave, p_operacion->>'accion', v_autor, v_canal, p_operacion->>'ref_tipo', p_operacion->>'ref_id',
          'pendiente', jsonb_build_object('preferencias', v_prefs, 'planes', v_planes),
          least(coalesce((p_operacion->>'pedida_at')::timestamptz, now()), now()))
  on conflict (household_id, clave) do nothing
  returning id into v_id;
  if v_id is null then
    select jsonb_build_object('operacion_id', o.id, 'estado', o.estado, 'repetida', true, 'hecho', o.hecho,
                              'sin_hacer', o.sin_hacer, 'choques', o.choques, 'rev', s.bot_rev)
      into d
      from public.operacion o left join public.household_state s on s.household_id = o.household_id
     where o.household_id = v_casa and o.clave = v_clave;
    return d;
  end if;

  -- Una escritura de preferencias a la vez por casa: la fila que sube bot_rev al final se toma ya.
  perform 1 from public.household_state where household_id = v_casa for update;
  if not found then
    raise exception 'escribir_preferencias: la casa no tiene household_state' using errcode = '23503';
  end if;

  for p in select x.value from jsonb_array_elements(v_planes) with ordinality x order by x.ordinality loop
    v_pid := (p->>'id')::uuid;
    select * into v_plan from public.plan_preferencias where household_id = v_casa and id = v_pid for update;
    v_inv_planes := v_inv_planes || jsonb_build_array(jsonb_build_object('plan_id', v_pid,
      'antes', case when found then to_jsonb(v_plan) - 'household_id' end));
    v_hecho := v_hecho || jsonb_build_array(jsonb_build_object('plan_id', v_pid, 'nuevo', not found));
    insert into public.plan_preferencias (household_id, id, persona_id, nombre, desde, hasta, activo, operacion_id)
    values (v_casa, v_pid, nullif(p->>'persona_id', ''), p->>'nombre', (p->>'desde')::date, (p->>'hasta')::date,
            coalesce((p->>'activo')::boolean, true), v_id)
    on conflict (household_id, id) do update
      set persona_id = excluded.persona_id, nombre = excluded.nombre, desde = excluded.desde, hasta = excluded.hasta,
          activo = excluded.activo, operacion_id = v_id, updated_at = now();
  end loop;

  for p in select x.value from jsonb_array_elements(v_prefs) with ordinality x order by x.ordinality loop
    v_pid := nullif(p->>'id', '')::uuid;
    v_motivo := null;

    if p->'borrar' = 'true'::jsonb or p->'rechazar' = 'true'::jsonb then
      select * into v_antes from public.preferencia where household_id = v_casa and id = v_pid for update;
      if not found then
        v_motivo := 'no_existe';
      elsif p->'rechazar' = 'true'::jsonb and v_antes.origen in ('dicho', 'delegado') then
        v_motivo := 'ya_lo_dijo_la_familia';
      elsif p->'borrar' = 'true'::jsonb then
        delete from public.preferencia where household_id = v_casa and id = v_pid;
        v_hecho := v_hecho || jsonb_build_array(jsonb_build_object('preferencia_id', v_pid, 'borrada', true));
      else
        update public.preferencia set rechazada_at = now(), operacion_id = v_id, updated_at = now()
         where household_id = v_casa and id = v_pid;
        v_hecho := v_hecho || jsonb_build_array(jsonb_build_object('preferencia_id', v_pid, 'rechazada', true));
      end if;
      if v_motivo is null then
        v_inv_prefs := v_inv_prefs || jsonb_build_array(jsonb_build_object('preferencia_id', v_pid, 'antes', to_jsonb(v_antes) - 'household_id'));
      else
        v_sin_hacer := v_sin_hacer || jsonb_build_array(jsonb_build_object('preferencia_id', v_pid, 'motivo', v_motivo));
      end if;
      continue;
    end if;

    -- Crear o cambiar. Lo que pone el servidor (casa, sobre, fechas) no lo puede traer el pedido.
    v_nueva := jsonb_populate_record(null::public.preferencia, p);
    v_nueva.household_id := v_casa;
    v_nueva.origen := coalesce(v_nueva.origen, 'dicho');
    v_nueva.canal := v_canal;
    v_nueva.dicho_by := case when v_nueva.origen in ('dicho', 'delegado') then v_autor end;
    v_nueva.rechazada_at := null;
    v_nueva.operacion_id := v_id;
    v_nueva.updated_at := now();
    select * into v_antes from public.preferencia x
     where x.household_id = v_casa
       and (x.id = v_pid
            or (x.persona_id is not distinct from v_nueva.persona_id and x.grupo_id is not distinct from v_nueva.grupo_id
                and x.plan_id is not distinct from v_nueva.plan_id and x.nivel = v_nueva.nivel and x.eje = v_nueva.eje
                and x.medida = v_nueva.medida
                and x.operador = v_nueva.operador and x.valor is not distinct from v_nueva.valor
                and x.dias is not distinct from v_nueva.dias and x.comidas is not distinct from v_nueva.comidas
                and x.semanas is not distinct from v_nueva.semanas and x.salvo_dias is not distinct from v_nueva.salvo_dias
                and x.salvo_comidas is not distinct from v_nueva.salvo_comidas
                and x.salvo_semanas is not distinct from v_nueva.salvo_semanas
                and x.desde is not distinct from v_nueva.desde and x.hasta is not distinct from v_nueva.hasta))
     order by x.id = v_pid desc nulls last
     limit 1
     for update;
    v_habia := found;
    if v_habia and v_nueva.origen in ('supuesto', 'visto') then
      if v_antes.origen in ('dicho', 'delegado') and v_antes.rechazada_at is null then
        v_motivo := 'ya_lo_dijo_la_familia';
      elsif v_antes.rechazada_at is not null and v_antes.cantidad is not distinct from v_nueva.cantidad then
        v_motivo := 'ya_lo_rechazo';
      end if;
    end if;
    if v_motivo is not null then
      v_sin_hacer := v_sin_hacer || jsonb_build_array(jsonb_build_object('preferencia_id', v_antes.id, 'motivo', v_motivo));
      continue;
    end if;

    if v_habia then
      -- Nada cuelga de una preferencia: cambiarla es sustituir su fila, con su id, su alta y su confirmación.
      v_nueva.id := v_antes.id;
      v_nueva.created_at := v_antes.created_at;
      v_nueva.confirmado_at := case when p->'confirmado' = 'true'::jsonb then coalesce(v_antes.confirmado_at, now()) end;
      delete from public.preferencia where household_id = v_casa and id = v_antes.id;
    else
      v_nueva.id := coalesce(v_pid, gen_random_uuid());
      v_nueva.created_at := now();
      v_nueva.confirmado_at := case when p->'confirmado' = 'true'::jsonb then now() end;
    end if;
    insert into public.preferencia select (v_nueva).*;
    v_inv_prefs := v_inv_prefs || jsonb_build_array(jsonb_build_object('preferencia_id', v_nueva.id,
      'antes', case when v_habia then to_jsonb(v_antes) - 'household_id' end));
    v_hecho := v_hecho || jsonb_build_array(jsonb_build_object('preferencia_id', v_nueva.id, 'nueva', not v_habia));
  end loop;

  update public.household_state set bot_rev = bot_rev + 1 where household_id = v_casa returning bot_rev into v_rev;

  -- La inversa de preferencias no la conoce aún deshacer_operacion (0111/0115): sin «datos», falla en alto si se pide.
  update public.operacion
     set estado = 'hecha', hecho = v_hecho, sin_hacer = v_sin_hacer, ejecutada_at = now(),
         autor_persona_id = (select x.id from public.persona x where x.household_id = v_casa and x.id = nullif(p_operacion->>'autor_persona_id', '')),
         inversa = jsonb_build_object('preferencias', v_inv_prefs, 'planes', v_inv_planes)
   where household_id = v_casa and id = v_id;

  return jsonb_build_object('operacion_id', v_id, 'estado', 'hecha', 'repetida', false, 'hecho', v_hecho,
                            'sin_hacer', v_sin_hacer, 'choques', '[]'::jsonb, 'rev', v_rev);
end $$;

revoke all on function public.escribir_preferencias(jsonb) from public, anon, authenticated;
grant execute on function public.escribir_preferencias(jsonb) to service_role;
comment on function public.escribir_preferencias(jsonb) is
  'La única escritura de preferencia y plan_preferencias (trozo 14): una operación con sus conjuntos y sus preferencias (crear o cambiar por id o por firma, borrar, rechazar); lo supuesto no pisa lo dicho ni repite lo rechazado; guarda la inversa y sube bot_rev. Idempotente por (casa, clave). Solo la service role (la tubería del servidor).';

-- 5. preferencias_de_casa -------------------------------------------------------------------------------------
-- {v: 1, rev, preferencias: [fila sin household_id], planes: [fila sin household_id]}, por su alta. Todas, también
-- las rechazadas (para no volver a suponerlas) y las de fuera de fecha: quien lee decide qué vale hoy.
create function public.preferencias_de_casa(p_casa uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'preferencias_de_casa: hace falta sesión' using errcode = '42501';
  end if;
  if auth.uid() is not null and not exists (
       select 1 from public.household_members m where m.household_id = p_casa and m.user_id = auth.uid()) then
    raise exception 'preferencias_de_casa: no eres de esta casa' using errcode = '42501';
  end if;
  return jsonb_build_object('v', 1,
    'rev', (select s.bot_rev from public.household_state s where s.household_id = p_casa),
    'preferencias', coalesce((select jsonb_agg(to_jsonb(x) - 'household_id' order by x.created_at, x.id)
                                from public.preferencia x where x.household_id = p_casa), '[]'::jsonb),
    'planes', coalesce((select jsonb_agg(to_jsonb(x) - 'household_id' order by x.created_at, x.id)
                          from public.plan_preferencias x where x.household_id = p_casa), '[]'::jsonb));
end $$;

revoke all on function public.preferencias_de_casa(uuid) from public, anon, authenticated;
grant execute on function public.preferencias_de_casa(uuid) to authenticated, service_role;
comment on function public.preferencias_de_casa(uuid) is
  'Las preferencias y los conjuntos de la casa (trozo 14): de aquí monta la libreta la app y Lola (src/lib/preferencias.js). Para los de la casa y la service role. Solo lee.';

-- 6. senal -------------------------------------------------------------------------------------------------------
-- Una fila por (casa, cuenta, eje, valor), nunca una por evento (Pablo, 30 oct). user_id null = de la casa; con
-- cuenta, del Trato de esa persona (trozo 16). La escriben y la leen los trozos 15 y 16 (src/lib/senales.js).
create table public.senal (
  id           bigint generated always as identity primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete cascade,
  eje          text not null references public.registro_eje(id) on delete restrict,
  valor        jsonb not null,
  peso         numeric not null default 0,
  veces        integer not null default 0,
  ultima_at    timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  constraint senal_veces check (veces >= 0)
);
create unique index senal_unica on public.senal (household_id, user_id, eje, valor) nulls not distinct;
create index senal_cuenta on public.senal (user_id);
create index senal_eje on public.senal (eje);
comment on table public.senal is
  'Lo que la familia hace (cambios, votos, descartes), contado por casa o cuenta × eje × valor con un peso que olvida (senal_decaer, de noche). Al pasar un umbral escribe una preferencia visto (trozo 15). Solo el servidor.';
alter table public.senal enable row level security;
revoke all on table public.senal from anon, authenticated;

-- La fórmula vive aquí y en ningún otro sitio (senales.js solo lee el peso): la mitad cada 60 días, aplicada cada
-- noche; lo que ya no pesa se borra (una señal vieja no ocupa una fila para siempre).
create function public.senal_decaer() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_semivida_dias constant numeric := 60;
  c_suelo constant numeric := 0.05;
  v_n integer;
begin
  update public.senal set peso = peso * power(0.5, 1 / c_semivida_dias) where peso <> 0;
  delete from public.senal where abs(peso) < c_suelo;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.senal_decaer() from public, anon, authenticated;

-- 7. Historiales ------------------------------------------------------------------------------------------------
-- Solo se añaden, con fecha y poda (plan, «Las cuatro clases de dato»). Hoy viven en data.priceObs, data.receipts y
-- data.cookedDishes; el trozo 22 los escribe aquí y deja de escribirlos allí (no se copian los viejos).
create table public.ticket (
  household_id uuid not null references public.households(id) on delete cascade,
  id           text not null,
  super        text,
  comprado_at  timestamptz not null,
  total        numeric not null,
  lineas       integer not null,
  created_at   timestamptz not null default now(),
  primary key (household_id, id),
  constraint ticket_total check (total >= 0 and lineas >= 0)
);
comment on table public.ticket is
  'Un ticket de la compra que sube la familia (hoy data.receipts): súper, fecha, total y líneas. Lo escribe el trozo 22; se poda a los 90 días (historial_podar). Solo el servidor.';
comment on column public.ticket.id is 'El id del ticket (ids.ticket, src/lib/ids.js), generado en el cliente.';

create table public.precio_observado (
  household_id    uuid not null references public.households(id) on delete cascade,
  id              text not null,
  ticket_id       text,
  ingrediente_id  text,
  nombre          text not null,
  marca           text,
  super           text,
  precio          numeric not null,
  cantidad        numeric,
  unidad          text,
  tamano_cantidad numeric,
  tamano_unidad   text,
  fuente          text not null,
  tipo            text not null,
  comprado_at     timestamptz not null,
  created_at      timestamptz not null default now(),
  primary key (household_id, id),
  constraint precio_observado_ticket_fk foreign key (household_id, ticket_id)
    references public.ticket(household_id, id) on delete cascade,
  constraint precio_observado_precio check (precio >= 0),
  constraint precio_observado_fuente_vocabulario check (fuente in ('manual', 'receipt')),
  constraint precio_observado_tipo_vocabulario check (tipo in ('food', 'prefab', 'nonfood'))
);
create index precio_observado_ticket on public.precio_observado (household_id, ticket_id);
comment on table public.precio_observado is
  'Un precio visto: una línea de ticket o un gasto a mano (hoy data.priceObs). Lo escribe el trozo 22; se poda a los 90 días (historial_podar). Solo el servidor.';
comment on column public.precio_observado.ingrediente_id is 'Alimento del catálogo del bundle (src/data/ingredients.json): sin FK a propósito.';
comment on column public.precio_observado.id is 'El id del gasto (ids.gasto) o «<ticket>-<línea>», generado en el cliente.';

create table public.cocinado (
  id           bigint generated always as identity primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  receta_id    text not null,
  semana       date not null,
  dia          text not null,
  comida       text not null,
  cocinado_at  timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  constraint cocinado_dia_vocabulario check (dia in ('Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom')),
  constraint cocinado_comida_vocabulario check (comida in ('Desayuno', 'Comida', 'Merienda', 'Cena', 'Postre'))
);
create unique index cocinado_unico on public.cocinado (household_id, semana, dia, comida, receta_id);
comment on table public.cocinado is
  'Un plato cocinado de un hueco de la semana (hoy data.cookedDishes): lo escribe el trozo 22; se poda al año (historial_podar). Solo el servidor.';
comment on column public.cocinado.receta_id is 'Receta del catálogo del bundle o propia (user_recipes): polimórfica, sin FK a propósito.';

alter table public.ticket enable row level security;
alter table public.precio_observado enable row level security;
alter table public.cocinado enable row level security;
revoke all on table public.ticket, public.precio_observado, public.cocinado from anon, authenticated;

-- Los plazos, escritos una sola vez (plan, trozo 14): 90 días los precios y los tickets, un año lo cocinado.
create function public.historial_podar() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_precios constant interval := interval '90 days';
  c_cocinado constant interval := interval '1 year';
  v_n integer;
  v_total integer := 0;
begin
  delete from public.precio_observado where comprado_at < now() - c_precios;
  get diagnostics v_n = row_count; v_total := v_total + v_n;
  delete from public.ticket where comprado_at < now() - c_precios;
  get diagnostics v_n = row_count; v_total := v_total + v_n;
  delete from public.cocinado where cocinado_at < now() - c_cocinado;
  get diagnostics v_n = row_count; v_total := v_total + v_n;
  return v_total;
end $$;
revoke all on function public.historial_podar() from public, anon, authenticated;

-- 8. De noche, como bot-retencion (0065:47) ---------------------------------------------------------------------
select cron.schedule('senal-decaer', '23 3 * * *', 'select public.senal_decaer()');
select cron.schedule('historial-podar', '29 3 * * *', 'select public.historial_podar()');

-- 9. Autoprueba (se deshace siempre) ---------------------------------------------------------------------------
-- En una casa de prueba que crea aquí: crea una preferencia dicha en su conjunto; la misma clave no repite; decirla
-- otra vez no la duplica; lo supuesto no pisa lo dicho; lo supuesto rechazado no vuelve; borrar; un valor de otro
-- tipo y una semana que no es lunes no entran; la casa lee lo suyo; la señal pierde peso y la poda quita lo viejo.
do $$
declare
  v_dueno uuid; v_casa uuid; v_r jsonb; v_n integer; v_p uuid; v_s uuid;
  v_plan constant uuid := '00000000-0000-4000-8000-0000000001d9';
  v_base jsonb; v_sis jsonb;
  v_pesc constant jsonb := '{"nivel": "semana", "eje": "composicion", "medida": "cuenta", "operador": "como_mucho", "valor": "pescado", "cantidad": 2, "fuerza": "obligatoria"}';
  v_horno constant jsonb := '{"nivel": "plato", "eje": "tecnica", "medida": "valor", "operador": "mas", "valor": "horno", "cantidad": 1, "fuerza": "bajo", "origen": "supuesto"}';
begin
  select owner_user_id into v_dueno from public.households order by created_at limit 1;
  if v_dueno is null then raise notice '0109 autoprueba: no hay ninguna casa, no se prueba'; return; end if;
  begin
    insert into public.households (name, owner_user_id, propia) values ('Autoprueba 0109', v_dueno, false) returning id into v_casa;
    insert into public.household_members (household_id, user_id, role) values (v_casa, v_dueno, 'owner');
    insert into public.household_state (household_id) values (v_casa);
    perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
    v_base := jsonb_build_object('casa', v_casa, 'accion', 'ajustar_preferencias', 'canal', 'app', 'ref_tipo', 'pantalla',
                                 'ref_id', 'autoprueba', 'autor_user_id', v_dueno);
    v_sis := v_base || jsonb_build_object('canal', 'sistema', 'ref_tipo', 'cron', 'autor_user_id', null);

    -- Crear, en su conjunto, y la misma clave otra vez no repite.
    v_r := public.escribir_preferencias(v_base || jsonb_build_object('clave', 'ap-1',
             'planes', jsonb_build_array(jsonb_build_object('id', v_plan, 'nombre', 'Semana ligera')),
             'preferencias', jsonb_build_array(v_pesc || jsonb_build_object('plan_id', v_plan))));
    v_p := (v_r->'hecho'->1->>'preferencia_id')::uuid;
    if v_r->>'estado' <> 'hecha' or v_p is null or (select dicho_by from public.preferencia where id = v_p) is distinct from v_dueno then
      raise exception '0109 autoprueba: no crea la preferencia dicha (%)', v_r;
    end if;
    v_r := public.escribir_preferencias(v_base || jsonb_build_object('clave', 'ap-1', 'preferencias', jsonb_build_array(v_pesc)));
    if v_r->>'repetida' <> 'true' then raise exception '0109 autoprueba: la misma clave ha vuelto a escribir'; end if;

    -- Decirla otra vez, sin id, la cambia en su fila; lo supuesto no la pisa.
    v_r := public.escribir_preferencias(v_base || jsonb_build_object('clave', 'ap-2',
             'preferencias', jsonb_build_array(v_pesc || jsonb_build_object('plan_id', v_plan, 'cantidad', 3))));
    select count(*) into v_n from public.preferencia where household_id = v_casa;
    if v_n <> 1 or (v_r->'hecho'->0->>'preferencia_id')::uuid is distinct from v_p
       or (select cantidad from public.preferencia where id = v_p) is distinct from 3 then
      raise exception '0109 autoprueba: decirla otra vez la duplica o no la cambia (% filas, %)', v_n, v_r;
    end if;
    v_r := public.escribir_preferencias(v_sis || jsonb_build_object('clave', 'ap-3',
             'preferencias', jsonb_build_array(v_pesc || jsonb_build_object('plan_id', v_plan, 'cantidad', 1, 'origen', 'supuesto'))));
    if v_r->'sin_hacer'->0->>'motivo' is distinct from 'ya_lo_dijo_la_familia'
       or (select cantidad from public.preferencia where id = v_p) is distinct from 3 then
      raise exception '0109 autoprueba: lo supuesto ha pisado lo dicho (%)', v_r;
    end if;

    -- Lo supuesto y rechazado no se vuelve a suponer; borrar.
    v_r := public.escribir_preferencias(v_sis || jsonb_build_object('clave', 'ap-4', 'preferencias', jsonb_build_array(v_horno)));
    v_s := (v_r->'hecho'->0->>'preferencia_id')::uuid;
    perform public.escribir_preferencias(v_base || jsonb_build_object('clave', 'ap-5',
              'preferencias', jsonb_build_array(jsonb_build_object('id', v_s, 'rechazar', true))));
    v_r := public.escribir_preferencias(v_sis || jsonb_build_object('clave', 'ap-6', 'preferencias', jsonb_build_array(v_horno)));
    if v_r->'sin_hacer'->0->>'motivo' is distinct from 'ya_lo_rechazo' then
      raise exception '0109 autoprueba: lo rechazado se ha vuelto a suponer (%)', v_r;
    end if;
    v_r := public.escribir_preferencias(v_base || jsonb_build_object('clave', 'ap-7',
             'preferencias', jsonb_build_array(jsonb_build_object('id', v_s, 'borrar', true))));
    if exists (select 1 from public.preferencia where id = v_s) or v_r->'hecho'->0->>'borrada' is distinct from 'true'
       or (select inversa->'preferencias'->0->'antes'->>'valor' from public.operacion where id = (v_r->>'operacion_id')::uuid) is distinct from 'horno' then
      raise exception '0109 autoprueba: borrar no borra o no guarda la inversa (%)', v_r;
    end if;

    -- Lo que no cuadra no entra.
    begin
      perform public.escribir_preferencias(v_base || jsonb_build_object('clave', 'ap-8',
                'preferencias', jsonb_build_array(v_pesc || '{"eje": "kcal", "medida": "suma", "valor": "mucho"}')));
      raise exception '0109 autoprueba: ha entrado un texto en un eje numérico';
    exception when check_violation then null;  -- a propósito: el disparador lo rechaza
    end;
    begin
      perform public.escribir_preferencias(v_base || jsonb_build_object('clave', 'ap-9',
                'preferencias', jsonb_build_array(v_pesc || '{"semanas": ["2026-11-03"]}')));
      raise exception '0109 autoprueba: ha entrado una semana que no empieza en lunes';
    exception when check_violation then null;  -- a propósito: el disparador lo rechaza
    end;
    begin
      perform public.escribir_preferencias(v_base || jsonb_build_object('clave', 'ap-10', 'autor_persona_id', 'p_de_otra_casa',
                'preferencias', jsonb_build_array(v_pesc)));
      raise exception '0109 autoprueba: ha entrado una persona autora que no es de la casa';
    exception when insufficient_privilege then null;  -- a propósito: «la persona autora no es de esta casa» (42501)
    end;

    -- La casa lee lo suyo; alguien de fuera, no.
    perform set_config('request.jwt.claims', json_build_object('sub', v_dueno, 'role', 'authenticated')::text, true);
    v_r := public.preferencias_de_casa(v_casa);
    if jsonb_array_length(v_r->'preferencias') <> 1 or jsonb_array_length(v_r->'planes') <> 1 then
      raise exception '0109 autoprueba: la casa no lee sus preferencias (%)', v_r;
    end if;
    perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
    begin
      perform public.preferencias_de_casa(v_casa);
      raise exception '0109 autoprueba: alguien de fuera ha leído las preferencias de una casa';
    exception when insufficient_privilege then null;  -- a propósito: «no eres de esta casa» (42501) es lo esperado
    end;
    perform set_config('request.jwt.claims', '', true);

    -- La señal pierde peso y lo que ya no pesa se va; la poda quita lo viejo y deja lo nuevo.
    insert into public.senal (household_id, eje, valor, peso, veces) values
      (v_casa, 'tecnica', '"horno"', 2, 3), (v_casa, 'tecnica', '"frito"', 0.04, 1);
    perform public.senal_decaer();
    if coalesce(abs((select peso from public.senal where household_id = v_casa and valor = '"horno"') - 2 * power(0.5, 1 / 60.0)) > 0.000001, true)
       or exists (select 1 from public.senal where household_id = v_casa and valor = '"frito"') then
      raise exception '0109 autoprueba: senal_decaer no quita peso o no borra lo que ya no pesa';
    end if;
    insert into public.ticket (household_id, id, comprado_at, total, lineas) values
      (v_casa, 'tk_viejo', now() - interval '91 days', 10, 1), (v_casa, 'tk_nuevo', now(), 5, 1);
    insert into public.precio_observado (household_id, id, ticket_id, nombre, precio, fuente, tipo, comprado_at) values
      (v_casa, 'tk_viejo-0', 'tk_viejo', 'Arroz', 10, 'receipt', 'food', now() - interval '91 days'),
      (v_casa, 'tk_nuevo-0', 'tk_nuevo', 'Arroz', 5, 'receipt', 'food', now());
    insert into public.cocinado (household_id, receta_id, semana, dia, comida, cocinado_at) values
      (v_casa, 'r_viejo', '2025-01-06', 'Lun', 'Cena', now() - interval '13 months'),
      (v_casa, 'r_nuevo', '2026-11-02', 'Lun', 'Cena', now());
    perform public.historial_podar();
    if (select count(*) from public.ticket where household_id = v_casa) <> 1
       or (select count(*) from public.precio_observado where household_id = v_casa) <> 1
       or (select count(*) from public.cocinado where household_id = v_casa) <> 1 then
      raise exception '0109 autoprueba: historial_podar no quita lo viejo o quita lo nuevo';
    end if;

    raise exception 'autoprueba 0109 bien' using errcode = 'MP109';
  exception when sqlstate 'MP109' then
    raise notice '0109 autoprueba: crea en su conjunto, no repite la clave ni duplica, lo supuesto no pisa lo dicho ni vuelve si se rechazó, borra con inversa, rechaza lo que no cuadra, la casa lee lo suyo y nadie más, la señal decae y la poda quita lo viejo (deshecho)';
  end;
end $$;
