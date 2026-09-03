import { useCallback, useEffect, useRef, useState } from "react";
import { X, UserPlus, Check, MessageCircle, Camera, ThumbsUp, ThumbsDown, CookingPot, ArrowUpRight, ChevronDown, Pencil, ShieldOff } from "lucide-react";
import { Avatar } from "./ui.jsx";
import { FollowListSheet } from "./FollowListSheet.jsx";
import { relativeTime, personColor } from "../lib/socialUi.js";
import { fileToAvatarDataUrl } from "../lib/avatarImage.js";
import { googleInfo } from "../screens/Settings.jsx";
import {
  ensureSocialProfile,
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
  loadFollowing,
  followUser,
  loadCommentInbox,
  loadMyRecipeStats,
  usernameError,
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
export function ProfileDrawer({ user, thumbFor, onClose, onOpenTarget, onOpenPerson, onChanged }) {
  const [profile, setProfile] = useState(null);
  const [counts, setCounts] = useState({ followers: 0, following: 0, recipes: 0, menus: 0 });
  const [requests, setRequests] = useState([]);
  const [sent, setSent] = useState([]);
  // A quien sigo YO. Sin esto, la pestana de seguidores no puede
  // distinguir a quien ya devolvi el seguimiento de quien no.
  const [followers, setFollowers] = useState([]);
  const [followingIds, setFollowingIds] = useState([]);
  const [comments, setComments] = useState([]);
  const [myRecipes, setMyRecipes] = useState([]);
  const [people, setPeople] = useState({});
  const [tab, setTab] = useState("solicitudes");
  // Solicitudes aceptadas EN ESTA visita: siguen pintadas en su sitio, ya
  // como "aceptada + seguir de vuelta". En la proxima apertura seran
  // seguidores normales y no hara falta recordarlas.
  const [justAccepted, setJustAccepted] = useState([]);
  const [recipesOpen, setRecipesOpen] = useState(false);
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [listKind, setListKind] = useState(null);
  const [blocked, setBlocked] = useState([]);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const fileRef = useRef(null);

  const refresh = useCallback(async () => {
    const uid = user?.id;
    const [prof, cts, reqs, snt, fols, fing, coms, mine, blk] = await Promise.all([
      loadMyProfile(uid),
      loadProfileCounts(uid),
      loadFollowRequests(uid),
      loadSentRequests(uid),
      loadFollowers(uid),
      loadFollowing(uid),
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
    setFollowingIds(fing);
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
      // ensureSocialProfile ya corre al iniciar sesion (App.jsx), asi que lo
      // normal es que esto solo LEA. Se mantiene por si aquel fallo (sin red
      // en aquel momento): el resultado puede venir `unsaved`, y aun asi se
      // pinta — la alternativa es la pantalla incoherente.
      const prof = await ensureSocialProfile(user.id, googleInfo(user).name);
      if (alive && prof) setProfile((p) => ({ ...(p ?? {}), ...prof }));
    })();
    return () => { alive = false; };
  }, [profile?.username, profile?.display_name, user]);

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
    // Aceptar se resuelve EN EL SITIO: la fila se queda, marcada como
    // aceptada y con el boton de devolver el seguimiento al lado. Saltar a
    // otra pestana (lo que haciamos antes) te sacaba del monton de
    // solicitudes que estabas despachando para ensenarte una sola.
    if (accept) setJustAccepted((prev) => (prev.includes(followerId) ? prev : [...prev, followerId]));
    if (accept) await acceptFollowRequest(user?.id, followerId);
    else await rejectFollowRequest(user?.id, followerId);
    refresh();
    onChanged?.();
  };

  /**
   * Devolver el seguimiento.
   *
   * Seguir va en UNA direccion: que alguien te siga no hace que tu le sigas, y
   * por tanto su menu no aparece en tu feed hasta que tu le sigues a el. Es el
   * modelo de siempre, pero nadie lo tiene en la cabeza cuando acaba de
   * aceptar a alguien — y mandarle a buscar a esa persona en otra pantalla
   * para completar la mitad que falta era pedir demasiado.
   *
   * Si el otro esta en "solo quien me sigue", esto deja una solicitud
   * pendiente de SU respuesta: por eso el boton pasa a "Pendiente" y no a
   * "Siguiendo". Decir "Siguiendo" cuando aun no lo eres es la clase de
   * mentira que hace dudar de si la app funciona.
   */
  const followBack = async (followerId) => {
    const status = await followUser(user?.id, followerId);
    if (!status) return;
    if (status === "accepted") setFollowingIds((ids) => [...ids, followerId]);
    else setSent((prev) => (prev.some((r) => r.followee_id === followerId)
      ? prev
      : [...prev, { followee_id: followerId, created_at: new Date().toISOString() }]));
    // El feed de detras tiene que recargar su lista de seguidos, o el menu de
    // esta persona no aparece hasta reiniciar la app.
    onChanged?.();
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

  // Dos estados y ya: abierta o cerrada. El "private" legacy cuenta como
  // cerrada — dejo de existir como opcion en la 0046.
  const open = profile?.visibility === "public";
  // Amigos = vinculo mutuo. Seguidores = te siguen y tu a ellos no, que solo
  // pasa con la cuenta abierta. Salen de las listas que este cajon ya tiene
  // cargadas, asi que el numero y la lista nunca se contradicen.
  const amigos = followers.filter((f) => followingIds.includes(f.follower_id)).length;
  const soloSeguidores = followers.length - amigos;
  // El nombre no se pregunta dos veces: ya lo diste al entrar (googleInfo lo
  // saca de la cuenta o del correo, igual que la pantalla de Mi perfil), así
  // que aquí se hereda y solo se edita si quieres otro de cara al feed.
  const inheritedName = googleInfo(user).name;
  const name = profile?.display_name || inheritedName;

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
            {/* Amigos (mutuo) es el vinculo que crea la app; "seguidores" a
                secas solo existe alrededor de las cuentas abiertas. Antes
                ponia Seguidores/Siguiendo, que era el vocabulario del modelo
                direccional de antes de la 0046 y ya no describia nada. */}
            <Stat n={amigos} label="Amigos" onClick={() => setListKind("friends")} />
            <span style={statDivider} />
            <Stat n={soloSeguidores} label="Seguidores" onClick={() => setListKind("followers")} />
            <span style={statDivider} />
            <Stat n={counts.recipes} label="Recetas" onClick={() => setRecipesOpen(true)} />
            <span style={statDivider} />
            <Stat n={counts.menus} label="Menús" />
          </div>
        </div>

        <div style={tabBar}>
          {/* Solo lo que pide tu atencion o es contenido tuyo. La gente
              (seguidores, seguidos) vive en los NUMEROS de arriba, que abren
              su lista — tener la misma lista tambien aqui, con otro nombre y
              otra riqueza, era lo que hacia raro el layout. */}
          <Tab id="solicitudes" tab={tab} setTab={setTab} Icon={UserPlus} label="Solicitudes" badge={requests.length + sent.length} />
          <Tab id="comentarios" tab={tab} setTab={setTab} Icon={MessageCircle} label="Comentarios" badge={comments.length} />
        </div>

        <div style={{ padding: "14px 20px 20px" }}>
          {tab === "solicitudes" && (
            <>
              <h4 style={groupTitle}>Quieren ser tus amigos</h4>
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

              {justAccepted.map((id) => {
                // Con la 0046 aceptar ya crea la vuelta, asi que lo normal es
                // leer "Conectados". El boton solo aparece si la vuelta no
                // existe (migracion sin aplicar): mejor un boton de repuesto
                // que un "Conectados" mentiroso.
                const conectados = followingIds.includes(id);
                const pedido = sent.some((r) => r.followee_id === id);
                return (
                  <PersonRow key={id} p={people[id]} note="Aceptada">
                    {conectados
                      ? <span style={stateNote}>Amigos</span>
                      : (
                        <button
                          type="button"
                          onClick={pedido ? undefined : () => followBack(id)}
                          disabled={pedido}
                          style={pedido ? ghostBtn : backBtn}
                        >
                          {pedido ? "Pendiente" : "Agregar"}
                        </button>
                      )}
                  </PersonRow>
                );
              })}

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

        </div>

        {/* Tus recetas publicadas, como hoja que abre el NUMERO de arriba —
            la misma regla que seguidores y seguidos: los numeros abren, las
            pestanas atienden. Tenerla de pestana ademas del numero era la
            repeticion que hacia raro el layout. */}
        {recipesOpen && (
          <div style={sheetOverlay} onClick={() => setRecipesOpen(false)} className="mp-overlay-in">
            <div style={sheetBody} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px 10px" }}>
                <CookingPot size={16} strokeWidth={2.5} color={GREEN} />
                <h2 style={{ margin: 0, flex: 1, fontSize: 16, fontWeight: 900, color: INK }}>Tus recetas publicadas</h2>
                <button type="button" onClick={() => setRecipesOpen(false)} aria-label="Cerrar" style={sheetClose}>
                  <X size={16} strokeWidth={2.6} />
                </button>
              </div>
              <div style={{ padding: "0 14px 18px", overflowY: "auto", flex: 1 }}>
                {myRecipes.length === 0
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
                    ))}
              </div>
            </div>
          </div>
        )}

        {/* Plegada abajo, pero con el estado siempre a la vista: quién te ve se
            decide una vez, y aun así nunca debe quedar en duda. */}
        {/* La franja ES el interruptor.
            Antes eran dos capas para una decision binaria: una franja que se
            desplegaba y, dentro, otra fila con el toggle y su etiqueta fija
            "Cuenta abierta" — fija porque nombraba el interruptor, no su
            estado, asi que leias lo mismo estuviera como estuviera. Aqui la
            respuesta y el mando son la misma cosa: el estado se lee ("Tus
            conexiones" / "Cualquiera") y se cambia en el sitio, sin abrir
            nada. La linea de debajo describe el estado ACTUAL y no el otro
            lado, que es como acaban los ajustes que nadie entiende. */}
        {/* Segmented control y no un switch.
            Un interruptor responde "¿esto es verdad, si o no?", y aqui no hay
            proposicion: hay DOS estados con nombre propio, ninguno de los
            cuales es "apagado". Forzarlo a switch obligaba a inventar una
            frase afirmable, y ninguna sonaba a lo que de verdad eliges.
            Con dos opciones a la vista se ve el estado Y la alternativa de un
            golpe, que es lo que pide una decision de privacidad. */}
        <section style={privacyBlock}>
          <div style={segWrap} role="radiogroup" aria-label="Quién ve lo que publicas">
            {[
              ["Solo amigos", false, "followers"],
              ["Cuenta abierta", true, "public"],
            ].map(([label, esAbierta, value]) => {
              const on = open === esAbierta;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={saving}
                  onClick={() => { if (!on) patch({ visibility: value }); }}
                  style={{ ...segBtn, ...(on ? segOn : null) }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <p style={switchHint}>
            {open
              ? "Cualquiera ve tus recetas y menús publicados, y puede seguirte sin permiso."
              : "Te encuentran por tu nombre, pero para ver lo que publicas tienen que pedirte ser amigos."}
          </p>
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
          viewer={user?.id}
          onChanged={() => { refresh(); onChanged?.(); }}
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

const segWrap = {
  display: "flex", gap: 4, margin: "14px 20px 0", padding: 4,
  background: "#e8efea", borderRadius: 999,
};

const segBtn = {
  flex: 1, padding: "9px 6px", borderRadius: 999, border: "none",
  background: "none", cursor: "pointer", fontFamily: "inherit",
  fontSize: 12.5, fontWeight: 800, color: "#6b7d70",
  transition: "background .18s ease, color .18s ease",
};

const segOn = {
  background: GREEN, color: "#fff", fontWeight: 900,
  boxShadow: "0 2px 7px rgba(45,90,61,.3)",
};

const switchHint = {
  margin: 0, padding: "11px 20px 18px", fontSize: 12, fontWeight: 600,
  color: "#6b7d70", lineHeight: 1.45,
};

const sheetOverlay = {
  position: "fixed", inset: 0, zIndex: 320,
  background: "rgba(20,47,29,.45)", backdropFilter: "blur(2px)",
  display: "flex", alignItems: "flex-end", justifyContent: "center",
};

const sheetBody = {
  width: "100%", maxWidth: 420, maxHeight: "72vh",
  display: "flex", flexDirection: "column",
  background: "#f5f9f6", borderRadius: "20px 20px 0 0",
  paddingBottom: "calc(10px + env(safe-area-inset-bottom))",
  boxSizing: "border-box", overflow: "hidden",
};

const sheetClose = {
  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  width: 32, height: 32, borderRadius: "50%",
  border: "none", background: "#f0f4f1", color: GREEN, cursor: "pointer",
};

const stateNote = {
  flexShrink: 0, padding: "6px 11px", borderRadius: 999,
  background: "#f0f4f1", color: "#6b7d70", fontSize: 11.5, fontWeight: 800,
};

const backBtn = {
  padding: "6px 13px", borderRadius: 999, border: "none",
  background: GREEN, color: "#fff", cursor: "pointer",
  fontFamily: "inherit", fontSize: 12, fontWeight: 800, flexShrink: 0,
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

const empty = { margin: "8px 0 4px", fontSize: 12, fontWeight: 600, color: "#8aa294" };
