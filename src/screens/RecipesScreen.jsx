import { useMemo, useState } from "react";
import { BookOpen, Plus, SlidersHorizontal } from "lucide-react";
import { BottomNav, bottomNavSpacer } from "../components/ui.jsx";
import { CatalogBrowserSheet } from "./CatalogBrowserSheet.jsx";
import { RecipesCoachTour, CoachHelpButton } from "../components/HomeCoachTour.jsx";
import { filterOwnCreatedRecipes, isCatalogGarnishCombo } from "../lib/userRecipes.js";

const GREEN = "#2d5a3d";
const INK = "#142f1d";
// Shared title-band tint across En casa / Menú / Recetas / Compra — a soft
// green (accent-tinted), distinct from the white body below.
const HEADER_BAND = "#e9f4ed";

/**
 * Recetas del hogar activo — catálogo (con "Mis recetas" como una tile más
 * del grid de categorías, ver CatalogBrowserSheet) y descartados.
 */
export function RecipesScreen({
  user = null,
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
  onOpenRecipePrefs,
  readOnly = false,
  readOnlyLabel = null,
}) {
  const [showIconCoach, setShowIconCoach] = useState(false);

  const ownRecipes = useMemo(
    () => (readOnly ? userRecipes : filterOwnCreatedRecipes(userRecipes, user)),
    [userRecipes, user, readOnly],
  );

  const catalogExtraRecipes = useMemo(
    () => ownRecipes.filter((r) => !isCatalogGarnishCombo(r)),
    [ownRecipes],
  );

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
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            {onOpenRecipePrefs && !readOnly && (
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
            {onOpenRecipePlanner && !readOnly && (
              <button
                type="button"
                onClick={onOpenRecipePlanner}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 13px",
                  borderRadius: 12,
                  border: "none",
                  background: GREEN,
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <Plus size={14} strokeWidth={2.8} /> Crear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Sin segmented control (2026-08-27): el grid de categorías es ahora
          la única entrada — "Mis recetas" vive como una tile más ahí dentro
          (ver CatalogBrowserSheet#gridTiles), no como pestaña aparte. */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          paddingBottom: bottomNavSpacer(),
        }}
      >
        <CatalogBrowserSheet
          inline
          inlinePadding={18}
          reference
          browseCategories
          recipeVotes={recipeVotes}
          scopeGroups={scopeGroups}
          onSetFavoriteScope={readOnly ? undefined : onSetFavoriteScope}
          onOpenRecipe={onOpenRecipe}
          extraRecipes={catalogExtraRecipes}
          onChangeVisibility={readOnly ? undefined : onChangeRecipeVisibility}
          onDeleteRecipe={readOnly ? undefined : onDeleteRecipe}
          onEditRecipe={readOnly ? undefined : onEditRecipe}
        />
      </div>

      {showIconCoach && <RecipesCoachTour onClose={() => setShowIconCoach(false)} />}

      <BottomNav active="recipes" onNav={onNav} />
    </div>
  );
}
