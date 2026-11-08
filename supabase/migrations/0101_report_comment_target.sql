-- ═══ Reportar un comentario tambien tiene que poder guardarse ══════════════
-- AUDITADA: auditor-datos 2026-10-20 OK
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

-- Por qué un enum y no CHECK + constante (PRINCIPIOS §4): comment_target ya es
-- un enum desde la 0027 y lo usan dos tablas; pasarlo a text con CHECK es otra
-- migración que reescribe columnas vivas. Esta solo añade una etiqueta.
-- Puede que ya esté en producción (se arregló a mano el 2026-09-20): con if not
-- exists es un no-op. Excepción declarada en ENUM_DECLARATIVO de principios.test.js.
--
-- Consulta previa (solo lectura):
--   select enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'comment_target';
-- Plan B: sin el valor, reportar un comentario falla como antes y el resto sigue.
-- Objeto testigo (tipo valor): public.comment_target:comment.

set lock_timeout = '5s';

-- enum-declarativo: valor que el cliente ya usa y quizá ya existe en producción
alter type public.comment_target add value if not exists 'comment';
