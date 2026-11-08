-- El presupuesto sale del registro de campos con sobre (plan fichas con estado, trozo 14; #1037): es una preferencia
-- de la casa sobre la semana («el coste de la semana, como mucho N €»), una fila de `preferencia` (eje coste, medida
-- suma, operador como_mucho; src/lib/presupuestoCasa.js), y no un dato de la ficha Casa con sobre como lo dejó la
-- 0112. Sin lector, su fila de registro_campo sobra: se borra.
--
--   · registro_campo pierde 'presupuesto'. registroCampos.test.js compara el último INSERT de registro_campo (la
--     0114) menos lo que borran las migraciones que la siguen con REGISTRO_CAMPOS.
--
-- NO hace: no copia ningún presupuesto a `preferencia` (sin repoblar: cada casa lo vuelve a decir). Si alguna casa
-- tiene ya un sobre de presupuesto, NO lo borra: aborta y lo dice (borrar datos de familias lo decide Pablo). No toca
-- RLS, permisos, columnas ni funciones. Va tras la 0112 (que creó la fila) y la 0109 (preferencia), que comprueba.
-- Plan B (regla migraciones): la rama se despliega antes. Sin esta, la fila de registro_campo se queda sin que nadie
-- la escriba ni la lea (ficha_casa la devuelve y la app y Lola no la piden).
-- Consulta previa, justo antes de aplicarla (debe dar 1, 0 y 0): select (select count(*) from registro_campo where
--   id = 'presupuesto'), (select count(*) from sobre where campo = 'presupuesto'),
--   (select count(*) from bot_tareas where campo = 'presupuesto');
-- Tras aplicarla, una app con la versión vieja en caché que mande el sobre de presupuesto falla en alto
-- (aplicar_operacion no conoce el campo), con los demás datos de esa operación: pasajero.
-- Sin objeto testigo (solo una fila): la primera cuenta da 0 después.
-- AUDITADA: auditor-datos 2026-11-02 OK
set lock_timeout = '5s';

do $$
declare
  v_sobres integer;
begin
  if to_regclass('public.preferencia') is null then
    raise exception 'Falta la 0109 (preferencia): aplícala antes que la 0118';
  end if;
  if not exists (select 1 from public.registro_campo where id = 'presupuesto') then
    raise exception 'presupuesto no está en registro_campo: ¿la 0118 ya está aplicada?';
  end if;
  select count(*) into v_sobres from public.sobre where campo = 'presupuesto';
  if v_sobres > 0 then
    raise exception 'Hay % sobres de presupuesto de familias: no se borran sin que Pablo lo decida', v_sobres;
  end if;
end $$;

delete from public.registro_campo where id = 'presupuesto';

-- Autoprueba: la fila ya no está.
do $$
begin
  if exists (select 1 from public.registro_campo where id = 'presupuesto') then
    raise exception 'autoprueba 0118: presupuesto sigue en registro_campo';
  end if;
  raise notice 'autoprueba 0118: presupuesto fuera de registro_campo';
end $$;
