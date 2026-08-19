import { useMemo, useState } from "react";
import { BookOpen, Heart, NotebookPen, Plus, SlidersHorizontal } from "lucide-react";
import {
  BottomNav,
  bottomNavSpacer,
  EmptyIllustration,
  SegmentedTabBar,
  SegmentedTabButton,
} from "../components/ui.jsx";
import { CatalogBrowserSheet } from "./CatalogBrowserSheet.jsx";
import { favoriteRecipeIds } from "../lib/recipeVotes.js";
import { filterOwnCreatedRecipes, isCatalogGarnishCombo } from "../lib/userRecipes.js";

const GREEN = "#2d5a3d";
const INK = "#142f1d";
const HEADER_BAND = "#e9f4ed";

/**
 * Biblioteca personal (cuenta Google): catálogo, mis recetas creadas y favoritas
 * personales — separado del contexto del hogar activo (nav Recetas).
 */
export function BibliotecaScreen({
  user = null,
  userRecipes = [],
  recipeVotes = {},
  scopeGroups = [],
  onSetFavoriteScope,
  onOpenRecipe,
  onNav,
  onBack,
  onOpenRecipePlanner,
  onChangeRecipeVisibility,
  onDeleteRecipe,
  onEditRecipe,
  onBrowseGarnishCombo,
  onOpenRecipePrefs,
}) {
  const [tab, setTab] = useState("catalog");

  const favoriteIds = useMemo(
    () => new Set(favoriteRecipeIds(recipeVotes)),
    [recipeVotes],
  );

  const ownRecipes = useMemo(
    () => filterOwnCreatedRecipes(userRecipes, user),
    [userRecipes, user],
  );

  const catalogExtraRecipes = useMemo(
    () => ownRecipes.filter((r) => !isCatalogGarnishCombo(r)),
    [ownRecipes],
  );

  const TABS = [
    { id: "catalog", label: "Catálogo", Icon: BookOpen },
    { id: "mine", label: "Mis recetas", count: ownRecipes.length, Icon: NotebookPen },
    { id: "favorites", label: "Favoritas", count: favoriteIds.size, Icon: Heart },
  ];

  return (
    <div style={{ minHeight: "100dvh", background: "#fff", display: "flex", flexDirection: "column" }}>
      <div style={{ background: HEADER_BAND }}>
        <div
          style={{
            padding: "20px 18px 14px",
            maxWidth: 420,
            margin: "0 auto",
            width: "100%",
            boxSizing: "border-box",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                style={{
                  border: "1px solid #d5e6da",
                  background: "#fff",
                  color: GREEN,
                  borderRadius: 10,
                  padding: "7px 12px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  flexShrink: 0,
                }}
              >
                Atrás
              </button>
            )}
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 11,
                background: "#e6f3ea",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <BookOpen size={17} color={GREEN} />
            </div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: INK, letterSpacing: "-.3px" }}>
              Biblioteca
            </h1>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            {onOpenRecipePrefs && (
              <button
                type="button"
                onClick={onOpenRecipePrefs}
                title="Preferencias de recetas"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  border: "1.5px solid #d5e6da",
                  background: "#fff",
                  color: GREEN,
                  cursor: "pointer",
                }}
              >
                <SlidersHorizontal size={16} strokeWidth={2.3} />
              </button>
            )}
            {onOpenRecipePlanner && (
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

      <div
        style={{
          padding: "12px 18px 12px",
          background: "#fff",
          maxWidth: 420,
          margin: "0 auto",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <SegmentedTabBar>
          {TABS.map((t) => (
            <SegmentedTabButton
              key={t.id}
              selected={tab === t.id}
              onClick={() => setTab(t.id)}
              label={t.label}
              count={t.count}
              Icon={t.Icon}
              accent={GREEN}
            />
          ))}
        </SegmentedTabBar>
      </div>

      <div style={{ flex: 1, overflowY: "auto", paddingBottom: bottomNavSpacer() }}>
        {tab === "catalog" && (
          <CatalogBrowserSheet
            inline
            inlinePadding={18}
            reference
            recipeVotes={recipeVotes}
            scopeGroups={scopeGroups}
            onSetFavoriteScope={onSetFavoriteScope}
            onOpenRecipe={onOpenRecipe}
            extraRecipes={catalogExtraRecipes}
            onBrowseGarnishCombo={onBrowseGarnishCombo}
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
            extraRecipes={catalogExtraRecipes}
            favoriteIds={favoriteIds}
            emptyImg="/avatares/cards/empty_favoritas.jpg"
            emptyLabel="Aún no tienes favoritas"
            emptySubtitle="Pulsa el corazón en cualquier receta del catálogo para guardarla aquí."
          />
        )}

        {tab === "mine" && (
          ownRecipes.length === 0 ? (
            <div style={{ padding: "16px 18px", maxWidth: 420, margin: "0 auto", boxSizing: "border-box" }}>
              <EmptyIllustration
                img="/avatares/cards/empty_recetas_propias.jpg"
                title="Aún no tienes recetas propias"
                subtitle="Crea tu primera receta y la IA rellenará macros, pasos y foto."
                maxWidth={240}
                imgAspect="1 / 1"
                imgPosition="center"
              >
                {onOpenRecipePlanner && (
                  <button
                    type="button"
                    onClick={onOpenRecipePlanner}
                    style={{
                      marginTop: 14,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 7,
                      padding: "11px 20px",
                      borderRadius: 13,
                      border: "none",
                      background: GREEN,
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: 800,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    <Plus size={15} strokeWidth={2.8} /> Crear receta
                  </button>
                )}
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
              sourceRecipes={ownRecipes}
              onChangeVisibility={onChangeRecipeVisibility}
              onDeleteRecipe={onDeleteRecipe}
              onEditRecipe={onEditRecipe}
              ownRecipesView
              emptyLabel="Ninguna de tus recetas coincide con esos filtros."
            />
          )
        )}
      </div>

      <BottomNav active="dashboard" onNav={onNav} />
    </div>
  );
}
