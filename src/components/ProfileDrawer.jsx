import { useCallback, useEffect, useRef, useState } from "react";
import {
  X, UserPlus, Check, MessageCircle, Users2, Eye, Globe, Lock, Trash2,
  Camera, ThumbsUp, ThumbsDown, CookingPot, ArrowUpRight, ChevronDown, Pencil, ShieldOff, Ban,
} from "lucide-react";
import { Avatar } from "./ui.jsx";
import { FollowListSheet } from "./FollowListSheet.jsx";
import { relativeTime, personColor } from "../lib/socialUi.js";
import { fileToAvatarDataUrl } from "../lib/avatarImage.js";
import { googleInfo } from "../screens/Settings.jsx";
import {
  loadMyProfile,
  saveMyProfile,
  loadProfileCounts,
  loadProfilesByIds,
  loadFollowRequests,
  loadSentRequests,
  cancelSentRequest,
  acceptFollowRequest,
  rejectFollowRequest,
  loadFollowers,
  loadCommentInbox,
  loadMyRecipeStats,
  usernameError,
  suggestUsername,
  loadBlockedUsers,
  unblockUser,
} from "../lib/social.js";
import {
  FIXTURES_ENABLED, FIXTURE_REQUESTS, FIXTURE_COMMENTS, FIXTURE_SENT, FIXTURE_MY_RECIPES,
} from "../lib/socialFixtures.js";

// Ilustracion de "tus recetas" del navegador de catalogo: la misma que ya
// representa tu recetario en el resto de la app.
const RECIPE_FALLBACK = "/avatares/cards/empty_recetas_propias.jpg";

const GREEN = "#2d5a3d";
const INK = "#142f1d";
const TEAL = "#0f766e";

/**
 * El perfil como cajón lateral, no como pantalla.
 *
 * Es un sitio al que se entra a resolver cosas cortas — aceptar a alguien,
 * leer lo que te han comentado, ver cómo le va a una receta tuya — y se vuelve
 * a lo que estabas mirando. Una pantalla completa haría perder el sitio en el
 * feed cada vez; el cajón deja el feed detrás y se cierra con un gesto.
 *
 * Orden: identidad y números arriba (quién eres y cuánto pesas), luego lo que
 * pide una respuesta tuya, y la privacidad plegada al final — se toca una vez
 * y se olvida, así que no merece el sitio de arriba, pero tampoco esconderse
 * en otra pantalla.
 */
export function ProfileDrawer({ user, thumbFor, onClose, onOpenTarget, onOpenPerson }) {
  const [profile, setProfile] = useState(null);
  const [counts, setCounts] = useState({ followers: 0, following: 0, recipes: 0, menus: 0 });
  const [requests, setRequests] = useState([]);
  const [sent, setSent] = useState([]);
  const [followers, setFollowers] = useState([]);
  const [comments, setComments] = useState([]);
  const [myRecipes, setMyRecipes] = useState([]);
  const [people, setPeople] = useState({});
  const [tab, setTab] = useState("solicitudes");
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [listKind, setListKind] = useState(null);
  const [blocked, setBlocked] = useState([]);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const fileRef = useRef(null);

  const refresh = useCallback(async () => {
    const uid = user?.id;
    const [prof, cts, reqs, snt, fols, coms, mine, blk] = await Promise.all([
      loadMyProfile(uid),
      loadProfileCounts(uid),
      loadFollowRequests(uid),
      loadSentRequests(uid),
      loadFollowers(uid),
      loadCommentInbox(uid),
      loadMyRecipeStats(uid),
      loadBlockedUsers(uid),
    ]);
    // Sintéticos solo en dev y solo si no hay nada real: ver socialFixtures.js.
    const useFx = FIXTURES_ENABLED && reqs.length === 0 && coms.length === 0;
    const finalReqs = useFx ? FIXTURE_REQUESTS : reqs;
    const finalSent = useFx ? FIXTURE_SENT : snt;
    const finalComs = useFx ? FIXTURE_COMMENTS : coms;

    setProfile(prof);
    setCounts(useFx && cts.followers === 0 ? { followers: 12, following: 8, recipes: 5, menus: 1 } : cts);
    setRequests(finalReqs);
    setSent(finalSent);
    setFollowers(fols);
    setComments(finalComs);
    setMyRecipes(useFx && mine.length === 0 ? FIXTURE_MY_RECIPES : mine);
    setBlocked(blk);
    setPeople(await loadProfilesByIds([
      ...finalReqs.map((r) => r.follower_id),
      ...finalSent.map((r) => r.followee_id),
      ...fols.map((f) => f.follower_id),
      ...finalComs.map((c) => c.author_id),
      ...blk.map((b) => b.user_id),
    ]));
  }, [user?.id]);

  useEffect(() => { refresh(); }, [refresh]);

  /**
   * Nadie se queda sin handle. Si no hay perfil todavia se crea uno con el
   * nombre que ya diste al entrar y un @ derivado de el, en PRIVADO — o sea,
   * sin publicar nada ni aparecer en ninguna busqueda.
   *
   * Se hace asi para que la pantalla no diga tres cosas a la vez ("no tienes",
   * "elige uno" y un formulario ya relleno). O tienes handle o no lo tienes;
   * aqui siempre lo tienes, y editarlo es otra cosa.
   */
  useEffect(() => {
    if (profile?.username || !user?.id) return;
    let alive = true;
    (async () => {
      const display = profile?.display_name || googleInfo(user).name;
      const username = await suggestUsername(display);
      if (!alive || !username) return;
      const saved = await saveMyProfile(user.id, {
        display_name: display,
        username,
        visibility: profile?.visibility ?? "private",
      });
      // Si no se pudo guardar (sin sesion, o migracion sin aplicar) igualmente
      // se ensena el derivado: la alternativa es la pantalla incoherente.
      if (alive) setProfile((p) => ({ ...(p ?? {}), display_name: display, username, ...(saved?.error ? {} : saved ?? {}) }));
    })();
    return () => { alive = false; };
  }, [profile?.username, profile?.display_name, profile?.visibility, user]);

  const patch = async (fields) => {
    setSaving(true);
    setProfile((p) => ({ ...(p ?? {}), ...fields }));
    const res = await saveMyProfile(user?.id, { display_name: profile?.display_name ?? "", ...fields });
    setSaving(false);
    // Si el handle estaba cogido no se guardo nada: se deshace el optimismo.
    if (res?.error) refresh();
    return res;
  };

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try { await patch({ avatar_url: await fileToAvatarDataUrl(file) }); } catch { /* ignore */ }
  };

  const resolve = async (followerId, accept) => {
    setRequests((prev) => prev.filter((r) => r.follower_id !== followerId));
    if (accept) await acceptFollowRequest(user?.id, followerId);
    else await rejectFollowRequest(user?.id, followerId);
    refresh();
  };

  const unblock = async (id) => {
    setBlocked((prev) => prev.filter((b) => b.user_id !== id));
    await unblockUser(user?.id, id);
  };

  const cancel = async (followeeId) => {
    setSent((prev) => prev.filter((r) => r.followee_id !== followeeId));
    await cancelSentRequest(user?.id, followeeId);
    refresh();
  };

  const vis = profile?.visibility ?? "private";
  // El nombre no se pregunta dos veces: ya lo diste al entrar (googleInfo lo
  // saca de la cuenta o del correo, igual que la pantalla de Mi perfil), así
  // que aquí se hereda y solo se edita si quieres otro de cara al feed.
  const inheritedName = googleInfo(user).name;
  const name = profile?.display_name || inheritedName;
  const VIS_LABEL = { private: "Nadie te ve", followers: "Solo quien te sigue", public: "Cualquiera" };
  // Los tres colores de privacidad que el sistema ya tiene escritos.
  const VIS_TINT = { private: "#5a2d7a", followers: "#7a4e00", public: "#2d5a3d" };

  return (
    <div style={backdrop} onClick={onClose}>
      <aside className="mp-drawer-in" style={drawer} onClick={(e) => e.stopPropagation()}>
        <input ref={fileRef} type="file" accept="image/*" onChange={pickPhoto} style={{ display: "none" }} />

        <div style={head}>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={closeBtn}>
            <X size={16} strokeWidth={2.6} />
          </button>

          {/* Foto a la izquierda y nombre a la derecha, como se lee una ficha
              de persona en cualquier sitio. La foto es el botón para cambiarla:
              no hace falta un "editar" aparte para algo que se toca una vez. */}
          <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              title={profile?.avatar_url ? "Cambiar foto" : "Añadir foto"}
              style={photoBtn}
            >
              <Avatar name={name} photo={profile?.avatar_url} size={62} color={GREEN} />
              <span style={photoBadge}><Camera size={12} strokeWidth={2.6} /></span>
            </button>
            <div style={{ flex: 1, minWidth: 0, paddingRight: 30 }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: INK, lineHeight: 1.2 }}>{name}</div>
              {/* Con sesion siempre hay handle (se deriva al crear el perfil),
                  asi que no hay estado vacio que anunciar ni nada que elegir.
                  Sin sesion no hay perfil social en absoluto, y eso es otra
                  cosa: se dice, en vez de ensenar un @ que no existe. */}
              {user?.id ? (
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 2 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: "#8aa294", minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    @{profile?.username ?? "…"}
                  </span>
                  <button type="button" onClick={() => setEditing((v) => !v)} aria-label="Editar perfil" style={editBtn}>
                    <Pencil size={12} strokeWidth={2.6} />
                  </button>
                </div>
              ) : (
                <div style={{ fontSize: 11.5, fontWeight: 600, color: "#8aa294", marginTop: 2, lineHeight: 1.35 }}>
                  Inicia sesión para tener perfil y seguir a gente.
                </div>
              )}
            </div>
          </div>

          {/* Los números en tarjeta y separados: sueltos sobre el fondo se
              leían como cuatro palabras sin dueño. */}
          {editing && user?.id && <ProfileForm profile={profile} inheritedName={inheritedName} onSave={async (fields) => { await patch(fields); setEditing(false); }} />}

          <div style={statsCard}>
            <Stat n={counts.followers} label="Seguidores" onClick={() => setListKind("followers")} />
            <span style={statDivider} />
            <Stat n={counts.following} label="Siguiendo" onClick={() => setListKind("following")} />
            <span style={statDivider} />
            <Stat n={counts.recipes} label="Recetas" />
            <span style={statDivider} />
            <Stat n={counts.menus} label="Menús" />
          </div>
        </div>

        <div style={tabBar}>
          <Tab id="solicitudes" tab={tab} setTab={setTab} Icon={UserPlus} label="Solicitudes" badge={requests.length + sent.length} />
          <Tab id="seguidores" tab={tab} setTab={setTab} Icon={Users2} label="Te siguen" badge={followers.length} />
          <Tab id="comentarios" tab={tab} setTab={setTab} Icon={MessageCircle} label="Comentarios" badge={comments.length} />
          <Tab id="recetas" tab={tab} setTab={setTab} Icon={CookingPot} label="Recetas" badge={0} />
        </div>

        <div style={{ padding: "14px 20px 20px" }}>
          {tab === "solicitudes" && (
            <>
              <h4 style={groupTitle}>Te han pedido seguirte</h4>
              {requests.length === 0
                ? <p style={empty}>Nadie por ahora.</p>
                : requests.map((r) => (
                    <PersonRow key={r.follower_id} p={people[r.follower_id]}>
                      <button type="button" onClick={() => resolve(r.follower_id, true)} style={okBtn} aria-label="Aceptar">
                        <Check size={15} strokeWidth={3} />
                      </button>
                      <button type="button" onClick={() => resolve(r.follower_id, false)} style={noBtn} aria-label="Rechazar">
                        <X size={15} strokeWidth={3} />
                      </button>
                    </PersonRow>
                  ))}

              <h4 style={{ ...groupTitle, marginTop: 16 }}>Has pedido tú</h4>
              {/* Solo las pendientes: rechazar borra la fila, así que una
                  solicitud rechazada no deja rastro. Es a propósito — guardar
                  para siempre que alguien te dijo que no no ayuda a nadie, y
                  además impediría volver a pedirlo. */}
              {sent.length === 0
                ? <p style={empty}>No tienes solicitudes en el aire.</p>
                : sent.map((r) => (
                    <PersonRow key={r.followee_id} p={people[r.followee_id]} note="Pendiente">
                      <button type="button" onClick={() => cancel(r.followee_id)} style={ghostBtn}>Retirar</button>
                    </PersonRow>
                  ))}
            </>
          )}

          {tab === "seguidores" && (
            followers.length === 0
              ? <p style={empty}>Todavía no te sigue nadie.</p>
              : followers.map((f) => (
                  <PersonRow key={f.follower_id} p={people[f.follower_id]}>
                    {/* Quitar a alguien es el mismo borrado que rechazar: se
                        deshace el seguimiento y puede volver a pedirlo. */}
                    <button type="button" onClick={() => resolve(f.follower_id, false)} style={noBtn} aria-label="Quitar seguidor">
                      <Trash2 size={14} strokeWidth={2.6} />
                    </button>
                  </PersonRow>
                ))
          )}

          {tab === "comentarios" && (
            comments.length === 0
              ? <p style={empty}>Todavía no te ha comentado nadie.</p>
              : comments.map((c) => {
                  const p = people[c.author_id];
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onOpenTarget?.(c.target_type, c.target_id)}
                      style={{ ...row, alignItems: "flex-start", width: "100%", border: "none", background: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left", borderBottom: "1px solid #f2f6f3" }}
                    >
                      <Avatar name={p?.display_name ?? "?"} photo={p?.avatar_url} size={30} color={personColor(c.author_id)} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={rowName}>
                          {p?.display_name || `@${p?.username ?? "alguien"}`}{" "}
                          <span style={{ fontWeight: 600, color: "#8aa294" }}>
                            {c.target_type === "menu" ? "en tu menú" : "en tu receta"}
                          </span>
                        </div>
                        <div style={{ fontSize: 12.5, color: "#33463b", marginTop: 2, lineHeight: 1.35 }}>{c.body}</div>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: "#9ab0a1", marginTop: 3 }}>{relativeTime(c.created_at)}</div>
                      </div>
                      {/* La fila entera lleva al sitio comentado. La foto del
                          plato ES la flecha cuando la hay: dice a donde vas
                          mejor que un icono generico. */}
                      {(() => {
                        const img = thumbFor?.(c.target_type, c.target_id);
                        return img
                          ? <img src={img} alt="" loading="lazy" style={{ width: 38, height: 38, borderRadius: 10, objectFit: "cover", flexShrink: 0, background: "#eef3f0" }} />
                          : <ArrowUpRight size={15} strokeWidth={2.5} color="#b6c7bd" style={{ flexShrink: 0, marginTop: 2 }} />;
                      })()}
                    </button>
                  );
                })
          )}

          {tab === "recetas" && (
            myRecipes.length === 0
              ? <p style={empty}>No has publicado ninguna receta todavía.</p>
              : myRecipes.map((r) => (
                  <div key={r.id} style={{ ...row, gap: 10 }}>
                    {/* Siempre con foto: una lista con huecos grises se lee
                        como "algo ha fallado", no como "esta no tiene foto". */}
                    <img src={r.photo || RECIPE_FALLBACK} alt="" loading="lazy" style={recipeThumb} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={rowName}>{r.name}</div>
                      <div style={{ display: "flex", gap: 11, marginTop: 3, fontSize: 11, fontWeight: 700, color: "#6b7d70" }}>
                        <span style={stat}><ThumbsUp size={11} strokeWidth={2.5} /> {r.likes}</span>
                        <span style={stat}><ThumbsDown size={11} strokeWidth={2.5} /> {r.dislikes}</span>
                        <span style={{ ...stat, color: TEAL }}><CookingPot size={12} strokeWidth={2.5} /> {r.used}</span>
                        <span style={stat}><MessageCircle size={11} strokeWidth={2.5} /> {r.comments}</span>
                      </div>
                    </div>
                  </div>
                ))
          )}
        </div>

        {/* Plegada abajo, pero con el estado siempre a la vista: quién te ve se
            decide una vez, y aun así nunca debe quedar en duda. */}
        <section style={privacyBlock}>
          <button type="button" onClick={() => setPrivacyOpen((v) => !v)} style={privacyHead}>
            {/* Dos zonas de la MISMA franja, separadas por un divisor: a la
                izquierda la pregunta, a la derecha la respuesta, en un teal
                un punto mas fuerte y hasta el borde. El texto del estado va
                en tinta y no en el color del tinte: teñir la letra del mismo
                tono que su fondo es lo que convierte una franja en pegatina. */}
            <span style={visAsk}>
              <Eye size={14} strokeWidth={2.5} color="#8aa294" />
              Quién te ve
            </span>
            <span style={visState}>
              <img src={VIS_ART[vis]} alt="" style={visBandArt} />
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: INK }}>
                {VIS_LABEL[vis]}
              </span>
              <ChevronDown size={15} strokeWidth={2.6} color="#5a8f86" style={{ flexShrink: 0, marginLeft: 10, transform: privacyOpen ? "rotate(180deg)" : "none", transition: "transform .18s ease" }} />
            </span>
          </button>
          {privacyOpen && (
            <div style={{ display: "flex", flexDirection: "column", gap: 7, padding: "12px 20px 20px" }}>
              <VisOption on={vis === "private"} disabled={saving} Icon={Lock}
                art="/avatares/cards/vis_nadie.png" tint={VIS_TINT.private}
                title="Nadie" desc="No apareces en búsquedas ni en el feed."
                onClick={() => patch({ visibility: "private" })} />
              <VisOption on={vis === "followers"} disabled={saving} Icon={Eye}
                art="/avatares/cards/vis_seguidores.png" tint={VIS_TINT.followers}
                title="Solo quien te sigue" desc="Te encuentran por tu nombre, pero tienen que pedirte seguirte."
                onClick={() => patch({ visibility: "followers" })} />
              <VisOption on={vis === "public"} disabled={saving} Icon={Globe}
                art="/avatares/cards/vis_cualquiera.png" tint={VIS_TINT.public}
                title="Cualquiera" desc="Tus recetas y menús publicados los ve todo el mundo."
                onClick={() => patch({ visibility: "public" })} />
            </div>
          )}
        </section>

        {blocked.length > 0 && (
          <section style={plainBlock}>
            <button type="button" onClick={() => setBlockedOpen((v) => !v)} style={plainHead}>
              <ShieldOff size={14} strokeWidth={2.5} color="#8aa294" />
              <span style={{ flex: 1, textAlign: "left" }}>
                Cuentas bloqueadas · <strong style={{ color: INK }}>{blocked.length}</strong>
              </span>
              <ChevronDown size={15} strokeWidth={2.6} style={{ transform: blockedOpen ? "rotate(180deg)" : "none", transition: "transform .18s ease" }} />
            </button>
            {blockedOpen && (
              <div style={{ marginTop: 9 }}>
                {blocked.map((b) => (
                  <div key={b.user_id} style={row}>
                    <Avatar name={b.display_name ?? "?"} photo={b.avatar_url} size={30} color="#8aa294" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={rowName}>{b.display_name || (b.username ? `@${b.username}` : "Alguien")}</div>
                    </div>
                    <button type="button" onClick={() => unblock(b.user_id)} style={ghostBtn}>Desbloquear</button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </aside>

      {listKind && (
        <FollowListSheet
          userId={user?.id}
          kind={listKind}
          onOpenPerson={(id) => { setListKind(null); onOpenPerson?.(id); }}
          onClose={() => setListKind(null)}
        />
      )}
    </div>
  );
}

/**
 * Nombre y handle. El nombre viene heredado del que ya diste al entrar, asi
 * que en la practica esto es "elige tu @". El handle se valida mientras
 * escribes con la MISMA
 * regla que el CHECK de la base (usernameError): si divergieran, el formulario
 * diria que si y el guardado fallaria sin explicar por que.
 */
/**
 * Editar nombre y handle. Sin etiquetas ni explicaciones: los dos campos
 * llegan con su valor puesto, asi que no hay nada que ensenar — solo cambiar
 * lo que no te guste. El handle se valida contra la MISMA regla que el CHECK
 * de la base (usernameError); si divergieran, esto diria que si y el guardado
 * fallaria sin explicar por que.
 */
function ProfileForm({ profile, inheritedName, onSave }) {
  const [displayName, setDisplayName] = useState(profile?.display_name || inheritedName || "");
  const [username, setUsername] = useState(profile?.username ?? "");
  const [taken, setTaken] = useState(false);
  const [saving, setSaving] = useState(false);

  // El handle puede llegar despues (se deriva de forma asincrona al abrir).
  useEffect(() => {
    if (profile?.username) setUsername((cur) => cur || profile.username);
  }, [profile?.username]);

  const err = usernameError(username);

  const save = async () => {
    if (err) return;
    setSaving(true);
    setTaken(false);
    const res = await onSave({
      display_name: displayName.trim(),
      username: username.trim() || null,
    });
    setSaving(false);
    // El unico sitio donde se sabe si el handle esta libre es el indice unico:
    // preguntarlo antes es una carrera con quien lo pilla mientras tanto.
    if (res?.error === "username_taken") setTaken(true);
  };

  return (
    <div style={form}>
      <input
        className="mp-field"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        maxLength={40}
        placeholder="Tu nombre"
        style={field}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: "#8aa294" }}>@</span>
        <input
          className="mp-field"
          value={username}
          onChange={(e) => { setUsername(e.target.value.toLowerCase()); setTaken(false); }}
          maxLength={24}
          placeholder="usuario"
          style={{ ...field, flex: 1 }}
        />
      </div>
      {(err || taken) && <p style={errText}>{taken ? "Ese nombre ya está cogido" : err}</p>}

      <button type="button" onClick={save} disabled={saving || Boolean(err)} style={{ ...saveBtn, opacity: err ? .5 : 1 }}>
        Guardar
      </button>
    </div>
  );
}

function PersonRow({ p, note, children }) {
  return (
    <div style={row}>
      <Avatar name={p?.display_name ?? "?"} photo={p?.avatar_url} size={34} color={personColor(p?.user_id)} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={rowName}>{p?.display_name || `@${p?.username ?? "alguien"}`}</div>
        {(note || p?.username) && (
          <div style={rowSub}>{note ?? `@${p.username}`}</div>
        )}
      </div>
      {children}
    </div>
  );
}

/**
 * Cada nivel de privacidad, con su ilustracion y su color.
 *
 * Se queda en filas y no en tres tarjetas: aqui la explicacion ("tienen que
 * pedirte seguirte") es la mitad de la decision, y en una columna estrecha
 * como el cajon, tres tarjetas la dejarian en dos palabras cortadas.
 *
 * Los colores son los que el sistema ya tiene escritos para privacidad
 * (violeta privada / ambar amigos / verde publica): no invento tres nuevos
 * cuando la app ya habla de esto en otro sitio.
 *
 * Mientras no existan los png, cae al icono de siempre — asi esta pantalla
 * nunca se queda con un hueco roto.
 */
function VisOption({ on, disabled, Icon, art, tint, title, desc, onClick }) {
  const [noArt, setNoArt] = useState(false);
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={on}
      style={{
        ...visRow,
        borderColor: on ? tint : "#e0eae3",
        background: on ? `${tint}12` : "#fff",
        boxShadow: on ? `0 6px 16px -10px ${tint}99` : "none",
      }}>
      {art && !noArt ? (
        <img
          src={art}
          alt=""
          loading="lazy"
          onError={() => setNoArt(true)}
          style={{ ...visArt, filter: on ? "none" : "saturate(.55) opacity(.75)" }}
        />
      ) : (
        <Icon size={15} strokeWidth={2.4} color={on ? tint : "#8aa294"} style={{ flexShrink: 0, marginTop: 1 }} />
      )}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 12.5, fontWeight: 800, color: INK }}>{title}</span>
        <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6b7d70", marginTop: 1, lineHeight: 1.3 }}>{desc}</span>
      </span>
      {on && <Check size={13} color={tint} strokeWidth={3} style={{ flexShrink: 0 }} />}
    </button>
  );
}

function Stat({ n, label, onClick }) {
  const inner = (
    <>
      <div style={{ fontSize: 19, fontWeight: 900, color: INK, lineHeight: 1.1 }}>{n}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: onClick ? TEAL : "#8aa294", marginTop: 2 }}>{label}</div>
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} style={{ flex: 1, textAlign: "center", border: "none", background: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
        {inner}
      </button>
    );
  }
  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      <div style={{ fontSize: 19, fontWeight: 900, color: INK, lineHeight: 1.1 }}>{n}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#8aa294", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Tab({ id, tab, setTab, Icon, label, badge }) {
  const on = tab === id;
  return (
    <button type="button" onClick={() => setTab(id)}
      style={{ ...tabBtn, color: on ? INK : "#8aa294", borderBottomColor: on ? TEAL : "transparent" }}>
      {/* Sin icono: con cuatro pestanas en 348px el icono se comia el ancho y
          las etiquetas salian cortadas, que es peor que no tener icono. */}
      <span style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      {badge > 0 && <span style={tabBadge}>{badge}</span>}
    </button>
  );
}

const backdrop = {
  position: "fixed", inset: 0, zIndex: 260,
  background: "rgba(20,47,29,.45)", backdropFilter: "blur(2px)",
  display: "flex", justifyContent: "flex-end",
};

const drawer = {
  position: "relative",
  width: "min(400px, 94vw)", height: "100%", background: "#fff",
  overflowY: "auto", boxShadow: "-14px 0 40px rgba(20,47,29,.28)",
};

const head = { padding: "20px 20px 16px", background: "linear-gradient(180deg, #e9f4ed 0%, #fff 100%)" };

const closeBtn = {
  position: "absolute", top: 12, right: 12, zIndex: 2,
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 30, height: 30, borderRadius: 10,
  border: "1.5px solid #d5e6da", background: "#fff", color: GREEN, cursor: "pointer",
};

const photoBtn = {
  position: "relative", padding: 0, border: "none", background: "none",
  cursor: "pointer", flexShrink: 0, lineHeight: 0, marginRight: 34,
};

const photoBadge = {
  position: "absolute", right: -3, bottom: -3,
  width: 22, height: 22, borderRadius: 999,
  background: GREEN, color: "#fff", border: "2px solid #fff",
  display: "flex", alignItems: "center", justifyContent: "center",
};

const tabBar = { display: "flex", padding: "0 8px", borderTop: "1px solid #eef3f0", borderBottom: "1px solid #eef3f0" };

const tabBtn = {
  flex: 1, minWidth: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4,
  padding: "11px 2px", border: "none", borderBottom: "2px solid transparent",
  background: "none", fontSize: 10.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
};

const tabBadge = {
  minWidth: 15, padding: "0 4px", borderRadius: 999,
  background: TEAL, color: "#fff", fontSize: 9, fontWeight: 900, lineHeight: "15px",
};

const groupTitle = {
  margin: "0 0 6px", fontSize: 10.5, fontWeight: 900, color: "#7a9485",
  letterSpacing: ".6px", textTransform: "uppercase",
};

const row = { display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid #f2f6f3" };

const editBtn = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  width: 22, height: 22, borderRadius: 7,
  border: "none", background: "#eef3f0", color: TEAL, cursor: "pointer",
};

const form = {
  marginTop: 12, padding: 11, borderRadius: 13,
  background: "#fff", border: "1.5px solid #e0eae3",
};

// 16px de tamano de texto, como el resto de campos de la app: por debajo, iOS
// hace zoom al enfocar y el viewport ya no vuelve. Lo que se afina es la pista
// (.mp-field::placeholder) y el aire alrededor.
const field = {
  width: "100%", padding: "8px 10px", borderRadius: 10, boxSizing: "border-box",
  border: "1.5px solid #dde7e0", fontSize: 16, outline: "none",
  fontFamily: "inherit", color: "#142f1d",
};

const errText = { margin: "5px 0 0", fontSize: 11.5, fontWeight: 700, color: "#c0392b" };

const saveBtn = {
  width: "100%", marginTop: 14, padding: "10px", borderRadius: 11, border: "none",
  background: GREEN, color: "#fff", fontSize: 13, fontWeight: 800,
  cursor: "pointer", fontFamily: "inherit",
};

const statsCard = {
  display: "flex", alignItems: "center", marginTop: 16,
  padding: "12px 6px", borderRadius: 14,
  background: "#fff", border: "1.5px solid #e0eae3",
  boxShadow: "0 2px 8px rgba(20,47,29,.05)",
};

const statDivider = { width: 1, alignSelf: "stretch", background: "#eef3f0" };
const rowName = { fontSize: 13, fontWeight: 800, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const rowSub = { fontSize: 11, fontWeight: 700, color: "#8aa294" };
const stat = { display: "inline-flex", alignItems: "center", gap: 3 };

const recipeThumb = { width: 42, height: 42, borderRadius: 11, objectFit: "cover", flexShrink: 0, display: "block" };

const okBtn = {
  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  width: 32, height: 32, borderRadius: 10, border: "none",
  background: GREEN, color: "#fff", cursor: "pointer",
};

const noBtn = {
  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  width: 32, height: 32, borderRadius: 10,
  border: "1.5px solid #e6cfc9", background: "#fff", color: "#c0392b", cursor: "pointer",
};

const ghostBtn = {
  flexShrink: 0, padding: "7px 12px", borderRadius: 10,
  border: "1.5px solid #d5e6da", background: "#fff", color: GREEN,
  fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
};

// Sin padding: la franja de "Quien te ve" ocupa la seccion entera, de borde
// a borde y de arriba abajo, para que se lea como DOS colores y no como una
// tira flotando sobre un fondo. El aire lo pone el contenido desplegado.
// Bloqueados sigue siendo una seccion normal con su padding: la franja de
// dos colores es exclusiva de "Quien te ve", que es la unica decision que
// hay que poder leer de un vistazo sin desplegar nada.
const plainBlock = { padding: "14px 20px 24px", borderTop: "1px solid #eef3f0", background: "#f7fbf8" };

const plainHead = {
  display: "flex", alignItems: "center", gap: 8, width: "100%",
  padding: 0, border: "none", background: "none", cursor: "pointer",
  fontFamily: "inherit", fontSize: 12, fontWeight: 700, color: "#6b7d70",
};

const privacyBlock = { padding: 0, borderTop: "1px solid #eef3f0", background: "#f7fbf8" };

// La misma ilustracion de cada opcion, en miniatura: quien ya eligio
// reconoce el candado, la puerta o el globo sin leer nada.
const VIS_ART = {
  private: "/avatares/cards/vis_nadie.png",
  followers: "/avatares/cards/vis_seguidores.png",
  public: "/avatares/cards/vis_cualquiera.png",
};


// La franja ocupa la fila entera y se sale del padding de la seccion para
// llegar a los dos bordes: es una banda, no una tarjeta dentro de otra.
const visAsk = {
  display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
  alignSelf: "stretch", padding: "13px 13px 13px 20px",
  borderRight: "1px solid #d7e6e1",
  color: "#6b7d70",
};

const visState = {
  display: "flex", alignItems: "center", gap: 8,
  flex: 1, minWidth: 0, alignSelf: "stretch",
  padding: "11px 20px 11px 12px",
  background: "#dcefeb",
};

const visBandArt = {
  width: 22, height: 22, display: "block", flexShrink: 0,
};

const privacyHead = {
  display: "flex", alignItems: "stretch", width: "100%",
  margin: 0, padding: 0, border: "none",
  background: "#eaf3f0", cursor: "pointer",
  fontFamily: "inherit", fontSize: 12, fontWeight: 700, color: "#6b7d70",
  textAlign: "left",
};

const visArt = {
  width: 40, height: 40, display: "block", flexShrink: 0,
  transition: "filter .18s ease",
};

const visRow = {
  transition: "background .18s ease, border-color .18s ease, box-shadow .18s ease",
  display: "flex", alignItems: "flex-start", gap: 9, width: "100%",
  padding: "9px 11px", borderRadius: 12, border: "1.5px solid #e0eae3",
  cursor: "pointer", fontFamily: "inherit", textAlign: "left",
};

const empty = { margin: "8px 0 4px", fontSize: 12, fontWeight: 600, color: "#8aa294" };
