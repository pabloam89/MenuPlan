-- ═══ Reportar un comentario tambien tiene que poder guardarse ══════════════
--
-- content_reports.target_type reutiliza el enum `comment_target`, que nacio en
-- 0027 para decir sobre QUE se comenta: una receta o un menu. Al reutilizarlo
-- para los reportes se colo un caso que no existia: un comentario tambien se
-- puede reportar, y 'comment' no era un valor valido.
--
-- Consecuencia en produccion, verificada el 2026-09-20: reportar un comentario
-- fallaba con 22P02 (invalid input value for enum), reportContent devolvia
-- false y ReportSheet se quedaba sin confirmar, sin decir nada. Reportar
-- recetas, menus y perfiles si funcionaba — por eso no se habia notado.
--
-- Se anade el valor al enum en vez de cambiar el cliente porque el cliente
-- tenia razon: un comentario ES reportable, y la base era la que no lo
-- contemplaba. Anadir una etiqueta no afecta a social_comments, que sigue
-- usando solo recipe/menu para decir de que cuelga cada hilo.

alter type public.comment_target add value if not exists 'comment';
