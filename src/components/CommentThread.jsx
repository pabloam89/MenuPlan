import { useCallback, useEffect, useState } from "react";
import { MessageCircle, Send, Trash2, Heart, CornerDownRight, Flag } from "lucide-react";
import { Avatar } from "./ui.jsx";
import { personColor } from "../lib/socialUi.js";
import {
  loadComments, postComment, deleteComment, loadProfilesByIds,
  loadCommentLikes, toggleCommentLike,
} from "../lib/social.js";
import { FIXTURES_ENABLED, FIXTURE_THREADS } from "../lib/socialFixtures.js";
import { ReportSheet } from "./ReportSheet.jsx";

const INK = "#142f1d";
const TEAL = "#0f766e";
const GREEN = "#2d5a3d";

/**
 * Comentarios de una receta o de un menú.
 *
 * Empieza plegado y solo enseña el contador: en una corriente de tarjetas, un
 * hilo abierto por tarjeta convierte el scroll en un muro de texto. Se abre
 * quien quiere leer, y solo entonces se piden los comentarios — una petición
 * por tarjeta al pintar el feed sería una por cada plato que pasa por delante.
 *
 * Un solo nivel de respuesta: se responde a un comentario, pero no a una
 * respuesta. Lo impone la base (trigger check_comment_depth) y aquí se refleja
 * sin más — anidar sin fondo obliga a sangrados, plegados y "ver 3 respuestas
 * más" para una conversación que aquí son dos frases.
 *
 * `targetOwnerId` viaja hasta el insert porque la política de lectura lo
 * necesita en la fila (ver 0028_social_requests_comments.sql).
 */
export function CommentThread({ user, targetType, targetId, targetOwnerId, count: initialCount = null }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const [people, setPeople] = useState({});
  const [likes, setLikes] = useState({});
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [reportingId, setReportingId] = useState(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const real = await loadComments(targetType, targetId);
    const fx = FIXTURES_ENABLED && real.length === 0 ? (FIXTURE_THREADS[String(targetId)] ?? []) : real;
    setItems(fx);
    const [profs, lks] = await Promise.all([
      loadProfilesByIds(fx.map((c) => c.author_id)),
      loadCommentLikes(fx.map((c) => c.id)),
    ]);
    setPeople(profs);
    setLikes(lks);
  }, [targetType, targetId]);

  useEffect(() => { if (open && items === null) load(); }, [open, items, load]);

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    const saved = await postComment(user?.id, {
      targetType, targetId, targetOwnerId, body: text, parentId: replyTo,
    });
    setSending(false);
    if (!saved) return;
    setDraft("");
    setReplyTo(null);
    setItems((prev) => [...(prev ?? []), saved]);
  };

  const remove = async (id) => {
    // También se van sus respuestas: en la base va por ON DELETE CASCADE, y
    // aquí se refleja para no dejar hijos huérfanos hasta la próxima carga.
    setItems((prev) => (prev ?? []).filter((c) => c.id !== id && c.parent_id !== id));
    await deleteComment(id);
  };

  const like = async (id) => {
    const on = !likes[id]?.mine;
    setLikes((prev) => ({
      ...prev,
      [id]: { likes: (prev[id]?.likes ?? 0) + (on ? 1 : -1), mine: on },
    }));
    await toggleCommentLike(user?.id, id, on);
  };

  const roots = (items ?? []).filter((c) => !c.parent_id);
  const repliesOf = (id) => (items ?? []).filter((c) => c.parent_id === id);
  const count = items?.length ?? initialCount;

  const renderOne = (c, isReply) => {
    const p = people[c.author_id];
    const mine = c.author_id === user?.id;
    const l = likes[c.id] ?? { likes: 0, mine: false };
    return (
      <div key={c.id} style={{ ...commentRow, paddingLeft: isReply ? 30 : 0 }}>
        <Avatar name={p?.display_name ?? "?"} photo={p?.avatar_url} size={isReply ? 22 : 26} color={personColor(c.author_id)} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: INK }}>
            {p?.display_name || (p?.username ? `@${p.username}` : "Alguien")}
          </div>
          <div style={{ fontSize: 12.5, color: "#33463b", lineHeight: 1.35, marginTop: 1 }}>{c.body}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
            <button type="button" onClick={() => like(c.id)} style={{ ...miniBtn, color: l.mine ? "#c0392b" : "#8aa294" }}>
              <Heart size={12} strokeWidth={2.6} fill={l.mine ? "#c0392b" : "none"} />
              {l.likes > 0 ? l.likes : ""}
            </button>
            {!isReply && (
              <button type="button" onClick={() => setReplyTo(replyTo === c.id ? null : c.id)} style={{ ...miniBtn, color: replyTo === c.id ? TEAL : "#8aa294" }}>
                <CornerDownRight size={12} strokeWidth={2.6} /> Responder
              </button>
            )}
            {/* Reportar es de cualquiera menos del propio autor: reportarte a
                ti mismo no significa nada. */}
            {!mine && (
              <button type="button" onClick={() => setReportingId(c.id)} style={{ ...miniBtn, color: "#b6c7bd" }} aria-label="Reportar comentario">
                <Flag size={11} strokeWidth={2.5} />
              </button>
            )}
            {/* Borra el autor, y también el dueño del contenido: lo que se
                publica en tu receta lo puedes quitar tú. */}
            {(mine || targetOwnerId === user?.id) && (
              <button type="button" onClick={() => remove(c.id)} style={{ ...miniBtn, color: "#b6c7bd" }} aria-label="Borrar comentario">
                <Trash2 size={12} strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} style={toggle}>
        <MessageCircle size={14} strokeWidth={2.5} />
        {open
          ? "Ocultar comentarios"
          : count === null || count === 0
            ? "Sé el primero en comentar"
            : `${count} comentario${count === 1 ? "" : "s"}`}
      </button>

      {open && (
        <div style={{ marginTop: 8 }}>
          {items === null && <p style={hint}>Cargando…</p>}
          {items?.length === 0 && <p style={hint}>Todavía no hay comentarios.</p>}

          {roots.map((c) => (
            <div key={c.id}>
              {renderOne(c, false)}
              {repliesOf(c.id).map((r) => renderOne(r, true))}
            </div>
          ))}

          {replyTo && (
            <div style={replyBanner}>
              <CornerDownRight size={12} strokeWidth={2.6} />
              Respondiendo a {people[(items ?? []).find((c) => c.id === replyTo)?.author_id]?.display_name ?? "el comentario"}
              <button type="button" onClick={() => setReplyTo(null)} style={{ ...miniBtn, marginLeft: "auto", color: TEAL }}>Cancelar</button>
            </div>
          )}

          <div style={{ display: "flex", gap: 7, marginTop: 8 }}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") send(); }}
              maxLength={500}
              placeholder={replyTo ? "Escribe tu respuesta…" : "Escribe un comentario…"}
              style={input}
            />
            <button type="button" onClick={send} disabled={sending || !draft.trim()} aria-label="Enviar" style={{ ...sendBtn, opacity: draft.trim() ? 1 : .45 }}>
              <Send size={15} strokeWidth={2.6} />
            </button>
          </div>
        </div>
      )}

      {reportingId && (
        <ReportSheet user={user} targetType="comment" targetId={reportingId} onClose={() => setReportingId(null)} />
      )}
    </div>
  );
}

const toggle = {
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: 0, border: "none", background: "none", color: "#6b7d70",
  fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
};

const hint = { margin: "6px 0", fontSize: 12, fontWeight: 600, color: "#8aa294" };

const commentRow = {
  display: "flex", alignItems: "flex-start", gap: 8, padding: "7px 0",
  borderBottom: "1px solid #f2f6f3",
};

const miniBtn = {
  display: "inline-flex", alignItems: "center", gap: 4,
  padding: 0, border: "none", background: "none",
  fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
};

const replyBanner = {
  display: "flex", alignItems: "center", gap: 6, marginTop: 8,
  padding: "6px 10px", borderRadius: 9, background: "#eef6f4",
  fontSize: 11.5, fontWeight: 700, color: TEAL,
};

const input = {
  flex: 1, minWidth: 0, padding: "9px 12px", borderRadius: 11,
  border: "1.5px solid #dde7e0", fontSize: 16, outline: "none", fontFamily: "inherit",
};

const sendBtn = {
  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  width: 40, borderRadius: 11, border: "none",
  background: GREEN, color: "#fff", cursor: "pointer",
};
