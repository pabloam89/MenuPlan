import { useEffect, useMemo, useState } from "react";
import { BookOpen, Plus, RotateCcw, SlidersHorizontal } from "lucide-react";
import { BottomNav, bottomNavSpacer, EmptyIllustration } from "../components/ui.jsx";
import { CatalogBrowserSheet } from "./CatalogBrowserSheet.jsx";
import { RecipesCoachTour, CoachHelpButton } from "../components/HomeCoachTour.jsx";
import { favoriteRecipeIds } from "../lib/recipeVotes.js";
import { recipeCatalogById } from "../data/recipeCatalog.js";
import { dishImageForRecipe } from "../assets/dishes/dishImages.js";
import { deckImg } from "../lib/dishPhotoOptimize.js";

const GREEN = "#2d5a3d";
const INK = "#142f1d";
// Shared title-band tint across En casa / Menú / Recetas / Compra — a soft
// green (accent-tinted), distinct from the white body below.
const HEADER_BAND = "#e9f4ed";

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
  // Base catalog ids the user discarded "para siempre" (No me gusta). Shown in
  // the "Descartados" tab; onRecoverRecipe clears one so it rejoins the pool.
  // onDiscardRecipe marks one as discarded directly from the Catálogo tab.
  discardedIds = [],
  onRecoverRecipe,
  onDiscardRecipe,
  onSetFavoriteScope,
  onOpenRecipe,
  onNav,
  onOpenRecipePlanner,
  onChangeRecipeVisibility,
  onDeleteRecipe,
  onEditRecipe,
  onCombineGarnish,
  onOpenRecipePrefs,
  // Optional demo hooks (first-run value-prop carousel): preset the visible tab
  // and optionally auto-cycle Catálogo → Favoritas → Mis recetas. Default to the
  // normal interactive behaviour; never passed in the real app.
  initialTab = null,
  autoplay = false,
  // Demo only: land the Catálogo tab directly on a category so real dish
  // thumbnails show instead of the category grid.
  catalogInitialCategory = null,
}) {
  const [tab, setTab] = useState(initialTab ?? "mine");
  const [showIconCoach, setShowIconCoach] = useState(false);

  useEffect(() => {
    if (!autoplay) return undefined;
    const tabs = ["mine", "catalog", "favorites"];
    let k = tabs.indexOf(initialTab ?? "mine");
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

  const discardedRecipes = useMemo(
    () => discardedIds.map((id) => recipeCatalogById[id]).filter(Boolean),
    [discardedIds],
  );

  const TABS = [
    { id: "mine", label: "Mis recetas", count: userRecipes.length },
    { id: "catalog", label: "Catálogo" },
    { id: "favorites", label: "Favoritas", count: favoriteIds.size },
    { id: "discarded", label: "Descartados", count: discardedRecipes.length },
  ];

  return (
    <div style={{ minHeight: "100dvh", background: "#fff", display: "flex", flexDirection: "column" }}>
      {/* Title band (Menú color) */}
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
                width: 36, height: 36, borderRadius: 11, background: "#f2e7fb",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <BookOpen size={17} color="#9647c9" />
            </div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: INK, letterSpacing: "-.3px" }}>
              Recetas
            </h1>
            <CoachHelpButton active={showIconCoach} onClick={() => setShowIconCoach((v) => !v)} />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {onOpenRecipePrefs && (
              <button
                type="button"
                onClick={onOpenRecipePrefs}
                title="Preferencias de recetas"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 36, height: 36, borderRadius: 12,
                  border: "1.5px solid #d5e6da", background: "#fff",
                  color: GREEN, cursor: "pointer",
                }}
              >
                <SlidersHorizontal size={16} strokeWidth={2.3} />
              </button>
            )}
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
        </div>
      </div>

      {/* Tab switcher (white) */}
      <div
        style={{
          padding: "14px 18px 6px", background: "#fff",
          maxWidth: 420, margin: "0 auto", width: "100%", boxSizing: "border-box",
        }}
      >
        <div
          style={{
            display: "flex", background: "#e8efe9", borderRadius: 12, padding: 3,
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
                  flex: 1, minWidth: 0, padding: "7px 2px", borderRadius: 9, border: "none",
                  background: sel ? "#fff" : "transparent",
                  color: sel ? INK : "#7a9485",
                  fontSize: 12, fontWeight: sel ? 800 : 700,
                  cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                  boxShadow: sel ? "0 1px 4px rgba(0,0,0,.1)" : "none",
                  transition: "all .15s",
                }}
              >
                {t.label}
                {t.count > 0 && (
                  <span
                    style={{
                      marginLeft: 4, fontSize: 9.5, fontWeight: 900, color: sel ? GREEN : "#9ab0a1",
                      background: sel ? "#e4f3e9" : "#dce8de",
                      padding: "1px 5px", borderRadius: 999,
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
            discardedIds={new Set(discardedIds)}
            onDiscardRecipe={onDiscardRecipe}
            onRecoverRecipe={onRecoverRecipe}
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
            emptyImg="/avatares/cards/empty_favoritas.jpg"
            emptyLabel="Aún no tienes favoritas"
            emptySubtitle="Pulsa el corazón en cualquier receta del catálogo para guardarla aquí."
          />
        )}

        {tab === "mine" && (
          userRecipes.length === 0 ? (
            <div style={{ padding: "16px 18px", maxWidth: 420, margin: "0 auto", boxSizing: "border-box" }}>
              <EmptyIllustration
                img="/avatares/cards/empty_recetas_propias.jpg"
                title="Aún no tienes recetas propias"
                subtitle="Crea tu primera receta y la IA rellenará macros, pasos y foto."
                maxWidth={240}
                imgAspect="1 / 1"
                imgPosition="center"
              >
                <button
                  type="button"
                  onClick={onOpenRecipePlanner}
                  style={{
                    marginTop: 14, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
                    padding: "11px 20px", borderRadius: 13, border: "none",
                    background: GREEN, color: "#fff", fontSize: 14, fontWeight: 800,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  <Plus size={15} strokeWidth={2.8} /> Crear receta
                </button>
              </EmptyIllustration>
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

        {tab === "discarded" && (
          <div style={{ padding: "14px 18px", maxWidth: 420, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
            {discardedRecipes.length === 0 ? (
              <div style={{ padding: "8px 0" }}>
                <EmptyIllustration
                  img="/avatares/cards/empty_descartes.jpg"
                  title="No has descartado ninguna receta"
                  subtitle="Los platos que marques con «No me gusta» aparecerán aquí para no volver a proponerlos."
                  maxWidth={240}
                  imgAspect="1 / 1"
                  imgPosition="center"
                />
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {discardedRecipes.map((recipe) => {
                  const img = dishImageForRecipe(recipe);
                  return (
                    <div
                      key={recipe.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: 10, borderRadius: 14, background: "#fff",
                        border: "1.5px solid #eef3f0", boxShadow: "0 6px 16px -12px rgba(20,47,29,.3)",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => onOpenRecipe?.(recipe)}
                        style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, border: "none", background: "transparent", padding: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
                      >
                        <div style={{ width: 54, height: 54, borderRadius: 11, flexShrink: 0, overflow: "hidden", background: "#eef3f0", filter: "grayscale(.5)", opacity: 0.85 }}>
                          {img && <img src={deckImg(img, 108)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" decoding="async" />}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {recipe.name}
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#e0405a", marginTop: 2 }}>
                            Descartado
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => onRecoverRecipe?.(recipe.id)}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0,
                          padding: "8px 12px", borderRadius: 11, border: "1.5px solid #cfe6d6",
                          background: "#f2f9f4", color: GREEN, fontSize: 12.5, fontWeight: 800,
                          cursor: "pointer", fontFamily: "inherit",
                        }}
                      >
                        <RotateCcw size={14} strokeWidth={2.6} /> Recuperar
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {showIconCoach && <RecipesCoachTour onClose={() => setShowIconCoach(false)} />}

      <BottomNav active="recipes" onNav={onNav} />
    </div>
  );
}
