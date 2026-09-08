import { useMemo, useRef, useState } from "react";
import { X, Camera, ImagePlus, Search, ChevronLeft, ChevronRight, ChevronDown, Check, Plus, Sparkles } from "./icons.jsx";
import { Avatar } from "./ui.jsx";
import { memberAvatarColor } from "../lib/stages.js";
import { SEALS, STICKER_COLORS } from "../lib/cookings.js";
import { dishImageForRecipe } from "../assets/dishes/dishImages.js";
import { deckImg } from "../lib/dishPhotoOptimize.js";
import { CatalogBrowserSheet } from "../screens/CatalogBrowserSheet.jsx";

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
  // Solo lo tuyo: alimenta la pestaña "Mis recetas" de la hoja. `searchPool`
  // no vale porque ahí van tus recetas Y el catálogo entero mezclados.
  myRecipes = [],
  recipeVotes = {},
  // Crudas, sin las carpetas fijas: la hoja de Recetas las añade ella sola
  // (allFolders), y si llegaran ya expandidas saldrían por duplicado.
  recipeFolders = [],
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
  const [note, setNote] = useState("");
  const [sticker, setSticker] = useState(null); // { text, id, x, y, anchor }
  // Lo que llevas en la mano, y por dónde va el dedo.
  const [placing, setPlacing] = useState(null);
  const [ghost, setGhost] = useState(null);
  // Teal por defecto: es el color de la casa y funciona sobre casi
  // cualquier foto de comida.
  const [color, setColor] = useState("teal");
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
   * Lo tuyo, con los platos de HOY delante.
   *
   * La barra propone el primer plato del día; el segundo tiene que seguir
   * estando a mano, porque "hoy tenía dos cosas y he cocinado la otra" es el
   * caso corriente. Al entrar por "Mis recetas" salen los primeros, así que
   * sigue siendo un toque sin haber inventado una lista aparte.
   */
  const mineWithToday = useMemo(() => {
    const byId = new Map(searchPool.map((r) => [r.id, r]));
    const hoy = todayDishes.map((d) => d.recipe ?? byId.get(d.recipeId)).filter(Boolean);
    const seen = new Set(hoy.map((r) => r.id));
    return [...hoy, ...myRecipes.filter((r) => !seen.has(r.id))];
  }, [todayDishes, myRecipes, searchPool]);

  // Los ya marcados primero (sort estable), y tope de seis.
  const shownFriends = useMemo(
    () => [...friends]
      .sort((a, b) => Number(guests.includes(b.id)) - Number(guests.includes(a.id)))
      .slice(0, 6),
    [friends, guests],
  );

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
  };

  // ── El recetario: LA hoja de Recetas, no una copia ───────────────────
  // Aquí vivía un recetario propio: buscador, tus carpetas y poco más. El
  // catálogo entero solo aparecía si acertabas a escribir el nombre — no había
  // forma de mirar qué hay. Y al ser una segunda implementación, se quedaba
  // atrás cada vez que Recetas avanzaba: dos recetarios que envejecían por
  // separado.
  //
  // Ahora se monta la misma hoja: las categorías, los filtros, las pestañas de
  // Mis recetas / Catálogo y las carpetas, idénticas a como las conoces. Lo
  // único que se añade es «X» es mía, que la hoja no traía y aquí es la salida
  // para lo que no está en el catálogo.
  if (view === "pick") {
    return (
      <CatalogBrowserSheet
        gatePick
        gatePickSourceTabs
        gatePickType="plato"
        selectedPlatoId={link?.recipeId ?? null}
        onPickPlato={(id) => {
          // `null` es la X del chip (y volver a tocar la tarjeta ya elegida):
          // significa "quita la vinculación", no "no hagas nada". El guard de
          // antes se lo tragaba, así que la X no despegaba el plato propuesto
          // y no había forma de volver a "¿Qué has cocinado?".
          if (id === null) { setLink(null); return; }
          const r = searchPool.find((x) => x.id === id);
          if (r) pickRecipe(r);
        }}
        onCreateDraft={(name) => {
          setLink({ recipeId: `draft_${Date.now().toString(36)}`, name, draft: true });
          setView(null);
        }}
        extraRecipes={mineWithToday}
        recipeVotes={recipeVotes}
        recipeCollections={collections}
        recipeFolders={recipeFolders}
        onClose={() => setView(null)}
      />
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
              de hoy encabezan "Mis recetas" en la hoja que se abre. */}
          <div className="mp-rise" style={linkBar}>
            <button type="button" onClick={() => { setView("pick"); }} style={linkChip}>
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

        {/* ── Con quién: tus amigos, las caras ─────────────────────────
            Aquí vivía tu casa. Pero esto es una historia en Gente, y en Gente
            lo que se señala es a quién etiquetas: tu familia ya se da por
            supuesta —viene marcada entera— y cambiarla es lo raro, no lo
            común. Así que la fila la ocupan los amigos, cada uno con SU foto,
            y quien no la tenga cae a sus iniciales sobre su propio color (el
            verde para todos hacía que las caras sin foto fueran la misma
            mancha repetida).

            Los ya marcados se ordenan primero, para que elegir a alguien desde
            la hoja se vea aquí aunque esté más allá del sexto. La casa sigue
            editándose en la hoja, detrás del "+". */}
        <div className="mp-rise" style={{ ...eatersRow, "--d": ".12s" }}>
          {shownFriends.map((f) => {
            const on = guests.includes(f.id);
            const name = f.display_name ?? f.username ?? "?";
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={on}
                aria-label={name}
                title={name}
                onClick={() => setGuests((p2) => (p2.includes(f.id) ? p2.filter((x) => x !== f.id) : [...p2, f.id]))}
                style={{ ...eaterFace, opacity: on ? 1 : .3 }}
              >
                <Avatar name={name} photo={f.avatar_url} size={38} color={memberAvatarColor(f.id, friends)} />
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setView("guests")}
            aria-label="Quién comió"
            style={eaterAdd}
          >
            <Plus size={16} strokeWidth={2.6} color={INK_SOFT} />
          </button>
        </div>
      </div>
    </div>
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
