-- ═══ Códigos de un solo uso del bot: entrar sin pasar por Ajustes ══════════
--
-- La 0057 enlazaba un chat desde la app («Conectar Telegram»). Esta añade los
-- dos caminos que empiezan en el propio bot (specs/plan-bot-mensajeria.md):
--
--   · `vincular`: ya tienes cuenta. El bot te pide el email, Supabase te manda
--     un enlace de acceso, y al abrirlo la app te pregunta si conecta ESE chat
--     con tu casa. El código viaja en el enlace y dice qué chat era.
--   · `entrar`: empezaste en el bot sin cuenta. El bot te creó cuenta y casa, y
--     este código abre la app ya dentro, sin email ni Google.
--
-- Por qué una tabla nueva y no `bot_link_tokens`: allí el código nace de un
-- usuario con casa (el que pulsa en Ajustes) y sus columnas son NOT NULL. Aquí
-- el de `vincular` nace de un chat del que aún no sabemos quién es.

create table if not exists public.bot_codigos (
  codigo      text primary key,
  tipo        text not null check (tipo in ('vincular', 'entrar')),
  channel     text not null check (channel in ('telegram', 'whatsapp')),
  chat_id     text not null,
  external_id text,
  nombre      text,
  user_id     uuid references auth.users(id) on delete cascade,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now(),
  -- `entrar` siempre sabe de quién es; `vincular` lo sabrá al abrir el enlace.
  check (tipo <> 'entrar' or user_id is not null)
);

comment on table public.bot_codigos is
  'Códigos de un solo uso que nacen en el bot: vincular (cuenta existente, por email) y entrar (cuenta creada desde el bot). Solo servidor (0058).';

-- Solo el servidor (service_role): RLS activo y ninguna política.
alter table public.bot_codigos enable row level security;
