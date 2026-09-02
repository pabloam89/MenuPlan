-- ═══ El perfil nuevo nace visible para quien tú aceptes ════════════════════
--
-- Hasta ahora `social_profiles.visibility` nacía en 'private' (0027). Era la
-- opción prudente, pero tenía una consecuencia que solo se ve con la app en
-- marcha: NADIE aparecía en las búsquedas, ni siquiera gente que ya tenía
-- cuenta y quería encontrarse. La parte social arrancaba vacía para todo el
-- mundo, y la decisión de abrirse vivía escondida en un ajuste que nadie
-- visitaba.
--
-- 'followers' es el punto medio real, no una rendija abierta:
--   · te encuentran por tu nombre o tu @,
--   · pero tus recetas y menús publicados solo los ve quien TÚ hayas
--     aceptado — el seguimiento sigue siendo con solicitud.
-- O sea: se hace descubrible tu NOMBRE, nunca tu contenido.
--
-- ── Lo que este cambio NO hace ─────────────────────────────────────────────
-- No toca ni una fila existente. Quien ya tiene perfil en 'private' sigue en
-- 'private'. Cambiar el valor por defecto afecta solo a los perfiles que se
-- creen a partir de ahora; volver visible a alguien que hoy es invisible, sin
-- preguntárselo, sería exactamente lo que esta app promete no hacer.
--
-- Y por eso el cliente pregunta al entrar al Feed (ver VisibilityPrompt): si
-- abrimos el valor por defecto, hay que decirlo a la cara la primera vez.

alter table public.social_profiles
  alter column visibility set default 'followers';

comment on column public.social_profiles.visibility is
  'Quién te ve. Nace en followers: te encuentran por tu nombre, pero tu contenido solo lo ve quien aceptes. private = invisible en búsquedas; public = todo el mundo ve lo publicado.';
