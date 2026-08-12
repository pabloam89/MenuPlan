import { useState } from "react";
import { ThumbsUp, ThumbsDown, Utensils } from "lucide-react";

// Small MenuPlan logo mark used instead of a user avatar for catalog dishes.
export function MenuPlanBadge({ size = 26 }) {
  return (
    <div
      style={{
        width: size, height: size, borderRadius: size >= 24 ? 8 : 6, background: "#2d5a3d",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}
    >
      <Utensils size={Math.round(size * 0.5)} color="#fff" strokeWidth={2.2} />
    </div>
  );
}

/**
 * Accumulated like/dislike counts. Read-only by default; when `onVote` is
 * given, each count doubles as the button to cast that rating (optimistically
 * bumping the number while the user's own vote is active) — this is the
 * *only* way to like/dislike a recipe, distinct from favoriting.
 */
export function RecipeVoteCounts({ up, down, userVote, onVote, justify = "flex-start", textSize = 9.5, iconSize = 10 }) {
  const interactive = Boolean(onVote);
  const upActive = userVote === "up";
  const downActive = userVote === "down";
  const upCount = up + (upActive ? 1 : 0);
  const downCount = down + (downActive ? 1 : 0);

  if (!interactive) {
    const readOnlyStyle = {
      display: "flex", alignItems: "center", gap: 3, fontSize: textSize, fontWeight: 700, color: "#9ab0a1",
    };
    return (
      <div style={{ display: "flex", gap: 6, justifyContent: justify }}>
        <span style={readOnlyStyle}>
          <ThumbsUp size={iconSize} color="#9ab0a1" /> {up}
        </span>
        <span style={readOnlyStyle}>
          <ThumbsDown size={iconSize} color="#9ab0a1" /> {down}
        </span>
      </div>
    );
  }

  // Interactive: sized as real buttons (bigger tap target), not bare text —
  // this is the primary like/dislike control, so it needs button affordance.
  const pillStyle = (active, activeColor) => ({
    display: "flex", alignItems: "center", gap: 6,
    padding: "7px 11px", borderRadius: 10,
    border: `1.5px solid ${active ? activeColor : "#dde7e0"}`,
    background: active ? `${activeColor}14` : "#fff",
    color: active ? activeColor : "#7a9485",
    fontSize: textSize, fontWeight: 800,
    fontFamily: "inherit", cursor: "pointer",
  });

  return (
    <div style={{ display: "flex", gap: 8, justifyContent: justify }}>
      <button type="button" onClick={() => onVote("up")} aria-label="Me gusta" style={pillStyle(upActive, "#2d5a3d")}>
        <ThumbsUp size={iconSize} color={upActive ? "#2d5a3d" : "#9ab0a1"} fill={upActive ? "#2d5a3d" : "none"} /> {upCount}
      </button>
      <button type="button" onClick={() => onVote("down")} aria-label="No me gusta" style={pillStyle(downActive, "#c0392b")}>
        <ThumbsDown size={iconSize} color={downActive ? "#c0392b" : "#9ab0a1"} fill={downActive ? "#c0392b" : "none"} /> {downCount}
      </button>
    </div>
  );
}

// "hace 3 días" / "6 jul 2026" — compact relative date for the recipe's
// generation stamp (see RecipePlanner.jsx's formatGeneratedAt, kept in sync).
export function formatRecipeDate(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `hace ${d} ${d === 1 ? "día" : "días"}`;
  return new Date(ts).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

// The owner snapshot is stamped when the recipe is saved, so its avatar can be
// a Google account URL that has since expired. Fall back to the MenuPlan mark
// rather than leaving a broken-image glyph in the card.
function OwnerBadge({ owner }) {
  const [failed, setFailed] = useState(false);
  if (!owner?.avatar || failed) return <MenuPlanBadge />;
  return (
    <img
      src={owner.avatar}
      alt={owner.name ?? ""}
      onError={() => setFailed(true)}
      style={{ width: 26, height: 26, borderRadius: 8, objectFit: "cover", flexShrink: 0 }}
    />
  );
}

/**
 * Compact owner badge + name + vote counts, stacked in a narrow column.
 * Used as the trailing slot of the catalog's RecipeCard list rows.
 */
export function RecipeProvenance({ recipe }) {
  const isUserRecipe = Boolean(recipe.owner);
  const owner = recipe.owner;
  const up = recipe.rating?.up ?? 0;
  const down = recipe.rating?.down ?? 0;
  const name = isUserRecipe ? (owner?.name?.split(" ")[0] ?? "Tú") : "MenuPlan";

  return (
    <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, minWidth: 44 }}>
      {isUserRecipe ? <OwnerBadge owner={owner} /> : <MenuPlanBadge />}
      <span
        style={{
          fontSize: 9.5, fontWeight: 800, color: isUserRecipe ? "#2f6fb8" : "#2d5a3d",
          letterSpacing: ".1px", whiteSpace: "nowrap",
          background: isUserRecipe ? "#e5eff9" : "#eaf6ee",
          padding: "1px 5px", borderRadius: 5,
        }}
      >
        {name}
      </span>
      <RecipeVoteCounts up={up} down={down} justify="center" />
    </div>
  );
}
