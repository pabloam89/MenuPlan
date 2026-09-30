-- ═══ Quién manda los recordatorios ══════════════════════════════════════════
--
-- /api/bot/recordatorios manda los vencidos (0061), pero alguien tiene que
-- llamarlo cada pocos minutos. Los cron de Vercel solo corren en producción y
-- el bot vive en staging, así que lo llama Postgres: pg_cron + pg_net.
--
-- La programación del job NO va aquí porque lleva el secreto (BOT_CRON_SECRET)
-- en la cabecera: la pone scripts/bot-cron.mjs, que lo lee de .env.local.
-- Aprobado por Pablo el 30 sep 2026.

create extension if not exists pg_cron;
create extension if not exists pg_net;
