import { useCallback, useEffect, useState, useRef } from "react";
import { Users, Compass, Search, Bell, Plus, Check, CalendarDays, X, Lock, FolderPlus, Heart, Meh, Ban, Eye, Share2, EyeOff, Flag, MoreVertical, Ban as BlockIcon } from "lucide-react";
import { BottomNav, bottomNavSpacer, Avatar, EmptyIllustration } from "../components/ui.jsx";
import { RecipePoster, ActionButton } from "../components/SwipeCard.jsx";
import { ProfileDrawer } from "../components/ProfileDrawer.jsx";
import { PersonSheet } from "../components/PersonSheet.jsx";
import { CommentThread } from "../components/CommentThread.jsx";
import { ReportSheet } from "../components/ReportSheet.jsx";
import { ShareMenuSheet } from "../components/ShareMenuSheet.jsx";
import { ShareRecipeSheet } from "../components/ShareRecipeSheet.jsx";
import { NotificationsPopover } from "../components/NotificationsPopover.jsx";
import { DiscoverPeopleSheet } from "../components/DiscoverPeopleSheet.jsx";
import { loadNotifications, markNotificationsSeen, countUnread } from "../lib/socialNotifications.js";
import { setFeedBadge } from "../lib/socialBadge.js";
import { shareOut } from "../lib/shareLink.js";
import { relativeTime } from "../lib/socialUi.js";
import { dishImageForRecipe } from "../assets/dishes/dishImages.js";
import { deckImg } from "../lib/dishPhotoOptimize.js";
import { folderArt, ALL_ID } from "./CatalogBrowserSheet.jsx";
import { allFolders } from "../lib/recipeCollections.js";
import {
  loadFeed,
  loadWeeklyMenus,
  loadProfilesByIds,
  loadFollowing,
  loadSentRequests,
  loadRecipeStats,
  hideRecipe,
  searchProfiles,
  followUser,
  unfollowUser,
  blockUser,
} from "../lib/social.js";
import { FIXTURES_ENABLED, FIXTURE_STATS } from "../lib/socialFixtures.js";

const GREEN = "#2d5a3d";
const INK = "#142f1d";
const TEAL = "#0f766e";
const HEADER_BAND = "#e9f4ed";
// La franja del carrusel tiene su propio color, cálido, contra el verde frío
// de la cabecera: son dos zonas distintas (quién eres tú / qué hace tu gente)
// y compartir tono las hacía parecer la misma.
const CAROUSEL_BG = "#f4ede1";

/**
 * Feed — quinta pestaña, y puerta de todo lo que pasa fuera de tu casa: la
 * gente, y el mazo de Inspírate.
 *
 * ── Dos ejes, y a propósito ────────────────────────────────────────
 * Menús y recetas no son dos pestañas de lo mismo: un menú CONTIENE recetas,
 * y además llegan a ritmos distintos — uno por persona y semana frente a
 * muchas recetas sueltas. Un segmented control los pondría de iguales y
 * dejaría la pestaña de menús casi vacía. Así que cada uno va por su eje:
 *
 *   · HORIZONTAL (arriba) = menús. Pocos, periódicos, uno por persona. La
 *     cara en esa fila ya significa "ha publicado su menú"; el anillo marca
 *     lo que no has abierto. Solo cara y nombre: el plato de hoy vivió ahí un
 *     rato y hacía la fila el doble de alta para un dato que se ve mejor al
 *     abrir el menú.
 *   · VERTICAL (abajo) = recetas. Muchas y continuas, con autor y cuándo.
 *
 * Y por eso un menú NO aparece además como tarjeta en la corriente: estaría
 * dos veces en la misma pantalla.
 *
 * Sobre el formato de la fila: se parece a las historias y no lo es — ni
 * caducan en 24 h ni hay salto automático. Se toma prestado el anillo, que es
 * un "aquí hay algo nuevo" que todo el mundo ya sabe leer, y se deja fuera la
 * promesa: al tocar se abre la semana, no una secuencia a pantalla completa.
 *
 * Y por eso la fila no se llama "historias": el gesto es el mismo, pero la
 * palabra arrastra la presión de publicar a diario, y aquí se publica una vez
 * por semana como mucho.
 *
 * Las recetas del catalogo y las de la gente comparten corriente y cartel:
 * al decidir un plato, de donde salga es lo de menos.
 *
 * Sin conexión esta pantalla no tiene nada que enseñar — no hay copia local de
 * lo que publican otros — así que el estado vacío es normal, no un fallo.
 */
export function FeedScreen({
  user = null,
  onNav,
  onOpenRecipe,
  onCopyRecipe,
  menuShared = false,
  onPublishMenu,
  onUnpublishMenu,
  unsharedRecipes = [],
  myRecipes = [],
  initialPersonId = null,
  onConsumedPerson,
  onPublishRecipe,
  recipeFolders = [],
  onCreateFolder,
  onSetRecipeFolders,
}) {
  const [seenMenus, setSeenMenus] = useState(readSeenMenus);
  const [items, setItems] = useState([]);
  // "Siguiendo" o "Descubrir". Arranca en Siguiendo porque es el feed que la
  // gente espera de una red social; si no sigues a nadie, su estado vacio te
  // manda a buscar gente en vez de enseñarte desconocidos sin avisar.
  const [scope, setScope] = useState("following");
  const [cursor, setCursor] = useState(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [weekly, setWeekly] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [following, setFollowing] = useState([]);
  const [pendingIds, setPendingIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [copied, setCopied] = useState(() => new Set());
  const [menuOpen, setMenuOpen] = useState(null);
  const [stats, setStats] = useState({});
  const [folderPickerFor, setFolderPickerFor] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [personId, setPersonId] = useState(initialPersonId);
  // Un enlace a un perfil abre esa ficha en cuanto la pantalla existe.
  useEffect(() => {
    if (!initialPersonId) return;
    setPersonId(initialPersonId);
    onConsumedPerson?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPersonId]);
  const [sharing, setSharing] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareRecipeOpen, setShareRecipeOpen] = useState(false);
  const [meh, setMeh] = useState(() => new Set());
  const [notif, setNotif] = useState({ items: [], seenAt: null });
  const [notifPeople, setNotifPeople] = useState({});
  const [notifOpen, setNotifOpen] = useState(false);
  // La marca de agua de ANTES de abrir: la campana se pone a cero al abrir,
  // pero dentro del panel lo nuevo sigue tintado durante esta visita.
  const [prevSeenAt, setPrevSeenAt] = useState(null);
  // El panel cuelga de la campana de verdad: se mide al abrir en vez de
  // dejar una posicion fija a ojo, que se rompe en cuanto cambia el alto de
  // la cabecera o el navegador pinta las safe areas de otra forma.
  const bellRef = useRef(null);
  const [bellRect, setBellRect] = useState(null);

  // La corriente es SOLO de recetas: los menús ya están arriba, y repetirlos
  // aquí los pondría dos veces en la misma pantalla.
  const recipes = items.filter((i) => i.kind === "recipe");

  const openMenu = (m) => {
    setMenuOpen(m);
    setSeenMenus((prev) => {
      const next = new Set(prev).add(m.id);
      writeSeenMenus(next);
      return next;
    });
  };

  /**
   * Abrir el contenido que menciona una notificacion o un comentario del
   * cajon. Solo puede saltar a lo que el feed ya tiene cargado: si el menu o
   * la receta no estan (muy viejos, o retirados), no pasa nada — mejor un
   * toque sin efecto que abrir una pantalla vacia.
   */
  /**
   * La foto del plato del que habla una notificacion. Sale de lo que el feed
   * ya tiene en memoria: si esa receta no esta cargada, la fila se queda sin
   * miniatura — mejor eso que una peticion por notificacion.
   */
  // Quien publica en abierto, con cuanto. Es la unica sugerencia que le
  // queda a quien acaba de llegar y no sigue a nadie todavia.
  const feedAuthors = (() => {
    const count = new Map();
    for (const i of items) count.set(i.ownerId, (count.get(i.ownerId) ?? 0) + 1);
    return [...count.entries()]
      .map(([id, n]) => ({ id, count: n }))
      .sort((a, b) => b.count - a.count);
  })();

  const thumbForTarget = (type, id) => {
    if (type !== "recipe") return null;
    // Tu biblioteca primero: casi todas estas notificaciones hablan de algo
    // TUYO, y tu receta puede llevar semanas fuera de la tanda del feed. El
    // feed es el respaldo, para responder a un comentario tuyo en lo de otro.
    const src =
      myRecipes.find((r) => r.id === id) ??
      items.find((i) => i.kind === "recipe" && i.recipe.id === id)?.recipe ??
      null;
    const img = src ? dishImageForRecipe(src) : null;
    return img ? deckImg(img, 160) : null;
  };

  const openTarget = (type, id) => {
    if (type === "menu") {
      const m = weekly.find((w) => w.id === id) ?? items.find((i) => i.kind === "menu" && i.id === id)?.menu;
      if (m) openMenu(m);
      return;
    }
    const it = items.find((i) => i.kind === "recipe" && i.recipe.id === id);
    if (it) onOpenRecipe?.(it.recipe);
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    const mineIds = await loadFollowing(user?.id);
    const [feed, week, sent] = await Promise.all([
      loadFeed({ viewerId: user?.id, scope, followingIds: mineIds }),
      loadWeeklyMenus({ viewerId: user?.id }),
      loadSentRequests(user?.id),
    ]);
    const mine = mineIds;
    setItems(feed.items);
    setCursor(feed.cursor);
    setMore(!feed.done);
    setWeekly(week);
    setFollowing(mine);
    setPendingIds(sent.map((r) => r.followee_id));
    // Los autores de las dos listas, en una sola petición: uno por tarjeta
    // serían 20 peticiones por pantalla.
    setProfiles(await loadProfilesByIds([...feed.items.map((i) => i.ownerId), ...week.map((w) => w.owner_id)]));
    setLoading(false);
    // Las estadísticas van aparte y después: son un adorno de la tarjeta, y no
    // deben retrasar la pintura de lo que sí es contenido.
    const recipeIds = feed.items.filter((i) => i.kind === "recipe").map((i) => i.recipe.id);
    const real = await loadRecipeStats(recipeIds);
    setStats(FIXTURES_ENABLED ? { ...FIXTURE_STATS, ...real } : real);
  }, [user?.id, scope]);

  useEffect(() => { refresh(); }, [refresh]);

  /**
   * La siguiente tanda. Se pide sola al llegar al final (ver el centinela de
   * abajo): un boton de "cargar mas" es un peaje que nadie quiere pagar
   * cuando lo unico que estas haciendo es bajar.
   */
  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    const feed = await loadFeed({ viewerId: user?.id, scope, cursor });
    setItems((prev) => {
      // Por si acaso: la misma receta no puede entrar dos veces aunque dos
      // filas compartan fecha al milisegundo.
      const seen = new Set(prev.map((i) => `${i.kind}_${i.id}`));
      return [...prev, ...feed.items.filter((i) => !seen.has(`${i.kind}_${i.id}`))];
    });
    setCursor(feed.cursor);
    setMore(!feed.done);
    setLoadingMore(false);
    const nuevos = feed.items.filter((i) => i.kind === "recipe").map((i) => i.recipe.id);
    const [profs, sts] = await Promise.all([
      loadProfilesByIds(feed.items.map((i) => i.ownerId)),
      loadRecipeStats(nuevos),
    ]);
    setProfiles((prev) => ({ ...prev, ...profs }));
    setStats((prev) => ({ ...prev, ...sts }));
  }, [cursor, loadingMore, user?.id, scope]);

  const sentinelRef = useRef(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !more) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      // Se dispara un poco antes de llegar al borde para que la siguiente
      // tanda ya este cuando el dedo termina el gesto.
      { rootMargin: "600px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [more, loadMore]);

  const refreshNotifications = useCallback(async () => {
    const res = await loadNotifications(user?.id);
    setNotif((prev) => ({ ...res, seenAt: prev.seenAt ?? res.seenAt }));
    setNotifPeople(await loadProfilesByIds(res.items.map((n) => n.actorId)));
    setFeedBadge(countUnread(res.items, res.seenAt) > 0);
  }, [user?.id]);

  useEffect(() => { refreshNotifications(); }, [refreshNotifications]);

  const openNotifications = () => {
    setBellRect(bellRef.current?.getBoundingClientRect() ?? null);
    setPrevSeenAt(notif.seenAt);
    setNotifOpen(true);
    // Abrir = leer: la marca avanza YA (campana y punto del nav a cero), no
    // al cerrar — igual que un chat se marca leido al entrar, no al salir.
    setNotif((prev) => ({ ...prev, seenAt: new Date().toISOString() }));
    setFeedBadge(false);
    markNotificationsSeen(user?.id);
  };

  /**
   * Copiar es dos cosas: traerte la receta y decidir dónde la guardas. Se
   * pregunta una vez y se recuerda — quien conteste "Todas" no vuelve a ver
   * la hoja, y quien quiera ordenar sigue teniendo el paso.
   */
  const copyInto = async (item, folderIds) => {
    const newId = await onCopyRecipe?.(item.recipe.id, item.ownerId);
    if (!newId) return;
    // La copia nace con id propio, así que las carpetas se asignan al NUEVO
    // id, no al de la receta original — que no es tuya.
    if (folderIds?.length) onSetRecipeFolders?.(newId, folderIds);
    setCopied((prev) => new Set(prev).add(item.recipe.id));
  };

  const handleBlocked = (blockedId) => {
    setItems((prev) => prev.filter((i) => i.ownerId !== blockedId));
    setWeekly((prev) => prev.filter((m) => m.owner_id !== blockedId));
    setFollowing((prev) => prev.filter((id) => id !== blockedId));
    setMenuOpen(null);
    setPersonId(null);
  };

  const handleCopy = (item) => {
    const preset = readDefaultFolders();
    if (preset) { copyInto(item, preset); return; }
    setFolderPickerFor(item);
  };

  /**
   * Solo el "no" penaliza, y no como un descarte: la receta es de otro, no
   * está en tu biblioteca, así que no hay nada que mandar a Descartados. Se
   * apunta como "no me la vuelvas a enseñar" y desaparece del Feed y del mazo.
   * "Ni fu ni fa" no guarda nada — es literalmente no opinar.
   */
  const handleDislike = (item) => {
    hideRecipe(item.recipe.id);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
  };

  return (
    <div style={{ minHeight: "100dvh", background: "#fff", display: "flex", flexDirection: "column" }}>
      <div style={{ background: HEADER_BAND }}>
        <div
          style={{
            padding: "20px 18px 14px",
            maxWidth: 420, margin: "0 auto", width: "100%", boxSizing: "border-box",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div
              style={{
                width: 36, height: 36, borderRadius: 11, background: "#e6efff",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <Users size={17} color="#4a6fd4" />
            </div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: INK, letterSpacing: "-.3px" }}>
              Feed
            </h1>
          </div>
          {/* Buscar y "yo" en la cabecera, no como sub-pestañas: si el feed
              comparte fila con otras dos pestañas deja de ser lo primero que
              ves, que es justo lo que tiene que ser. */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            <button type="button" onClick={() => setSearchOpen(true)} title="Buscar gente" style={iconBtn}>
              <Search size={16} strokeWidth={2.3} />
            </button>
            {(() => {
              const unread = countUnread(notif.items, notif.seenAt);
              return (
                <button
                  type="button"
                  ref={bellRef}
                  onClick={openNotifications}
                  title="Notificaciones"
                  aria-label={unread > 0 ? `Notificaciones (${unread} sin leer)` : "Notificaciones"}
                  style={{ ...iconBtn, position: "relative" }}
                >
                  <span className={notifOpen ? "mp-bell-ring" : undefined} style={{ display: "inline-flex" }}>
                    <Bell size={16} strokeWidth={2.3} />
                  </span>
                  {unread > 0 && (
                    <span style={bellBadge}>{unread > 9 ? "9+" : unread}</span>
                  )}
                </button>
              );
            })()}
            {/* El perfil se abre como cajon lateral, no como pantalla: se
                entra a resolver cosas cortas (aceptar a alguien, leer un
                comentario) y se vuelve al feed sin perder el sitio. */}
            <button type="button" onClick={() => setProfileOpen(true)} title="Mi perfil" style={{ ...iconBtn, border: "none", padding: 0 }}>
              <Avatar name={user?.email ?? "Yo"} size={34} color={GREEN} />
            </button>
          </div>
        </div>

        {(weekly.length > 0 || onPublishMenu) && (
          <section style={carouselBand}>
            <div aria-hidden="true" style={glassBlobs} />
            <div aria-hidden="true" style={glassPane} />
            <div style={{ position: "relative" }}>
            {/* "Hoy cocinan" y no "esta semana": el plato de hoy sale del
                menú que ya han publicado, así que la fila cuenta algo vivo
                sin pedir un tipo de contenido nuevo. Al tocar, la semana. */}
            <h2 style={sectionTitle}>Hoy cocinan…</h2>
            <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 2, marginInline: -14, paddingInline: 14 }}>
              {/* Tu hueco, el primero de la fila — el patron de "tu historia"
                  de toda red: anillo punteado con + si no has publicado, un
                  check si si. Sustituye al banner con parrafo que habia
                  encima: mismo mensaje en una fraccion del sitio, y el aviso
                  de privacidad se lee dentro de la hoja al ir a publicar. */}
              {onPublishMenu && (
                <button type="button" onClick={() => setShareOpen(true)} style={weeklyItem}>
                  <span style={menuShared ? ringOn : ringDashed}>
                    <span style={ringGap}>
                      <span style={shareCircle}>
                        {menuShared
                          ? <Check size={17} strokeWidth={2.8} color={TEAL} />
                          : <Plus size={17} strokeWidth={2.6} color="#8aa294" />}
                      </span>
                    </span>
                  </span>
                  <span style={{ ...weeklyName, fontWeight: 700, color: INK }}>Tu menú</span>
                </button>
              )}
            {weekly.map((m) => {
                const p = profiles[m.owner_id];
                const unseen = !seenMenus.has(m.id);
                return (
                  <button key={m.id} type="button" onClick={() => openMenu(m)} style={weeklyItem}>
                    {/* Anillo de gradiente + hueco blanco + avatar, la
                        construcción de Instagram exacta. El gradiente es de
                        la paleta de la app, no el naranja-morado de allí. */}
                    <span style={unseen ? ringOn : ringOff}>
                      <span style={ringGap}>
                        <Avatar name={p?.display_name ?? "?"} photo={p?.avatar_url} size={48} color={TEAL} />
                      </span>
                    </span>
                    <span style={{ ...weeklyName, fontWeight: unseen ? 700 : 500, color: unseen ? INK : "#8aa294" }}>
                      {p?.display_name || (p?.username ? `@${p.username}` : "Alguien")}
                    </span>
                  </button>
                );
              })}
            </div>
            </div>
          </section>
          )}

      </div>

      <div style={{ flex: 1, overflowY: "auto", paddingBottom: bottomNavSpacer() }}>
        <div style={{ maxWidth: 420, margin: "0 auto", width: "100%", boxSizing: "border-box", padding: "0 18px" }}>

          {loading && <p style={hint}>Cargando…</p>}

          {onPublishRecipe && !loading && (
            <button type="button" onClick={() => setShareRecipeOpen(true)} style={publishCard}>
              {/* La ilustracion de Mis Recetas, la misma que ya identifica tu
                  recetario en el navegador de carpetas: si esa imagen ya
                  significa "lo tuyo", la tarjeta no tiene que explicarse.
                  Y es ella quien pone el color: el resto va en la escala de
                  tinta de siempre. */}
              <img src="/avatares/cards/empty_recetas_propias.jpg" alt="" loading="lazy" style={publishArt} />
              <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                <span style={{ display: "block", fontSize: 12.5, fontWeight: 800, color: INK }}>
                  Publica una receta tuya
                </span>
                <span style={{ display: "block", fontSize: 10.5, fontWeight: 600, color: "#7a8a7f", marginTop: 1 }}>
                  {unsharedRecipes.length === 1
                    ? "Tienes 1 sin compartir"
                    : unsharedRecipes.length > 1
                      ? `Tienes ${unsharedRecipes.length} sin compartir`
                      : "Tus platos, en el feed"}
                </span>
              </span>
              <span style={publishPill}>Publicar</span>
            </button>
          )}

          {/* Siguiendo o Descubrir. Es la unica decision del feed, asi que va
              arriba del rio y no en la cabecera: no compite con buscar,
              notificaciones y perfil, que son atajos, no modos de lectura. */}
          <div style={scopeTabs}>
            {/* Cada pestaña con su icono y su color: azul para los tuyos,
                teja para lo que esta por descubrir. En gris las dos, la fila
                no decia nada y habia que leerla entera. */}
            {[
              ["following", "Siguiendo", Users, "#4a6fd4"],
              ["all", "Descubrir", Compass, "#cf7833"],
            ].map(([id, label, TabIcon, tint]) => {
              const on = scope === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => { if (!on) { setScope(id); setItems([]); } }}
                  style={{
                    ...scopeTab,
                    background: on ? "#fff" : "transparent",
                    color: on ? INK : "#8aa294",
                    boxShadow: on ? "0 1px 4px rgba(0,0,0,.1)" : "none",
                  }}
                >
                  <TabIcon size={14} strokeWidth={2.5} color={on ? tint : "#b6c7bd"} />
                  {label}
                </button>
              );
            })}
          </div>

          {/* Sigues a gente pero no han publicado nada: no es lo mismo que no
              seguir a nadie, y decir lo que toca evita que parezca roto. */}
          {!loading && scope === "following" && recipes.length === 0 && (
            <div style={{ padding: "22px 0 4px", textAlign: "center" }}>
              <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: "#8aa294", lineHeight: 1.5 }}>
                {following.length === 0
                  ? "Aquí verás lo que cocina la gente a la que sigues. Todavía no sigues a nadie."
                  : "La gente a la que sigues no ha publicado nada nuevo. Date una vuelta por Descubrir."}
              </p>
              <button
                type="button"
                onClick={() => (following.length === 0 ? setSearchOpen(true) : setScope("all"))}
                style={{ ...primaryBtn, margin: "12px auto 0" }}
              >
                {following.length === 0
                  ? <><Search size={14} strokeWidth={2.6} /> Encontrar gente</>
                  : <><Users size={14} strokeWidth={2.4} /> Ir a Descubrir</>}
              </button>
            </div>
          )}

          {!loading && scope === "all" && recipes.length === 0 && weekly.length === 0 && (
            <div style={{ padding: "26px 0 10px" }}>
              <EmptyIllustration
                img="/avatares/cards/comidas.jpg"
                accent={TEAL}
                title="Aquí verás lo que cocinan los demás"
                subtitle="Busca a alguien y síguele: sus recetas y sus menús de la semana aparecerán aquí, y además se colarán en el mazo de Inspírate."
              >
                <button type="button" onClick={() => setSearchOpen(true)} style={{ ...primaryBtn, marginTop: 14 }}>
                  <Search size={14} strokeWidth={2.6} /> Buscar gente
                </button>
              </EmptyIllustration>
            </div>
          )}

          {recipes.length > 0 && (
            <h2 style={{ ...sectionTitle, marginTop: 16 }}>Recién salido del horno</h2>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 26, padding: "4px 0 18px" }}>
            {recipes.map((item) => (
              <RecipeCard
                key={`r_${item.id}`}
                item={item}
                user={user}
                profile={profiles[item.ownerId]}
                mine={item.ownerId === user?.id}
                copied={copied.has(item.recipe.id)}
                meh={meh.has(item.recipe.id)}
                onMeh={() => setMeh((prev) => new Set(prev).add(item.recipe.id))}
                onDislike={() => handleDislike(item)}
                onOpenPerson={() => setPersonId(item.ownerId)}
                stats={stats[item.recipe.id] ?? EMPTY_STATS}
                onOpen={() => onOpenRecipe?.(item.recipe)}
                onCopy={() => handleCopy(item)}
              />
            ))}
          </div>

          {/* Centinela: al asomar por el borde inferior pide la siguiente
              tanda. Ver loadMore. */}
          {more && (
            <div ref={sentinelRef} style={{ padding: "6px 0 26px", textAlign: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#b6c7bd" }}>
                {loadingMore ? "Cargando más…" : " "}
              </span>
            </div>
          )}

        </div>
      </div>

      {searchOpen && (
        <DiscoverPeopleSheet
          user={user}
          following={following}
          pending={pendingIds}
          feedAuthors={feedAuthors}
          profiles={profiles}
          onClose={() => setSearchOpen(false)}
          onChanged={refresh}
          onOpenPerson={(id) => { setSearchOpen(false); setPersonId(id); }}
        />
      )}

      {menuOpen && (
        <MenuPeek menu={menuOpen} user={user} profile={profiles[menuOpen.owner_id]} onOpenPerson={() => { setMenuOpen(null); setPersonId(menuOpen.owner_id); }} onBlocked={handleBlocked} onClose={() => setMenuOpen(null)} />
      )}

      {notifOpen && (
        <NotificationsPopover
          user={user}
          items={notif.items}
          prevSeenAt={prevSeenAt}
          people={notifPeople}
          anchor={bellRect}
          followingIds={following}
          pendingIds={pendingIds}
          thumbFor={thumbForTarget}
          onOpenPerson={(id) => { setNotifOpen(false); setPersonId(id); }}
          onOpenTarget={(type, id) => { setNotifOpen(false); openTarget(type, id); }}
          onChanged={refreshNotifications}
          onClose={() => setNotifOpen(false)}
        />
      )}

      {shareRecipeOpen && (
        <ShareRecipeSheet
          recipes={unsharedRecipes}
          signedIn={Boolean(user?.id)}
          sharing={sharing}
          onPublish={async (recipeId, visibility) => {
            setSharing(true);
            const done = await onPublishRecipe?.(recipeId, visibility);
            setSharing(false);
            if (done) { setShareRecipeOpen(false); refresh(); }
          }}
          onClose={() => setShareRecipeOpen(false)}
        />
      )}

      {shareOpen && (
        <ShareMenuSheet
          shared={menuShared}
          sharing={sharing}
          onPublish={async (scope) => {
            setSharing(true);
            const done = await onPublishMenu?.(scope);
            setSharing(false);
            if (done) { setShareOpen(false); refresh(); }
          }}
          onUnpublish={async () => {
            setSharing(true);
            await onUnpublishMenu?.();
            setSharing(false);
            setShareOpen(false);
            refresh();
          }}
          onClose={() => setShareOpen(false)}
        />
      )}

      {folderPickerFor && (
        <SaveToFolderDialog
          recipe={folderPickerFor.recipe}
          folders={allFolders(recipeFolders)}
          onSave={(ids, remember) => {
            if (remember) writeDefaultFolders(ids);
            copyInto(folderPickerFor, ids);
          }}
          onCreateFolder={onCreateFolder}
          onClose={() => setFolderPickerFor(null)}
        />
      )}

      {personId && (
        <PersonSheet
          user={user}
          userId={personId}
          profile={profiles[personId]}
          onClose={() => setPersonId(null)}
          onOpenRecipe={(r) => { setPersonId(null); onOpenRecipe?.(r); }}
          onOpenMenu={(m) => { setPersonId(null); openMenu(m); }}
          onOpenPerson={(id) => setPersonId(id)}
          onBlocked={handleBlocked}
        />
      )}

      {profileOpen && (
        <ProfileDrawer
          user={user}
          thumbFor={thumbForTarget}
          onOpenPerson={(id) => { setProfileOpen(false); setPersonId(id); }}
          onClose={() => setProfileOpen(false)}
          onOpenTarget={(type, id) => { setProfileOpen(false); openTarget(type, id); }}
        />
      )}

      <BottomNav active="feed" onNav={onNav} />
    </div>
  );
}

// ── Tarjeta de receta ───────────────────────────────────────────────────────

/**
 * La receta con el mismo cartel que en el mazo (RecipePoster): foto a sangre,
 * dificultad y tiempo en las esquinas, nombre grande y el autor debajo del
 * nombre. Cambia el gesto, no el objeto — si en Inspírate y aquí se vieran
 * distintas, parecerían dos catálogos.
 *
 * Sin tarjeta que lo envuelva: el cartel ya tiene su forma y su sombra, y un
 * marco blanco alrededor solo añadía un borde más que mirar.
 *
 * Todo cabe en el propio cartel: a la izquierda lo que la receta es
 * (dificultad, tiempo), a la derecha lo que la gente dice (votos y veces
 * cocinada), y abajo el autor con la fecha. Sin franja de datos aparte —
 * era una fila más para tres números que caben en las esquinas.
 */
function RecipeCard({ item, user, profile, mine, copied, meh, stats, onOpen, onCopy, onMeh, onDislike, onOpenPerson }) {
  const [reporting, setReporting] = useState(false);
  // Aviso corto de que el enlace se copio: un boton que no confirma nada
  // parece roto aunque haya funcionado.
  const [shared, setShared] = useState(null);
  useEffect(() => {
    if (!shared) return;
    const t = setTimeout(() => setShared(null), 2200);
    return () => clearTimeout(t);
  }, [shared]);
  const r = item.recipe;
  const poster = {
    id: r.id,
    name: r.name,
    category: r.category,
    difficulty: r.difficulty,
    time: r.time_minutes,
    photo: r.photo,
    owner: {
      name: profile?.display_name || (profile?.username ? `@${profile.username}` : "Alguien"),
      avatar: profile?.avatar_url ?? null,
    },
  };
  return (
    <article style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <RecipePoster
        recipe={poster}
        onInfo={onOpen}
        onOwner={mine ? undefined : onOpenPerson}
        when={relativeTime(item.createdAt)}
        stats={stats}
        style={{ aspectRatio: "4 / 5", cursor: "pointer", boxShadow: "0 6px 20px rgba(20,47,29,.14)" }}
      />

      {/* Copiar, no dar like: en una app de menús el aplauso no sirve de nada,
          y "cuántos se la han llevado" es la única señal honesta de si una
          receta es buena. */}
      {/* Los mismos tres botones que el mazo, en el mismo orden y con los
          mismos colores: es la misma decisión sobre el mismo objeto, y
          aprender dos vocabularios para lo mismo sobra. Aquí no hay arrastre,
          así que son la única vía. */}
      {mine ? (
        <p style={{ margin: 0, textAlign: "center", fontSize: 12, fontWeight: 700, color: "#8aa294" }}>
          Tu receta
        </p>
      ) : copied ? (
        <p style={{ ...resolvedNote, color: GREEN }}>
          <Check size={13} strokeWidth={3} /> En tus recetas
        </p>
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20, padding: "2px 0 4px" }}>
          <ActionButton label="No me la enseñes más" color="#c0392b" size={50} onClick={onDislike}>
            <Ban size={21} strokeWidth={2.6} />
          </ActionButton>
          <ActionButton label="Ni fu ni fa" color="#a97a1f" size={44} disabled={meh} onClick={onMeh}>
            <Meh size={19} strokeWidth={2.4} />
          </ActionButton>
          <ActionButton label="Añadir a mis recetas" color={GREEN} size={50} onClick={onCopy}>
            <Heart size={20} strokeWidth={2.6} />
          </ActionButton>
        </div>
      )}

      {/* Plegado: un hilo abierto por tarjeta convertiria la corriente en un
          muro de texto, y ademas pedir los comentarios de cada plato que pasa
          por delante seria una peticion por tarjeta. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <CommentThread
          user={user}
          targetType="recipe"
          targetId={item.recipe.id}
          targetOwnerId={item.ownerId}
          count={stats?.comments ?? 0}
        />
        {/* Compartir y reportar van JUNTOS y pegados: son las dos acciones
            de "esta tarjeta" y sueltas por la fila parecian dos botones sin
            relacion entre si. */}
        <span style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: "auto", flexShrink: 0 }}>
        <button
          type="button"
          aria-label="Compartir receta"
          onClick={async () => {
            const res = await shareOut({
              kind: "recipe", value: item.recipe.id,
              title: item.recipe.name,
              text: `Mira esta receta en HoMenu: ${item.recipe.name}`,
            });
            if (res === "copied") setShared("Enlace copiado");
            else if (res === "error") setShared("No se ha podido compartir");
          }}
          style={reportLink}
        >
          <Share2 size={12} strokeWidth={2.5} />
        </button>
        {!mine && (
          <button type="button" onClick={() => setReporting(true)} aria-label="Reportar receta" style={reportLink}>
            <Flag size={12} strokeWidth={2.5} />
          </button>
        )}
        </span>
      </div>

      {shared && <div style={sharedNote}>{shared}</div>}

      {reporting && (
        <ReportSheet user={user} targetType="recipe" targetId={item.recipe.id} onClose={() => setReporting(false)} />
      )}
    </article>
  );
}

// ── Tarjeta de menú ─────────────────────────────────────────────────────────

/**
 * Lo que llega en `payload` es la proyección curada que se guardó al publicar
 * (contrato en 0027_social_feed.sql): platos por día y avatares anónimos. Ni
 * compra, ni presupuesto, ni horarios, ni nombres — aunque el menú original
 * los tenga, aquí no han llegado nunca.
 */
function MenuPeek({ menu: m, user, profile, onClose, onOpenPerson, onBlocked }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  // Filtro por comensal: toca un avatar de la cabecera y ves solo lo que come
  // esa persona ("que han comido los peques hoy"). Es una VISTA sobre lo ya
  // publicado — no ensena nada que la semana entera no ensenara igual.
  const [eaterFilter, setEaterFilter] = useState(null);
  const days = m.payload?.weeks?.[0]?.days ?? [];
  const members = m.payload?.members ?? [];
  const byId = Object.fromEntries(members.map((x) => [x.id, x]));
  const name = profile?.display_name || (profile?.username ? `@${profile.username}` : "Alguien");

  return (
    <div style={peekBackdrop} onClick={onClose}>
      <div className="mp-peek-in" style={peekScreen} onClick={(e) => e.stopPropagation()}>
        {/* Entrar en la cocina de alguien: su cara arriba y su semana debajo,
            con la misma pinta que tiene la tuya. Pantalla completa y no una
            hoja, porque el gesto que la abre es "asomarse". */}
        <div style={peekHeader}>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={peekClose}>
            <X size={17} strokeWidth={2.6} />
          </button>
          <div style={{ position: "absolute", top: 14, left: 14 }}>
            {/* peekClose trae su propio position:absolute (top/right) para
                anclarse solo; aqui ya lo ancla el div padre, asi que se usa un
                estilo sin esa parte o el boton se iria a la esquina opuesta. */}
            <button type="button" onClick={() => setMoreOpen((v) => !v)} aria-label="Más opciones" style={peekMenuBtn}>
              <MoreVertical size={17} strokeWidth={2.6} />
            </button>
            {moreOpen && (
              <div style={peekMenu}>
                <button type="button" onClick={() => { setMoreOpen(false); setReporting(true); }} style={peekMenuItem}>
                  <Flag size={13} strokeWidth={2.5} /> Reportar menú
                </button>
                <button
                  type="button"
                  onClick={async () => { setMoreOpen(false); await blockUser(user?.id, m.owner_id); onBlocked?.(m.owner_id); onClose(); }}
                  style={{ ...peekMenuItem, color: "#c0392b" }}
                >
                  <BlockIcon size={13} strokeWidth={2.5} /> Bloquear
                </button>
              </div>
            )}
          </div>
          <span style={ringOn}>
            <span style={{ ...ringGap, background: "rgba(255,255,255,.92)" }}>
              <Avatar name={profile?.display_name ?? "?"} photo={profile?.avatar_url} size={64} color={TEAL} />
            </span>
          </span>
          <button type="button" onClick={onOpenPerson} style={{ padding: 0, border: "none", background: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 18, fontWeight: 900, color: INK, marginTop: 10 }}>
            {name}
          </button>
          {profile?.username && profile?.display_name && (
            <div style={{ fontSize: 12, fontWeight: 700, color: "#8aa294" }}>@{profile.username}</div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 12.5, fontWeight: 800, color: TEAL }}>
            <CalendarDays size={14} strokeWidth={2.5} />
            {m.title || rangeLabel(m.week_start, m.week_end)}
          </div>
          {members.length > 0 && (
            <div style={{ display: "flex", gap: 5, marginTop: 10 }}>
              {members.map((mem) => {
                const on = eaterFilter === mem.id;
                return (
                  <button
                    key={mem.id}
                    type="button"
                    title={mem.role === "nino" ? "Solo lo que come este peque" : "Solo lo que come esta persona"}
                    aria-pressed={on}
                    onClick={() => setEaterFilter(on ? null : mem.id)}
                    style={{
                      ...memberDot, width: 26, height: 26,
                      border: on ? `2px solid ${TEAL}` : "2px solid transparent",
                      background: on ? "#d9ece7" : "#e8efe9",
                      cursor: "pointer", padding: 0, fontFamily: "inherit",
                    }}
                  >
                    {mem.avatar
                      ? <img src={mem.avatar} alt="" style={{ width: 22, height: 22, borderRadius: 999, objectFit: "cover" }} />
                      : (mem.role === "nino" ? "N" : "A")}
                  </button>
                );
              })}
              {eaterFilter && (
                <button type="button" onClick={() => setEaterFilter(null)} style={clearFilterBtn}>
                  Ver todo
                </button>
              )}
            </div>
          )}
          {/* Se dice en voz alta: esto es la semana de otra persona y desde
              aqui no se toca nada. Sin el aviso, una pantalla identica a la
              tuya invita a editarla. */}
          <div style={readOnlyPill}>
            <Eye size={12} strokeWidth={2.6} /> Solo vista
          </div>
        </div>

        <div style={{ padding: "4px 16px 26px", maxWidth: 420, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
          {days.length === 0 && <p style={hint}>Este menu no trae dias.</p>}
          {days
            .map((d) => ({
              ...d,
              meals: (d.meals ?? []).filter((meal) => !eaterFilter || (meal.eaters ?? []).includes(eaterFilter)),
            }))
            .filter((d) => d.meals.length > 0)
            .map((d) => (
            <div key={d.day} style={peekDayCard}>
              <div style={peekDayName}>{d.day}</div>
              {d.meals.map((meal, mi) => (
                <div key={meal.slot} style={{ ...peekSlotRow, borderTop: mi === 0 ? "none" : "1px solid #eef3f0" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...peekSlotLabel, color: SLOT_COLOR[meal.slot] ?? "#7a9485" }}>{meal.slot}</div>
                    {(meal.dishes ?? []).map((dish, di) => (
                      <div key={di} style={{ display: "flex", alignItems: "center", gap: 9, marginTop: di === 0 ? 5 : 7 }}>
                        <DishThumb dish={dish} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: INK, lineHeight: 1.25, minWidth: 0 }}>
                          {dish.name}
                          {/* El nombre se ve siempre; la receta solo si su
                              autor la tiene en publico o de amigos. */}
                          {dish.readable === false && (
                            <Lock size={11} strokeWidth={2.6} style={{ verticalAlign: "-1px", marginLeft: 4, color: "#9aa8a0" }} />
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                  {(meal.eaters ?? []).length > 0 && (
                    <div style={{ display: "flex", gap: 3, flexShrink: 0, paddingTop: 2 }}>
                      {meal.eaters.map((id) => (
                        <span key={id} title={byId[id]?.role} style={{ ...memberDot, width: 20, height: 20, fontSize: 9 }}>
                          {byId[id]?.role === "nino" ? "N" : "A"}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}

          <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid #eef3f0" }}>
            <CommentThread user={user} targetType="menu" targetId={m.id} targetOwnerId={m.owner_id} />
          </div>
        </div>
      </div>

      {reporting && (
        <ReportSheet user={user} targetType="menu" targetId={m.id} onClose={() => setReporting(false)} />
      )}
    </div>
  );
}

/** Miniatura del plato. Se resuelve igual que en tu menu: por id de catalogo. */
function DishThumb({ dish }) {
  const img = dish.recipeId ? dishImageForRecipe({ id: dish.recipeId }) : null;
  if (!img) {
    return <span style={{ ...peekThumb, background: "#eef3f0", display: "flex", alignItems: "center", justifyContent: "center", color: "#b6c7bd" }}><Lock size={13} strokeWidth={2.4} /></span>;
  }
  return <img src={deckImg(img, 160)} alt="" loading="lazy" style={peekThumb} />;
}

// ── Guardar en carpetas ─────────────────────────────────────────────────────

/**
 * Pop-up centrado (no hoja): guardar una receta es una decisión corta que
 * interrumpe lo que estabas haciendo, y un diálogo en el centro lo dice mejor
 * que un panel que sube desde abajo.
 *
 * "Todas" NO es "selecciona todas las carpetas": es el destino por defecto —
 * tu recetario entero. Toda receta copiada acaba ahí; las carpetas son
 * subconjuntos opcionales. Por eso es excluyente con el resto y guarda sin
 * ninguna carpeta: no hay nada que archivar, ya está en casa.
 *
 * (Nota de mantenimiento: este componente ya se borró una vez sin querer en
 * una limpieza por anclas de texto — si el corazón del feed peta con
 * "SaveToFolderDialog is not defined", es que ha vuelto a pasar.)
 */
function SaveToFolderDialog({ recipe, folders, onSave, onCreateFolder, onClose }) {
  const [picked, setPicked] = useState(() => new Set());
  const [remember, setRemember] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const all = picked.size === 0;

  const toggle = (id) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const createFolder = () => {
    const id = onCreateFolder?.(draft.trim());
    setCreating(false);
    setDraft("");
    if (id) setPicked((prev) => new Set([...prev, id]));
  };

  const tiles = [{ id: ALL_ID, label: "Todas" }, ...folders];

  return (
    <div style={dialogOverlay} onClick={onClose} className="mp-overlay-in">
      <div style={dialogBox} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: INK }}>Guardar en…</div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "#42594c", marginTop: 3 }}>{recipe.name}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={iconBtn}><X size={16} strokeWidth={2.6} /></button>
        </div>

        <div style={folderGrid}>
          {tiles.map((f) => {
            const isAll = f.id === ALL_ID;
            const on = isAll ? all : picked.has(f.id);
            const art = folderArt(f.id);
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={on}
                onClick={() => (isAll ? setPicked(new Set()) : toggle(f.id))}
                style={{
                  position: "relative", display: "block", padding: 0, overflow: "hidden",
                  borderRadius: 14, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  border: `2px solid ${on ? TEAL : "#e0eae3"}`,
                  boxShadow: on ? `0 4px 14px ${TEAL}33` : "none",
                  background: "#fff",
                }}
              >
                <img
                  src={art.img}
                  alt=""
                  loading="lazy"
                  style={{ display: "block", width: "100%", aspectRatio: "16 / 10", objectFit: "cover", background: "#f4f7f5" }}
                />
                <span
                  style={{
                    position: "absolute", inset: 0,
                    background: "linear-gradient(to top, rgba(20,47,29,.88) 0%, rgba(20,47,29,.15) 62%, transparent 100%)",
                  }}
                />
                <span style={{ position: "absolute", left: 9, right: 9, bottom: 7, display: "flex", alignItems: "center", gap: 5, color: "#fff" }}>
                  <art.Icon size={13} strokeWidth={2.6} />
                  <span style={{ fontSize: 12, fontWeight: 800, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {f.label}
                  </span>
                </span>
                {on && (
                  <span style={{ position: "absolute", top: 7, right: 7, width: 19, height: 19, borderRadius: "50%", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }}>
                    <Check size={11} color={TEAL} strokeWidth={3.2} />
                  </span>
                )}
              </button>
            );
          })}

          {onCreateFolder && !creating && (
            <button type="button" onClick={() => setCreating(true)} style={newFolderTile}>
              <FolderPlus size={16} strokeWidth={2.6} />
              Nueva carpeta
            </button>
          )}
        </div>

        {creating && (
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") createFolder();
                if (e.key === "Escape") { setDraft(""); setCreating(false); }
              }}
              placeholder="Nombre de la carpeta"
              style={{ flex: 1, padding: "9px 12px", borderRadius: 10, border: "1.5px solid #dde7e0", fontSize: 16, outline: "none", fontFamily: "inherit", minWidth: 0 }}
            />
            <button type="button" onClick={createFolder} aria-label="Crear carpeta" style={{ width: 40, borderRadius: 10, border: "none", background: GREEN, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Check size={16} strokeWidth={3} />
            </button>
          </div>
        )}

        <label style={rememberRow}>
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            style={{ width: 17, height: 17, accentColor: GREEN, flexShrink: 0 }}
          />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "#42594c" }}>
            Guardar siempre aquí y no volver a preguntar
          </span>
        </label>

        <button type="button" onClick={() => { onSave([...picked], remember); onClose(); }} style={{ ...primaryBtnFull, marginTop: 12 }}>
          <Plus size={14} strokeWidth={2.8} /> Añadir a mis recetas
        </button>
      </div>
    </div>
  );
}

// ── Buscar gente ────────────────────────────────────────────────────────────

// ── Estilos ─────────────────────────────────────────────────────────────────

const DEFAULT_FOLDERS_KEY = "hm_feed_default_folders";

/**
 * Carpetas en las que guardar sin preguntar. Es una preferencia de este
 * dispositivo, no un dato del hogar: si el usuario cambia de móvil, que se lo
 * vuelvan a preguntar es menos malo que decidir por él en silencio.
 * `null` = todavía no ha contestado.
 */
function readDefaultFolders() {
  try {
    const raw = localStorage.getItem(DEFAULT_FOLDERS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function writeDefaultFolders(ids) {
  try { localStorage.setItem(DEFAULT_FOLDERS_KEY, JSON.stringify(ids ?? [])); } catch { /* modo privado */ }
}

// Ceros explícitos: sin esto la columna de la derecha no se pinta y parece
// que la receta no tiene datos, en vez de tener cero.
const EMPTY_STATS = { likes: 0, dislikes: 0, used: 0 };

const SEEN_KEY = "hm_feed_seen_menus";

/** Menús ya abiertos: solo sirve para apagar el anillo, así que localStorage basta. */
function readSeenMenus() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]")); } catch { return new Set(); }
}
function writeSeenMenus(set) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...set])); } catch { /* modo privado */ }
}

function rangeLabel(a, b) {
  if (!a) return "Menú";
  const f = (s) => s.slice(8, 10) + "/" + s.slice(5, 7);
  return b ? `${f(a)} – ${f(b)}` : f(a);
}

const carouselBand = {
  position: "relative",
  padding: "12px 18px 16px",
  maxWidth: 420, margin: "0 auto", width: "100%", boxSizing: "border-box",
  background: CAROUSEL_BG,
  overflow: "hidden",
  borderBottom: "1px solid rgba(255,255,255,.5)",
};

// Manchones de color desenfocados: son lo que el cristal difumina. Sin algo
// detras que desenfocar, un "liquid glass" es solo un gris plano.
const glassBlobs = {
  position: "absolute", inset: -40, pointerEvents: "none",
  background:
    "radial-gradient(38% 60% at 12% 30%, rgba(76,186,110,.6) 0%, transparent 70%)," +
    "radial-gradient(42% 65% at 78% 18%, rgba(74,111,212,.45) 0%, transparent 72%)," +
    "radial-gradient(45% 70% at 55% 98%, rgba(232,133,74,.42) 0%, transparent 70%)",
  filter: "blur(6px)",
};

// El cristal cubre la franja ENTERA, de borde a borde: es el fondo de la
// seccion, no una tarjeta dentro de ella. Por eso va absolute con inset 0 y
// sin radio — un cristal recortado deja de leerse como material y pasa a
// leerse como un cuadro pegado encima.
const glassPane = {
  position: "absolute", inset: 0, pointerEvents: "none",
  background: "rgba(255,255,255,.40)",
  backdropFilter: "blur(18px) saturate(160%)",
  WebkitBackdropFilter: "blur(18px) saturate(160%)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.7)",
};

// Los mismos colores de comida/cena que usa el asistente.
const SLOT_COLOR = { Desayuno: "#a9762a", Comida: "#c9820a", Cena: "#5a7a9a" };

const readOnlyPill = {
  display: "inline-flex", alignItems: "center", gap: 5, marginTop: 12,
  padding: "5px 11px", borderRadius: 999,
  background: "#eef3f0", color: "#5c6b60", fontSize: 11, fontWeight: 800,
};

const peekDayCard = {
  border: "1.5px solid #e0eae3", borderRadius: 16, background: "#fff",
  padding: "10px 12px 12px", marginTop: 10,
  boxShadow: "0 2px 8px rgba(20,47,29,.04)",
};

const peekDayName = {
  fontSize: 11, fontWeight: 900, color: "#7a9485",
  letterSpacing: ".6px", textTransform: "uppercase", marginBottom: 6,
};

const peekSlotRow = {
  display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0 2px",
};

const peekSlotLabel = { fontSize: 10.5, fontWeight: 900, letterSpacing: ".4px", textTransform: "uppercase" };

const peekThumb = {
  width: 38, height: 38, borderRadius: 10, objectFit: "cover",
  flexShrink: 0, display: "block", background: "#f4f7f5",
};

const peekBackdrop = {
  position: "fixed", inset: 0, zIndex: 250,
  background: "rgba(20,47,29,.5)", backdropFilter: "blur(3px)",
  display: "flex", alignItems: "stretch", justifyContent: "center",
};

const peekScreen = {
  width: "100%", maxWidth: 420, background: "#fff",
  display: "flex", flexDirection: "column", overflowY: "auto",
  boxShadow: "0 0 60px rgba(0,0,0,.35)",
};

const peekHeader = {
  position: "relative",
  display: "flex", flexDirection: "column", alignItems: "center",
  padding: "26px 20px 20px",
  background: `linear-gradient(180deg, ${HEADER_BAND} 0%, #fff 100%)`,
};

const peekClose = {
  position: "absolute", top: 14, right: 14,
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 36, height: 36, borderRadius: 12,
  border: "1.5px solid #d5e6da", background: "#fff", color: GREEN, cursor: "pointer",
};

const peekMenuBtn = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 36, height: 36, borderRadius: 12,
  border: "1.5px solid #d5e6da", background: "#fff", color: GREEN, cursor: "pointer",
};

const peekMenu = {
  position: "absolute", top: 40, left: 0, zIndex: 3,
  width: 168, padding: 5, borderRadius: 13,
  background: "#fff", border: "1.5px solid #e0eae3",
  boxShadow: "0 10px 30px rgba(20,47,29,.18)",
};

const peekMenuItem = {
  display: "flex", alignItems: "center", gap: 8, width: "100%",
  padding: "9px 10px", borderRadius: 9, border: "none", background: "none",
  fontSize: 12.5, fontWeight: 700, color: INK, cursor: "pointer",
  fontFamily: "inherit", textAlign: "left",
};

// El icono de reportar una receta: discreto de serie (gris clarito), no
// compite con los tres botones de decision que son la accion principal.
const sharedNote = {
  alignSelf: "center", padding: "5px 12px", borderRadius: 999,
  background: "#eef6f4", color: TEAL, fontSize: 11.5, fontWeight: 800,
};

const reportLink = {
  display: "flex", alignItems: "center", justifyContent: "center",
  padding: 4, border: "none", background: "none", color: "#c2d2c8", cursor: "pointer",
};

const resolvedNote = {
  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
  margin: 0, fontSize: 12.5, fontWeight: 800,
};

const dialogOverlay = {
  position: "fixed", inset: 0, zIndex: 300,
  background: "rgba(20,47,29,.45)", backdropFilter: "blur(2px)",
  display: "flex", alignItems: "center", justifyContent: "center", padding: "0 18px",
};

const dialogBox = {
  width: "100%", maxWidth: 360, maxHeight: "84dvh", overflowY: "auto",
  background: "#f5f9f6", borderRadius: 20, padding: 16, boxSizing: "border-box",
  boxShadow: "0 18px 50px -18px rgba(20,47,29,.55)",
};

const folderGrid = {
  display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginTop: 14,
};

const newFolderTile = {
  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
  aspectRatio: "16 / 10", borderRadius: 14, cursor: "pointer", fontFamily: "inherit",
  border: "2px dashed #cfe0d6", background: "#fff", color: GREEN,
  fontSize: 12, fontWeight: 800,
};

const rememberRow = {
  display: "flex", alignItems: "center", gap: 9, marginTop: 12,
  padding: "10px 12px", borderRadius: 12, background: "#fff",
  border: "1.5px solid #d7e6dc", cursor: "pointer",
};

const sectionTitle = {
  margin: "0 0 9px", fontSize: 11, fontWeight: 900, color: "#7a9485",
  letterSpacing: ".6px", textTransform: "uppercase",
};

const card = {
  border: "1.5px solid #e0eae3", borderRadius: 18, overflow: "hidden",
  background: "#fff", boxShadow: "0 2px 10px rgba(20,47,29,.05)",
};

const primaryBtn = {
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "10px 16px", borderRadius: 12, border: "none",
  background: TEAL, color: "#fff", fontSize: 13, fontWeight: 800,
  cursor: "pointer", fontFamily: "inherit",
};

const primaryBtnFull = { ...primaryBtn, width: "100%", justifyContent: "center", marginTop: 12 };

const doneBtn = {
  ...primaryBtnFull, background: "#eef5f1", color: TEAL,
  border: "1.5px solid #cfe6df", cursor: "default",
};

const inspireLink = {
  display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
  width: "100%", margin: "0 0 22px", padding: "11px 14px",
  borderRadius: 12, border: "1.5px dashed #cfe0d6", background: "#f7fbf8",
  color: "#42594c", fontSize: 12.5, fontWeight: 700,
  cursor: "pointer", fontFamily: "inherit",
};

const dayRow = { display: "flex", gap: 10, alignItems: "flex-start" };
const dayName = { flexShrink: 0, width: 34, fontSize: 11.5, fontWeight: 900, color: "#7a9485", textTransform: "uppercase", paddingTop: 1 };

const clearFilterBtn = {
  marginLeft: 4, padding: "3px 10px", borderRadius: 999,
  border: "1.5px solid #cfe6df", background: "#fff", color: TEAL,
  fontSize: 10.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
};

const memberDot = {
  width: 22, height: 22, borderRadius: 999, flexShrink: 0,
  display: "flex", alignItems: "center", justifyContent: "center",
  background: "#e8efe9", color: "#42594c", fontSize: 10, fontWeight: 900,
};

/**
 * La tarjeta de publicar.
 *
 * Fondo crema para separarla del rio de recetas (que son fotos a sangre) sin
 * competir con ellas. El color lo ponen SOLO la ilustracion y la pildora
 * verde de accion: el texto va en la escala de tinta de la app, nunca en el
 * tono del fondo — un mismo color untado en fondo, borde y letras convierte
 * cualquier tarjeta en una pegatina.
 */
const publishCard = {
  display: "flex", alignItems: "center", gap: 10, width: "100%",
  margin: "12px 0 2px", padding: "6px 8px 6px 6px",
  borderRadius: 14, border: "none", background: "#f6efe6",
  cursor: "pointer", fontFamily: "inherit", boxSizing: "border-box",
};

const publishArt = {
  width: 36, height: 36, borderRadius: 10, objectFit: "cover",
  display: "block", flexShrink: 0,
};

// Verde de accion, como cualquier boton primario de la app: es el unico
// elemento saturado ademas de la ilustracion.
const publishPill = {
  flexShrink: 0, padding: "6px 13px", borderRadius: 999,
  background: GREEN, color: "#fff", fontSize: 11.5, fontWeight: 800,
};

const scopeTabs = {
  display: "flex", gap: 3, padding: 3, marginTop: 14,
  borderRadius: 12, background: "#f0f4f1",
};

const scopeTab = {
  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
  padding: "7px 0", borderRadius: 9, border: "none",
  fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
  transition: "background .15s ease, color .15s ease",
};

const bellBadge = {
  position: "absolute", top: -4, right: -4,
  minWidth: 16, height: 16, padding: "0 4px", borderRadius: 999,
  background: "#d45c5c", color: "#fff",
  fontSize: 9.5, fontWeight: 800, lineHeight: "16px",
  boxSizing: "border-box", pointerEvents: "none",
};

const iconBtn = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 36, height: 36, borderRadius: 12,
  border: "1.5px solid #d5e6da", background: "#fff", color: GREEN,
  cursor: "pointer", flexShrink: 0,
};

const weeklyItem = {
  display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
  flexShrink: 0, width: 60,
  padding: 0, border: "none", background: "none", cursor: "pointer", fontFamily: "inherit",
};

// Anillo sin ver: gradiente en la paleta de la app (verde → teal → azul de la
// barra) en vez del naranja-morado de Instagram. Misma construcción de tres
// capas — gradiente, hueco blanco, avatar — porque es lo que hace que se lea
// como "hay algo nuevo" sin explicar nada.
const ringOn = {
  display: "flex", padding: 2.5, borderRadius: "50%",
  background: "linear-gradient(135deg, #4cba6e 0%, #0f766e 45%, #4a6fd4 100%)",
};
// Ya abierto: gris plano. La diferencia entre "hay algo nuevo" y "ya lo has
// visto" es lo único que la fila necesita comunicar.
// El hueco de "tu menu" sin publicar: anillo punteado, la invitacion clasica.
const ringDashed = {
  display: "flex", padding: 2.5, borderRadius: "50%",
  border: "2px dashed #9ab5a6", margin: -2,
};

const shareCircle = {
  width: 48, height: 48, borderRadius: "50%",
  display: "flex", alignItems: "center", justifyContent: "center",
  background: "#f2f6f3",
};

const ringOff = { display: "flex", padding: 2.5, borderRadius: "50%", background: "#cfe0d6" };
// El hueco entre anillo y avatar va del color de la banda sobre la que se
// pinta la fila. Si fuera blanco, el "aire" del anillo se vería como un cerco
// recortado en vez de como separación.
const ringGap = { display: "flex", padding: 2.5, borderRadius: "50%", background: "rgba(255,255,255,.85)" };

const inspireBtn = {
  display: "inline-flex", alignItems: "center", gap: 5,
  height: 36, padding: "0 12px", borderRadius: 12, border: "none",
  background: GREEN, color: "#fff", fontSize: 12.5, fontWeight: 800,
  cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
};

const weeklyName = {
  fontSize: 10.5, maxWidth: 60,
  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
};

const hint = { margin: "10px 0", fontSize: 12.5, fontWeight: 600, color: "#8aa294", textAlign: "center" };

const overlay = {
  position: "fixed", inset: 0, zIndex: 200,
  background: "rgba(20,47,29,.4)", backdropFilter: "blur(2px)",
  display: "flex", alignItems: "flex-end", justifyContent: "center",
};

const sheet = {
  width: "100%", maxWidth: 420, background: "#fff",
  borderRadius: "20px 20px 0 0", padding: "16px 18px",
  paddingBottom: "calc(18px + env(safe-area-inset-bottom))",
  boxSizing: "border-box",
};



