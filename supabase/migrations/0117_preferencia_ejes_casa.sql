-- Cinco ejes de la casa en registro_eje (plan fichas con estado, trozo 14; #1037): los que necesitan las preferencias
-- que aún viven en el documento y no tienen eje del catálogo, `mealStyleByGroup` y `kidDinnerConfig`. Sin su fila,
-- preferencia.eje (FK a registro_eje) no los admite y escribir_preferencias aborta la operación entera.
-- AUDITADA: auditor-datos 2026-11-02 OK
--   (un agente independiente, que no la escribió: cinco filas que cuadran con EJES n 81-85 y con kidDinnerConfig y
--   mealStyleByGroup; la autoprueba solo usa household_id, captura el 23514 del disparador y se deshace; sin RLS,
--   permisos ni datos de familias; tests y ensayo PGlite en verde)
--
--   · estiloComida (enum): el estilo de comida de un menú, una preferencia por grupo.
--   · comeConLaFamilia (booleano), cenaDelMediodia (booleano), repiteDelComedor (enum) y comePocasCosas (booleano):
--     lo que la comida y la cena de cada niño copian o evitan, preferencias de su persona con ámbito de comida.
--   Los cinco, en src/data/axisRegistry.js (EJES); supabase/preferencia.test.js compara la suma de los INSERT de
--   registro_eje (la 0109 y esta) con EJES.
--
-- NO hace: no escribe ninguna preferencia ni toca filas de familias (las casas los estrenan vacíos, sin repoblar
-- desde el documento); no toca RLS, permisos, columnas ni funciones. Va tras la 0109 (registro_eje), que comprueba.
-- Plan B (regla migraciones): la rama se despliega antes. Sin esta, una preferencia de estos ejes no se guarda:
-- escribir_preferencias falla (FK) y la app y Lola lo dicen; las demás preferencias no cambian.
-- Consulta previa (debe dar 0): select count(*) from registro_eje where id in ('estiloComida', 'comeConLaFamilia',
--   'cenaDelMediodia', 'repiteDelComedor', 'comePocasCosas');
-- Sin objeto testigo (solo filas): la consulta previa da 5 después.
set lock_timeout = '5s';

do $$
begin
  if to_regclass('public.registro_eje') is null then
    raise exception 'Falta la 0109 (registro_eje): aplícala antes que la 0117';
  end if;
  if exists (select 1 from public.registro_eje where id = 'estiloComida') then
    raise exception 'estiloComida ya está en registro_eje: ¿la 0117 ya está aplicada?';
  end if;
end $$;

insert into public.registro_eje (id, tipo) values
  ('estiloComida', 'enum'), ('comeConLaFamilia', 'booleano'), ('cenaDelMediodia', 'booleano'), ('repiteDelComedor', 'enum'),
  ('comePocasCosas', 'booleano');

-- Autoprueba: los cinco, con su tipo; y la base acepta y rechaza el valor por el tipo de su eje (preferencia_valida).
do $$
declare
  v_casa uuid;
  v_n integer;
begin
  select count(*) into v_n from public.registro_eje
   where (id, tipo) in (('estiloComida', 'enum'), ('comeConLaFamilia', 'booleano'), ('cenaDelMediodia', 'booleano'),
                        ('repiteDelComedor', 'enum'), ('comePocasCosas', 'booleano'));
  if v_n <> 5 then
    raise exception 'autoprueba 0117: % de los 5 ejes con su tipo', v_n;
  end if;
  -- Con una casa cualquiera y dentro de un bloque que se deshace al final: no deja ninguna fila.
  select id into v_casa from public.households limit 1;
  if v_casa is not null then
    begin
      insert into public.preferencia (household_id, nivel, eje, medida, operador, valor, fuerza, origen, canal)
      values (v_casa, 'semana', 'estiloComida', 'valor', 'es', '"ligero"', 'alto', 'dicho', 'sistema');
      begin
        insert into public.preferencia (household_id, nivel, eje, medida, operador, valor, fuerza, origen, canal)
        values (v_casa, 'comida', 'comeConLaFamilia', 'valor', 'es', '"si"', 'obligatoria', 'dicho', 'sistema');
        raise exception 'autoprueba 0117: un texto en un eje sí/no entró';
      exception when check_violation then
        -- Solo el rechazo que se busca (el del disparador por el tipo del eje); otro CHECK se relanza.
        if sqlerrm not like 'preferencia: el eje comeConLaFamilia%' then
          raise;
        end if;
      end;
      raise exception 'autoprueba_0117_deshecha';
    exception when raise_exception then
      if sqlerrm <> 'autoprueba_0117_deshecha' then
        raise;
      end if;
    end;
  end if;
  raise notice 'autoprueba 0117: los 5 ejes de la casa, con su tipo y su valor comprobado';
end $$;
