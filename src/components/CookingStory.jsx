import { useCallback, useEffect, useRef, useState } from "react";
import { X, ChefHat, ChevronRight, MessageSquarePlus, ArrowLeftRight } from "./icons.jsx";
import { Avatar } from "./ui.jsx";
import { sealText, sealPos, sealColor } from "../lib/cookings.js";
import { relativeTime } from "../lib/socialUi.js";
import { dishImageForRecipe } from "../assets/dishes/dishImages.js";
import { deckImg } from "../lib/dishPhotoOptimize.js";
import { recipeCatalogById } from "../data/recipeCatalog.js";

const INK = "#142f1d";
const INK_SOFT = "#5a7066";
const GREEN = "#2d5a3d";

/**
 * El visor de cocinadas: a pantalla completa, como una historia.
 *
 * Aquí el anillo por fin es honesto. La fila llevaba prestado el anillo de
 * Instagram para enseñar menús que ni caducaban ni eran visuales — el propio
 * código lo confesaba ("se parece a las historias y no lo es"). Una cocinada
 * sí es diaria, sí es foto y sí caduca a las 48 h. Y caducar no cuesta nada:
 * lo efímero es el evento, la foto se queda en la historia de la receta.
 *
 * ── LA REGLA INNEGOCIABLE ──────────────────────────────────────────────
 * La chapa del vínculo vive en una ZONA SEGURA que ningún adorno puede tapar.
 * Es lo único que separa esto de un álbum de fotos: mientras esa chapa esté
 * ahí, cada foto del feed es una puerta a algo que te puedes copiar a tu
 * semana. Los adornos van dentro del escenario; la chapa vive fuera, en su
 * propia franja, siempre.
 *
 * ── Y AQUÍ VIVE LO QUE NO PUEDE COPIARNOS NADIE ────────────────────────
 * El comparador. Tenemos la foto OFICIAL del mismo plato —la del catálogo— y
 * la foto REAL de una cocina de verdad a las nueve y media de la noche.
 * Arrastras y ves las dos: "así se supone" contra "así te quedó".
 *
 * Instagram no puede hacer esto: allí dos fotos de lentejas no saben que son
 * la misma cosa. Aquí sí, porque debajo de cada foto hay una receta — y por
 * eso el comparador no es un filtro más, es la consecuencia de la única regla
 * dura del producto.
 *
 * Solo aparece si existen LAS DOS fotos. Con un borrador no hay foto oficial
 * contra la que medirse, y sin foto propia no hay nada que comparar: en esos
 * casos ni se insinúa, porque un control que no hace nada es peor que no
 * tenerlo.
 */
export function CookingStory({ group, profile, onClose, onOpenRecipe, onAskRecipe }) {
  const [idx, setIdx] = useState(0);
  // 0 = solo tu foto. Al arrastrar a la derecha asoma la del catálogo.
  const [wipe, setWipe] = useState(0);
  const wipeRef = useRef(false);
  const stageRef = useRef(null);
  const items = group?.items ?? [];
  const c = items[idx];

  /**
   * Cambiar de cocinada devuelve el comparador a cero. Va aqui y no en un
   * efecto sobre `idx`: si se quedara a medias, la siguiente foto se abriria
   * partida por la mitad sin que nadie lo haya pedido.
   */
  const goTo = useCallback((next) => {
    setIdx(next);
    setWipe(0);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
      if (e.key === "ArrowRight") setIdx((i) => { setWipe(0); return Math.min(i + 1, items.length - 1); });
      if (e.key === "ArrowLeft") setIdx((i) => { setWipe(0); return Math.max(i - 1, 0); });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items.length, onClose]);

  if (!c) return null;

  const catalog = dishImageForRecipe(recipeCatalogById[c.recipeId] ?? { id: c.recipeId });
  const catalogSrc = c.draft || !catalog ? null : deckImg(catalog, 900);
  // Sin foto propia se cae al cartel del catálogo: publicar sin foto está
  // permitido a propósito, y así la historia nunca es un hueco gris.
  const mine = c.photo ?? null;
  const base = mine ?? catalogSrc;
  const comparable = Boolean(mine && catalogSrc);

  const stickerText = sealText(c.seal);
  const stickerColor = sealColor(c.seal);
  const pos = sealPos(c.seal);
  const eaters = (c.eaters?.length ?? 0) + (c.guests?.length ?? 0);

  const moveWipe = (e) => {
    if (!wipeRef.current || !stageRef.current) return;
    const r = stageRef.current.getBoundingClientRect();
    setWipe(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)));
  };

  const advance = () => {
    if (idx < items.length - 1) goTo(idx + 1);
    else onClose?.();
  };

  return (
    <div style={backdrop}>
      <div
        ref={stageRef}
        style={stage}
        onPointerMove={moveWipe}
        onPointerUp={() => { wipeRef.current = false; }}
        onPointerLeave={() => { wipeRef.current = false; }}
      >
        {base
          ? <img src={base} alt="" style={photoStyle} className={comparable ? undefined : "mp-kenburns"} draggable={false} />
          : <div style={{ ...photoStyle, background: "#1c4a2e" }} />}

        {/* La oficial, recortada por la izquierda hasta donde llegue el
            arrastre. Va encima porque lo que se revela es la expectativa. */}
        {comparable && wipe > 0 && (
          <>
            <img
              src={catalogSrc}
              alt=""
              draggable={false}
              style={{ ...photoStyle, position: "absolute", inset: 0, clipPath: `inset(0 ${100 - wipe}% 0 0)` }}
            />
            <span style={{ ...wipeTag, left: 12, opacity: wipe > 16 ? 1 : 0 }}>Así se supone</span>
          </>
        )}
        {comparable && (
          <span style={{ ...wipeTag, right: 12, opacity: wipe < 84 ? 1 : 0 }}>Así te quedó</span>
        )}

        <div style={scrim} />

        <div style={bars}>
          {items.map((it, i) => (
            <span key={it.id} style={{ ...bar, background: i <= idx ? "#fff" : "rgba(255,255,255,.35)" }} />
          ))}
        </div>

        <div style={header}>
          <Avatar name={profile?.display_name ?? "?"} photo={profile?.avatar_url} size={34} color={GREEN} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={headerName}>{profile?.display_name ?? "Alguien"}</span>
            <span style={headerTime}>{relativeTime(c.createdAt)}</span>
          </span>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={closeBtn}>
            <X size={17} strokeWidth={2.6} color="#fff" />
          </button>
        </div>

        {/* Pasar de foto tocando los lados. Se apaga mientras hay comparador:
            con las dos cosas vivas, arrastrar para comparar acababa saltando
            a la siguiente. */}
        {!comparable && (
          <>
            <button type="button" aria-label="Anterior" onClick={() => goTo(Math.max(0, idx - 1))} style={{ ...tapZone, left: 0 }} />
            <button type="button" aria-label="Siguiente" onClick={advance} style={{ ...tapZone, right: 0 }} />
          </>
        )}

        {/* El tampón, donde lo dejó su autor. Guardar la posición es lo que
            separa "ha rellenado un campo" de "ha publicado algo suyo": dos
            personas con el mismo sello no producen la misma imagen. */}
        {stickerText && (
          <span className="mp-seal-pop" style={{ ...stickerChip, [pos.anchor === "right" ? "right" : "left"]: `${pos.x}%`, top: `${pos.y}%`, background: stickerColor.bg, color: stickerColor.fg }}>
            {stickerText}
          </span>
        )}

        {eaters > 0 && (
          <span style={eatersLine}>
            {eaters === 1 ? "Lo comió 1" : `Lo comieron ${eaters}`}
            {c.guests?.length > 0 && ` · ${c.guests.length} de fuera`}
          </span>
        )}

        {comparable && (
          <div
            role="slider"
            aria-label="Comparar con la foto del catálogo"
            aria-valuenow={Math.round(wipe)}
            aria-valuemin={0}
            aria-valuemax={100}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") setWipe((w) => Math.min(100, w + 8));
              if (e.key === "ArrowLeft") setWipe((w) => Math.max(0, w - 8));
            }}
            onPointerDown={(e) => { wipeRef.current = true; e.currentTarget.setPointerCapture(e.pointerId); }}
            style={{ ...wipeHandle, left: `${wipe}%` }}
          >
            <span style={wipeLine} />
            <span style={wipeGrip}><ArrowLeftRight size={15} strokeWidth={2.6} color={INK} /></span>
          </div>
        )}
      </div>

      {comparable && wipe === 0 && (
        <p style={compareHint}>Arrastra para ver cómo queda en el catálogo</p>
      )}

      {/* ── ZONA SEGURA. Fuera del escenario, y por eso intocable. ─────── */}
      <div style={safeZone}>
        {c.draft ? (
          <button type="button" onClick={() => onAskRecipe?.(c)} style={chipBtn}>
            <ChefHat size={17} color={GREEN} strokeWidth={2.4} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
              <span style={chipName}>{c.recipeName}</span>
              <span style={chipSub}>{profile?.display_name ?? "Aún"} no ha escrito la receta todavía</span>
            </span>
            <span style={askPill}><MessageSquarePlus size={12} strokeWidth={2.6} /> Pedírsela</span>
          </button>
        ) : (
          <button type="button" onClick={() => onOpenRecipe?.(c)} style={chipBtn}>
            <ChefHat size={17} color={GREEN} strokeWidth={2.4} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
              <span style={chipName}>{c.recipeName}</span>
              <span style={chipSub}>Ver la receta y copiarla a tu semana</span>
            </span>
            <ChevronRight size={17} color={INK_SOFT} strokeWidth={2.6} style={{ flexShrink: 0 }} />
          </button>
        )}
      </div>
    </div>
  );
}

const backdrop = {
  position: "fixed", inset: 0, zIndex: 95, background: "#121814",
  display: "flex", flexDirection: "column", alignItems: "center",
  animation: "mp-overlay-in .18s ease",
};
const stage = { position: "relative", flex: 1, width: "100%", maxWidth: 420, overflow: "hidden", touchAction: "none" };
const photoStyle = { width: "100%", height: "100%", objectFit: "cover", display: "block", userSelect: "none" };
const scrim = {
  position: "absolute", inset: 0, pointerEvents: "none",
  background: "linear-gradient(to bottom, rgba(10,20,14,.5) 0%, rgba(10,20,14,0) 24%, rgba(10,20,14,0) 60%, rgba(10,20,14,.62) 100%)",
};
const bars = { position: "absolute", top: 10, left: 12, right: 12, display: "flex", gap: 4 };
const bar = { flex: 1, height: 3, borderRadius: 999, transition: "background .2s ease" };
const header = { position: "absolute", top: 24, left: 12, right: 12, display: "flex", alignItems: "center", gap: 9 };
const headerName = { display: "block", fontSize: 13.5, fontWeight: 900, color: "#fff" };
const headerTime = { display: "block", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,.78)", marginTop: 1 };
const closeBtn = {
  width: 32, height: 32, borderRadius: 999, border: "none", background: "rgba(0,0,0,.3)",
  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
};
const tapZone = {
  position: "absolute", top: 70, bottom: 96, width: "45%", border: "none",
  background: "transparent", cursor: "pointer", padding: 0,
};

/**
 * El adhesivo: lo que escribio su autor, donde lo dejo. Pastilla blanca y no
 * tinta translucida, porque ahora el texto lo pone la gente y puede llevar
 * emoji — un emoji dentro de un tampon de tinta no se ve. Blanco sobre foto
 * con sombra se lee siempre, y es identico al del composer a proposito: si al
 * publicar cambiara de aspecto, pareceria que se ha movido.
 */
const stickerChip = {
  position: "absolute", padding: "9px 14px", borderRadius: 999,
  background: "rgba(255,255,255,.94)", color: INK, fontSize: 13.5, fontWeight: 900,
  boxShadow: "0 3px 12px rgba(0,0,0,.22)",
  maxWidth: "80%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  pointerEvents: "none",
};
const eatersLine = {
  position: "absolute", left: 16, bottom: 16, fontSize: 11.5, fontWeight: 700,
  color: "rgba(255,255,255,.92)", pointerEvents: "none",
};
const wipeTag = {
  position: "absolute", top: 68, padding: "5px 10px", borderRadius: 999,
  background: "rgba(0,0,0,.5)", color: "#fff", fontSize: 10.5, fontWeight: 800,
  letterSpacing: ".3px", pointerEvents: "none", transition: "opacity .15s ease",
};
const wipeHandle = {
  position: "absolute", top: 0, bottom: 0, width: 44, marginLeft: -22,
  display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "ew-resize", touchAction: "none",
};
const wipeLine = { position: "absolute", top: 0, bottom: 0, width: 2, background: "rgba(255,255,255,.9)" };
const wipeGrip = {
  position: "relative", width: 38, height: 38, borderRadius: 999, background: "#fff",
  display: "flex", alignItems: "center", justifyContent: "center",
  boxShadow: "0 2px 10px rgba(0,0,0,.35)",
};
const compareHint = {
  margin: 0, padding: "9px 0 0", width: "100%", maxWidth: 420, textAlign: "center",
  fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.6)",
};
const safeZone = {
  width: "100%", maxWidth: 420, padding: "10px 12px calc(12px + env(safe-area-inset-bottom))",
  boxSizing: "border-box", background: "#121814", flexShrink: 0,
};
const chipBtn = {
  display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "11px 13px",
  background: "#fff", border: "none", borderRadius: 14, cursor: "pointer", fontFamily: "inherit",
};
const chipName = {
  display: "block", fontSize: 14, fontWeight: 900, color: INK,
  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
};
const chipSub = { display: "block", fontSize: 11, fontWeight: 600, color: INK_SOFT, marginTop: 2 };
const askPill = {
  display: "inline-flex", alignItems: "center", gap: 4, padding: "7px 11px", borderRadius: 999,
  background: "#eaf3ed", color: GREEN, fontSize: 11, fontWeight: 800, flexShrink: 0,
};
