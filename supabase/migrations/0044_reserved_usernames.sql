-- ── 0044: handles reservados y con al menos un caracter identificable ──────
--
-- Nada impedia registrarse como @soporte, @admin o @homenu.oficial y parecer
-- la app hablando. El handle es la unica identidad fuerte del feed (el
-- display_name es texto libre a proposito: la gente se llama como se llama),
-- asi que es aqui donde se corta la suplantacion.
--
-- Tres reglas nuevas, las mismas que usernameError en el cliente — si
-- divergieran, el formulario diria que si y el guardado fallaria sin
-- explicar (misma doctrina que el CHECK de formato de la 0027):
--
--   1. Lista exacta de nombres de confianza (admin, soporte, ayuda...).
--   2. Veto por marca: ningun handle puede CONTENER "homenu" ni "menuplan".
--      La lista sola no para "homenu.oficial" ni "soporte_homenu".
--   3. Al menos una letra o numero: "..." y "._." pasan el formato pero no
--      identifican a nadie.
--
-- Sobre el "y si ya existiera uno": un ALTER TABLE ADD CONSTRAINT valida
-- todas las filas existentes; si alguien ya tuviera un handle vetado, la
-- migracion fallaria en el acto en vez de dejar la trampa dentro — que es
-- exactamente lo que queremos saber al aplicarla.

alter table public.social_profiles
  drop constraint if exists chk_social_username_reserved;

alter table public.social_profiles
  add constraint chk_social_username_reserved
  check (
    username is null
    or (
      username !~ 'homenu|menuplan'
      and username ~ '[a-z0-9]'
      and username <> all (array[
        'admin', 'administrador', 'soporte', 'support', 'ayuda', 'help',
        'info', 'contacto', 'oficial', 'official', 'equipo', 'staff',
        'moderador', 'moderacion', 'mod', 'seguridad', 'security',
        'sistema', 'system', 'api', 'root', 'noreply', 'news', 'legal',
        'privacidad', 'terminos'
      ])
    )
  );
