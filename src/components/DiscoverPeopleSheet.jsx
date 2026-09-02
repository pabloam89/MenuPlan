import { useCallback, useEffect, useState } from "react";
import { X, Search, UserPlus, Users2, Sparkles, Check } from "lucide-react";
import { Avatar } from "./ui.jsx";
import {
  searchProfiles, followUser, unfollowUser,
  loadSuggestedProfiles, loadFollowers, loadProfilesByIds,
} from "../lib/social.js";

const GREEN = "#2d5a3d";
const INK = "#142f1d";
const TEAL = "#0f766e";

/**
 * Encontrar gente.
 *
 * Antes esto era solo un buscador, y sin escribir no había nada: quien no
 * conoce a nadie —que es justo quien más lo necesita— se quedaba mirando un
 * campo vacío. Ahora buscar es UNA de las entradas; por defecto se enseña a
 * quién seguir, en tres bloques por orden de intención:
 *
 *   1. Te siguen · lo más fácil de decidir, y de paso cierra el círculo.
 *   2. Por gente que sigues · los amigos de tus amigos (RPC 0035).
 *   3. Cocinan en abierto · autores del feed público que aún no sigues, que
 *      es lo único que le queda a quien acaba de llegar y no sigue a nadie.
 *
 * Cada fila dice POR QUÉ está ahí. Una sugerencia sin motivo es una lista de
 * desconocidos, y eso no se toca nunca.
 */
export function DiscoverPeopleSheet({
  user,
  following = [],
  pending = [],
  feedAuthors = [],
  profiles = {},
  onClose,
  onChanged,
  onOpenPerson,
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [suggested, setSuggested] = useState([]);
  const [backFollows, setBackFollows] = useState([]);
  const [loading, setLoading] = useState(true);

  // none | pending | following por persona. followUser devuelve el estado en
  // que quedó la solicitud ("pending" si esa cuenta pide aprobación): tratarlo
  // como booleano pintaba "Siguiendo" sobre una solicitud sin responder.
  const [rel, setRel] = useState(() => {
    const m = {};
    for (const id of following) m[id] = "following";
    for (const id of pending) m[id] = "pending";
    return m;
  });

  // ── Sugerencias ───────────────────────────────────────────────────────────
  const loadSuggestions = useCallback(async () => {
    setLoading(true);
    const [sug, followers] = await Promise.all([
      loadSuggestedProfiles(user?.id),
      loadFollowers(user?.id),
    ]);
    // Quien te sigue y tú no: el bloque de "devolver el seguimiento".
    const backIds = followers.map((f) => f.follower_id).filter((id) => !following.includes(id));
    const backProfiles = await loadProfilesByIds(backIds);
    setBackFollows(backIds.map((id) => backProfiles[id]).filter(Boolean));
    setSuggested(sug);
    setLoading(false);
  }, [user?.id, following]);

  useEffect(() => { loadSuggestions(); }, [loadSuggestions]);

  // ── Búsqueda ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    let alive = true;
    setBusy(true);
    const t = setTimeout(async () => {
      const r = await searchProfiles(q);
      if (alive) { setResults(r); setBusy(false); }
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  const toggle = async (targetId) => {
    const cur = rel[targetId] ?? "none";
    if (cur === "none") {
      const status = await followUser(user?.id, targetId);
      if (status) setRel((m) => ({ ...m, [targetId]: status === "pending" ? "pending" : "following" }));
    } else {
      // Dejar de seguir y retirar una solicitud son el mismo borrado.
      const done = await unfollowUser(user?.id, targetId);
      if (done) setRel((m) => ({ ...m, [targetId]: "none" }));
    }
    onChanged?.();
  };

  // Autores del feed público que todavía no sigues. Sale de lo que la
  // pantalla ya tiene cargado, así que no cuesta ni una petición.
  const openCooks = feedAuthors
    .filter((a) => a.id !== user?.id && (rel[a.id] ?? "none") === "none" && profiles[a.id])
    .slice(0, 6);

  const searching = q.trim().length >= 2;
  const nothingToSuggest = !loading && backFollows.length === 0 && suggested.length === 0 && openCooks.length === 0;

  return (
    <div style={overlay} onClick={onClose} className="mp-overlay-in">
      <div style={sheet} onClick={(e) => e.stopPropagation()}>
        <div style={grabber} />

        <div style={header}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <h2 style={{ margin: 0, flex: 1, fontSize: 17, fontWeight: 900, color: INK }}>Encontrar gente</h2>
            <button type="button" onClick={onClose} aria-label="Cerrar" style={closeBtn}>
              <X size={16} strokeWidth={2.6} />
            </button>
          </div>

          <div style={{ position: "relative" }}>
            <Search size={15} strokeWidth={2.4} color="#9ab0a1" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nombre o @usuario"
              className="mp-field"
              style={input}
            />
            {q && (
              <button type="button" onClick={() => setQ("")} aria-label="Limpiar" style={clearBtn}>
                <X size={13} strokeWidth={2.8} />
              </button>
            )}
          </div>
        </div>

        <div style={body}>
          {searching ? (
            <>
              {busy && <p style={hint}>Buscando…</p>}
              {!busy && results.length === 0 && (
                <p style={hint}>Nadie con ese nombre. Solo aparece quien ha activado su perfil.</p>
              )}
              {results.filter((p) => p.user_id !== user?.id).map((p) => (
                <PersonRow
                  key={p.user_id}
                  person={p}
                  state={rel[p.user_id] ?? "none"}
                  onFollow={() => toggle(p.user_id)}
                  onOpen={() => onOpenPerson?.(p.user_id)}
                />
              ))}
            </>
          ) : (
            <>
              {loading && <p style={hint}>Buscando a quién seguir…</p>}

              {backFollows.length > 0 && (
                <Section Icon={UserPlus} title="Te siguen" note="Y tú a ellos todavía no">
                  {backFollows.map((p) => (
                    <PersonRow
                      key={p.user_id}
                      person={p}
                      reason="Empezó a seguirte"
                      state={rel[p.user_id] ?? "none"}
                      onFollow={() => toggle(p.user_id)}
                      onOpen={() => onOpenPerson?.(p.user_id)}
                    />
                  ))}
                </Section>
              )}

              {suggested.length > 0 && (
                <Section Icon={Users2} title="Por gente que sigues">
                  {suggested.map((p) => (
                    <PersonRow
                      key={p.user_id}
                      person={p}
                      reason={viaLine(p)}
                      state={rel[p.user_id] ?? "none"}
                      onFollow={() => toggle(p.user_id)}
                      onOpen={() => onOpenPerson?.(p.user_id)}
                    />
                  ))}
                </Section>
              )}

              {openCooks.length > 0 && (
                <Section Icon={Sparkles} title="Cocinan en abierto">
                  {openCooks.map((a) => (
                    <PersonRow
                      key={a.id}
                      person={profiles[a.id]}
                      reason={a.count === 1 ? "1 receta en el feed" : `${a.count} recetas en el feed`}
                      state={rel[a.id] ?? "none"}
                      onFollow={() => toggle(a.id)}
                      onOpen={() => onOpenPerson?.(a.id)}
                    />
                  ))}
                </Section>
              )}

              {nothingToSuggest && (
                <p style={hint}>
                  Todavía no tengo a quién sugerirte. Busca por nombre o por @usuario
                  a alguien que conozcas: en cuanto sigas a una persona, aparecerá
                  gente suya por aquí.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** "Le sigue Marta · 3 en común". El porqué de la sugerencia, en una línea. */
function viaLine(p) {
  const via = p.via_name ? `Le sigue ${p.via_name}` : null;
  const more = p.mutuals > 1 ? `${p.mutuals} en común` : null;
  return [via, more].filter(Boolean).join(" · ") || "Sugerido";
}

function Section({ Icon, title, note, children }) {
  return (
    <section style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 2px 6px" }}>
        <Icon size={13} strokeWidth={2.6} color={GREEN} />
        <span style={{ fontSize: 11, fontWeight: 800, color: GREEN, textTransform: "uppercase", letterSpacing: ".6px" }}>
          {title}
        </span>
        {note && <span style={{ fontSize: 10.5, fontWeight: 700, color: "#9ab0a1" }}>· {note}</span>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{children}</div>
    </section>
  );
}

/**
 * Fila de persona. El botón dice en qué estado quedó la relación, no lo que
 * te gustaría que dijera: "Pendiente" cuando esa cuenta aprueba a mano.
 */
function PersonRow({ person, reason, state, onFollow, onOpen }) {
  if (!person) return null;
  const name = person.display_name || (person.username ? `@${person.username}` : "Alguien");
  return (
    <div style={row}>
      <button type="button" onClick={onOpen} style={{ ...plainBtn, display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, textAlign: "left" }}>
        <Avatar name={name} photo={person.avatar_url} size={40} color={TEAL} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={oneLine}>{name}</span>
          {person.username && person.display_name && (
            <span style={{ ...oneLine, fontSize: 11.5, fontWeight: 700, color: "#8aa294" }}>@{person.username}</span>
          )}
          {reason && (
            <span style={{ ...oneLine, fontSize: 11, fontWeight: 700, color: "#9ab0a1", marginTop: 1 }}>{reason}</span>
          )}
        </span>
      </button>
      <button type="button" onClick={onFollow} style={state === "none" ? followPill : followingPill}>
        {state === "following" && <Check size={12} strokeWidth={3} />}
        {LABEL[state]}
      </button>
    </div>
  );
}

const LABEL = { none: "Seguir", pending: "Pendiente", following: "Siguiendo" };

const overlay = {
  position: "fixed", inset: 0, zIndex: 310,
  background: "rgba(20,47,29,.45)", backdropFilter: "blur(2px)",
  display: "flex", alignItems: "flex-end", justifyContent: "center",
};

const sheet = {
  width: "100%", maxWidth: 420, maxHeight: "84vh",
  display: "flex", flexDirection: "column",
  background: "#f5f9f6", borderRadius: "20px 20px 0 0",
  boxSizing: "border-box", overflow: "hidden",
};

const grabber = {
  width: 38, height: 4, borderRadius: 999, background: "#dde7e0",
  margin: "8px auto 4px", flexShrink: 0,
};

// La cabecera y el buscador se quedan fijos: en una lista de gente se escribe
// y se mira a la vez, y perder el campo al bajar obliga a subir para corregir.
const header = { padding: "8px 18px 12px", background: "#f5f9f6", flexShrink: 0 };

const body = { padding: "4px 14px 18px", overflowY: "auto", flex: 1 };

const input = {
  width: "100%", padding: "11px 34px 11px 34px",
  borderRadius: 12, border: "1.5px solid #dde7e0", background: "#fff",
  fontSize: 16, outline: "none", fontFamily: "inherit", boxSizing: "border-box",
  color: "#1a3a24",
};

const clearBtn = {
  position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 22, height: 22, borderRadius: 999,
  border: "none", background: "#eef3f0", color: "#7a8a7f", cursor: "pointer",
};

const closeBtn = {
  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  width: 32, height: 32, borderRadius: "50%",
  border: "none", background: "#f0f4f1", color: GREEN, cursor: "pointer",
};

const row = {
  display: "flex", alignItems: "center", gap: 8,
  padding: "8px 10px", borderRadius: 14,
  background: "#fff", border: "1px solid #eef3f0",
};

const oneLine = {
  display: "block", fontSize: 13.5, fontWeight: 800, color: INK,
  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
};

const plainBtn = {
  border: "none", background: "transparent", padding: 0,
  cursor: "pointer", fontFamily: "inherit",
};

const followPill = {
  display: "flex", alignItems: "center", gap: 4, flexShrink: 0,
  padding: "7px 15px", borderRadius: 999, border: "none",
  background: GREEN, color: "#fff",
  fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
};

const followingPill = {
  ...followPill,
  background: "#fff", color: TEAL, border: `1.5px solid ${TEAL}`,
};

const hint = {
  margin: "10px 4px", fontSize: 12.5, fontWeight: 600,
  color: "#9ab0a1", lineHeight: 1.45,
};
