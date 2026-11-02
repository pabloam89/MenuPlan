-- La señal de la casa por Realtime (plan fichas con estado, trozo 20; #1037).
--
-- La app se entera de que otro (Lola, la pareja, otro aparato) ha escrito en la casa mirando household_state.bot_rev
-- cada 20 s y al volver a la pestaña. Con esta migración, cada vez que bot_rev sube, la base manda un mensaje de
-- Realtime (Broadcast) al tema privado `casa:<household_id>` con la versión nueva, y la app que lo escucha recarga al
-- momento (src/lib/realtimeCasa.js). Una sola señal por casa, no una por tabla; sin tabla nueva: el dato sigue siendo
-- solo bot_rev (los mensajes viven en realtime.messages, que Supabase poda solo).
--
--   · _avisar_rev_de_casa (nueva, disparador, sin permisos para nadie): realtime.send({rev}, 'rev', 'casa:<id>', privado).
--     realtime.send de Supabase no aborta si falla (deja un warning): un aviso que no sale no tumba el guardado.
--   · casa_rev_avisa (nuevo disparador): tras subir bot_rev en household_state, sea quien sea quien lo suba (la app,
--     bot_save_casa, aplicar_operacion y los demás de la 0106 a la 0115): un solo sitio.
--   · _puede_oir_casa (nueva): si el tema es `casa:<uuid>` y quien escucha es miembro de esa casa (is_household_member).
--   · casa_oye_su_senal (política nueva en realtime.messages): un usuario con sesión solo recibe la señal de su casa.
--
-- NO hace: no dice qué ficha cambió (la app recarga como hoy; llega cuando aplicar_operacion lo apunte), no toca
-- household_state ni sus permisos, ni otras políticas, ni datos de familias.
-- Toca RLS (una política nueva en realtime.messages): la lanza Pablo con --pablo.
-- Plan B (regla migraciones): sin ella, la app no recibe ninguna señal y sigue con el sondeo de 20 s, como hoy
-- (realtimeCasa.js solo apaga el sondeo mientras el canal está suscrito).
-- Testigo: la función public._puede_oir_casa(text).

set lock_timeout = '5s';

-- ── 1. El aviso, al subir la versión ─────────────────────────────────────────
create or replace function public._avisar_rev_de_casa()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform realtime.send(jsonb_build_object('rev', new.bot_rev), 'rev', 'casa:' || new.household_id::text, true);
  return null;
end;
$$;

revoke all on function public._avisar_rev_de_casa() from public, anon, authenticated;

drop trigger if exists casa_rev_avisa on public.household_state;
create trigger casa_rev_avisa
  after update of bot_rev on public.household_state
  for each row
  when (new.bot_rev is distinct from old.bot_rev)
  execute function public._avisar_rev_de_casa();

-- ── 2. Quién la oye: solo los de la casa ─────────────────────────────────────
create or replace function public._puede_oir_casa(p_topic text)
returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  -- Antes de convertir a uuid: un tema que no es de casa no es error, es «no».
  if p_topic is null or p_topic !~ '^casa:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.is_household_member(substr(p_topic, 6)::uuid);
end;
$$;

revoke all on function public._puede_oir_casa(text) from public, anon, authenticated;
grant execute on function public._puede_oir_casa(text) to authenticated;

drop policy if exists casa_oye_su_senal on realtime.messages;
create policy casa_oye_su_senal on realtime.messages
  for select to authenticated
  using (realtime.messages.extension = 'broadcast' and public._puede_oir_casa((select realtime.topic())));

comment on function public._puede_oir_casa(text) is
  'Trozo 20 de #1037: si quien escucha por Realtime el tema casa:<id> es de esa casa. La usa la política casa_oye_su_senal de realtime.messages; la señal la manda _avisar_rev_de_casa al subir bot_rev.';

-- ── 3. Autoprueba ────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'casa_rev_avisa' and tgrelid = 'public.household_state'::regclass) then
    raise exception '0121: falta el disparador casa_rev_avisa';
  end if;
  if public._puede_oir_casa('casa:no-es-un-uuid') or public._puede_oir_casa('otra:00000000-0000-0000-0000-000000000000') then
    raise exception '0121: _puede_oir_casa deja oír un tema que no es de casa';
  end if;
  if not exists (select 1 from pg_policy where polname = 'casa_oye_su_senal' and polrelid = 'realtime.messages'::regclass) then
    raise exception '0121: falta la política casa_oye_su_senal';
  end if;
end;
$$;
