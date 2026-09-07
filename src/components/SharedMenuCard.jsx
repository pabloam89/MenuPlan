import { useMemo } from "react";
import { ChevronRight } from "./icons.jsx";
import { Avatar } from "./ui.jsx";
import { relativeTime } from "../lib/socialUi.js";
import { dishImageForRecipe } from "../assets/dishes/dishImages.js";
import { deckImg } from "../lib/dishPhotoOptimize.js";
import { recipeCatalogById } from "../data/recipeCatalog.js";

const INK = "#142f1d";
const TEAL = "#0f766e";

/**
 * La semana de alguien, como tarjeta del río.
 *
 * ── Por qué aquí y no en una pestaña ───────────────────────────────────
 * El menú es de enganche BAJO y valor ALTO, y una pestaña es un hueco de
 * impulso. Uno por persona y semana: si sigues a ocho son ocho tarjetas
 * publicadas casi todas el domingo, así que de miércoles a sábado esa pestaña
 * está igual que ayer — y una pestaña que nunca cambia te enseña a no tocarla.
 * Intercalada entre recetas, en cambio, esa misma escasez es la densidad
 * perfecta: aparece cada pocos scrolls, rompe el ritmo y no la buscas, te la
 * encuentras cuando ya estabas mirando.
 *
 * Y ya no choca con la regla vieja ("un menú no puede estar en la fila y en el
 * río a la vez"): la fila la ocupan ahora las cocinadas, así que el río está
 * libre.
 *
 * ── Su trabajo es ser PUERTA, no menú ──────────────────────────────────
 * No intenta enseñar la semana — para eso está MenuPeek, que ya sabe hacerlo
 * con días, semana y comensales. Aquí solo hay tres hechos, y los tres son
 * motivos para entrar:
 *
 *   · de quién es;
 *   · A QUÉ SE PARECE SU CASA — el que más pesa y casi nadie pone: copiarle la
 *     semana a alguien solo sirve si su casa se parece a la tuya, porque dos
 *     niños y un bebé cambian el menú entero;
 *   · qué te llevas, con un número.
 *
 * Mosaico y no tabla: una semana en texto no cabe en 420px, y sería lo único
 * del feed que hay que LEER. Además así se distingue sola del cartel de receta
 * sin necesidad de etiqueta — el cartel es UNA foto a sangre, esto son seis en
 * rejilla. La forma ya lo dice.
 */
export function SharedMenuCard({ menu, profile, myRecipeIds = [], onOpen, onPickDish }) {
  const { dishes, allDishes, members } = useMemo(() => extractCover(menu), [menu]);

  // Lo que te llevas, con número: es lo que convierte una tarjeta bonita en
  // una razón para tocar.
  //
  // Se cuenta sobre la SEMANA ENTERA, no sobre los seis del mosaico: la
  // promesa es lo que hay dentro, y el mosaico es solo una muestra. Contando
  // los seis, la portada prometía 6 y al entrar aparecían 16 — una portada que
  // se queda corta respecto a lo que hay detrás miente igual que una que se
  // pasa.
  const nuevos = allDishes.filter((d) => d.recipeId && !myRecipeIds.includes(d.recipeId));

  if (dishes.length === 0) return null;

  return (
    <article style={card}>
      <button type="button" onClick={onOpen} style={headerBtn}>
        <Avatar name={profile?.display_name ?? "?"} photo={profile?.avatar_url} size={36} color={TEAL} />
        <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
          <span style={title}>La semana de {profile?.display_name ?? "alguien"}</span>
        </span>

        {/* Las caras de la casa, arriba: de un vistazo ves a qué familia te
            asomas, y eso es lo que decide si su semana te sirve. Dicen lo
            mismo que "2 adultos · 2 niños" sin tener que leerlo. */}
        <span style={faceRow}>
          {members.slice(0, 3).map((m, i) => (
            <span key={m.id ?? i} style={{ ...facePos, marginLeft: i === 0 ? 0 : -10 }}>
              <Avatar name="" photo={m.avatar} size={30} color={TEAL} />
            </span>
          ))}
          {members.length > 3 && (
            <span style={{ ...facePos, marginLeft: -10 }}>
              <span style={faceMore}>+{members.length - 3}</span>
            </span>
          )}
        </span>
      </button>

      {/* Tocar una foto = ese plato a tu semana. Tocar la tarjeta = entrar.
          Si entrar cuesta un toque y sacar algo cuesta siete, la gente entra
          una vez y no vuelve. */}
      <div style={mosaic}>
        {dishes.slice(0, 6).map((d, i) => {
          const img = d.recipeId ? dishImageForRecipe(recipeCatalogById[d.recipeId] ?? { id: d.recipeId }) : null;
          return (
            <button
              key={`${d.recipeId ?? d.name}-${i}`}
              type="button"
              title={d.name}
              onClick={() => (d.recipeId ? onPickDish?.(d) : onOpen?.())}
              style={tile}
            >
              {img
                ? <img src={deckImg(img, 200)} alt="" loading="lazy" style={tileImg} />
                : <span style={{ ...tileImg, background: "#eef3f0", display: "block" }} />}
              <span style={tileName}>{d.name}</span>
            </button>
          );
        })}
      </div>

      {/* ── El pie: cuándo, y qué te llevas ──────────────────────────
          El número va en círculo y no en una frase para que pese lo mismo
          que las caras de arriba: son los dos datos que deciden si entras
          —a quién te pareces y cuánto te llevas—, y leerse igual de rápido
          es justo lo que hace que se comparen entre tarjetas. */}
      <button type="button" onClick={onOpen} style={footerBtn}>
        <span style={footerTime}>{relativeTime(menu.created_at)}</span>
        {nuevos.length > 0 && (
          <>
            <span style={countCircle}>+{nuevos.length}</span>
            <span style={footerCopy}>
              {nuevos.length === 1 ? "plato nuevo" : "platos nuevos"}
            </span>
          </>
        )}
        <ChevronRight size={15} strokeWidth={2.6} style={{ flexShrink: 0 }} />
      </button>

    </article>
  );
}

/**
 * Los platos de la portada y de qué casa salen.
 *
 * Dos listas, y hacen falta las dos: en el MOSAICO va uno por día (un día con
 * comida, cena y menú de bebé se comería la portada él solo), pero el número
 * de "los que no tienes" se cuenta sobre TODA la semana, que es lo que hay
 * detrás de la puerta.
 */
function extractCover(menu) {
  const days = menu?.payload?.weeks?.[0]?.days ?? [];
  const dishes = [];
  const allDishes = [];
  const vistos = new Set();
  for (const d of days) {
    const first = d.meals?.[0]?.dishes?.[0];
    if (first) dishes.push(first);
    for (const meal of d.meals ?? []) {
      for (const dish of meal.dishes ?? []) {
        if (!dish.recipeId || vistos.has(dish.recipeId)) continue;
        vistos.add(dish.recipeId);
        allDishes.push(dish);
      }
    }
  }

  const members = menu?.payload?.members ?? [];

  return { dishes, allDishes, members };
}

const card = {
  background: "#fff", border: "1px solid #e3ebe6", borderRadius: 20,
  overflow: "hidden", marginBottom: 18,
};
const headerBtn = {
  display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "13px 14px",
  background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
};
const title = { display: "block", fontSize: 14, fontWeight: 900, color: INK, letterSpacing: "-.2px" };
const mosaic = { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2, background: "#eef3f0" };
const tile = {
  position: "relative", aspectRatio: "1 / 1", border: "none", padding: 0,
  background: "#eef3f0", cursor: "pointer", overflow: "hidden", fontFamily: "inherit",
};
const tileImg = { width: "100%", height: "100%", objectFit: "cover", display: "block" };
const tileName = {
  position: "absolute", left: 0, right: 0, bottom: 0, padding: "12px 6px 5px",
  background: "linear-gradient(to top, rgba(10,30,18,.82), rgba(10,30,18,0))",
  color: "#fff", fontSize: 9.5, fontWeight: 800, lineHeight: 1.15,
  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
};
const footerBtn = {
  display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 14px",
  background: "#eef6f4", border: "none", color: TEAL,
  cursor: "pointer", fontFamily: "inherit",
};
const footerTime = { flex: 1, textAlign: "left", fontSize: 11.5, fontWeight: 700, color: "#7a9485" };
const countCircle = {
  width: 30, height: 30, borderRadius: 999, background: TEAL, color: "#fff",
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  fontSize: 12, fontWeight: 900, flexShrink: 0,
};
const footerCopy = { fontSize: 12, fontWeight: 800, color: TEAL, flexShrink: 0 };
const faceRow = { display: "flex", alignItems: "center", flexShrink: 0 };
// Se solapan 10px: una fila de caras pegadas se lee como "esta gente va
// junta", que es justo lo que una casa es.
// Se solapan 10px con el borde del color de la tarjeta: una fila de caras
// pegadas se lee como "esta gente va junta", que es lo que una casa es.
const facePos = { display: "inline-flex", borderRadius: 999, border: "2px solid #fff", lineHeight: 0 };
const faceMore = {
  width: 30, height: 30, borderRadius: 999, background: "#eef6f4", color: TEAL,
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  fontSize: 12, fontWeight: 900,
};
