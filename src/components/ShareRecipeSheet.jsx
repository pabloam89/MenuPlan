import { useState } from "react";
import { X, CookingPot, Users2, Globe, Check, Share2 } from "lucide-react";
import { dishImageForRecipe } from "../assets/dishes/dishImages.js";
import { deckImg } from "../lib/dishPhotoOptimize.js";

const GREEN = "#2d5a3d";
const INK = "#142f1d";
const TEAL = "#0f766e";

/**
 * Publicar una receta tuya en el Feed.
 *
 * Enseña SOLO las que siguen en privado: las ya publicadas ya están en el
 * feed, y volver a listarlas aquí convertiría "publica una" en "gestiona
 * todas" — para eso está la pestaña Recetas del perfil.
 *
 * Publicar una receta = cambiarle la visibilidad. No hay tabla nueva ni
 * copia: es el mismo interruptor private/friends/public que la receta ya
 * tiene desde 0003, con una puerta más cómoda.
 */
export function ShareRecipeSheet({ recipes = [], signedIn = true, sharing = false, onPublish, onClose }) {
  const [pickedId, setPickedId] = useState(null);
  const [visibility, setVisibility] = useState("public");

  return (
    <div style={overlay} onClick={onClose}>
      <div style={sheet} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <CookingPot size={16} strokeWidth={2.5} color={TEAL} />
          <h2 style={{ margin: 0, flex: 1, fontSize: 15, fontWeight: 900, color: INK }}>Publicar una receta</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={closeBtn}>
            <X size={15} strokeWidth={2.6} />
          </button>
        </div>

        {!signedIn ? (
          <p style={emptyCopy}>
            Inicia sesión para publicar tus recetas: lo publicado vive en la
            nube, y sin cuenta no hay dónde ponerlo.
          </p>
        ) : recipes.length === 0 ? (
          <p style={emptyCopy}>
            Todas tus recetas están ya publicadas — o todavía no has creado ninguna.
            Crea una desde Recetas y la podrás compartir aquí.
          </p>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12, maxHeight: 260, overflowY: "auto" }}>
              {recipes.map((r) => {
                const on = pickedId === r.id;
                const img = dishImageForRecipe(r);
                return (
                  <button
                    key={r.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setPickedId(on ? null : r.id)}
                    style={{ ...recipeRow, borderColor: on ? TEAL : "#e0eae3", background: on ? "#eef6f4" : "#fff" }}
                  >
                    {img
                      ? <img src={deckImg(img, 160)} alt="" loading="lazy" style={thumb} />
                      : <span style={{ ...thumb, background: "#eef3f0" }} />}
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 800, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.name}
                    </span>
                    {on && <Check size={15} color={TEAL} strokeWidth={3} style={{ flexShrink: 0 }} />}
                  </button>
                );
              })}
            </div>

            {/* Para quién. "Amigos" es el 'friends' de siempre: seguimiento
                MUTUO, no basta con que te sigan. */}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <VisBox on={visibility === "friends"} Icon={Users2} title="Amigos" desc="Solo con seguimiento mutuo" onClick={() => setVisibility("friends")} />
              <VisBox on={visibility === "public"} Icon={Globe} title="Cualquiera" desc="Todo el mundo la ve" onClick={() => setVisibility("public")} />
            </div>

            <button
              type="button"
              disabled={!pickedId || sharing}
              onClick={() => onPublish?.(pickedId, visibility)}
              style={{ ...publishBtn, opacity: pickedId ? 1 : .5 }}
            >
              <Share2 size={14} strokeWidth={2.6} /> Publicar en el feed
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function VisBox({ on, Icon, title, desc, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      style={{ ...visBox, borderColor: on ? TEAL : "#e0eae3", background: on ? "#eef6f4" : "#fff" }}>
      <Icon size={16} strokeWidth={2.4} color={on ? TEAL : "#8aa294"} />
      <span style={{ fontSize: 12.5, fontWeight: 800, color: INK, marginTop: 4 }}>{title}</span>
      <span style={{ fontSize: 10.5, fontWeight: 600, color: "#6b7d70", marginTop: 1, lineHeight: 1.3 }}>{desc}</span>
    </button>
  );
}

const overlay = {
  position: "fixed", inset: 0, zIndex: 310,
  background: "rgba(20,47,29,.45)", backdropFilter: "blur(2px)",
  display: "flex", alignItems: "flex-end", justifyContent: "center",
};

const sheet = {
  width: "100%", maxWidth: 380, background: "#fff",
  borderRadius: "20px 20px 0 0", padding: "16px 18px",
  paddingBottom: "calc(18px + env(safe-area-inset-bottom))",
  boxSizing: "border-box",
};

const emptyCopy = { margin: "16px 0 6px", fontSize: 12.5, fontWeight: 600, color: "#6b7d70", lineHeight: 1.45 };

const closeBtn = {
  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  width: 30, height: 30, borderRadius: 10,
  border: "1.5px solid #d5e6da", background: "#fff", color: GREEN, cursor: "pointer",
};

const recipeRow = {
  display: "flex", alignItems: "center", gap: 10, width: "100%",
  padding: "8px 10px", borderRadius: 12, border: "2px solid #e0eae3",
  cursor: "pointer", fontFamily: "inherit", textAlign: "left",
};

const thumb = { width: 38, height: 38, borderRadius: 10, objectFit: "cover", flexShrink: 0, display: "block" };

const visBox = {
  flex: 1, display: "flex", flexDirection: "column", alignItems: "flex-start",
  padding: "10px 11px", borderRadius: 13, border: "2px solid #e0eae3",
  cursor: "pointer", fontFamily: "inherit", textAlign: "left",
};

const publishBtn = {
  display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
  width: "100%", marginTop: 12, padding: "12px", borderRadius: 12, border: "none",
  background: GREEN, color: "#fff", fontSize: 13.5, fontWeight: 800,
  cursor: "pointer", fontFamily: "inherit",
};
