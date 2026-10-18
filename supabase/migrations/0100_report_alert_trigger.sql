-- ═══ Que un reporte avise a alguien ════════════════════════════════════════
--
-- La Guideline 1.2 de App Store no se conforma con que exista un boton de
-- reportar: pide actuar sobre lo reportado en un plazo razonable. Hasta ahora
-- las filas de content_reports se quedaban esperando a que alguien entrase a
-- mirar — lo admitia el propio docstring de ReportSheet.jsx.
--
-- ── Por que un trigger y no un Database Webhook del panel ─────────────────
-- Un webhook configurado a mano en el dashboard no vive en el repositorio:
-- nadie lo revisa, nadie sabe que existe, y al levantar otro entorno no
-- aparece. Esto si viaja con las migraciones.
--
-- ── Por que el trigger manda SOLO el id ───────────────────────────────────
-- Para no guardar ningun secreto en la base. El endpoint lee el reporte con la
-- service-role key y firma el enlace de retirada con MODERATION_SECRET, que
-- vive solo en Vercel. Si esto mandara un token, ese token estaria escrito en
-- una migracion de un repositorio publico.
--
-- ── Por que nunca puede tumbar el insert ──────────────────────────────────
-- El EXCEPTION de abajo no es decoracion. Sin el, un fallo de pg_net haria
-- fallar el INSERT, y entonces reportar contenido ofensivo dejaria de
-- funcionar justo cuando mas falta hace. Si el aviso se pierde, la fila se
-- guarda igual y queda el WARNING.

-- ── Ya puede estar en producción ─────────────────────────────────────────
-- La función y el trigger pudieron crearse a mano antes de llegar a staging:
-- todo es repetible (create or replace, drop trigger if exists). Respecto a lo
-- que hubiera, añade pg_temp al search_path y quita el execute a public, anon
-- y authenticated: toca permisos de algo que pudo existir, así que la aplica
-- Pablo con --pablo. Un trigger no necesita execute del que inserta.
--
-- Consulta previa (solo lectura):
--   select proconfig, proacl from pg_proc where proname = 'notify_content_report';
-- Plan B: sin el trigger, los reportes se guardan igual y esperan revisión a mano.
-- Objeto testigo: el trigger trg_notify_content_report en public.content_reports.

set lock_timeout = '5s';

create extension if not exists pg_net;

create or replace function public.notify_content_report()
returns trigger
language plpgsql
security definer
set search_path = public, net, pg_temp
as $$
begin
  begin
    perform net.http_post(
      url := 'https://homenu.vercel.app/api/report-alert',
      body := jsonb_build_object('id', new.id),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  exception when others then
    raise warning 'notify_content_report: no se pudo avisar del reporte %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists trg_notify_content_report on public.content_reports;
create trigger trg_notify_content_report
  after insert on public.content_reports
  for each row execute function public.notify_content_report();

revoke execute on function public.notify_content_report() from public, anon, authenticated;

comment on function public.notify_content_report is
  'Avisa a /api/report-alert al entrar un reporte. Falla en silencio: el aviso nunca puede impedir que se reporte.';
