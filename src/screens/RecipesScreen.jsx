import { useState } from "react";
import { ChefHat, BookOpen, Plus, Clock, Users, Globe, Users2, Lock, ChevronDown } from "lucide-react";
import { BottomNav, bottomNavSpacer } from "../components/ui.jsx";
import { CatalogBrowserSheet } from "./CatalogBrowserSheet.jsx";

const GREEN = "#2d5a3d";
const INK = "#142f1d";
const BG = "#f4f8f5";

const TABS = [
  { id: "catalog", label: "Catálogo" },
  { id: "mine", label: "Mis recetas" },
];

const VIS_META = {
  public:  { icon: Globe,   label: "Pública",       color: "#2d5a3d", bg: "#e6f3ea" },
  friends: { icon: Users2,  label: "Solo amigos",   color: "#7a4e00", bg: "#fff8e7" },
  private: { icon: Lock,    label: "Privada",       color: "#5a2d7a", bg: "#f5edfc" },
};

// Inline visibility quick-change pill.
function VisibilityPill({ visibility = "public", onChange }) {
  const [open, setOpen] = useState(false);
  const current = VIS_META[visibility] ?? VIS_META.public;
  const Icon = current.icon;

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "3px 8px 3px 6px", borderRadius: 999, border: "none", cursor: "pointer",
          background: current.bg, fontFamily: "inherit",
        }}
      >
        <Icon size={10} color={current.color} />
        <span style={{ fontSize: 10.5, fontWeight: 700, color: current.color }}>{current.label}</span>
        <ChevronDown size={9} color={current.color} />
      </button>
      {open && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 50,
            background: "#fff", borderRadius: 12, border: "1.5px solid #e8efe9",
            boxShadow: "0 6px 20px rgba(0,0,0,.12)", minWidth: 148, overflow: "hidden",
          }}
        >
          {Object.entries(VIS_META).map(([id, meta]) => {
            const Ic = meta.icon;
            const active = id === visibility;
            return (
              <button
                key={id}
                type="button"
                onClick={(e) => { e.stopPropagation(); onChange?.(id); setOpen(false); }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8,
                  padding: "9px 12px", border: "none", cursor: "pointer",
                  fontFamily: "inherit", textAlign: "left",
                  background: active ? meta.bg : "#fff",
                }}
              >
                <Ic size={13} color={meta.color} />
                <span style={{ fontSize: 12.5, fontWeight: active ? 800 : 600, color: active ? meta.color : "#1a3a24" }}>
                  {meta.label}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Compact card for a user-created recipe.
function UserRecipeCard({ recipe, onClick, onChangeVisibility }) {
  const usageLabel =
    recipe.usageTags?.[0] === "plato_unico"
      ? "Plato único"
      : recipe.usageTags?.[0] === "guarnicion"
      ? "Guarnición"
      : "Plato";

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%", textAlign: "left", border: "1.5px solid #e3ebe6",
        borderRadius: 16, background: "#fff", padding: 0, cursor: "pointer",
        fontFamily: "inherit", overflow: "hidden",
        boxShadow: "0 2px 10px rgba(20,47,29,.07)",
      }}
    >
      {/* Photo or placeholder */}
      <div
        style={{
          height: 110, background: recipe.photo
            ? `url(${recipe.photo}) center/cover`
            : "linear-gradient(135deg, #8f3fc4 0%, #e0567a 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative",
        }}
      >
        {!recipe.photo && <ChefHat size={32} color="rgba(255,255,255,.6)" />}
      </div>
      <div style={{ padding: "9px 12px 11px" }}>
        <p style={{ margin: "0 0 5px", fontSize: 13.5, fontWeight: 800, color: INK, lineHeight: 1.25 }}>
          {recipe.name}
        </p>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#9647c9", background: "#f2e7fb", padding: "2px 7px", borderRadius: 999 }}>
            {usageLabel}
          </span>
          {recipe.time && (
            <span style={{ fontSize: 11, fontWeight: 600, color: "#7a9485", display: "flex", alignItems: "center", gap: 3 }}>
              <Clock size={10} /> {recipe.time} min
            </span>
          )}
        </div>
        {/* Visibility row */}
        <div style={{ marginTop: 7 }} onClick={(e) => e.stopPropagation()}>
          <VisibilityPill
            visibility={recipe.visibility ?? "public"}
            onChange={onChangeVisibility}
          />
        </div>
      </div>
    </button>
  );
}

/**
 * Recetas screen — two internal tabs:
 *   Catálogo: full CatalogBrowserSheet in reference/browse mode
 *   Mis recetas: grid of user-created recipes + "Crear nueva" button
 */
export function RecipesScreen({
  userRecipes = [],
  recipeVotes = {},
  onVote,
  onOpenRecipe,
  onNav,
  onOpenRecipePlanner,
  onChangeRecipeVisibility,
}) {
  const [tab, setTab] = useState("catalog");

  return (
    <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div
        style={{
          padding: "20px 18px 0",
          background: BG,
          maxWidth: 420, margin: "0 auto", width: "100%", boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div
              style={{
                width: 36, height: 36, borderRadius: 11, background: "#f2e7fb",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <BookOpen size={17} color="#9647c9" />
            </div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: INK, letterSpacing: "-.3px" }}>
              Recetas
            </h1>
          </div>
          <button
            type="button"
            onClick={onOpenRecipePlanner}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "8px 13px",
              borderRadius: 12, border: "none", background: GREEN, color: "#fff",
              fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <Plus size={14} strokeWidth={2.8} /> Crear
          </button>
        </div>

        {/* Tab switcher */}
        <div
          style={{
            display: "flex", background: "#e8efe9", borderRadius: 12, padding: 3,
            marginBottom: 6,
          }}
        >
          {TABS.map((t) => {
            const sel = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                style={{
                  flex: 1, padding: "7px 0", borderRadius: 9, border: "none",
                  background: sel ? "#fff" : "transparent",
                  color: sel ? INK : "#7a9485",
                  fontSize: 13, fontWeight: sel ? 800 : 700,
                  cursor: "pointer", fontFamily: "inherit",
                  boxShadow: sel ? "0 1px 4px rgba(0,0,0,.1)" : "none",
                  transition: "all .15s",
                }}
              >
                {t.label}
                {t.id === "mine" && userRecipes.length > 0 && (
                  <span
                    style={{
                      marginLeft: 5, fontSize: 10, fontWeight: 900, color: sel ? GREEN : "#9ab0a1",
                      background: sel ? "#e4f3e9" : "#dce8de",
                      padding: "1px 6px", borderRadius: 999,
                    }}
                  >
                    {userRecipes.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          paddingBottom: bottomNavSpacer(),
        }}
      >
        {tab === "catalog" && (
          <CatalogBrowserSheet
            inline
            inlinePadding={18}
            reference
            recipeVotes={recipeVotes}
            onVote={onVote}
            onOpenRecipe={onOpenRecipe}
            extraRecipes={userRecipes}
          />
        )}

        {tab === "mine" && (
          <div style={{ padding: "14px 18px", maxWidth: 420, margin: "0 auto", boxSizing: "border-box" }}>
            {userRecipes.length === 0 ? (
              <div
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center",
                  gap: 12, padding: "50px 20px", textAlign: "center",
                }}
              >
                <div
                  style={{
                    width: 60, height: 60, borderRadius: 18, background: "#f2e7fb",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <ChefHat size={26} color="#9647c9" />
                </div>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: INK }}>
                  Aún no tienes recetas propias
                </p>
                <p style={{ margin: 0, fontSize: 13, color: "#7a9485", lineHeight: 1.5 }}>
                  Crea tu primera receta y la IA rellenará macros, pasos y foto.
                </p>
                <button
                  type="button"
                  onClick={onOpenRecipePlanner}
                  style={{
                    marginTop: 4, display: "flex", alignItems: "center", gap: 7,
                    padding: "11px 20px", borderRadius: 13, border: "none",
                    background: GREEN, color: "#fff", fontSize: 14, fontWeight: 800,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  <Plus size={15} strokeWidth={2.8} /> Crear receta
                </button>
              </div>
            ) : (
              <>
                <div
                  style={{
                    display: "grid", gridTemplateColumns: "1fr 1fr",
                    gap: 10, marginBottom: 14,
                  }}
                >
                  {userRecipes.map((r) => (
                    <UserRecipeCard
                      key={r.id ?? r.name}
                      recipe={r}
                      onClick={() => onOpenRecipe?.(r)}
                      onChangeVisibility={(vis) => onChangeRecipeVisibility?.(r.id ?? r.name, vis)}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={onOpenRecipePlanner}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                    gap: 7, padding: "12px 0", borderRadius: 14, border: "2px dashed #c8ddd0",
                    background: "transparent", color: GREEN, fontSize: 13.5, fontWeight: 800,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  <Plus size={15} strokeWidth={2.8} /> Crear otra receta
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <BottomNav active="recipes" onNav={onNav} context="home" />
    </div>
  );
}
