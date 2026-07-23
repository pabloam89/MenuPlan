import { useEffect, useMemo, useState } from "react";
import { ChefHat, BookOpen, Plus } from "lucide-react";
import { BottomNav, bottomNavSpacer } from "../components/ui.jsx";
import { CatalogBrowserSheet } from "./CatalogBrowserSheet.jsx";
import { favoriteRecipeIds } from "../lib/recipeVotes.js";

const GREEN = "#2d5a3d";
const INK = "#142f1d";
const BG = "#f4f8f5";

/**
 * Recetas screen — three internal tabs, all backed by CatalogBrowserSheet so
 * search + filters + card style stay identical across them:
 *   Catálogo:    full catalog + the user's own recipes
 *   Favoritas:   only recipes the user liked (thumbs-up), catalog or own
 *   Mis recetas: only the user's created recipes, with inline visibility
 */
export function RecipesScreen({
  userRecipes = [],
  recipeVotes = {},
  scopeGroups = [],
  onSetFavoriteScope,
  onOpenRecipe,
  onNav,
  onOpenRecipePlanner,
  onChangeRecipeVisibility,
  onDeleteRecipe,
  onEditRecipe,
  onCombineGarnish,
  // Optional demo hooks (first-run value-prop carousel): preset the visible tab
  // and optionally auto-cycle Catálogo → Favoritas → Mis recetas. Default to the
  // normal interactive behaviour; never passed in the real app.
  initialTab = null,
  autoplay = false,
  // Demo only: land the Catálogo tab directly on a category so real dish
  // thumbnails show instead of the category grid.
  catalogInitialCategory = null,
}) {
  const [tab, setTab] = useState(initialTab ?? "catalog");

  useEffect(() => {
    if (!autoplay) return undefined;
    const tabs = ["catalog", "favorites", "mine"];
    let k = tabs.indexOf(initialTab ?? "catalog");
    if (k < 0) k = 0;
    const id = setInterval(() => {
      k = (k + 1) % tabs.length;
      setTab(tabs[k]);
    }, 2200);
    return () => clearInterval(id);
  }, [autoplay, initialTab]);

  const favoriteIds = useMemo(
    () => new Set(favoriteRecipeIds(recipeVotes)),
    [recipeVotes],
  );

  const TABS = [
    { id: "catalog", label: "Catálogo" },
    { id: "favorites", label: "Favoritas", count: favoriteIds.size },
    { id: "mine", label: "Mis recetas", count: userRecipes.length },
  ];

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
            data-coach="recipes-create"
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
                data-coach={`recipes-tab-${t.id}`}
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
                {t.count > 0 && (
                  <span
                    style={{
                      marginLeft: 5, fontSize: 10, fontWeight: 900, color: sel ? GREEN : "#9ab0a1",
                      background: sel ? "#e4f3e9" : "#dce8de",
                      padding: "1px 6px", borderRadius: 999,
                    }}
                  >
                    {t.count}
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
            scopeGroups={scopeGroups}
            onSetFavoriteScope={onSetFavoriteScope}
            onOpenRecipe={onOpenRecipe}
            extraRecipes={userRecipes}
            onCombineGarnish={onCombineGarnish}
            initialCategory={catalogInitialCategory}
          />
        )}

        {tab === "favorites" && (
          <CatalogBrowserSheet
            inline
            inlinePadding={18}
            reference
            recipeVotes={recipeVotes}
            scopeGroups={scopeGroups}
            onSetFavoriteScope={onSetFavoriteScope}
            onOpenRecipe={onOpenRecipe}
            extraRecipes={userRecipes}
            favoriteIds={favoriteIds}
            emptyLabel="Aún no tienes favoritas. Pulsa el corazón en cualquier receta del catálogo para guardarla aquí."
          />
        )}

        {tab === "mine" && (
          userRecipes.length === 0 ? (
            <div style={{ padding: "14px 18px", maxWidth: 420, margin: "0 auto", boxSizing: "border-box" }}>
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
            </div>
          ) : (
            <CatalogBrowserSheet
              inline
              inlinePadding={18}
              reference
              recipeVotes={recipeVotes}
              scopeGroups={scopeGroups}
              onSetFavoriteScope={onSetFavoriteScope}
              onOpenRecipe={onOpenRecipe}
              sourceRecipes={userRecipes}
              onChangeVisibility={onChangeRecipeVisibility}
              onDeleteRecipe={onDeleteRecipe}
              onEditRecipe={onEditRecipe}
              ownRecipesView
              emptyLabel="Ninguna de tus recetas coincide con esos filtros."
            />
          )
        )}
      </div>

      <BottomNav active="recipes" onNav={onNav} />
    </div>
  );
}
