-- ═══ Consentimiento legal: quién aceptó qué, y cuándo ═══════════════════════
--
-- Hoy no hay ningún sitio que guarde "esta persona aceptó la política de
-- privacidad y los términos". La página de privacidad existe pero solo se
-- enlaza en Ajustes (y solo con sesión); los términos ni eso. El bot no lo
-- menciona nunca. Con alergias y datos de niños de por medio, esto hace falta
-- antes de abrir el piloto más allá de los socios.
--
-- La regla: un texto con versión (src/lib/legal.js, LEGAL_VERSION), y quien
-- acepta queda con esa versión y la fecha en su perfil. Si el texto cambia, se
-- sube la versión y a quien tenga una antigua se le vuelve a preguntar — tanto
-- la app como el bot comparten la misma constante, así que da igual por dónde
-- entrara.

alter table public.user_profiles
  add column if not exists legal_version      text,
  add column if not exists legal_accepted_at  timestamptz;

comment on column public.user_profiles.legal_version is
  'La versión de privacidad.html + terminos.html (src/lib/legal.js LEGAL_VERSION) que esta persona aceptó. NULL = nunca aceptó.';
comment on column public.user_profiles.legal_accepted_at is
  'Cuándo aceptó esa versión. Guardarlo (no solo un booleano) es lo que permite demostrarlo si hace falta.';
