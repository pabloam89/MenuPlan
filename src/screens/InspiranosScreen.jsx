import { useEffect, useRef, useState } from "react";
import { CalendarDays, Sparkles, Zap, Baby, Heart, Ban, Meh, Check, ChevronLeft } from "lucide-react";
import { BottomNav, bottomNavSpacer, SegmentedControl } from "../components/ui.jsx";
import { SwipeCard, ActionButton } from "../components/SwipeCard.jsx";
import { FolderPickerSheet } from "./CatalogBrowserSheet.jsx";
import { allFolders } from "../lib/recipeCollections.js";
import { buildInspireDeck, eligibleCatalogPool, intentsForRecipe, promoteSocial, spliceUpcoming } from "../utils/recipeIntents.js";
import { loadSocialRecipes, hideRecipe } from "../lib/social.js";

const GREEN = "#2d5a3d";
const INK = "#142f1d";
// Shared title-band tint across En casa / Menú / Recetas / Compra.
const HEADER_BAND = "#e9f4ed";

// Arranca en "día a día", el caso normal. Se cambia solo con el segmented
// control: el eje vertical de la carta es "ni fu ni fa", no navegación.
// `label` va abreviado porque son 4 segmentos en 420px; el nombre largo se usa
// donde hay sitio (mensajes, toast).
const INTENTS = [
  { id: "dia_a_dia", label: "Día a día", long: "Día a día", Icon: CalendarDays },
  { id: "ocasion_especial", label: "Especial", long: "Ocasión especial", Icon: Sparkles },
  { id: "cena_rapida", label: "Rápida", long: "Cena rápida", Icon: Zap },
  { id: "hijos", label: "Peques", long: "Para mis hijos", Icon: Baby },
];

/**
 * Inspíranos: descubrir recetas a base de swipes, sin buscar nada.
 *
 * Entra directo al mazo (sin pantalla previa de "qué quieres") y el tipo de
 * plato se cambia con el segmented control de arriba.
 *
 * Tres salidas, para que "no me interesa" y "no me disgusta, pero tampoco"
 * dejen de ser lo mismo:
 *   ♥  derecha → archiva en la carpeta de la categoría y marca favorita, que
 *                es la señal que el generador ya sabe leer.
 *   🚫 izquierda → no me gusta: descarte permanente (reversible desde la
 *                carpeta Descartados).
 *   😐 abajo   → ni fu ni fa: enfría 14 días, así que puede reaparecer.
 */
export function InspiranosScreen({
  data, user = null, onLike, onDiscard, onNav, onOpenRecipe, onOpenRecipes,
  recipeCollections = {}, recipeFolders = [], onCreateFolder, onSetRecipeFolders,
}) {
  const [intentIdx, setIntentIdx] = useState(0);
  const [index, setIndex] = useState(0);
  const [likedIds, setLikedIds] = useState([]);
  const [justLiked, setJustLiked] = useState(null);
  // Receta cuyo selector de carpetas está abierto (mantener pulsado el ♥, o
  // "Cambiar" en el aviso de guardado).
  const [folderPickerFor, setFolderPickerFor] = useState(null);
  const cardRef = useRef(null);

  const intent = INTENTS[intentIdx];
  const dataRef = useRef(data);
  dataRef.current = data;

  // El mazo NO se deriva en el render. Barajar usa Math.random, así que como
  // useMemo la función se recalculaba en el doble render de StrictMode y salían
  // dos barajas distintas: se pintaba una carta y el handler del botón operaba
  // sobre otra (un "no me gusta" descartaba una receta que no estabas viendo).
  // Vive en estado y solo se rehace al cambiar de categoría — que además es lo
  // que queremos: descartar o guardar cambia `data`, y no debe reordenar las
  // cartas que aún no has visto.
  // Recetas públicas de otra gente. El mazo es el único sitio de la app donde
  // se hace swipe de platos, así que aquí se mezcla catálogo y gente: cuando
  // eliges plato, de dónde salga es lo de menos. El Feed va de personas.
  // Entran por `extraRecipes`, o sea por las MISMAS reglas duras que el
  // catálogo — alergias incluidas.
  const socialRef = useRef([]);
  const buildDeck = (intentId) =>
    promoteSocial(
      buildInspireDeck(
        eligibleCatalogPool(dataRef.current ?? {}, { extraRecipes: socialRef.current }),
        [intentId],
      ),
      socialRef.current,
    );
  const [deck, setDeck] = useState(() => buildDeck(INTENTS[0].id));

  // Llegan después que el mazo (una petición de red). No se rebaraja: eso
  // cambiaría la carta que tienes delante a mitad de decisión. Se intercalan
  // en las siguientes, que además es donde se van a ver.
  useEffect(() => {
    let alive = true;
    loadSocialRecipes({ excludeOwnerId: user?.id }).then((rows) => {
      if (!alive || rows.length === 0) return;
      socialRef.current = rows;
      const socialIds = new Set(rows.map((r) => r.id));
      const pool = eligibleCatalogPool(dataRef.current ?? {}, { extraRecipes: rows });
      const cards = buildInspireDeck(pool.filter((r) => socialIds.has(r.id)), [intent.id]);
      if (cards.length === 0) return;
      setDeck((prev) => spliceUpcoming(prev, index + 1, cards));
    });
    return () => { alive = false; };
    // Solo al montar y al cambiar de usuario: el cambio de categoría ya
    // reconstruye el mazo entero con `socialRef` dentro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const pickIntent = (id) => {
    const idx = INTENTS.findIndex((i) => i.id === id);
    if (idx < 0 || idx === intentIdx) return;
    setIntentIdx(idx);
    setDeck(buildDeck(id));
    setIndex(0);
  };

  const current = deck[index] ?? null;

  const handleSwipe = (dir) => {
    const recipe = deck[index];
    if (recipe) {
      if (dir === "like") {
        onLike?.(recipe.id, intentsForRecipe(recipe, [intent.id]));
        setLikedIds((prev) => (prev.includes(recipe.id) ? prev : [...prev, recipe.id]));
        setJustLiked(recipe);
      } else if (recipe.ownerId) {
        // Receta de OTRA persona: no está en tu biblioteca, así que no hay
        // nada que mandar a Descartados — esa carpeta es de lo tuyo. Solo se
        // apunta "no me la vuelvas a enseñar", en el Feed y aquí.
        hideRecipe(recipe.id);
      } else {
        // Del catálogo: "no" descarta para siempre y "meh" la enfría 14 días.
        // Las dos acaban en Descartados, de donde se recuperan.
        onDiscard?.(recipe.id, dir);
      }
    }
    setIndex((i) => i + 1);
  };

  // El aviso de "guardada" se va solo: es confirmación, no algo que atender.
  // Mientras está, ofrece "Cambiar" por si esa receta va además en una carpeta
  // propia — así el swipe no se frena para preguntar y aun así hay salida.
  useEffect(() => {
    if (!justLiked) return;
    const t = setTimeout(() => setJustLiked(null), 3200);
    return () => clearTimeout(t);
  }, [justLiked]);

  // Mantener pulsado el ♥ abre el selector en vez de guardar directo. Mismo
  // umbral que el long-press del menú (420ms), para que el gesto se sienta
  // igual en toda la app.
  const longPress = useRef({ timer: null, fired: false });
  const canPickFolders = Boolean(onSetRecipeFolders);
  const startLongPress = () => {
    if (!canPickFolders || !current) return;
    longPress.current.fired = false;
    longPress.current.timer = setTimeout(() => {
      longPress.current.fired = true;
      setFolderPickerFor(current);
    }, 420);
  };
  const endLongPress = () => {
    clearTimeout(longPress.current.timer);
  };
  const handleLikeClick = () => {
    // El click llega también tras un long-press; si ya abrió el selector, no
    // se guarda por duplicado.
    if (longPress.current.fired) { longPress.current.fired = false; return; }
    cardRef.current?.swipe("like");
  };

  return (
    <div style={{ minHeight: "100dvh", background: "#fff", display: "flex", flexDirection: "column" }}>
      <div style={{ background: HEADER_BAND }}>
        <div
          style={{
            padding: "20px 18px 14px",
            maxWidth: 420, margin: "0 auto", width: "100%", boxSizing: "border-box",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
              {/* Inspírate cuelga de Recetas (ya no es pestaña del nav), así
                  que necesita su propia salida. */}
              <button
                type="button"
                onClick={onOpenRecipes}
                aria-label="Volver a Recetas"
                style={{
                  width: 36, height: 36, borderRadius: 11, flexShrink: 0,
                  border: "1.5px solid #d5e6da", background: "#fff", color: GREEN,
                  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                }}
              >
                <ChevronLeft size={18} strokeWidth={2.6} />
              </button>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: INK, letterSpacing: "-.3px" }}>
                Inspírate
              </h1>
            </div>
            {likedIds.length > 0 && (
              <button type="button" onClick={onOpenRecipes} style={countPill}>
                <Heart size={12} fill={GREEN} color={GREEN} /> {likedIds.length}
              </button>
            )}
          </div>

          <SegmentedControl
            options={INTENTS.map(({ id, label, Icon }) => ({ id, label, Icon }))}
            value={intent.id}
            onChange={pickIntent}
            style={{ marginTop: 14, background: "#dcebe1" }}
          />
        </div>
      </div>

      <div
        style={{
          flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
          padding: "14px 18px 0", maxWidth: 420, margin: "0 auto", width: "100%", boxSizing: "border-box",
          paddingBottom: bottomNavSpacer(),
        }}
      >
        {/* overflow hidden: la carta sale volando a ±700px y sin recortar
            asoma una barra de scroll horizontal durante la animación. */}
        <div style={{ position: "relative", flex: 1, minHeight: 240, overflow: "hidden" }}>
          {current ? (
            <SwipeCard
              key={`${intent.id}-${current.id}`}
              ref={cardRef}
              recipe={current}
              onSwipe={handleSwipe}
              onInfo={onOpenRecipe ? () => onOpenRecipe(current) : undefined}
            />
          ) : (
            <div
              style={{
                position: "absolute", inset: 0, display: "grid", placeItems: "center",
                borderRadius: 20, border: "1.5px dashed #cfe0d6", color: "#42594c",
                fontSize: 13, fontWeight: 600, textAlign: "center", padding: 24, lineHeight: 1.5,
              }}
            >
              Ya has visto todo lo de «{intent.long}».
              <br />
              Cambia de tipo de plato arriba para seguir.
            </div>
          )}

          {justLiked && (
            <div role="status" style={savedToast}>
              <Check size={13} strokeWidth={3} /> Guardada en «{intent.long}»
              {canPickFolders && (
                <button
                  type="button"
                  onClick={() => { setFolderPickerFor(justLiked); setJustLiked(null); }}
                  style={{
                    marginLeft: 4, padding: "3px 9px", borderRadius: 999,
                    border: "1px solid rgba(255,255,255,.5)", background: "transparent",
                    color: "#fff", fontSize: 11.5, fontWeight: 800, fontFamily: "inherit",
                    cursor: "pointer", pointerEvents: "auto",
                  }}
                >
                  Cambiar
                </button>
              )}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 22, padding: "20px 0 6px" }}>
          <ActionButton
            label="No me gusta"
            color="#c0392b"
            disabled={!current}
            onClick={() => cardRef.current?.swipe("no")}
          >
            <Ban size={24} strokeWidth={2.6} />
          </ActionButton>
          <ActionButton
            label="Ni fu ni fa"
            color="#a97a1f"
            size={52}
            disabled={!current}
            onClick={() => cardRef.current?.swipe("meh")}
          >
            <Meh size={22} strokeWidth={2.4} />
          </ActionButton>
          <ActionButton
            label={canPickFolders ? "Me gusta (mantén pulsado para elegir carpeta)" : "Me gusta"}
            color={GREEN}
            disabled={!current}
            onClick={handleLikeClick}
            onPointerDown={startLongPress}
            onPointerUp={endLongPress}
            onPointerLeave={endLongPress}
            onPointerCancel={endLongPress}
          >
            <Heart size={23} strokeWidth={2.6} />
          </ActionButton>
        </div>
      </div>

      {folderPickerFor && (
        <FolderPickerSheet
          recipe={folderPickerFor}
          folders={allFolders(recipeFolders)}
          current={recipeCollections[folderPickerFor.id] ?? intentsForRecipe(folderPickerFor, [intent.id])}
          onSave={(ids) => {
            onSetRecipeFolders?.(folderPickerFor.id, ids);
            // Elegir carpeta cuenta como like: marca favorita y avanza, salvo
            // que la carta ya se hubiera pasado (venías del aviso "Cambiar").
            if (current && folderPickerFor.id === current.id) {
              onLike?.(folderPickerFor.id, ids);
              setLikedIds((prev) => (prev.includes(folderPickerFor.id) ? prev : [...prev, folderPickerFor.id]));
              setIndex((i) => i + 1);
            }
          }}
          onCreateFolder={onCreateFolder}
          onClose={() => setFolderPickerFor(null)}
        />
      )}

      <BottomNav active="feed" onNav={onNav} />
    </div>
  );
}


const countPill = {
  display: "inline-flex", alignItems: "center", gap: 5,
  padding: "6px 11px", borderRadius: 999,
  border: `1.5px solid ${GREEN}44`, background: "#fff", color: GREEN,
  fontSize: 12.5, fontWeight: 800, fontFamily: "inherit", cursor: "pointer",
};

// Arriba, bajo los badges de dificultad/tiempo: abajo tapaba el nombre del
// plato, que es justo lo que el usuario está mirando al decidir.
const savedToast = {
  position: "absolute", left: "50%", top: 48, transform: "translateX(-50%)",
  display: "flex", alignItems: "center", gap: 6,
  padding: "8px 14px", borderRadius: 999,
  background: "rgba(20,47,29,.92)", color: "#fff",
  fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap",
  pointerEvents: "none",
};
