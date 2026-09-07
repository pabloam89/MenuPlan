import { useMemo, useRef, useState } from "react";
import { X, Camera, ImagePlus, Search, ChevronLeft, ChevronRight, ChevronDown, Check, Plus, UsersRound, Folder, Sparkles } from "./icons.jsx";
import { Avatar } from "./ui.jsx";
import { SEALS, STICKER_COLORS } from "../lib/cookings.js";
import { dishImageForRecipe } from "../assets/dishes/dishImages.js";
import { deckImg } from "../lib/dishPhotoOptimize.js";

const INK = "#142f1d";
const INK_SOFT = "#5a7066";
const GREEN = "#2d5a3d";

/**
 * Las ilustraciones del hueco vacío: `/avatares/cards/foto_recetas/`.
 *
 * Un icono de cámara dentro de un círculo es lo más genérico que existe: lo
 * pone cualquiera y no dice nada de esta app. Estas están hechas para esta
 * pantalla —planes de comida reales, y en todas alguien sacando el móvil para
 * fotografiar lo que ha cocinado, que es exactamente lo que se te está
 * pidiendo— y eso no lo tiene nadie más.
 *
 * Sale una al azar en cada apertura, así que abrir a publicar no es dos veces
 * la misma pantalla.
 *
 * Vienen de PNG de 1,2-1,6 MB y se sirven en WebP de 1200px (50-120 kB): son
 * un FONDO de 420px, y un megabyte por abrir el composer no lo paga nadie con
 * datos. Para meter más: conviértelas igual y añade la ruta aquí.
 */
const HERO_ART = [
  "/avatares/cards/foto_recetas/barbacoa.webp",
  "/avatares/cards/foto_recetas/sobremesa_amigos.webp",
  "/avatares/cards/foto_recetas/solo_cocina.webp",
  "/avatares/cards/foto_recetas/merienda_campo.webp",
  "/avatares/cards/foto_recetas/brunch_casa.webp",
  "/avatares/cards/foto_recetas/brunch_terraza.webp",
  "/avatares/cards/foto_recetas/cocina_generica.webp",
];

// El adhesivo no baja de aquí: la franja de abajo es de la receta, y esa no la
// tapa nada. Es la única regla del lienzo — ver CookingStory.
const STICKER_MAX_Y = 58;

/**
 * Dónde cae el adhesivo, en % del lienzo, y POR QUÉ LADO se ancla.
 *
 * Con `left` siempre, una frase larga soltada en la mitad derecha se salía del
 * marco y se cortaba a media palabra. Anclando por el borde más cercano
 * —izquierda en la mitad izquierda, derecha en la derecha— el texto crece
 * siempre hacia dentro, y da igual lo largo que sea lo que escriba nadie.
 */
function pointToPct(e, stage) {
  const r = stage.getBoundingClientRect();
  const px = ((e.clientX - r.left) / r.width) * 100;
  const y = Math.min(STICKER_MAX_Y, Math.max(3, ((e.clientY - r.top) / r.height) * 100 - 5));
  return px > 50
    ? { anchor: "right", x: Math.min(92, Math.max(4, 100 - px)), y }
    : { anchor: "left", x: Math.min(92, Math.max(4, px)), y };
}

/**
 * Publicar una cocinada: la foto de hoy, vinculada a un plato.
 *
 * ── Todo pasa sobre la foto ────────────────────────────────────────────
 * La receta vive ABAJO DEL TODO, dentro del propio lienzo, como una miniatura
 * redondeada: así se ve de un vistazo que la foto y el plato son la misma
 * cosa. Sacarla a una tarjeta aparte la convertía en un campo de formulario.
 *
 * ── Escribes lo que quieras, y lo sueltas donde quieras ────────────────
 * Texto libre con los emoji de tu teclado. Al pulsar "Pegar" el adhesivo se te
 * queda EN LA MANO y te sigue por la foto; el siguiente toque lo suelta.
 *
 * Lo importante es el fantasma (`ghost`): antes se oscurecía la pantalla y el
 * adhesivo no aparecía hasta soltarlo, así que estabas apuntando a ciegas y el
 * gesto se sentía del revés. Ahora ves LO QUE estás colocando MIENTRAS lo
 * colocas, que es como funciona coger algo y dejarlo en un sitio.
 *
 * ── Los atajos no son una fila de pastillas ────────────────────────────
 * Vivían como cinco pastillas bajo el campo: una forma que ninguna red usa
 * para esto y que cargaba la pantalla con algo que casi nunca se toca. Ahora
 * se despliegan desde el botón de al lado del campo, como el panel de
 * adhesivos de cualquier editor de historias.
 */
export function CookingComposer({
  todayDishes = [],
  members = [],
  friends = [],
  searchPool = [],
  folders = [],
  collections = {},
  onPublish,
  onClose,
}) {
  const [photo, setPhoto] = useState(null);
  // Se propone el primer plato de hoy, haya uno o cinco. Preguntar cuál era
  // un formulario antes de la parte divertida; proponer y dejar cambiar es un
  // toque, y la meta-línea dice claramente que es una propuesta.
  const [link, setLink] = useState(todayDishes[0] ?? null);
  const [view, setView] = useState(null); // null | "pick" | "guests" | "shortcuts"
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [sticker, setSticker] = useState(null); // { text, id, x, y, anchor }
  // Lo que llevas en la mano, y por dónde va el dedo.
  const [placing, setPlacing] = useState(null);
  const [ghost, setGhost] = useState(null);
  // Teal por defecto: es el color de la casa y funciona sobre casi
  // cualquier foto de comida.
  const [color, setColor] = useState("teal");
  const [openFolder, setOpenFolder] = useState(null);
  const [panel, setPanel] = useState(null); // null | "pills" | "color"
  const [eaters, setEaters] = useState(() => members.map((m) => m.id));
  const [guests, setGuests] = useState([]);
  const [hero] = useState(() => HERO_ART[Math.floor(Math.random() * HERO_ART.length)]);
  const camRef = useRef(null);
  const galRef = useRef(null);
  const stageRef = useRef(null);
  const dragRef = useRef(false);

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result));
    reader.readAsDataURL(f);
  };

  /**
   * Emparejar ANTES de crear nada. Sin esto, catorce personas cocinando lo
   * mismo crean catorce fichas de "pasta con tomate". Crear es la última
   * salida, no la primera.
   */
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return searchPool.filter((r) => r.name?.toLowerCase().includes(q)).slice(0, 8);
  }, [query, searchPool]);

  /**
   * El recetario tal y como lo tienes organizado: tus recetas primero, y luego
   * cada carpeta con lo que guardaste dentro.
   *
   * Se reusa `data.recipeCollections` (receta -> carpetas), que es el mismo
   * mapa que pinta Mis Recetas: si aquí inventara otra agrupación, el mismo
   * plato estaría en sitios distintos según por dónde entres.
   */
  const shelves = useMemo(() => {
    const byId = new Map(searchPool.map((r) => [r.id, r]));
    const mias = searchPool.filter((r) => r.owner || String(r.id).startsWith("user_"));
    const hoy = todayDishes.map((d) => d.recipe ?? byId.get(d.recipeId)).filter(Boolean);
    const out = [];
    // Lo de hoy primero: la barra propone UNO, y este es el sitio donde se
    // cambia por el otro plato del día sin tener que buscarlo.
    if (hoy.length > 0) out.push({ id: "hoy", label: "Hoy tenías", recipes: hoy, img: "/avatares/cards/comidas.jpg" });
    out.push({ id: "mias", label: "Tus recetas", recipes: mias, img: "/avatares/cards/empty_recetas_propias.jpg" });
    for (const f of folders) {
      const recipes = Object.entries(collections)
        .filter(([, ids]) => Array.isArray(ids) && ids.includes(f.id))
        .map(([recipeId]) => byId.get(recipeId))
        .filter(Boolean);
      out.push({ id: f.id, label: f.label, recipes, img: f.img, Icon: f.Icon });
    }
    return out;
  }, [searchPool, folders, collections, todayDishes]);

  const recipe = link?.recipe ?? null;
  const catalogPhoto = link && !link.draft ? dishImageForRecipe(recipe ?? link) : null;
  const canPublish = Boolean(link);
  const activeColor = STICKER_COLORS.find((c) => c.id === color) ?? STICKER_COLORS[0];

  /** El texto queda EN LA MANO; el siguiente toque sobre la foto lo suelta. */
  const armSticker = (text, id = null) => {
    const t = text.trim();
    if (!t) return;
    setPlacing({ text: t, id, color });
    setGhost(null);
    setNote("");
    setView(null);
  };

  const dropSticker = (e) => {
    if (!placing || !stageRef.current) return;
    setSticker({ ...placing, color, ...pointToPct(e, stageRef.current) });
    setPlacing(null);
    setGhost(null);
  };

  const onStageMove = (e) => {
    if (placing && stageRef.current) {
      setGhost(pointToPct(e, stageRef.current));
      return;
    }
    if (!dragRef.current || !stageRef.current) return;
    const p = pointToPct(e, stageRef.current);
    setSticker((s) => (s ? { ...s, ...p } : s));
  };

  const publish = () => {
    if (!link) return;
    onPublish?.({
      photo,
      recipeId: link.recipeId ?? link.recipe?.id ?? link.id,
      recipeName: link.name ?? link.recipe?.name,
      draft: Boolean(link.draft),
      seal: sticker,
      eaters,
      guests,
    });
  };

  const pickRecipe = (r) => {
    setLink({ recipeId: r.id, name: r.name, recipe: r });
    setView(null);
    setOpenFolder(null);
  };

  // ── El recetario: carpetas como en Recetas, y dentro las fichas ──────
  if (view === "pick") {
    const searching = query.trim().length >= 2;
    const inside = openFolder ? shelves.find((f) => f.id === openFolder) : null;
    return (
      <Sheet onClose={onClose}>
        <SheetHead
          title={inside ? inside.label : "¿Qué has cocinado?"}
          onBack={() => (inside ? setOpenFolder(null) : setView(null))}
        />
        <div style={searchWrap}>
          <Search size={15} color={INK_SOFT} strokeWidth={2.4} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Escribe el nombre del plato…"
            style={searchInput}
          />
        </div>

        {/* La `key` dispara el deslizamiento: cada nivel entra desde el lado en
            vez de cambiar de golpe. Misma transición que el resto de la app. */}
        <div
          className="mp-nav-fwd"
          key={searching ? "q" : (inside?.id ?? "folders")}
          style={{ maxHeight: 380, overflowY: "auto", marginTop: 12 }}
        >
          {searching ? (
            <>
              <div style={pickList}>
                {matches.map((r) => <RecipeTile key={r.id} recipe={r} onPick={pickRecipe} />)}
              </div>

              {/* Crear ficha nueva va DEBAJO de las coincidencias: es lo último
                  que quieres que haga alguien que solo sube una cena. */}
              <button
                type="button"
                onClick={() => {
                  setLink({ recipeId: `draft_${Date.now().toString(36)}`, name: query.trim(), draft: true });
                  setView(null);
                }}
                style={{ ...pickRow, borderStyle: "dashed", marginTop: 10 }}
              >
                <span style={{ width: 40, height: 40, borderRadius: 11, background: "#eef2f0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Plus size={18} color={INK_SOFT} strokeWidth={2.5} />
                </span>
                <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                  <span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: INK }}>«{query.trim()}» es mía</span>
                  <span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: INK_SOFT, marginTop: 2 }}>
                    La receta la escribes cuando te la pidan
                  </span>
                </span>
              </button>
            </>
          ) : inside ? (
            inside.recipes.length > 0 ? (
              <div style={pickList}>
                {inside.recipes.map((r) => <RecipeTile key={r.id} recipe={r} onPick={pickRecipe} />)}
              </div>
            ) : (
              <p style={mutedCopy}>Esta carpeta está vacía.</p>
            )
          ) : (
            /* Las carpetas con SU ilustración, exactamente como en Recetas: si
               las mismas carpetas se vieran distintas según por dónde entras,
               parecerían dos recetarios diferentes. */
            <div style={pickList}>
              {shelves.map((f) => (
                <FolderTile
                  key={f.id}
                  label={f.label}
                  img={f.img}
                  Icon={f.Icon}
                  count={f.recipes.length}
                  onClick={() => setOpenFolder(f.id)}
                />
              ))}
            </div>
          )}
        </div>
      </Sheet>
    );
  }

  // ── Quién comió ──────────────────────────────────────────────────────
  if (view === "guests") {
    return (
      <Sheet onClose={onClose}>
        <SheetHead title="Quién comió" onBack={() => setView(null)} />
        <div className="mp-nav-fwd">
          <p style={groupLabel}>Tu casa</p>
          <div style={faceGrid}>
            {members.map((m) => (
              <FaceToggle
                key={m.id}
                name={m.name}
                photo={m.avatar}
                on={eaters.includes(m.id)}
                onClick={() => setEaters((p) => (p.includes(m.id) ? p.filter((x) => x !== m.id) : [...p, m.id]))}
              />
            ))}
          </div>

          {/* Invitados desde tu lista de amigos: gente que existe y que estuvo,
              no un @ escrito a mano que puede no llevar a ningún sitio. */}
          <p style={groupLabel}>Invitados</p>
          {friends.length === 0 ? (
            <p style={mutedCopy}>Cuando sigas a alguien podrás marcarlo aquí si vino a cenar.</p>
          ) : (
            <div style={faceGrid}>
              {friends.map((f) => (
                <FaceToggle
                  key={f.id}
                  name={f.display_name ?? f.username ?? "?"}
                  photo={f.avatar_url}
                  on={guests.includes(f.id)}
                  onClick={() => setGuests((p) => (p.includes(f.id) ? p.filter((x) => x !== f.id) : [...p, f.id]))}
                />
              ))}
            </div>
          )}

          <button type="button" onClick={() => setView(null)} style={primaryBtn}>Listo</button>
        </div>
      </Sheet>
    );
  }

  /**
   * ── Primero la foto. Todo lo demás, después ─────────────────────────
   *
   * Antes esta pantalla enseñaba de golpe el campo de escribir, los colores,
   * los comensales y el vínculo — o sea, un formulario con una ilustración
   * encima, y todo referido a una foto que aún no existía. Decorar algo que no
   * está es imposible, así que primero se hace la foto y luego aparece el
   * resto.
   *
   * Publicar SIN foto sigue permitido (si no, la fila se queda muerta un
   * martes), pero deja de ser una opción al mismo nivel: es la puerta pequeña
   * de abajo, no uno de los tres botones grandes.
   */
  if (!photo) {
    return (
      <div style={overlay} onClick={onClose}>
        <div style={canvasSheet} onClick={(e) => e.stopPropagation()}>
          <div className="mp-rise" style={stage}>
            <img src={hero} alt="" style={stagePhoto} className="mp-drift" draggable={false} />
            <div style={heroVeil} />

            {/* La X va DENTRO de la ilustración. Una cabecera propia para un
                solo botón se comía 44px de alto en una hoja que ya compite
                con el teclado del móvil. */}
            <button type="button" onClick={onClose} aria-label="Cerrar" style={overClose}>
              <X size={16} strokeWidth={2.7} color="#fff" />
            </button>

            <div style={heroActions}>
              <button type="button" onClick={() => camRef.current?.click()} style={heroPrimary}>
                <Camera size={16} strokeWidth={2.5} /> Haz una foto
              </button>
              <button type="button" onClick={() => galRef.current?.click()} style={heroGhost}>
                <ImagePlus size={14} strokeWidth={2.5} /> Galería
              </button>
            </div>
          </div>

          <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display: "none" }} />
          <input ref={galRef} type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} />
        </div>
      </div>
    );
  }

  // ── Paso 2: el lienzo, con la foto ya puesta ─────────────────────────
  return (
    <div style={overlay} onClick={onClose}>
      <div style={canvasSheet} onClick={(e) => e.stopPropagation()}>
        <div
          ref={stageRef}
          className="mp-rise"
          style={{ ...stage, cursor: placing ? "crosshair" : "default", "--d": ".03s" }}
          onPointerMove={onStageMove}
          onPointerUp={() => { dragRef.current = false; }}
          onPointerLeave={() => { dragRef.current = false; setGhost(null); }}
          onClick={dropSticker}
        >
          {photo
            ? <img src={photo} alt="" style={stagePhoto} draggable={false} />
            : catalogPhoto
              ? <img src={deckImg(catalogPhoto, 900)} alt="" style={stagePhoto} draggable={false} />
              : <img src={hero} alt="" style={stagePhoto} className="mp-drift" draggable={false} />}

          {/* Los mandos, sobre la propia foto: cerrar y rehacer a la
              izquierda, publicar a la derecha. Sacarlos a una cabecera costaba
              44px de marco en una hoja que ya pelea con el teclado. */}
          {!placing && (
            <>
              <div style={overLeft}>
                <button type="button" onClick={onClose} aria-label="Cerrar" style={{ ...overClose, position: "static" }}>
                  <X size={16} strokeWidth={2.7} color="#fff" />
                </button>
                <button type="button" onClick={() => camRef.current?.click()} aria-label="Cambiar la foto" style={{ ...overClose, position: "static" }}>
                  <Camera size={15} strokeWidth={2.5} color="#fff" />
                </button>
              </div>
              <button
                type="button"
                disabled={!canPublish}
                onClick={publish}
                style={{ ...overPublish, opacity: canPublish ? 1 : .45 }}
              >
                Publicar
              </button>
            </>
          )}

          {/* El fantasma: lo que llevas en la mano, siguiéndote. Es la
              diferencia entre colocar algo y apuntar a ciegas. */}
          {placing && ghost && (
            <span
              style={{
                ...stickerChip,
                [ghost.anchor === "right" ? "right" : "left"]: `${ghost.x}%`,
                top: `${ghost.y}%`,
                background: (STICKER_COLORS.find((x) => x.id === color) ?? STICKER_COLORS[0]).bg,
                color: (STICKER_COLORS.find((x) => x.id === color) ?? STICKER_COLORS[0]).fg,
                opacity: .75,
                pointerEvents: "none",
                boxShadow: "0 8px 22px rgba(0,0,0,.32)",
              }}
            >
              {placing.text}
            </span>
          )}
          {placing && !ghost && <div style={placingHint}>Toca donde quieras ponerlo</div>}

          {sticker && !placing && (() => {
            const c = STICKER_COLORS.find((x) => x.id === sticker.color) ?? STICKER_COLORS[0];
            return (
              <span
                className="mp-seal-pop"
                style={{ position: "absolute", [sticker.anchor === "right" ? "right" : "left"]: `${sticker.x}%`, top: `${sticker.y}%` }}
              >
                <button
                  type="button"
                  onPointerDown={(e) => { dragRef.current = true; e.currentTarget.setPointerCapture(e.pointerId); }}
                  title="Arrástralo para moverlo"
                  style={{ ...stickerChip, position: "static", background: c.bg, color: c.fg }}
                >
                  {sticker.text}
                </button>
                {/* Una X de verdad. El doble toque no lo encontraba nadie —y en
                    movil compite con el zoom—, asi que quitarlo tiene boton. */}
                <button
                  type="button"
                  onClick={() => setSticker(null)}
                  aria-label="Quitar el adhesivo"
                  style={stickerKill}
                >
                  <X size={11} strokeWidth={3} color="#fff" />
                </button>
              </span>
            );
          })()}

          {/* ── La vinculación: UNA barra, siempre ──────────────────────
              Antes, sin plato elegido, la franja se partía en una tarjeta por
              cada plato de hoy: dos barras de cristal seguidas que parecían dos
              publicaciones distintas en vez de dos opciones. Ahora se PROPONE
              el primero —el mismo criterio de "confirmar, no preguntar" con el
              que arrancó todo esto— y cambiarlo es un toque. Los otros platos
              de hoy salen los primeros al abrir el recetario. */}
          <div className="mp-rise" style={linkBar}>
            <button type="button" onClick={() => { setView("pick"); setQuery(""); }} style={linkChip}>
              {link ? (
                <>
                  {catalogPhoto
                    ? <img src={deckImg(catalogPhoto, 160)} alt="" style={linkThumb} />
                    : <span style={{ ...linkThumb, background: "rgba(255,255,255,.2)" }} />}
                  <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                    <span style={linkName}>{link.name}</span>
                    <span style={linkMeta}>
                      {link.draft
                        ? "Borrador · la escribes cuando te la pidan"
                        : link.meal
                          ? `Hoy · ${link.meal} · tocar para cambiar`
                          : "Tocar para cambiar"}
                    </span>
                  </span>
                </>
              ) : (
                <>
                  <span style={{ ...linkThumb, background: "rgba(255,255,255,.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Search size={17} strokeWidth={2.5} color="#fff" />
                  </span>
                  <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                    <span style={linkName}>¿Qué has cocinado?</span>
                    <span style={linkMeta}>Tu recetario, el de HoMenu, o escríbelo</span>
                  </span>
                </>
              )}
              <ChevronRight size={16} color="rgba(255,255,255,.75)" strokeWidth={2.5} style={{ flexShrink: 0 }} />
            </button>
          </div>
        </div>

        <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display: "none" }} />
        <input ref={galRef} type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} />

        {/* ── Escribe, y a la derecha los dos desplegables ─────────────
            La barra ocupa casi todo: escribir es lo que quieres que pase. Los
            adhesivos hechos y los colores se pliegan en dos botones, y cada
            uno abre su panel DEBAJO — no compiten con el campo por el ancho. */}
        <div className="mp-rise" style={{ ...noteRow, "--d": ".06s" }}>
          <div style={noteWrap}>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") armSticker(note); }}
              maxLength={60}
              placeholder="Escribe algo… 😋"
              style={noteInput}
            />
            <button
              type="button"
              onClick={() => armSticker(note)}
              disabled={!note.trim() && !placing}
              style={{ ...noteAdd, opacity: (note.trim() || placing) ? 1 : .3 }}
            >
              {placing ? "Toca" : "Pegar"}
            </button>
          </div>

          <button
            type="button"
            aria-label="Adhesivos hechos"
            aria-expanded={panel === "pills"}
            onClick={() => setPanel(panel === "pills" ? null : "pills")}
            style={{ ...noteTool, borderColor: panel === "pills" ? GREEN : "#dbe3de" }}
          >
            <Sparkles size={16} strokeWidth={2.4} color={GREEN} />
            <ChevronDown size={12} strokeWidth={2.8} color={INK_SOFT} style={{ transform: panel === "pills" ? "rotate(180deg)" : "none", transition: "transform .18s ease" }} />
          </button>

          <button
            type="button"
            aria-label="Color del adhesivo"
            aria-expanded={panel === "color"}
            onClick={() => setPanel(panel === "color" ? null : "color")}
            style={{ ...colorDot, background: activeColor.bg, outline: panel === "color" ? `2px solid ${GREEN}` : "1px solid #dbe3de" }}
          />
        </div>

        {panel === "pills" && (
          <div className="mp-rise" style={dropdown}>
            {SEALS.map((s2) => (
              <button
                key={s2.id}
                type="button"
                onClick={() => { armSticker(s2.label, s2.id); setPanel(null); }}
                style={{ ...premadeChip, background: activeColor.bg, color: activeColor.fg }}
              >
                {s2.label}
              </button>
            ))}
          </div>
        )}

        {panel === "color" && (
          <div className="mp-rise" style={{ ...dropdown, ...colorGrid }}>
            {STICKER_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-label={`Color ${c.id}`}
                aria-pressed={color === c.id}
                onClick={() => {
                  setColor(c.id);
                  setSticker((st) => (st ? { ...st, color: c.id } : st));
                  setPlacing((pl) => (pl ? { ...pl, color: c.id } : pl));
                  setPanel(null);
                }}
                style={{
                  ...colorDot,
                  background: c.bg,
                  outline: color === c.id ? `2px solid ${GREEN}` : "1px solid #dbe3de",
                }}
              />
            ))}
          </div>
        )}

        {/* ── Quién comió: las caras, no un número ─────────────────────
            "Comieron 4" es una estadística, y encima obligaba a abrir una hoja
            para saber de quién hablaba. Tu casa son cuatro caras: enseñarlas
            cuesta menos que la frase que las resume, y se tocan aquí mismo.
            La hoja se queda solo para los invitados, que sí son una lista. */}
        <div className="mp-rise" style={{ ...eatersRow, "--d": ".12s" }}>
          {members.map((m) => {
            const on = eaters.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={on}
                aria-label={m.name}
                title={m.name}
                onClick={() => setEaters((p2) => (p2.includes(m.id) ? p2.filter((x) => x !== m.id) : [...p2, m.id]))}
                style={{ ...eaterFace, opacity: on ? 1 : .3 }}
              >
                <Avatar name={m.name ?? "?"} photo={m.avatar} size={38} color={GREEN} />
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setView("guests")}
            aria-label="Añadir invitados"
            style={eaterAdd}
          >
            {guests.length > 0
              ? <span style={{ fontSize: 12, fontWeight: 900, color: GREEN }}>+{guests.length}</span>
              : <Plus size={16} strokeWidth={2.6} color={INK_SOFT} />}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * La carpeta, con la misma cara que en Recetas: su ilustración a sangre, el
 * contador sobre la foto y el nombre debajo.
 *
 * El arte llega ya resuelto en la prop `folders` (ver FeedScreen) para no
 * arrastrar CatalogBrowserSheet entero hasta aquí. Si estas carpetas se vieran
 * distintas según por dónde entras, parecerían dos recetarios diferentes.
 */
function FolderTile({ label, img, Icon, count, onClick }) {
  const [failed, setFailed] = useState(false);
  const showImg = Boolean(img) && !failed;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <button
        type="button"
        onClick={onClick}
        aria-label={`Abrir carpeta ${label}`}
        style={{
          position: "relative", width: "100%", aspectRatio: "1 / 1",
          padding: 0, borderRadius: 14, overflow: "hidden", cursor: "pointer",
          border: showImg ? "none" : `1.5px dashed ${GREEN}44`,
          background: showImg ? "#f4f7f5" : `${GREEN}0f`,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
          fontFamily: "inherit",
        }}
      >
        {showImg ? (
          <>
            <img
              src={img}
              alt=""
              loading="lazy"
              onError={() => setFailed(true)}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
            />
            {/* El contador va SOBRE la foto, así que necesita su propio fondo
                para leerse igual en una imagen clara y en una oscura. */}
            <span style={folderCount}>{count}</span>
          </>
        ) : (
          <>
            {Icon ? <Icon size={28} color={GREEN} strokeWidth={1.9} /> : null}
            <span style={{ fontSize: 18, fontWeight: 900, color: GREEN, lineHeight: 1 }}>{count}</span>
          </>
        )}
      </button>
      <div style={folderLabelStyle}>{label}</div>
    </div>
  );
}

function RecipeTile({ recipe, onPick }) {
  const img = dishImageForRecipe(recipe);
  return (
    <button type="button" onClick={() => onPick(recipe)} title={recipe.name} style={tile}>
      {img
        ? <img src={deckImg(img, 240)} alt="" loading="lazy" style={tileImg} />
        : <span style={{ ...tileImg, background: "#eef2f0", display: "block" }} />}
      <span style={tileName}>{recipe.name}</span>
    </button>
  );
}

function Sheet({ children, onClose }) {
  return (
    <div style={overlay} onClick={onClose}>
      <div style={sheet} onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

function SheetHead({ title, onBack }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <button type="button" onClick={onBack} aria-label="Volver" style={headIcon}>
        <ChevronLeft size={17} strokeWidth={2.6} />
      </button>
      <h2 style={{ margin: 0, flex: 1, fontSize: 16, fontWeight: 900, color: INK }}>{title}</h2>
    </div>
  );
}

function FaceToggle({ name, photo, on, onClick }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} style={{ ...faceBtn, opacity: on ? 1 : .35 }}>
      <span style={{ position: "relative", display: "inline-flex" }}>
        <Avatar name={name ?? "?"} photo={photo} size={50} color={GREEN} />
        {on && <span style={faceCheck}><Check size={11} strokeWidth={3.4} color="#fff" /></span>}
      </span>
      <span style={faceName}>{name}</span>
    </button>
  );
}

// La barra de abajo mide 80. Sin este colchón el último control queda debajo
// de la navegación y no hay forma de tocarlo.
const NAV_CLEARANCE = "calc(92px + env(safe-area-inset-bottom))";

const overlay = {
  position: "fixed", inset: 0, zIndex: 90, background: "rgba(18,24,20,.45)",
  display: "flex", alignItems: "flex-end", justifyContent: "center",
  animation: "mp-overlay-in .18s ease",
};
const canvasSheet = {
  width: "100%", maxWidth: 420, maxHeight: "94dvh", overflowY: "auto",
  background: "#fff", borderRadius: "22px 22px 0 0",
  padding: `12px 14px ${NAV_CLEARANCE}`,
  boxSizing: "border-box", animation: "mp-sheet-up .22s cubic-bezier(.2,.8,.3,1)",
};
// La flecha de volver de las sub-hojas (recetario, invitados). Sobrevive a la
// cabecera del lienzo porque ahi si hay un titulo al lado que acompanar.
const headIcon = {
  width: 34, height: 34, borderRadius: 999, border: "none", background: "#eef2f0",
  display: "flex", alignItems: "center", justifyContent: "center", color: INK,
  cursor: "pointer", flexShrink: 0, fontFamily: "inherit",
};
const stage = {
  position: "relative", width: "100%", aspectRatio: "4 / 3", borderRadius: 18,
  overflow: "hidden", background: "#eef2f0", touchAction: "none",
};
const stagePhoto = { width: "100%", height: "100%", objectFit: "cover", display: "block", userSelect: "none" };
const heroVeil = {
  position: "absolute", inset: 0, pointerEvents: "none",
  background: "linear-gradient(to bottom, rgba(0,0,0,0) 30%, rgba(0,0,0,.42) 100%)",
};
const heroActions = {
  position: "absolute", left: 0, right: 0, top: "48%", transform: "translateY(-50%)",
  display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
  transition: "opacity .18s ease",
};
const heroPrimary = {
  display: "inline-flex", alignItems: "center", gap: 7, padding: "12px 20px",
  borderRadius: 999, border: "none", background: "#fff", color: INK,
  fontSize: 14, fontWeight: 900, cursor: "pointer", fontFamily: "inherit",
  boxShadow: "0 4px 14px rgba(0,0,0,.22)",
};
const heroGhost = {
  display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 15px",
  borderRadius: 999, border: "1.5px solid rgba(255,255,255,.85)", background: "rgba(0,0,0,.28)",
  color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
};
// La puerta pequeña: publicar sin foto sigue estando, pero deja de competir
// con "haz una foto". Sin ella la fila se queda muerta un martes; con ella al
// mismo tamaño, nadie llega a hacer la foto nunca.
// Los mandos van SOBRE la foto: cristal oscuro para que se lean igual sobre un
// plato claro y sobre uno oscuro, que es lo único que tienen que garantizar.
const overClose = {
  width: 34, height: 34, borderRadius: 999, border: "none",
  background: "rgba(15,25,19,.58)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
  display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer", flexShrink: 0, fontFamily: "inherit", padding: 0,
  position: "absolute", top: 10, left: 10,
};
const overLeft = { position: "absolute", top: 10, left: 10, display: "flex", gap: 7 };
const overPublish = {
  position: "absolute", top: 10, right: 10, padding: "9px 18px", borderRadius: 999,
  border: "none", background: GREEN, color: "#fff", fontSize: 13.5, fontWeight: 900,
  cursor: "pointer", fontFamily: "inherit", boxShadow: "0 2px 10px rgba(0,0,0,.28)",
};
const stickerChip = {
  position: "absolute", padding: "9px 14px", borderRadius: 999, border: "none",
  background: "rgba(255,255,255,.94)", color: INK, cursor: "grab",
  fontSize: 13.5, fontWeight: 900, fontFamily: "inherit", touchAction: "none",
  boxShadow: "0 3px 12px rgba(0,0,0,.22)",
  maxWidth: "80%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
};
const placingHint = {
  position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
  padding: "7px 14px", borderRadius: 999, background: "rgba(24,62,39,.82)",
  color: "#fff", fontSize: 12, fontWeight: 800, pointerEvents: "none", whiteSpace: "nowrap",
};
const linkBar = { position: "absolute", left: 10, right: 10, bottom: 10 };
const linkChip = {
  display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 10px",
  borderRadius: 16, border: "none", background: "rgba(24,62,39,.74)",
  backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
  cursor: "pointer", fontFamily: "inherit",
};
const linkThumb = { width: 42, height: 42, borderRadius: 12, objectFit: "cover", flexShrink: 0 };
const linkName = {
  display: "block", fontSize: 13.5, fontWeight: 900, color: "#fff",
  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
};
const linkMeta = {
  display: "block", fontSize: 10.5, fontWeight: 600, color: "rgba(255,255,255,.78)", marginTop: 2,
  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
};
const noteTool = {
  display: "flex", alignItems: "center", gap: 2, flexShrink: 0, height: 40,
  padding: "0 9px", borderRadius: 999, border: "1px solid", background: "#fff",
  cursor: "pointer", fontFamily: "inherit",
};
const colorDot = {
  width: 34, height: 34, borderRadius: 999, border: "none", padding: 0,
  cursor: "pointer", flexShrink: 0, outlineOffset: 2,
};
// Los dos paneles cuelgan DEBAJO de la fila, no a su lado: en 420px cualquier
// cosa que compita por el ancho con el campo de escribir lo estrangula.
// Cinco por fila, dos filas: en una sola tira los diez colores quedaban
// diminutos y era imposible acertar con el dedo.
const colorGrid = { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, justifyItems: "center" };
const dropdown = {
  display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10, padding: 12,
  borderRadius: 16, border: "1px solid #dbe3de", background: "#f7faf8",
};
const premadeChip = {
  flexShrink: 0, padding: "9px 14px", borderRadius: 999, border: "none",
  fontSize: 12.5, fontWeight: 900, cursor: "pointer", fontFamily: "inherit",
  boxShadow: "0 2px 8px rgba(0,0,0,.12)", whiteSpace: "nowrap",
};
const noteRow = { display: "flex", alignItems: "center", gap: 8, marginTop: 14 };
const noteWrap = {
  display: "flex", alignItems: "center", gap: 4, flex: 1, minWidth: 0,
  padding: 5, borderRadius: 999, background: "#eef2f0",
};
const stickerKill = {
  position: "absolute", top: -7, right: -7, width: 20, height: 20, borderRadius: 999,
  border: "2px solid #fff", background: "#c0392b", display: "flex",
  alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0,
};
const eatersRow = { display: "flex", alignItems: "center", gap: 9, marginTop: 16, flexWrap: "wrap" };
const eaterFace = {
  border: "none", background: "none", padding: 0, cursor: "pointer",
  transition: "opacity .15s ease", fontFamily: "inherit", lineHeight: 0,
};
const eaterAdd = {
  width: 38, height: 38, borderRadius: 999, border: "1.5px dashed #cfd9d4",
  background: "none", display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer", flexShrink: 0, fontFamily: "inherit",
};
const folderCount = {
  position: "absolute", bottom: 6, left: 6, padding: "2px 8px", borderRadius: 999,
  background: "rgba(255,255,255,.92)", color: GREEN, fontSize: 12.5, fontWeight: 900,
  lineHeight: 1.5, boxShadow: "0 1px 3px rgba(0,0,0,.18)",
};
const folderLabelStyle = {
  fontSize: 12, fontWeight: 800, color: INK, lineHeight: 1.25, minWidth: 0,
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};
const noteInput = {
  flex: 1, minWidth: 0, border: "none", outline: "none", background: "none",
  fontSize: 13.5, fontWeight: 600, color: INK, fontFamily: "inherit", paddingLeft: 9,
};
const noteAdd = {
  flexShrink: 0, padding: "8px 13px", borderRadius: 999, border: "none",
  background: GREEN, color: "#fff", fontSize: 13, fontWeight: 900,
  cursor: "pointer", fontFamily: "inherit",
};

const sheet = {
  width: "100%", maxWidth: 420, maxHeight: "92dvh", overflowY: "auto",
  background: "#fff", borderRadius: "22px 22px 0 0",
  padding: `16px 16px ${NAV_CLEARANCE}`,
  boxSizing: "border-box", animation: "mp-sheet-up .22s cubic-bezier(.2,.8,.3,1)",
};
const primaryBtn = {
  marginTop: 20, width: "100%", padding: "14px 0", borderRadius: 16, border: "none",
  background: GREEN, color: "#fff", fontSize: 14.5, fontWeight: 900,
  cursor: "pointer", fontFamily: "inherit",
};
const pickList = { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 7 };
const tile = {
  position: "relative", aspectRatio: "1 / 1", borderRadius: 13, overflow: "hidden",
  border: "none", padding: 0, background: "#eef2f0", cursor: "pointer", fontFamily: "inherit",
};
const tileImg = { width: "100%", height: "100%", objectFit: "cover", display: "block" };
const tileName = {
  position: "absolute", left: 0, right: 0, bottom: 0, padding: "16px 6px 6px",
  background: "linear-gradient(to top, rgba(10,20,14,.86), rgba(10,20,14,0))",
  color: "#fff", fontSize: 10, fontWeight: 800, lineHeight: 1.15, textAlign: "left",
  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
};
const groupLabel = { margin: "18px 0 10px", fontSize: 12, fontWeight: 800, color: INK_SOFT };
const faceGrid = { display: "flex", gap: 13, flexWrap: "wrap" };
const faceBtn = {
  display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 62,
  border: "none", background: "none", padding: 0, cursor: "pointer",
  transition: "opacity .15s ease", fontFamily: "inherit",
};
const faceCheck = {
  position: "absolute", right: -2, bottom: -2, width: 19, height: 19, borderRadius: 999,
  background: GREEN, border: "2.5px solid #fff", display: "flex", alignItems: "center", justifyContent: "center",
};
const faceName = {
  fontSize: 11, fontWeight: 700, color: INK, maxWidth: 62,
  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
};
const mutedCopy = { margin: 0, fontSize: 12.5, fontWeight: 600, color: INK_SOFT, lineHeight: 1.5 };
const searchWrap = {
  display: "flex", alignItems: "center", gap: 9, marginTop: 14, padding: "12px 14px",
  background: "#eef2f0", borderRadius: 999,
};
const searchInput = {
  flex: 1, minWidth: 0, border: "none", outline: "none", background: "none",
  fontSize: 14.5, fontWeight: 600, color: INK, fontFamily: "inherit",
};
const pickRow = {
  display: "flex", alignItems: "center", gap: 11, padding: 9, background: "#fff",
  border: "1px solid #dbe3de", borderRadius: 15, cursor: "pointer", fontFamily: "inherit",
};
