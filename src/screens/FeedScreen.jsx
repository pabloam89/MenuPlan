import { Fragment, useCallback, useEffect, useMemo, useState, useRef } from "react";
import { Users, Compass, Search, Bell, Plus, Check, CalendarDays, X, Lock, FolderPlus, Heart, Meh, Ban, Ban as BlockIcon, Share2, Flag, MoreVertical, ChefHat, Layers2, ChevronDown, ChevronLeft, Info } from "lucide-react";
import { BottomNav, bottomNavSpacer, Avatar, EmptyIllustration, GroupAvatarStack } from "../components/ui.jsx";
import { RecipePoster, PosterCorners, ActionButton } from "../components/SwipeCard.jsx";
import { ProfileDrawer } from "../components/ProfileDrawer.jsx";
import { PersonSheet } from "../components/PersonSheet.jsx";
import { CommentThread } from "../components/CommentThread.jsx";
import { ReportSheet } from "../components/ReportSheet.jsx";
import { ShareMenuSheet } from "../components/ShareMenuSheet.jsx";
import { ShareRecipeSheet } from "../components/ShareRecipeSheet.jsx";
import { NotificationsPopover } from "../components/NotificationsPopover.jsx";
import { DiscoverPeopleSheet } from "../components/DiscoverPeopleSheet.jsx";
import { VisibilityPrompt } from "../components/VisibilityPrompt.jsx";
import { CoachTour } from "../components/HomeCoachTour.jsx";
import { loadNotifications, markNotificationsSeen, countUnread } from "../lib/socialNotifications.js";
import { setFeedBadge } from "../lib/socialBadge.js";
import { shareOut } from "../lib/shareLink.js";
import { relativeTime } from "../lib/socialUi.js";
import { dishImageForRecipe } from "../assets/dishes/dishImages.js";
import { deckImg } from "../lib/dishPhotoOptimize.js";
import { recipeCatalogById } from "../data/recipeCatalog.js";
import { memberAvatarColor } from "../lib/stages.js";
import { DAYS } from "../lib/planner.js";
import { loadPublicRecipe } from "../lib/userRecipesSync.js";
import { folderArt, ALL_ID } from "./CatalogBrowserSheet.jsx";
import { allFolders } from "../lib/recipeCollections.js";
import {
  loadFeed,
  loadWeeklyMenus,
  loadSharedMenu,
  loadProfilesByIds,
  loadFollowing,
  loadSentRequests,
  loadRecipeStats,
  loadMyProfile,
  saveMyProfile,
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
  onSaveDish,
  onPlaceDish,
  onConsumedPerson,
  onPublishRecipe,
  recipeFolders = [],
  onCreateFolder,
  onSetRecipeFolders,
  onToast,
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
  // Ya copiadas antes de abrir el Feed: la copia guarda de quién venía
  // (copiedFromRecipeId), así que la marca sobrevive a cerrar sesión y volver
  // — antes vivía solo en el estado de la pantalla y se perdía al salir.
  const copiedIds = useMemo(() => {
    const ids = new Set(copied);
    for (const r of myRecipes) if (r.copiedFromRecipeId) ids.add(r.copiedFromRecipeId);
    return ids;
  }, [copied, myRecipes]);
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
  // Publicar vive plegado, asomando por el borde, y comparte hueco con
  // Siguiendo/Descubrir: al desplegarse, las pestañas se van. Son dos cosas
  // que nunca se necesitan a la vez -o estas leyendo o estas publicando- asi
  // que la zona alta del feed no tiene por que crecer para tener las dos.
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishHint, setPublishHint] = useState(false);
  // "¿Quieres que te encuentren?", una vez. Ver VisibilityPrompt.
  const [visPrompt, setVisPrompt] = useState(null);
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

  // Abrir algo desde una notificacion o un comentario.
  //
  // Antes solo miraba lo que YA estaba cargado en pantalla y, si no lo
  // encontraba, no hacia nada — en silencio. Y no encontrarlo es lo normal:
  // el carrusel solo trae los menus de esta semana y el rio va paginado, asi
  // que cualquier aviso sobre algo un poco viejo llevaba a ningun sitio y
  // parecia que la app se habia colgado. Ahora, si no esta a mano, se pide
  // por id; y si tampoco asi (borrado, o sin permiso), se dice.
  const openTarget = async (type, id) => {
    if (type === "menu") {
      const local = weekly.find((w) => w.id === id) ?? items.find((i) => i.kind === "menu" && i.id === id)?.menu;
      const m = local ?? await loadSharedMenu(id);
      if (m) openMenu(m);
      else onToast?.("Ese menú ya no está disponible");
      return;
    }
    const local = items.find((i) => i.kind === "recipe" && i.recipe.id === id)?.recipe;
    const r = local ?? await loadPublicRecipe(id);
    if (r) onOpenRecipe?.(r);
    else onToast?.("Esa receta ya no está disponible");
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    const mineIds = await loadFollowing(user?.id);
    const [feed, week, sent] = await Promise.all([
      loadFeed({ viewerId: user?.id, scope, followingIds: mineIds }),
      loadWeeklyMenus({ viewerId: user?.id, scope, followingIds: mineIds }),
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

  // Desde 0038 el perfil nuevo nace en 'followers' (te encuentran por tu
  // nombre, tu contenido no). Abrir un valor por defecto obliga a decirlo, no
  // a esconderlo: por eso esto se enseña una vez al entrar al Feed, diga lo
  // que diga tu estado actual, y con la puerta de salida al lado.
  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    (async () => {
      try {
        if (localStorage.getItem(VIS_PROMPT_KEY)) return;
      } catch { /* modo privado: se preguntara otra vez, mal menor */ }
      const prof = await loadMyProfile(user.id);
      // Sin perfil todavia no se pregunta: el handle se crea al abrir Mi
      // perfil, y preguntar antes seria hablar de algo que aun no existe.
      if (!alive || !prof) return;
      setVisPrompt(prof.visibility ?? "followers");
    })();
    return () => { alive = false; };
  }, [user?.id]);

  const answerVisibility = async (visibility) => {
    const before = visPrompt;
    setVisPrompt(null);
    try { localStorage.setItem(VIS_PROMPT_KEY, "1"); } catch { /* modo privado */ }
    // Si eliges lo que ya eras, no hay nada que guardar: seria una peticion
    // para dejar todo igual.
    if (visibility !== before) await saveMyProfile(user?.id, { visibility });
  };

  // Una lengueta a medio asomar no se explica sola: la primera vez se señala,
  // y solo la primera.
  useEffect(() => {
    if (!onPublishRecipe) return;
    try {
      if (!localStorage.getItem(PUBLISH_HINT_KEY)) setPublishHint(true);
    } catch { /* modo privado: sin pista, pero sin romper nada */ }
  }, [onPublishRecipe]);

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

  const dismissPublishHint = () => {
    setPublishHint(false);
    try { localStorage.setItem(PUBLISH_HINT_KEY, "1"); } catch { /* modo privado */ }
  };

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
   * Guardar un plato del menu de otra persona pasa por la MISMA hoja de
   * carpetas que guardar una receta del rio: es la misma decision -"me la
   * llevo, ¿donde la meto?"- sobre el mismo objeto, y sin ella el plato caia
   * en el saco comun sin que hubiera forma de ordenarlo. Se respeta el
   * "guardar siempre aqui" que ya hubieras contestado.
   */
  const saveDishInto = async (dish, folderIds) => {
    const savedId = await onSaveDish?.(dish);
    if (savedId && folderIds?.length) onSetRecipeFolders?.(savedId, folderIds);
  };

  const handleSaveDish = (dish) => {
    const preset = readDefaultFolders();
    if (preset) { saveDishInto(dish, preset); return; }
    setFolderPickerFor({ dish, recipe: { id: dish.recipeId, name: dish.name } });
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
            <div className="deck-scroller" style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 2, marginInline: -14, paddingInline: 14 }}>
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

          {/* Siguiendo o Descubrir. Es la unica decision del feed, asi que va
              arriba del rio y no en la cabecera: no compite con buscar,
              notificaciones y perfil, que son atajos, no modos de lectura. */}
          <div style={{ position: "relative" }}>
          {/* Acordeon horizontal: publicar y las pestañas se reparten UNA fila.
              Los dos paneles estan siempre montados y lo que se anima es su
              reparto (flex-grow), asi que al crecer uno el otro se pliega en
              el mismo gesto — sin desmontar nada, que es lo que provocaria el
              salto. Las pestañas conservan su seleccion: al volver, sigues en
              la vista en la que estabas. */}
          <div style={{ display: "flex", alignItems: "center", marginTop: 14 }}>
            {onPublishRecipe && (
              <div
                className="mp-hpanel"
                data-coach="feed-publish"
                style={{
                  // La base se queda FIJA en 46 y lo que se anima es cuanto
                  // crece. Interpolar flex-basis de 46px a 100% no funciona:
                  // el navegador no sabe pasar de px a % y da un salto seco.
                  flexBasis: 46,
                  flexGrow: publishOpen ? 1 : 0,
                  flexShrink: 0,
                }}
                {...(publishOpen ? {} : {
                  role: "button",
                  tabIndex: 0,
                  "aria-label": "Publicar una receta tuya",
                  onClick: () => { setPublishOpen(true); dismissPublishHint(); },
                  onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { setPublishOpen(true); dismissPublishHint(); } },
                })}
              >
                <div style={{ ...publishCard, marginTop: 0, marginBottom: 0, cursor: publishOpen ? "default" : "pointer" }}>
                  {/* La ilustracion de Mis Recetas, la misma que ya identifica
                      tu recetario en el navegador de carpetas: si esa imagen ya
                      significa "lo tuyo", la tarjeta no tiene que explicarse. */}
                  <img src="/avatares/cards/empty_recetas_propias.jpg" alt="" loading="lazy" style={publishArt} />
                  {/* El texto no se desmonta al plegar: se queda detras del
                      recorte y reaparece deslizandose. Montarlo y desmontarlo
                      haria que apareciera de golpe a mitad de la animacion. */}
                  <span style={{ flex: 1, minWidth: 0, textAlign: "left", whiteSpace: "nowrap", opacity: publishOpen ? 1 : 0, transition: "opacity .2s ease" }}>
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
                  {publishOpen && (
                    <>
                      <button type="button" onClick={() => setShareRecipeOpen(true)} style={publishPill}>Publicar</button>
                      <button type="button" onClick={() => setPublishOpen(false)} aria-label="Cerrar" style={publishClose}>
                        <X size={13} strokeWidth={2.8} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            <div
              className="mp-hpanel"
              style={{
                // Base 0 y todo el reparto por flex-grow, para que el gesto
                // sea el mismo numero animandose en los dos paneles a la vez.
                flexBasis: 0,
                flexGrow: publishOpen ? 0 : 1,
                opacity: publishOpen ? 0 : 1,
                marginLeft: onPublishRecipe ? 8 : 0,
              }}
              aria-hidden={publishOpen}
            >
          <div style={{ ...scopeTabs, marginTop: 0 }}>
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
            </div>
          </div>

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
                copied={copiedIds.has(item.recipe.id)}
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

      {/* Llevarte un plato del menu de otro (a tu semana o a tu recetario) y
          abrir su receta: las tres llegaban ya como props de la pantalla y no
          se pasaban, asi que los botones del plato no hacian NADA — ni fallo
          ni aviso, simplemente no pasaba nada al tocarlos. */}
      {menuOpen && (
        <MenuPeek
          menu={menuOpen}
          user={user}
          profile={profiles[menuOpen.owner_id]}
          onOpenPerson={() => { setMenuOpen(null); setPersonId(menuOpen.owner_id); }}
          onBlocked={handleBlocked}
          onClose={() => setMenuOpen(null)}
          onSaveDish={handleSaveDish}
          onPlaceDish={(dish) => { setMenuOpen(null); onPlaceDish?.(dish); }}
          onOpenDish={(dish) => onOpenRecipe?.({ id: dish.recipeId, name: dish.name })}
        />
      )}

      {/* La lengueta a medio asomar no se explica sola, pero una burbuja
          flotando al lado tampoco: sin oscurecer el resto, no se sabe a que
          apunta. Se reusa el coach-mark de la casa -mismo recorte, misma
          burbuja- para que se vea como el resto de explicaciones de la app y
          no como un aviso pegado encima. */}
      {publishHint && !publishOpen && onPublishRecipe && (
        <CoachTour
          steps={[{
            selector: '[data-coach="feed-publish"]',
            Icon: ChefHat,
            title: "Tus recetas sin publicar",
            desc: "Aquí asoman las que aún no has compartido. Tócalo y se abre para elegir cuál publicas.",
            place: "below",
          }]}
          onClose={dismissPublishHint}
        />
      )}

      {visPrompt && (
        <VisibilityPrompt
          current={visPrompt}
          onChoose={answerVisibility}
          // Cerrar sin tocar nada deja el estado como esta -no se cambia la
          // privacidad de nadie por no contestar- y no se vuelve a preguntar.
          onClose={() => answerVisibility(visPrompt)}
        />
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
            if (folderPickerFor.dish) saveDishInto(folderPickerFor.dish, ids);
            else copyInto(folderPickerFor, ids);
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
          onChanged={refresh}
        />
      )}

      {profileOpen && (
        <ProfileDrawer
          user={user}
          thumbFor={thumbForTarget}
          onChanged={refresh}
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
function MenuPeek({ menu: m, user, profile, onClose, onOpenPerson, onBlocked, onSaveDish, onPlaceDish, onOpenDish }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  // Para quien es lo que estas mirando: adultos, ninos o bebes.
  //
  // Antes era un filtro por PERSONA -una fila de caras plegada tras un boton
  // de la cabecera- y estaba mal por dos lados. Uno: las caras van sin nombre
  // (el payload es anonimo a proposito), asi que elegir "esta persona" era
  // elegir a ciegas. Dos: en una casa lo que cambia el menu no es quien eres
  // sino que edad tienes — los dos adultos comen lo mismo. Asi que el filtro
  // es por rol, que es la unica diferencia que el menu publicado conoce.
  const [roleFilter, setRoleFilter] = useState(null);
  // El plato que estas mirando de cerca. Se copia PLATO a plato -no la semana
  // entera-, que es como se usa de verdad el menu de otra persona: te llevas
  // la idea suelta que te ha gustado.
  const [dishPick, setDishPick] = useState(null);
  // Memorizado porque de el cuelga la peticion de estadisticas: sin esto el
  // `?? []` daria un array nuevo en cada pintada y se pediria una vez por
  // pintada en vez de una por menu.
  const days = useMemo(() => m.payload?.weeks?.[0]?.days ?? [], [m]);
  const rango = m.title || (m.week_start ? rangeLabel(m.week_start, m.week_end) : null);
  const members = m.payload?.members ?? [];
  const byId = Object.fromEntries(members.map((x) => [x.id, x]));
  const name = profile?.display_name || (profile?.username ? `@${profile.username}` : "Alguien");
  const scopes = eaterScopes(members, days);

  // Lo que ha pasado con cada plato ahi fuera: votos, veces cocinado y
  // comentarios. Va aparte y despues de pintar -igual que en el rio de
  // recetas- porque es adorno de la tarjeta, no contenido del menu.
  const [dishStats, setDishStats] = useState({});
  useEffect(() => {
    const ids = [...new Set(
      days.flatMap((d) => (d.meals ?? []).flatMap((meal) => (meal.dishes ?? []).map((x) => x.recipeId)))
        .filter(Boolean),
    )];
    if (ids.length === 0) return undefined;
    let alive = true;
    loadRecipeStats(ids).then((real) => {
      if (alive) setDishStats(FIXTURES_ENABLED ? { ...FIXTURE_STATS, ...real } : real);
    });
    return () => { alive = false; };
    // `days` es la MISMA referencia mientras el menu este abierto (es un trozo
    // del payload, que es una instantanea y no se toca), asi que esto se pide
    // una vez por menu y no una vez por pintada.
  }, [days]);

  return (
    <div style={peekBackdrop} onClick={onClose}>
      <div className="mp-peek-in" style={peekScreen} onClick={(e) => e.stopPropagation()}>
        {/* Entrar en la cocina de alguien: su cara arriba y su semana debajo,
            con la misma pinta que tiene la tuya. Pantalla completa y no una
            hoja, porque el gesto que la abre es "asomarse". */}
        {/* Franja compacta, no portada.
            Antes era una cabecera centrada de ~200px -avatar de 64, nombre,
            @handle, fila de comensales y dos pastillas- que se comia un
            tercio de la pantalla en un movil: para ver el segundo plato ya
            habia que hacer scroll. Y en una pantalla que existe para MIRAR
            UN MENU, quien lo publica es contexto, no el contenido.

            Ahora una fila de 52px con lo imprescindible, y el resto -el
            filtro por comensal- se despliega solo si lo pides. */}
        <div style={peekBar}>
          {/* Atras, no cerrar. Una X dice "esto es una ventana y la descartas";
              una flecha dice "has entrado en un sitio y vuelves por donde
              viniste", que es exactamente lo que pasa: el menu de alguien se
              abre desde el feed y se vuelve al feed. Y va la primera, a la
              izquierda, que es donde la busca el pulgar. */}
          <button type="button" className="mp-press" onClick={onClose} aria-label="Volver" style={peekBarIcon}>
            <ChevronLeft size={20} strokeWidth={2.6} />
          </button>

          <button type="button" className="mp-press" onClick={() => setMoreOpen((v) => !v)} aria-label="Más opciones" style={{ ...peekBarIcon, order: 3 }}>
            <MoreVertical size={16} strokeWidth={2.6} />
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

          <button type="button" className="mp-press" onClick={onOpenPerson} style={peekWho} aria-label={`Ver el perfil de ${name}`}>
            <Avatar name={profile?.display_name ?? "?"} photo={profile?.avatar_url} size={34} color={TEAL} />
            <span style={{ minWidth: 0 }}>
              <span style={peekWhoName}>{name}</span>
              {/* La fecha va aqui, bajo el nombre: "el menu de Alvaro, del 31
                  al 6". Solo si la hay — un chip que pone "Menú" no dice
                  nada, que es lo que salia cuando el menu no traia rango. */}
              {rango && <span style={peekWhoWhen}>{rango}</span>}
            </span>
          </button>

        </div>

        <div style={{ padding: "16px 16px 26px", maxWidth: 420, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
          <SharedMenuDeck
            days={days
              .map((d) => ({
                ...d,
                meals: (d.meals ?? []).filter((meal) =>
                  !roleFilter || (meal.eaters ?? []).some((id) => byId[id]?.role === roleFilter)),
              }))
              .filter((d) => d.meals.length > 0)}
            weekStart={m.payload?.weeks?.[0]?.weekStart ?? m.week_start ?? null}
            scopes={scopes}
            roleFilter={roleFilter}
            onRole={setRoleFilter}
            stats={dishStats}
            onPickDish={setDishPick}
            onOpenDish={onOpenDish}
          />

          <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid #eef3f0" }}>
            <CommentThread user={user} targetType="menu" targetId={m.id} targetOwnerId={m.owner_id} />
          </div>
        </div>
      </div>

      {/* Dos acciones y ya: llevartelo al menu (lo colocas tu, en el hueco que
          quieras) o guardarlo para luego. Son los dos motivos por los que
          alguien copia un plato ajeno, y no hay un tercero.

          Y salen PEGADAS AL PLATO, no en una tarjeta centrada: es la misma
          barra que aparece al mantener pulsado un plato en tu propio menu.
          Una ventana en mitad de la pantalla te obliga a volver a buscar de
          que plato hablabas; el recuadro sobre la foto ya lo dice. */}
      {dishPick && (
        <DishActionBar
          anchor={dishPick.anchor}
          // Los dos copys empiezan por el verbo: lo que haces con el plato de
          // otro es COPIARLO, y "A mi menú" describia el destino pero no la
          // accion — que es lo unico que el boton tiene que prometer.
          actions={[
            { id: "menu", label: "Copiar al menú", Icon: CalendarDays, onPick: () => { onPlaceDish?.(dishPick.dish); setDishPick(null); } },
            { id: "recetas", label: "Copiar a recetas", Icon: Heart, onPick: () => { onSaveDish?.(dishPick.dish); setDishPick(null); } },
          ]}
          onClose={() => setDishPick(null)}
        />
      )}

      {reporting && (
        <ReportSheet user={user} targetType="menu" targetId={m.id} onClose={() => setReporting(false)} />
      )}
    </div>
  );
}

/** Miniatura del plato. Se resuelve igual que en tu menu: por id de catalogo. */
/**
 * El menu de otra persona, con la misma cara que el tuyo.
 *
 * Antes era una lista de nombres con miniaturas de 34px: legible, pero no se
 * parecia en nada a la pantalla de Menu y los platos eran casi imposibles de
 * acertar con el dedo. Aqui se reusa el LENGUAJE de DeckTile -foto a sangre,
 * degradado abajo, nombre en blanco- pero no el componente: DeckTile arrastra
 * long-press, ArmedContext, regeneracion y badges de grupo, maquinaria de
 * EDICION que en un menu ajeno no solo sobra, sino que invita a tocar lo que
 * no se puede tocar.
 *
 * Un dia se ensena solo; varios traen el selector Dia/Semana, igual que Menu.
 * Con un unico dia el selector seria elegir entre una cosa y la misma.
 */
function SharedMenuDeck({ days, weekStart, scopes, roleFilter, onRole, stats, onPickDish, onOpenDish }) {
  const multi = days.length > 1;
  const [week, setWeek] = useState(false);
  const [dayIdx, setDayIdx] = useState(0);
  // Un filtro por comensal puede dejar el dia activo fuera de la lista.
  const idx = Math.min(dayIdx, Math.max(0, days.length - 1));
  const nums = dayNumbers(days, weekStart);

  if (days.length === 0) return <p style={hint}>Este menu no trae dias.</p>;

  return (
    <>
      {/* Una sola franja de mando: a la izquierda COMO lo miras (dia o semana)
          y a la derecha PARA QUIEN es lo que miras. Las caras vivian antes en
          la esquina de cada plato, una por comensal, y ahi no elegian nada:
          eran un adorno que ademas repetia las mismas cuatro caras en todas
          las tarjetas. Aqui son un control, y encima liberan la esquina. */}
      {(multi || scopes.all.length > 0) && (
        <div style={deckTopRow}>
          {multi && <ViewPicker week={week} onWeek={setWeek} />}
          {/* Los GRUPOS de la casa, siempre: todos, adultos, niños y bebés —
              los que haya. Antes solo salian cuando el menu se partia en dos, y
              entonces la franja se quedaba vacia en la mayoria de casas, que es
              justo donde mas se quiere ver quien come. */}
          {scopes.all.length > 0 && (
            <EaterScope scopes={scopes.groups} all={scopes.all} value={roleFilter} onPick={onRole} />
          )}
        </div>
      )}

      {/* La tira de dias es un CALENDARIO, no siete botones.
          Antes eran siete pastillas blancas con borde, todas iguales y con el
          nombre del dia en gris: la forma decia "elige una accion" cuando lo
          que hay debajo es una semana. Ahora cada dia es su casilla -inicial
          arriba, numero del mes debajo- sobre una pista verde clara, como el
          resto de controles segmentados de la app: se lee de un vistazo en que
          dia estas y que dia es. */}
      {multi && !week && (
        <div style={deckDayStrip} role="tablist" aria-label="Día del menú">
          {days.map((d, i) => {
            const on = i === idx;
            const num = nums[d.day];
            return (
              <button
                key={d.day}
                type="button"
                role="tab"
                className="mp-press"
                onClick={() => setDayIdx(i)}
                aria-selected={on}
                style={{ ...deckDayCell, ...(on ? deckDayCellOn : null) }}
              >
                <span style={{ ...deckDayName, color: on ? "rgba(255,255,255,.82)" : "#9ab0a1" }}>{d.day}</span>
                {num != null && (
                  <span style={{ ...deckDayNum, color: on ? "#fff" : INK }}>{num}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* La lista se repinta con la misma transicion de pestaña que usa el resto
          de la app: al cambiar de dia, de vista o de comensal, los platos
          entran deslizando en vez de aparecer de golpe — que es lo que hacia
          dudar de si habias tocado algo. La `key` es lo que la dispara: cada
          combinacion es un contenido distinto, asi que React lo remonta y la
          animacion arranca sola. */}
      <div key={`${week ? "s" : "d"}-${idx}-${roleFilter ?? "all"}`} className="mp-tab-fwd">
      {week
        ? days.map((d) => (
            <div key={d.day} style={{ marginBottom: 18 }}>
              <div style={deckWeekHead}>
                <span style={{ fontSize: 14, fontWeight: 900, color: INK }}>{d.day}</span>
                {nums[d.day] != null && (
                  <span style={{ fontSize: 12, fontWeight: 800, color: "#4cba6e" }}>{nums[d.day]}</span>
                )}
                <span style={{ flex: 1, height: 1, background: "#e8f0ea" }} />
              </div>
              {/* En semana los platos van en fila y compactos: esta vista sirve
                  para abarcar, no para mirar de cerca — eso es la de dia. */}
              <div className="deck-scroller" style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
                {flattenDayDishes(d).map((item, i) => (
                  <div key={i} style={{ flex: "0 0 46%" }}>
                    <SharedDishTile item={item} onPick={onPickDish} height={132} compact />
                  </div>
                ))}
              </div>
            </div>
          ))
        : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {flattenDayDishes(days[idx]).map((item, i) => (
                <SharedDishTile
                  key={i}
                  item={item}
                  stats={stats}
                  onPick={onPickDish}
                  onOpen={onOpenDish}
                  height={192}
                />
              ))}
            </div>
          )}
      </div>
    </>
  );
}

/**
 * El numero del mes de cada dia del menu compartido.
 *
 * `weekStart` es la fecha del PRIMER dia publicado (ver handlePublishMenu), no
 * necesariamente un lunes: compartir "solo hoy" arranca en el dia que sea. Asi
 * que el desplazamiento se cuenta contra ese primer dia y no contra la semana.
 * Sin fecha -o con un dia que no esta en DAYS- se devuelve nada y la casilla
 * ensena solo la inicial: mejor eso que un numero inventado.
 */
function dayNumbers(days, weekStart) {
  if (!weekStart || days.length === 0) return {};
  const [y, mo, d] = String(weekStart).split("-").map(Number);
  if (!y || !mo || !d) return {};
  const baseIdx = DAYS.indexOf(days[0].day);
  if (baseIdx < 0) return {};
  const out = {};
  for (const day of days) {
    const i = DAYS.indexOf(day.day);
    if (i < 0) continue;
    const date = new Date(y, mo - 1, d + (i - baseIdx));
    out[day.day] = date.getDate();
  }
  return out;
}

/**
 * Para quien es el menu: adultos, ninos o bebes.
 *
 * Son los MISMOS circulos que filtran tu propio menu (ScopeCircle en Menu.jsx):
 * la cara de cada uno recortada sobre un disco de su color, apiladas y
 * creciendo hacia la derecha, con la etiqueta debajo. Seleccionado = discos
 * llenos de color; sin seleccionar, el color se va al aro y el disco se queda
 * hueco. Se reusa GroupAvatarStack tal cual, que es donde vive esa regla, para
 * que filtrar el menu de otro se vea y se toque igual que filtrar el tuyo.
 *
 * No hay circulo por persona -que en tu menu si lo hay- porque el payload es
 * anonimo: las caras van sin nombre, asi que elegir "esta persona" seria
 * elegir a ciegas. Y de todos modos lo que parte un menu en dos es la edad.
 */
function EaterScope({ scopes, all, value, onPick }) {
  // Con un solo grupo, "Todos" y ese grupo son el mismo conjunto: enseñar los
  // dos seria pintar dos veces a la misma gente y ofrecer una eleccion que no
  // elige nada. Se queda la pila, sin ser boton.
  if (scopes.length < 2) {
    const only = scopes[0];
    return (
      <span style={scopeRow}>
        <span style={scopeOpt}>
          <GroupAvatarStack faces={only?.faces ?? all} size={SCOPE_FACE} active max={SCOPE_MAX} />
          {only && <span style={{ ...scopeOptLabel, color: "#5f7568" }}>{only.label}</span>}
        </span>
      </span>
    );
  }

  const opts = [{ role: null, label: "Todos", faces: all }, ...scopes];
  return (
    <div style={scopeRow} role="group" aria-label="Para quién es el menú">
      {opts.map((opt, i) => {
        const on = value === opt.role;
        return (
          <Fragment key={opt.role ?? "all"}>
            {/* Barra fina entre "Todos" y los grupos: separa el conjunto de sus
                partes, igual que en el selector de para-quien de la casa. */}
            {i === 1 && <span style={scopeDivider} />}
            <button
              type="button"
              className="mp-press"
              aria-pressed={on}
              onClick={() => onPick(opt.role)}
              style={scopeOpt}
            >
              <GroupAvatarStack faces={opt.faces} size={SCOPE_FACE} active={on} max={SCOPE_MAX} />
              <span style={{ ...scopeOptLabel, color: on ? GREEN : "#5f7568" }}>{opt.label}</span>
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}

// El orden en el que se lee una casa, y como se llama cada grupo por fuera.
const ROLE_ORDER = ["adulto", "nino", "bebe"];
const ROLE_LABEL = { adulto: "Adultos", nino: "Niños", bebe: "Bebés" };

// El dibujo generico de cada grupo, para cuando ningun miembro publico el
// suyo (nadie eligio avatar, o el menu se publico antes de que existieran).
// Aqui SI se puede: el chip habla de una categoria -"Niños"- y no dice que
// esta sea la cara de nadie. En la esquina de un plato eso mismo habria sido
// ponerle cara inventada a una persona concreta.
const ROLE_AVATAR = {
  adulto: "/avatares/adulto/adulto_1.png",
  nino: "/avatares/hijo/hijo_1.png",
  bebe: "/avatares/bebe/bebe_1.png",
};

/**
 * Los grupos de comensales que merece la pena poder filtrar.
 *
 * Un grupo por rol que aparezca comiendo, mas la casa entera. Elegir solo
 * significa algo cuando hay mas de un grupo -con uno, "Todos" y ese grupo son
 * la misma gente-, y eso lo decide quien pinta; aqui solo se cuenta quien hay.
 */
function eaterScopes(members, days) {
  const eating = new Set();
  for (const d of days ?? []) {
    for (const meal of d.meals ?? []) {
      for (const id of meal.eaters ?? []) eating.add(id);
    }
  }

  // El color del disco sale del puesto que ocupa cada uno en la casa, igual
  // que en tu menu (memberAvatarColor): asi dos personas seguidas nunca caen
  // del mismo color y la pila se lee como personas distintas.
  const roster = members ?? [];
  const faceOf = (mem) => ({
    src: scopeFaceSrc(mem),
    color: memberAvatarColor(mem.id, roster),
  });

  const all = roster.filter((mem) => eating.has(mem.id));
  const groups = [];
  for (const role of ROLE_ORDER) {
    const mine = all.filter((mem) => mem.role === role);
    if (mine.length > 0) groups.push({ role, label: ROLE_LABEL[role], faces: mine.map(faceOf) });
  }
  return { groups, all: all.map(faceOf) };
}

/**
 * El recorte de cabeza y hombros de un comensal.
 *
 * El payload trae la ruta del dibujo a tamaño completo (un PNG de 1024 px
 * donde el muñeco es una columna estrecha en el centro) y esto se pinta en
 * discos de 34: en ese tamaño la persona son cuatro pixeles, y ademas se
 * bajaba medio mega por cara. La regla de la casa para los circulos pequeños
 * es /avatares/thumbs/... (memberAvatarThumbSrc), y aqui se aplica igual.
 *
 * Sin dibujo propio -nadie eligio avatar, o el menu se publico antes de que
 * existieran- se cae al generico del rol. Aqui SI se puede: el circulo va
 * etiquetado por categoria -"Niños"- y no dice que esa sea la cara de nadie.
 */
function scopeFaceSrc(mem) {
  const full = mem?.avatar ?? ROLE_AVATAR[mem?.role] ?? ROLE_AVATAR.adulto;
  return full.replace("/avatares/", "/avatares/thumbs/");
}

/**
 * Dia / Semana con la misma pinta que en tu menu: circulo de color con el
 * icono de la vista, su nombre y un chevron.
 *
 * Se replica el LENGUAJE de DeckNav (Menu.jsx) y no el componente: aquel abre
 * un modal a pantalla completa con tres vistas y su propio estado; aqui son
 * dos opciones dentro de una hoja que ya esta abierta, y un modal encima de
 * otro modal es una pantalla de mas para elegir entre dos cosas.
 */
function ViewPicker({ week, onWeek }) {
  const [open, setOpen] = useState(false);
  const OPTS = [
    { id: false, label: "Día", Icon: CalendarDays, color: "#c9820a" },
    { id: true, label: "Semana", Icon: Layers2, color: "#2e7d75" },
  ];
  const active = OPTS.find((o) => o.id === week) ?? OPTS[0];
  const ActiveIcon = active.Icon;

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Vista del menú (${active.label})`}
        style={pickerBtn}
      >
        <span style={{ ...pickerCircle, background: active.color }}>
          <ActiveIcon size={14} strokeWidth={2.6} color="#fff" />
        </span>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: active.color, letterSpacing: "-.2px" }}>
          {active.label}
        </span>
        <ChevronDown size={15} strokeWidth={2.8} color="#9db3a6" />
      </button>

      {open && (
        <>
          {/* Capa invisible para cerrar tocando fuera: sin ella el desplegable
              se queda abierto y tapa el primer plato. */}
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 1 }} />
          <div role="listbox" style={pickerMenu}>
            {OPTS.map((o) => {
              const OptIcon = o.Icon;
              const on = o.id === week;
              return (
                <button
                  key={o.label}
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => { onWeek(o.id); setOpen(false); }}
                  style={{ ...pickerItem, background: on ? "#eef4f0" : "transparent" }}
                >
                  <span style={{ ...pickerCircle, background: o.color, width: 24, height: 24 }}>
                    <OptIcon size={13} strokeWidth={2.6} color="#fff" />
                  </span>
                  <span style={{ flex: 1, textAlign: "left", fontSize: 13, fontWeight: on ? 900 : 700, color: INK }}>
                    {o.label}
                  </span>
                  {on && <Check size={14} strokeWidth={3} color={o.color} />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/** Los platos de un dia, en orden, cada uno sabiendo de que comida sale. */
function flattenDayDishes(day) {
  const out = [];
  for (const meal of day?.meals ?? []) {
    for (const dish of meal.dishes ?? []) out.push({ dish, slot: meal.slot, eaters: meal.eaters ?? [] });
  }
  return out;
}

/** Un plato, con su foto llenando la tarjeta. */
function SharedDishTile({ item, stats = null, onPick, onOpen, height, compact = false }) {
  const { dish, slot } = item;
  const [failed, setFailed] = useState(false);
  const img = dish.recipeId ? dishImageForRecipe({ id: dish.recipeId }) : null;
  // Un plato cerrado no se puede abrir: no hay receta detras, solo su nombre.
  const locked = dish.readable === false;
  // Lo que la receta ES sale del catalogo, que es el mismo para todos: no hace
  // falta que el menu publicado cargue con la dificultad ni con los minutos.
  const catalog = dish.recipeId ? recipeCatalogById[dish.recipeId] : null;
  // Ceros explicitos, como en el rio: sin ellos la columna de la derecha no se
  // pinta y parece que el plato no tiene datos, en vez de tener cero. Un plato
  // cerrado no lleva ninguna: no hay receta de la que contar nada.
  const dishStats = dish.recipeId ? (stats?.[dish.recipeId] ?? EMPTY_STATS) : null;
  return (
    <button
      type="button"
      className={locked ? undefined : "mp-press"}
      // La barra de acciones sale pegada al plato, asi que el toque tiene que
      // decir DONDE esta el plato — no solo cual es.
      onClick={locked ? undefined : (e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onPick({ dish, anchor: { tile: { top: r.top, left: r.left, width: r.width, height: r.height }, radius: compact ? 16 : 20 } });
      }}
      disabled={locked}
      style={{
        position: "relative", width: "100%", height, display: "block",
        padding: 0, border: "none", borderRadius: compact ? 16 : 20,
        overflow: "hidden", background: "#eef3f0",
        cursor: locked ? "default" : "pointer", fontFamily: "inherit",
        textAlign: "left", WebkitTapHighlightColor: "transparent",
      }}
    >
      {img && !failed ? (
        <img
          src={deckImg(img, compact ? 360 : 720)}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#b6c7bd" }}>
          <Lock size={compact ? 18 : 24} strokeWidth={2.2} />
        </span>
      )}

      {/* El degradado no es decoracion: sin el, un nombre en blanco sobre una
          foto clara se vuelve ilegible. */}
      <span style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(10,30,18,.78) 0%, rgba(10,30,18,0) 58%)" }} />

      {/* Las mismas dos esquinas que el cartel de una receta en el rio: a la
          izquierda lo que el plato ES -dificultad y minutos-, a la derecha lo
          que la gente ha hecho con el -votos, veces cocinado, comentarios-.
          Solo en la vista de dia: en la de semana la tarjeta mide la mitad y
          seis pastillas la taparian entera. */}
      {!compact && (
        <PosterCorners difficulty={catalog?.difficulty ?? null} time={catalog?.time ?? null} stats={dishStats} inset={10} />
      )}

      {/* Turno y nombre, abajo y en ese orden, exactamente donde los pone
          DeckTile en tu propio menu: el punto de color y el eyebrow encima
          del titulo. Es la disposicion la que hace que se lea como la misma
          app, mas que la foto.

          Sin caras: quien come cada plato se elige arriba, en la franja de
          Dia/Semana. Repetirlas aqui era pintar las mismas cuatro caras en
          todas las tarjetas del dia para no decir nada nuevo en ninguna. */}
      <span style={{ position: "absolute", left: compact ? 10 : 14, right: compact ? 10 : 14, bottom: compact ? 10 : 13 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: compact ? 4 : 7 }}>
          <span style={{
            width: compact ? 7 : 9, height: compact ? 7 : 9, borderRadius: 999,
            background: SLOT_COLOR[slot] ?? "#7a9485", flexShrink: 0,
            boxShadow: "0 0 0 2px rgba(255,255,255,.6)",
          }} />
          <span style={{
            color: "rgba(255,255,255,.95)", fontSize: compact ? 9 : 10.5, fontWeight: 800,
            letterSpacing: ".7px", textTransform: "uppercase",
            textShadow: "0 1px 6px rgba(0,0,0,.5)", whiteSpace: "nowrap",
          }}>
            {slot}
          </span>
        </span>
        <span style={{
          display: "block", color: "#fff", fontWeight: 900, lineHeight: 1.15,
          fontSize: compact ? 13 : 19, letterSpacing: "-.3px",
          textShadow: "0 2px 12px rgba(0,0,0,.45)",
          // Hueco a la derecha para la ⓘ, para que el nombre no pase por debajo.
          paddingRight: compact || locked || !onOpen ? 0 : 34,
        }}>
          {dish.name}
          {dish.source === "user" && (
            <ChefHat size={compact ? 11 : 14} strokeWidth={2.6} style={{ verticalAlign: "-2px", marginLeft: 6, color: "#ffc98a" }} />
          )}
          {locked && (
            <Lock size={compact ? 11 : 14} strokeWidth={2.6} style={{ verticalAlign: "-2px", marginLeft: 6, color: "#dbe6df" }} />
          )}
        </span>
      </span>

      {/* La ⓘ abre la receta entera, como en el cartel del rio y en el mazo.
          Va aparte del toque en la foto a proposito: mirar la receta y
          llevartela son dos cosas distintas, y antes tocar el plato solo
          ofrecia lo segundo — para leerla no habia por donde. Un plato cerrado
          no la enseña: no hay nada que abrir. */}
      {onOpen && !locked && !compact && (
        <span
          role="button"
          tabIndex={0}
          aria-label={`Ver la receta de ${dish.name}`}
          title="Ver la receta"
          onClick={(e) => { e.stopPropagation(); onOpen(dish); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onOpen(dish); } }}
          style={{
            position: "absolute", right: 12, bottom: 14,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", cursor: "pointer",
            filter: "drop-shadow(0 1px 3px rgba(0,0,0,.5))",
          }}
        >
          <Info size={26} strokeWidth={2.2} />
        </span>
      )}
    </button>
  );
}

/**
 * Las acciones de un plato, pegadas al plato.
 *
 * Se replica el LENGUAJE de la barra que sale al mantener pulsado un plato en
 * tu propio menu (DishActionBar en Menu.jsx) y no el componente: aquel arrastra
 * el mazo entero -contexto de armado, anclas de regeneracion, portal- y aqui
 * son dos botones dentro de una pantalla que ya esta abierta. Lo que se copia
 * es lo que se ve: el fondo que apaga el resto, el recuadro claro sobre la
 * foto que dice de que plato hablamos, y la fila de circulos con su copy
 * debajo. Cae por debajo del plato si hay sitio, y por encima si no.
 */
function DishActionBar({ anchor, actions, onClose }) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tile = anchor?.tile;
  const BTN = 86;
  const GAP = 8;
  const PAD = 12;
  const barW = actions.length * BTN + (actions.length - 1) * GAP + PAD * 2;
  const cx = tile ? tile.left + tile.width / 2 : vw / 2;
  const halfW = barW / 2 + 10;
  const left = Math.min(Math.max(cx, halfW), vw - halfW);
  const fitsBelow = !tile || tile.top + tile.height + 92 <= vh;
  const anchorFromBottom = Boolean(tile) && !fitsBelow;
  const top = !tile ? vh / 2 : anchorFromBottom ? tile.top - 14 : tile.top + tile.height + 14;

  return (
    <div onClick={onClose} className="mp-overlay-in" style={dishBarBackdrop} role="dialog" aria-modal="true">
      {tile && (
        <div
          style={{
            position: "fixed",
            top: tile.top, left: tile.left, width: tile.width, height: tile.height,
            boxSizing: "border-box", borderRadius: anchor.radius,
            border: "2px solid rgba(255,255,255,.55)",
            pointerEvents: "none", zIndex: 341,
          }}
        />
      )}

      <div
        style={{
          position: "fixed", top, left, zIndex: 342,
          transform: !tile ? "translate(-50%, -50%)" : anchorFromBottom ? "translate(-50%, -100%)" : "translate(-50%, 0)",
        }}
      >
        <div className="mp-pop" onClick={(e) => e.stopPropagation()} style={dishBar}>
          {actions.map((act) => (
            <button
              key={act.id}
              type="button"
              className="mp-press"
              aria-label={act.label}
              onClick={act.onPick}
              style={{ ...dishBarBtn, width: BTN }}
            >
              <span style={{ ...dishBarIcon, background: act.tint ?? "#eef5f0" }}>
                <act.Icon size={18} strokeWidth={2.3} color={act.color ?? GREEN} />
              </span>
              <span style={{ fontSize: 11, fontWeight: 800, color: INK, textAlign: "center", lineHeight: 1.15 }}>
                {act.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
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

        <button type="button" className="mp-press" onClick={() => { onSave([...picked], remember); onClose(); }} style={{ ...primaryBtnFull, marginTop: 12 }}>
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
  // Sin fecha no hay etiqueta. Antes devolvia "Menú", que en un chip junto a
  // un menu no aporta nada: dice lo que ya se esta viendo. Quien llama
  // decide si pinta algo o no.
  if (!a) return null;
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

// Selector de vista: el mismo lenguaje que DeckNav en tu menu — circulo de
// color con el icono, el nombre y un chevron.
const pickerBtn = {
  display: "inline-flex", alignItems: "center", gap: 7,
  padding: 0, border: "none", background: "none",
  cursor: "pointer", fontFamily: "inherit",
};

const pickerCircle = {
  width: 28, height: 28, borderRadius: 999, flexShrink: 0,
  display: "inline-flex", alignItems: "center", justifyContent: "center",
};

const pickerMenu = {
  position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 2,
  minWidth: 170, padding: 5, borderRadius: 14,
  background: "#fff", border: "1px solid #e0eae3",
  boxShadow: "0 10px 28px rgba(20,47,29,.16)",
  display: "flex", flexDirection: "column", gap: 2,
};

const pickerItem = {
  display: "flex", alignItems: "center", gap: 9, width: "100%",
  padding: "7px 9px", borderRadius: 10, border: "none",
  cursor: "pointer", fontFamily: "inherit",
};

// Los siete dias, repartidos y SIN scroll horizontal.
//
// Antes era una tira que se desbordaba: los ultimos dias quedaban fuera de
// pantalla y habia que arrastrar para llegar al domingo, con la barra de
// scroll cortando por la mitad. Siete elementos cortos caben de sobra en los
// 420px de la columna — desbordar era gratis y molestaba.
//
// Y son CASILLAS de calendario, no pastillas: siete pildoras blancas con borde
// y texto gris tenian la forma de siete botones de accion, cuando lo que hay
// debajo es una semana. La pista verde clara es la misma de los controles
// segmentados de la app (§6.2), asi que la tira se lee como un selector y no
// como una fila de botones sueltos.
const deckDayStrip = {
  display: "flex", gap: 2, marginBottom: 14,
  padding: 4, borderRadius: 16,
  background: "#f0f4f1", border: "1px solid #e6efe9",
};
const deckDayCell = {
  flex: 1, minWidth: 0,
  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
  padding: "6px 0 7px", borderRadius: 12,
  border: "none", background: "none", cursor: "pointer",
  fontFamily: "inherit", transition: "background .15s ease",
};
const deckDayCellOn = { background: GREEN, boxShadow: "0 4px 12px rgba(45,90,61,.28)" };
const deckDayName = {
  fontSize: 9.5, fontWeight: 800, letterSpacing: ".5px",
  textTransform: "uppercase", lineHeight: 1,
};
const deckDayNum = { fontSize: 14, fontWeight: 900, lineHeight: 1, fontVariantNumeric: "tabular-nums" };

const deckWeekHead = { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 };

// Como lo miras a la izquierda, para quien a la derecha. Envuelve si la casa
// tiene tres grupos y no caben en una linea de 420 px.
const deckTopRow = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  flexWrap: "wrap", gap: 8, marginBottom: 12,
};

// El mismo tamaño de circulo que el filtro del mazo de tu menu, un punto por
// debajo (42 alli) porque aqui comparten linea con el selector de vista.
const SCOPE_FACE = 34;

// Tres caras y a partir de ahi un contador. Sin tope, la casa entera se pinta
// entera en "Todos" y una familia de seis empuja los demas grupos fuera de la
// linea; con el contador, cada grupo mide siempre lo mismo.
const SCOPE_MAX = 3;

const scopeRow = {
  display: "flex", alignItems: "flex-start", gap: 10,
  marginLeft: "auto",
};

const scopeOpt = {
  display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
  padding: 0, border: "none", background: "transparent",
  cursor: "pointer", fontFamily: "inherit", minWidth: 40,
};

const scopeOptLabel = {
  fontSize: 10.5, fontWeight: 800, whiteSpace: "nowrap",
  transition: "color .15s ease",
};

const scopeDivider = {
  width: 1, height: 30, background: "#dde8e1", alignSelf: "center", flexShrink: 0,
};

const dishBarBackdrop = {
  position: "fixed", inset: 0, zIndex: 340,
  background: "rgba(9,18,12,.8)",
};

const dishBar = {
  display: "flex", gap: 8, padding: 12, borderRadius: 20,
  background: "rgba(250,252,251,.98)",
  boxShadow: "0 14px 34px rgba(9,18,12,.42)",
};

const dishBarBtn = {
  display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
  padding: "8px 2px", border: "none", background: "none", borderRadius: 12,
  cursor: "pointer", fontFamily: "inherit",
};

const dishBarIcon = {
  width: 38, height: 38, borderRadius: "50%",
  display: "grid", placeItems: "center",
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

// Exactamente la misma caja que la cabecera de Inicio, Menú, Recetas o el
// propio Feed: 20 px arriba, 14 abajo y 36 de alto por dentro. Entrar en la
// cocina de alguien no es entrar en otra app, asi que la barra no puede medir
// otra cosa — antes era mas baja y el salto se notaba al abrirla. El inset
// seguro se suma al padding para que en un movil con notch tampoco se meta
// debajo.
const peekBar = {
  position: "relative",
  display: "flex", alignItems: "center", gap: 10,
  // La pantalla del asomo es una columna flex, asi que sin esto la cabecera
  // ENCOGE cuando el menu es largo: pedia 70 px y se quedaba en 64, y por eso
  // no acababa de cuadrar con la del resto de pestañas por mucho padding que
  // se le pusiera.
  flexShrink: 0,
  padding: "20px 16px 14px",
  paddingTop: "calc(20px + env(safe-area-inset-top, 0px))",
  background: HEADER_BAND,
  borderBottom: "1px solid #dfeae3",
};

const peekBarIcon = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 36, height: 36, borderRadius: 999, flexShrink: 0,
  border: "none", background: "#f0f4f1", color: GREEN, cursor: "pointer",
};

const peekWho = {
  display: "flex", alignItems: "center", gap: 9,
  flex: 1, minWidth: 0, padding: 0, border: "none", background: "none",
  cursor: "pointer", fontFamily: "inherit", textAlign: "left",
};

const peekWhoName = {
  display: "block", fontSize: 14, fontWeight: 900, color: INK,
  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
};

const peekWhoWhen = {
  display: "block", fontSize: 11.5, fontWeight: 700, color: "#8aa294",
  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
};

const peekMenu = {
  position: "absolute", top: "calc(100% - 4px)", right: 16, zIndex: 3,
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

/**
 * La tarjeta de publicar.
 *
 * Fondo crema para separarla del rio de recetas (que son fotos a sangre) sin
 * competir con ellas. El color lo ponen SOLO la ilustracion y la pildora
 * verde de accion: el texto va en la escala de tinta de la app, nunca en el
 * tono del fondo — un mismo color untado en fondo, borde y letras convierte
 * cualquier tarjeta en una pegatina.
 */
const PUBLISH_HINT_KEY = "hm_feed_publish_hint";
const VIS_PROMPT_KEY = "hm_feed_visibility_asked";

// La lengueta: a la altura de la fila de pestañas, redondeada solo por la
// izquierda y mordida por el borde derecho de la columna.

const publishClose = {
  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  width: 24, height: 24, borderRadius: 999, marginLeft: 4,
  border: "none", background: "rgba(20,47,29,.07)", color: "#7a8a7f", cursor: "pointer",
};

// Plegada asoma por el borde izquierdo (margen negativo contra el padding de
// la columna) y solo se redondea por la derecha, que es el lado que se ve.
const publishCard = {
  display: "flex", alignItems: "center", gap: 10, minWidth: "100%",
  marginLeft: -18, padding: "6px 8px 6px 18px",
  borderRadius: "0 14px 14px 0", border: "none", background: "#f6efe6",
  fontFamily: "inherit", boxSizing: "border-box",
};

const publishArt = {
  width: 36, height: 36, borderRadius: 10, objectFit: "cover",
  display: "block", flexShrink: 0,
};

// Verde de accion, como cualquier boton primario de la app: es el unico
// elemento saturado ademas de la ilustracion.
const publishPill = {
  flexShrink: 0, padding: "6px 13px", borderRadius: 999, border: "none",
  background: GREEN, color: "#fff", fontSize: 11.5, fontWeight: 800,
  cursor: "pointer", fontFamily: "inherit",
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
// Mismo diametro exterior que ringOn/ringOff (58): el borde de 2px se come
// parte del aire en vez de sumarse, o "Tu menu" quedaba mas gordo y mas
// pegado a su vecino que el resto de la fila.
const ringDashed = {
  display: "flex", padding: 0.5, borderRadius: "50%",
  border: "2px dashed #9ab5a6",
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

