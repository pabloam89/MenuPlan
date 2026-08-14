import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Search,
  SlidersHorizontal,
  X,
  Plus,
  Check,
  Clock,
  Flame,
  Baby,
  Drumstick,
  Fish,
  Egg,
  Wheat,
  Soup,
  Salad,
  Coffee,
  Apple,
  IceCream,
  Bean,
  Utensils,
  Tag,
  ChevronRight,
  ChevronLeft,
  BarChart3,
  Sparkles,
  Heart,
  Globe,
  Users2,
  Lock,
  ChevronDown,
  Trash2,
  Pencil,
} from "lucide-react";
import { recipeCatalog } from "../data/recipeCatalog.js";
import guarnicionesData from "../data/recipes/guarniciones.json";
import { dishImageUrl } from "../assets/dishes/dishImages.js";
import { deckImg } from "../lib/dishPhotoOptimize.js";
import { getFavoriteScope, isRecipeFavorite, applyFavoriteScopePick } from "../lib/recipeVotes.js";
import { categoryImageSrc, proteinImageSrc } from "../lib/ingredientImages.js";
import { RecipeProvenance } from "../components/RecipeProvenance.jsx";
import { FavoriteScopeModal } from "../components/FavoriteScopeModal.jsx";

const GARNISHES = guarnicionesData;
const GARNISH_BY_ID = Object.fromEntries(guarnicionesData.map((g) => [g.id, g]));

const GREEN = "#2d5a3d";

const CATEGORY_META = {
  legumbres:          { label: "Legumbres",     icon: Bean,           color: "#b9770e", img: "/categories/legumbres.png" },
  carnes:             { label: "Carnes",         icon: Drumstick,      color: "#c0392b", img: "/categories/carnes.png" },
  pescados:           { label: "Pescados",       icon: Fish,           color: "#2f6f9f", img: "/categories/pescados.png" },
  huevos:             { label: "Huevos",         icon: Egg,            color: "#d4a017", img: "/categories/huevos.png" },
  pasta_arroces:      { label: "Pasta y arroz",  icon: Wheat,          color: "#cf7833", img: "/categories/pasta_arroces.png" },
  sopas_cremas:       { label: "Sopas y cremas", icon: Soup,           color: "#8a6cc4", img: "/categories/sopas_cremas.png" },
  ensaladas_verduras: { label: "Verduras",       icon: Salad,          color: "#3f9656", img: "/categories/ensaladas_verduras.png" },
  platos_unicos:      { label: "Platos únicos",  icon: Utensils,       color: "#5a7066", img: "/categories/platos_unicos.png" },
  cenas_rapidas:      { label: "Cenas rápidas",  icon: Soup,           color: "#d56b9a", img: "/categories/cenas_rapidas.png" },
  bebes:              { label: "Bebés",           icon: Baby,           color: "#6cb4c4", img: "/categories/bebes.png" },
  desayunos:          { label: "Desayunos",       icon: Coffee,         color: "#c98a3a", img: "/categories/desayunos.png" },
  meriendas:          { label: "Meriendas",       icon: Apple,          color: "#4a9d6b", img: "/categories/meriendas.png" },
  postres:            { label: "Postres",         icon: IceCream,       color: "#c463a0", img: "/categories/postres.png" },
};

const DEFAULT_COLOR = "#5a7066";
export function categoryColor(cat) {
  return CATEGORY_META[cat]?.color ?? DEFAULT_COLOR;
}

export function categoryIcon(cat) {
  return CATEGORY_META[cat]?.icon ?? Utensils;
}

export function isKnownCategory(cat) {
  return Boolean(cat) && Object.prototype.hasOwnProperty.call(CATEGORY_META, cat);
}

const PAGE_SIZES = [10, 20, 50];
const DEFAULT_PAGE_SIZE = 20;

const DIFFICULTY_LABEL = { facil: "Fácil", media: "Media", dificil: "Difícil" };
const TIME_OPTIONS = [
  { value: 0, label: "Cualquiera" },
  { value: 20, label: "≤ 20 min" },
  { value: 30, label: "≤ 30 min" },
  { value: 45, label: "≤ 45 min" },
];

function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function titleCase(s) {
  const t = String(s ?? "").trim().replace(/_/g, " ");
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

function isRealProtein(p) {
  const n = norm(p);
  return Boolean(n) && n !== "none" && n !== "null" && n !== "ninguna" && n !== "ninguno";
}

function isGuarnicionRecipe(r) {
  return r?.type === "guarnicion" || r?.mealRole?.includes?.("guarnicion");
}

function sortByNameQuery(items, q) {
  const sorted = [...items];
  if (q) {
    sorted.sort((a, b) => {
      const aStarts = norm(a.name).startsWith(q) ? 0 : 1;
      const bStarts = norm(b.name).startsWith(q) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return a.name.localeCompare(b.name);
    });
  } else {
    sorted.sort((a, b) => a.name.localeCompare(b.name));
  }
  return sorted;
}

export function categoryLabel(cat) {
  return CATEGORY_META[cat]?.label ?? titleCase(cat);
}

function CategoryIcon({ category, size = 22 }) {
  const Icon = CATEGORY_META[category]?.icon ?? Utensils;
  return <Icon size={size} color={categoryColor(category)} strokeWidth={2} />;
}

/**
 * Bottom-sheet catalog browser. Lets the user search & filter the real recipe
 * catalog and add dishes they already know how to cook to their weekly repeats.
 *
 * @param {() => void} onClose
 * @param {Set<string>} addedIds  catalog ids already added as fixed dishes
 * @param {Object<string,string>} garnishByCatalogId  { [catalogId]: garnishId }
 * @param {(recipe: object) => void} onAdd
 * @param {(catalogId: string) => void} onRemove
 * @param {(recipe: object, garnishId: string|null) => void} onSetGarnish
 */
export function CatalogBrowserSheet({
  inline = false, onClose, addedIds = new Set(), garnishByCatalogId = {},
  onAdd, onRemove, onSetGarnish, extraRecipes = [],
  // Horizontal padding applied in inline mode (non-inline always uses 18px).
  inlinePadding = 0,
  // Reference mode: read-only browsing. No add/garnish actions — cards show
  // owner + vote info instead.
  reference = false,
  // Land on the categories grid first, same as `reference` browsing, but
  // without giving up add/garnish actions — used by "¿Qué repetimos?" so
  // picking fixed dishes still gets the "browse by category" landing.
  browseCategories = false,
  // Gate-pick mode (recipe planner): search platos and/or guarniciones from the
  // same browser used in ¿Qué repetimos?, with tap-to-select instead of add.
  gatePick = false,
  // When set ("plato" | "guarnicion"), the gate picker is locked to that type
  // and the Todos/Platos/Guarniciones toggle is hidden (used by the recipe
  // planner's review step, where the type is already decided).
  gatePickType = null,
  selectedPlatoId = null,
  selectedGarnishId = null,
  onPickPlato,
  onPickGarnish,
  extraGarnishes = [],
  // User votes keyed by recipe id: { v: 'up'|'down' (rating), fav: 'all'|string[] (favorite scope) }.
  recipeVotes = {},
  // Selectable menu-group labels for per-group favorites (e.g. ["Adultos",
  // "Niños"]); when there's more than one, tapping the heart opens a picker
  // instead of favoriting for everyone right away.
  scopeGroups = [],
  onSetFavoriteScope,
  // Tap a recipe in reference mode to open dish detail.
  onOpenRecipe,
  // When provided, fully replaces the bundled catalog as the browse source
  // (used by "Mis recetas" to browse only the user's own recipes).
  sourceRecipes = null,
  // When provided, restricts results to these recipe ids ("Favoritas" tab).
  favoriteIds = null,
  // When provided (Set of base ids), restricts the browsable pool to just those
  // recipes — used by the "Cena rápida" / "Plato único" quick pickers so the grid
  // only shows dishes valid for that slot type.
  restrictToIds = null,
  // Custom empty-state copy (favorites / mine have their own wording).
  emptyLabel = null,
  // Reference mode only: lets user-owned recipes change visibility inline.
  onChangeVisibility = null,
  // Reference mode only: lets the owner delete their own recipes inline.
  onDeleteRecipe = null,
  // "Mis recetas" view: edit action + edit/delete icons rendered outside the
  // card, and the "Tuya" badge hidden (redundant when all are yours).
  onEditRecipe = null,
  ownRecipesView = false,
  // Reference/browse mode: lets the user pair a catalog dish with a garnish and
  // save the combo to "Mis recetas" (called with the built combo recipe).
  onCombineGarnish = null,
  // Demo only: preselect a category so we land straight on its dish list (with
  // real thumbnails) instead of the category grid.
  initialCategory = null,
}) {
  const fullCatalog = useMemo(
    () =>
      sourceRecipes
        ? sourceRecipes
        : extraRecipes.length > 0
          ? [...recipeCatalog, ...extraRecipes]
          : recipeCatalog,
    [sourceRecipes, extraRecipes],
  );
  const platoCatalog = useMemo(
    () => fullCatalog.filter((r) => !isGuarnicionRecipe(r)),
    [fullCatalog],
  );
  const garnishCatalog = useMemo(() => {
    const seen = new Set(GARNISHES.map((g) => g.id));
    const merged = [...GARNISHES];
    for (const g of extraGarnishes) {
      if (g?.id && !seen.has(g.id)) {
        seen.add(g.id);
        merged.push(g);
      }
    }
    return merged;
  }, [extraGarnishes]);
  const [query, setQuery] = useState("");
  // all | plato | guarnicion — locked to gatePickType when provided.
  const [typeFilter, setTypeFilter] = useState(gatePickType ?? "all");
  useEffect(() => {
    if (gatePickType) setTypeFilter(gatePickType);
  }, [gatePickType]);
  const [showFilters, setShowFilters] = useState(false);
  const [cats, setCats] = useState(() => (initialCategory ? new Set([initialCategory]) : new Set()));
  const [proteins, setProteins] = useState(() => new Set());
  const [maxTime, setMaxTime] = useState(0);
  const [difficulties, setDifficulties] = useState(() => new Set());
  const [kidOnly, setKidOnly] = useState(false);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [garnishFor, setGarnishFor] = useState(null);
  const [combineFor, setCombineFor] = useState(null); // catalog dish being paired with a garnish to save as own recipe
  const [scopeFor, setScopeFor] = useState(null); // recipe being favorited via the group picker

  const { allCats, allProteins } = useMemo(() => {
    const c = new Set();
    const p = new Set();
    const source = gatePick ? platoCatalog : fullCatalog;
    for (const r of source) {
      if (r.category) c.add(r.category);
      if (isRealProtein(r.mainProtein)) p.add(r.mainProtein);
    }
    return {
      allCats: [...c].sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b))),
      allProteins: [...p].sort((a, b) => titleCase(a).localeCompare(titleCase(b))),
    };
  }, [fullCatalog, gatePick, platoCatalog]);

  const activeFilterCount =
    cats.size +
    proteins.size +
    difficulties.size +
    (maxTime ? 1 : 0) +
    (kidOnly ? 1 : 0);

  const platoResults = useMemo(() => {
    const q = norm(query);
    const filtered = platoCatalog.filter((r) => {
      if (restrictToIds && !restrictToIds.has(r.id)) return false;
      if (q && !norm(r.name).includes(q)) return false;
      if (cats.size && !cats.has(r.category)) return false;
      if (proteins.size && !proteins.has(r.mainProtein)) return false;
      if (maxTime && (r.time ?? 999) > maxTime) return false;
      if (difficulties.size && !difficulties.has(r.difficulty)) return false;
      if (kidOnly && !r.kidFriendly) return false;
      return true;
    });
    return sortByNameQuery(filtered, q);
  }, [query, cats, proteins, maxTime, difficulties, kidOnly, platoCatalog, restrictToIds]);

  const garnishResults = useMemo(() => {
    const q = norm(query);
    const filtered = garnishCatalog.filter((g) => !q || norm(g.name).includes(q));
    return sortByNameQuery(filtered, q);
  }, [query, garnishCatalog]);

  const results = useMemo(() => {
    if (gatePick) {
      if (typeFilter === "plato") {
        return platoResults.map((item) => ({ kind: "plato", item }));
      }
      if (typeFilter === "guarnicion") {
        return garnishResults.map((item) => ({ kind: "guarnicion", item }));
      }
      return sortByNameQuery(
        [
          ...platoResults.map((item) => ({ kind: "plato", item, name: item.name })),
          ...garnishResults.map((item) => ({ kind: "guarnicion", item, name: item.name })),
        ],
        norm(query),
      ).map(({ kind, item }) => ({ kind, item }));
    }

    const q = norm(query);
    const filtered = fullCatalog.filter((r) => {
      if (favoriteIds && !favoriteIds.has(r.id)) return false;
      if (restrictToIds && !restrictToIds.has(r.id)) return false;
      if (q && !norm(r.name).includes(q)) return false;
      if (cats.size && !cats.has(r.category)) return false;
      if (proteins.size && !proteins.has(r.mainProtein)) return false;
      if (maxTime && (r.time ?? 999) > maxTime) return false;
      if (difficulties.size && !difficulties.has(r.difficulty)) return false;
      if (kidOnly && !r.kidFriendly) return false;
      return true;
    });
    return sortByNameQuery(filtered, q);
  }, [gatePick, typeFilter, platoResults, garnishResults, query, cats, proteins, maxTime, difficulties, kidOnly, fullCatalog, favoriteIds, restrictToIds]);

  // Reset pagination whenever the result set or page size changes.
  useEffect(() => {
    setLimit(pageSize);
  }, [query, cats, proteins, maxTime, difficulties, kidOnly, pageSize, typeFilter, gatePick]);

  const visible = results.slice(0, limit);
  const hasMore = results.length > visible.length;

  const selectedPlato = selectedPlatoId
    ? platoCatalog.find((r) => r.id === selectedPlatoId) ?? null
    : null;
  const selectedGarnish = selectedGarnishId
    ? garnishCatalog.find((g) => g.id === selectedGarnishId) ?? GARNISH_BY_ID[selectedGarnishId]
    : null;

  const showPlatoFilters = !gatePick || typeFilter !== "guarnicion";

  const clearFilters = () => {
    setCats(new Set());
    setProteins(new Set());
    setMaxTime(0);
    setDifficulties(new Set());
    setKidOnly(false);
  };

  const px = inline ? inlinePadding : 18;

  // Full-catalog browse mode (not gate-pick, not a scoped/limited list like
  // favorites or "mis recetas"): land on a categories grid first instead of
  // dumping all recipes at once. Picking a category (or typing a search)
  // reveals the normal filtered list.
  const isBrowseCatalog = (reference || browseCategories) && !gatePick && !favoriteIds && !sourceRecipes;
  const showCategoryGrid = isBrowseCatalog && cats.size === 0 && !query.trim();
  const categoryCounts = useMemo(() => {
    const counts = {};
    for (const r of fullCatalog) {
      if (r.category) counts[r.category] = (counts[r.category] ?? 0) + 1;
    }
    return counts;
  }, [fullCatalog]);

  const styleBlock = (
    <style>{`
      @keyframes sheetUp {
        from { transform: translateY(28px); opacity: 0; }
        to   { transform: translateY(0);    opacity: 1; }
      }
      @keyframes cardIn {
        from { opacity: 0; transform: translateY(6px) scale(0.98); }
        to   { opacity: 1; transform: translateY(0)   scale(1);    }
      }
      @keyframes checkPop {
        0%   { transform: scale(1); }
        45%  { transform: scale(1.2); }
        100% { transform: scale(1); }
      }
      .catalog-sheet-inner { animation: sheetUp .22s cubic-bezier(.25,.9,.4,1) both; }
      .catalog-card-enter  { animation: cardIn .16s ease-out both; }
      .catalog-added-pop   { animation: checkPop .18s ease-out both; }
    `}</style>
  );

  const searchRow = (
    <>
      {gatePick && !gatePickType && (
        <div style={{ display: "flex", gap: 6, marginBottom: 10, padding: `0 ${px}px`, flexShrink: 0 }}>
          {[
            { id: "all", label: "Todos" },
            { id: "plato", label: "Platos" },
            { id: "guarnicion", label: "Guarniciones" },
          ].map((opt) => {
            const active = typeFilter === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTypeFilter(opt.id)}
                style={{
                  flex: 1, padding: "8px 6px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
                  border: `1.5px solid ${active ? GREEN : "#e8efe9"}`,
                  background: active ? GREEN : "#fff",
                  color: active ? "#fff" : "#5a7066",
                  fontSize: 12, fontWeight: 800,
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, padding: `0 ${px}px`, flexShrink: 0 }}>
        <div
          style={{
            flex: 1, display: "flex", alignItems: "center", gap: 8,
            height: 42, padding: "0 12px", borderRadius: 12,
            background: "#f4f7f5", border: "1.5px solid #e8efe9",
          }}
        >
          <Search size={16} color="#9ab0a1" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={gatePick ? "Buscar plato o guarnición…" : "Buscar plato…"}
            style={{
              flex: 1, border: "none", background: "transparent", outline: "none",
              // Match the catalog category / Filtros text size (was 16 = oversized).
              fontSize: 13.5, color: "#1a3a24", fontFamily: "inherit", minWidth: 0,
            }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Limpiar búsqueda"
              style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0, display: "flex" }}
            >
              <X size={15} color="#9ab0a1" />
            </button>
          )}
        </div>
        {showPlatoFilters && (
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            style={{
              position: "relative", display: "inline-flex", alignItems: "center", gap: 7,
              height: 42, padding: "0 14px", borderRadius: 12, cursor: "pointer",
              border: `1.5px solid ${showFilters || activeFilterCount ? GREEN : "#e8efe9"}`,
              background: showFilters || activeFilterCount ? GREEN : "#f4f7f5",
              color: showFilters || activeFilterCount ? "#fff" : "#5a7066",
              fontSize: 13, fontWeight: 800, fontFamily: "inherit", flexShrink: 0,
            }}
          >
            <SlidersHorizontal size={16} />
            Filtros
            {activeFilterCount > 0 && (
              <span
                style={{
                  minWidth: 18, height: 18, borderRadius: 999, padding: "0 5px",
                  background: "#fff", color: GREEN, fontSize: 11, fontWeight: 900,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                }}
              >
                {activeFilterCount}
              </span>
            )}
          </button>
        )}
      </div>
    </>
  );

  const countRow = results.length === 0 ? null : (
    <div style={{ padding: `10px ${px}px 6px`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
      <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#7a9485", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {gatePick
          ? `${results.length} ${results.length === 1 ? "resultado" : "resultados"}`
          : `${results.length} ${results.length === 1 ? "plato" : "platos"}`}
      </p>
      {results.length > PAGE_SIZES[0] && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 2, background: "#f0f4f1", borderRadius: 9, padding: 2, flexShrink: 0 }}>
          {PAGE_SIZES.map((size) => {
            const active = pageSize === size;
            return (
              <button
                key={size}
                type="button"
                onClick={() => setPageSize(size)}
                style={{
                  border: "none", cursor: "pointer", fontFamily: "inherit",
                  borderRadius: 7, padding: "4px 9px", fontSize: 11.5, fontWeight: 800,
                  background: active ? "#fff" : "transparent",
                  color: active ? GREEN : "#8aa093",
                  boxShadow: active ? "0 1px 2px rgba(0,0,0,.08)" : "none",
                  transition: "color .15s ease, background .15s ease",
                }}
              >
                {size}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  const categoryBackRow = isBrowseCatalog && cats.size > 0 ? (
    <div style={{ padding: `0 ${px}px 8px`, flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setCats(new Set())}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          border: "none", background: "transparent", cursor: "pointer",
          fontFamily: "inherit", fontSize: 12.5, fontWeight: 800, color: GREEN, padding: "2px 0",
        }}
      >
        <ChevronLeft size={15} /> Todas las categorías
      </button>
    </div>
  ) : null;

  const categoryGrid = (
    <div style={{ padding: `2px ${px}px 4px` }}>
      {allCats.map((catId, i) => {
        const meta = CATEGORY_META[catId];
        const Icon = meta?.icon ?? Utensils;
        const color = categoryColor(catId);
        return (
          <button
            key={catId}
            type="button"
            onClick={() => setCats(new Set([catId]))}
            className="filter-opt-row catalog-card-enter"
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              padding: "8px 4px", border: "none", background: "transparent",
              cursor: "pointer", fontFamily: "inherit", textAlign: "left",
              borderBottom: i === allCats.length - 1 ? "none" : "1px solid rgba(45,110,70,.2)",
              animationDelay: `${i < 14 ? i * 16 : 0}ms`,
            }}
          >
            <span
              style={{
                width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                overflow: "hidden", background: `${color}18`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {meta?.img
                ? <img src={meta.img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <Icon size={14} color={color} strokeWidth={2} />}
            </span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 800, color: "#142f1d", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {categoryLabel(catId)}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#9ab0a1", flexShrink: 0 }}>
              {categoryCounts[catId] ?? 0}
            </span>
            <ChevronRight size={16} color="#c2cfc7" style={{ flexShrink: 0 }} />
          </button>
        );
      })}
    </div>
  );

  const selectedRow = gatePick && (selectedPlato || selectedGarnish) ? (
    <div style={{ padding: `0 ${px}px 8px`, display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
      {selectedPlato && (
        <SelectedChip
          kind="plato"
          label={selectedPlato.name}
          onClear={() => onPickPlato?.(null)}
        />
      )}
      {selectedGarnish && (
        <SelectedChip
          kind="guarnicion"
          label={selectedGarnish.name}
          onClear={() => onPickGarnish?.(null)}
        />
      )}
    </div>
  ) : null;

  const cards = (
    <>
      {gatePick
        ? visible.map((entry, i) => (
            <GatePickCard
              key={`${entry.kind}-${entry.item.id}`}
              kind={entry.kind}
              item={entry.item}
              selected={
                entry.kind === "plato"
                  ? selectedPlatoId === entry.item.id
                  : selectedGarnishId === entry.item.id
              }
              onToggle={() => {
                if (entry.kind === "plato") {
                  onPickPlato?.(selectedPlatoId === entry.item.id ? null : entry.item.id);
                } else {
                  onPickGarnish?.(selectedGarnishId === entry.item.id ? null : entry.item.id);
                }
              }}
              animDelay={i < 12 ? i * 18 : 0}
            />
          ))
        : visible.map((r, i) => (
            <RecipeCard
              key={r.id}
              recipe={r}
              reference={reference}
              added={addedIds.has(r.id)}
              garnishId={garnishByCatalogId[r.id] ?? null}
              onAdd={() => onAdd?.(r)}
              onRemove={() => onRemove?.(r.id)}
              onOpenGarnish={() => setGarnishFor(r)}
              onOpenRecipe={onOpenRecipe}
              favorite={isRecipeFavorite(recipeVotes, r.id)}
              onSetFavoriteScope={onSetFavoriteScope}
              scopeGroups={scopeGroups}
              onOpenScopePicker={() => setScopeFor(r)}
              onChangeVisibility={onChangeVisibility}
              onDelete={onDeleteRecipe && r.source === "user" ? () => onDeleteRecipe(r.id) : undefined}
              onEdit={onEditRecipe && r.source === "user" ? () => onEditRecipe(r) : undefined}
              ownView={ownRecipesView}
              onCombine={onCombineGarnish && r.type === "principal" && r.source !== "user" ? () => setCombineFor(r) : undefined}
              animDelay={i < 12 ? i * 18 : 0}
            />
          ))}
      {results.length === 0 && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "50px 20px", textAlign: "center" }}>
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: 18,
              background: favoriteIds ? "#fdecef" : "#eef4f0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {favoriteIds ? <Heart size={26} color="#e0668a" /> : <Search size={26} color="#2d5a3d" />}
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "#7a9485", lineHeight: 1.5, maxWidth: 260 }}>
            {emptyLabel
              ? emptyLabel
              : gatePick
                ? "No encontramos platos ni guarniciones con esos filtros."
                : "No encontramos platos con esos filtros."}
          </p>
        </div>
      )}
    </>
  );

  const pager = hasMore ? (
    <div style={{ padding: `8px ${px}px calc(10px + env(safe-area-inset-bottom, 0px))`, borderTop: inline ? "none" : "1px solid #eef3f0", flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setLimit((n) => n + pageSize)}
        style={{
          width: "100%", height: 44, borderRadius: 12,
          border: "1.5px solid #e3ebe6", background: "#f4f7f5", color: GREEN,
          fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
        }}
      >
        Ver más
      </button>
    </div>
  ) : null;

  const overlays = (
    <>
      {garnishFor && (
        <GarnishPickerSheet
          recipe={garnishFor}
          currentGarnishId={garnishByCatalogId[garnishFor.id] ?? null}
          onSelect={(gid) => { onSetGarnish?.(garnishFor, gid); setGarnishFor(null); }}
          onClose={() => setGarnishFor(null)}
        />
      )}
      {combineFor && (
        <GarnishPickerSheet
          recipe={combineFor}
          currentGarnishId={null}
          title="Guardar con guarnición"
          subtitle={null}
          onSelect={(gid) => {
            const g = gid ? (GARNISH_BY_ID[gid] ?? garnishCatalog.find((x) => x.id === gid)) : null;
            if (g) onCombineGarnish?.(combineFor, g);
            setCombineFor(null);
          }}
          onClose={() => setCombineFor(null)}
        />
      )}
      {showFilters && (
        <FiltersSheet
          onClose={() => setShowFilters(false)}
          resultCount={results.length}
          allCats={allCats}
          allProteins={allProteins}
          cats={cats}
          setCats={setCats}
          proteins={proteins}
          setProteins={setProteins}
          maxTime={maxTime}
          setMaxTime={setMaxTime}
          difficulties={difficulties}
          setDifficulties={setDifficulties}
          kidOnly={kidOnly}
          setKidOnly={setKidOnly}
          activeFilterCount={activeFilterCount}
          onClear={clearFilters}
        />
      )}
      {scopeFor && (
        <FavoriteScopeModal
          recipeName={scopeFor.name}
          isFavorite={isRecipeFavorite(recipeVotes, scopeFor.id)}
          scope={getFavoriteScope(recipeVotes, scopeFor.id)}
          groups={scopeGroups}
          onPick={(key) => {
            applyFavoriteScopePick(key, { recipeId: scopeFor.id, onSetFavoriteScope });
            setScopeFor(null);
          }}
          onClose={() => setScopeFor(null)}
        />
      )}
    </>
  );

  // Inline mode — embedded straight into a screen (no bottom-sheet chrome).
  if (inline) {
    return (
      <div>
        {styleBlock}
        <div style={{ position: "sticky", top: 0, zIndex: 5, background: "#fff", paddingTop: 12 }}>
          {searchRow}
          {selectedRow}
          {categoryBackRow}
          {!showCategoryGrid && countRow}
        </div>
        {showCategoryGrid ? (
          categoryGrid
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: `2px ${px}px 0` }}>
            {cards}
          </div>
        )}
        {!showCategoryGrid && pager}
        {overlays}
      </div>
    );
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.45)",
        zIndex: 200,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="catalog-sheet-inner"
        style={{
          background: "#f5f9f6",
          borderRadius: "20px 20px 0 0",
          width: "100%",
          maxWidth: 420,
          height: "92dvh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {styleBlock}

        {/* ── Header ── */}
        <div style={{ padding: "16px 18px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: "#142f1d" }}>
                Explorar catálogo
              </h3>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "#7a9485" }}>
                Elige platos que ya sabes cocinar
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              style={{
                border: "none", background: "#f0f4f1", borderRadius: 999,
                width: 32, height: 32, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {searchRow}
        {countRow}

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            padding: "2px 18px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {cards}
        </div>

        {pager}
      </div>

      {overlays}
    </div>
  );
}

const FILTER_ROWS = [
  { key: "cats", label: "Categoría", icon: Tag },
  { key: "proteins", label: "Proteína", icon: Drumstick },
  { key: "time", label: "Tiempo máximo", icon: Clock },
  { key: "difficulty", label: "Dificultad", icon: BarChart3 },
  { key: "extras", label: "Extras", icon: Sparkles },
];

function FiltersSheet({
  onClose, resultCount,
  allCats, allProteins,
  cats, setCats, proteins, setProteins,
  maxTime, setMaxTime, difficulties, setDifficulties,
  kidOnly, setKidOnly,
  activeFilterCount, onClear,
}) {
  const [view, setView] = useState("list");

  const toggleIn = (setter) => (value) =>
    setter((prev) => {
      const next = new Set(prev);
      next.has(value) ? next.delete(value) : next.add(value);
      return next;
    });

  const summary = {
    cats: cats.size === 0 ? "Todas" : `${cats.size} ${cats.size === 1 ? "elegida" : "elegidas"}`,
    proteins: proteins.size === 0 ? "Todas" : `${proteins.size} ${proteins.size === 1 ? "elegida" : "elegidas"}`,
    time: TIME_OPTIONS.find((t) => t.value === maxTime)?.label ?? "Cualquiera",
    difficulty:
      difficulties.size === 0
        ? "Cualquiera"
        : [...difficulties].map((d) => DIFFICULTY_LABEL[d]).join(", "),
    extras: kidOnly ? "Niños" : "Ninguno",
  };

  const current = FILTER_ROWS.find((r) => r.key === view);

  const applyBtn = (
    <button
      type="button"
      onClick={onClose}
      style={{
        width: "100%", height: 50, borderRadius: 14, border: "none",
        background: GREEN, color: "#fff", fontSize: 15, fontWeight: 800,
        cursor: "pointer", fontFamily: "inherit",
      }}
    >
      Ver {resultCount} {resultCount === 1 ? "plato" : "platos"}
    </button>
  );

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 210,
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="catalog-sheet-inner"
        style={{
          background: "#f5f9f6", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 420,
          maxHeight: "82dvh", display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        <style>{`
          @keyframes checkPop {
            0%   { transform: scale(0.5); opacity: .4; }
            55%  { transform: scale(1.18); opacity: 1; }
            100% { transform: scale(1); }
          }
          .filter-opt-row {
            transition: background .16s ease;
          }
          .filter-opt-row:hover { background: rgba(45,90,61,.06); }
          .filter-opt-row:active { background: rgba(45,90,61,.11); }
          .filter-check {
            transition: background .18s cubic-bezier(.34,1.4,.6,1),
                        border-color .18s ease,
                        transform .18s cubic-bezier(.34,1.4,.6,1);
          }
          .filter-opt-row:active .filter-check { transform: scale(.88); }
          .filter-check-icon { animation: checkPop .22s cubic-bezier(.34,1.5,.6,1) both; }
        `}</style>

        {/* grabber */}
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 8, flexShrink: 0 }}>
          <span style={{ width: 38, height: 4, borderRadius: 999, background: "#dde7e0" }} />
        </div>

        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px 12px", flexShrink: 0 }}>
          {view !== "list" ? (
            <button
              type="button"
              onClick={() => setView("list")}
              aria-label="Volver"
              style={iconBtnStyle}
            >
              <ChevronLeft size={18} />
            </button>
          ) : null}
          <h3 style={{ flex: 1, margin: 0, fontSize: 17, fontWeight: 900, color: "#142f1d" }}>
            {view === "list" ? "Filtros" : current?.label}
          </h3>
          {view === "list" && activeFilterCount > 0 && (
            <button
              type="button"
              onClick={onClear}
              style={{
                border: "none", background: "transparent", color: GREEN,
                fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", padding: "4px 6px",
              }}
            >
              Limpiar
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Cerrar" style={iconBtnStyle}>
            <X size={18} />
          </button>
        </div>

        {/* body */}
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "0 16px" }}>
          {view === "list" && (
            <div>
              {FILTER_ROWS.map((row, i) => (
                <button
                  key={row.key}
                  type="button"
                  onClick={() => setView(row.key)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 12,
                    padding: "14px 2px", border: "none", background: "transparent",
                    cursor: "pointer", fontFamily: "inherit",
                    borderTop: i === 0 ? "none" : "1px solid #eef3f0",
                  }}
                >
                  <row.icon size={18} color={GREEN} />
                  <span style={{ flex: 1, textAlign: "left", fontSize: 14.5, fontWeight: 700, color: "#142f1d" }}>
                    {row.label}
                  </span>
                  <span
                    style={{
                      fontSize: 12.5, fontWeight: 700,
                      color: summaryActive(row.key, { cats, proteins, maxTime, difficulties, kidOnly }) ? GREEN : "#9ab0a1",
                      maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}
                  >
                    {summary[row.key]}
                  </span>
                  <ChevronRight size={17} color="#c2cfc7" />
                </button>
              ))}
            </div>
          )}

          {view === "cats" && (
            <div style={{ paddingTop: 4 }}>
              <CheckRow
                label="Todas las categorías"
                checked={cats.size === 0}
                onToggle={() => setCats(new Set())}
              />
              {allCats.map((c, i) => (
                <CheckRow
                  key={c}
                  icon={CATEGORY_META[c]?.icon ?? Utensils}
                  iconColor={categoryColor(c)}
                  img={categoryImageSrc(c)}
                  label={categoryLabel(c)}
                  checked={cats.has(c)}
                  last={i === allCats.length - 1}
                  onToggle={() => toggleIn(setCats)(c)}
                />
              ))}
            </div>
          )}
          {view === "proteins" && (
            <div style={{ paddingTop: 4 }}>
              <CheckRow
                label="Todas las proteínas"
                checked={proteins.size === 0}
                onToggle={() => setProteins(new Set())}
              />
              {allProteins.map((p, i) => (
                <CheckRow
                  key={p}
                  img={proteinImageSrc(p)}
                  label={titleCase(p)}
                  checked={proteins.has(p)}
                  last={i === allProteins.length - 1}
                  onToggle={() => toggleIn(setProteins)(p)}
                />
              ))}
            </div>
          )}
          {view === "time" && (
            <div style={{ paddingTop: 4 }}>
              {TIME_OPTIONS.map((t, i) => (
                <CheckRow
                  key={t.value}
                  icon={t.value === 0 ? null : Clock}
                  label={t.label}
                  checked={maxTime === t.value}
                  single
                  last={i === TIME_OPTIONS.length - 1}
                  onToggle={() => setMaxTime(t.value)}
                />
              ))}
            </div>
          )}
          {view === "difficulty" && (
            <div style={{ paddingTop: 4 }}>
              <CheckRow
                label="Cualquier dificultad"
                checked={difficulties.size === 0}
                onToggle={() => setDifficulties(new Set())}
              />
              {Object.keys(DIFFICULTY_LABEL).map((d, i, arr) => (
                <CheckRow
                  key={d}
                  label={DIFFICULTY_LABEL[d]}
                  checked={difficulties.has(d)}
                  last={i === arr.length - 1}
                  onToggle={() => toggleIn(setDifficulties)(d)}
                />
              ))}
            </div>
          )}
          {view === "extras" && (
            <div style={{ paddingTop: 4 }}>
              <CheckRow
                icon={Baby}
                label="Apto para niños"
                checked={kidOnly}
                last
                onToggle={() => setKidOnly((v) => !v)}
              />
            </div>
          )}
        </div>

        {/* footer */}
        <div
          style={{
            padding: "12px 16px calc(14px + env(safe-area-inset-bottom, 0px))",
            borderTop: "1px solid #eef3f0", flexShrink: 0,
          }}
        >
          {applyBtn}
        </div>
      </div>
    </div>
  );
}

function summaryActive(key, { cats, proteins, maxTime, difficulties, kidOnly }) {
  if (key === "cats") return cats.size > 0;
  if (key === "proteins") return proteins.size > 0;
  if (key === "time") return maxTime > 0;
  if (key === "difficulty") return difficulties.size > 0;
  if (key === "extras") return kidOnly;
  return false;
}

function CheckRow({ icon: Icon, iconColor, img, label, checked, single, onToggle, last }) {
  // The illustration wins when there is one; the flat icon stays as the fallback
  // so a missing file degrades instead of leaving the label unaligned.
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = Boolean(img) && !imgFailed;
  return (
    <button
      type="button"
      onClick={onToggle}
      className="filter-opt-row"
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 12,
        padding: showImg ? "8px 10px" : "13px 10px",
        border: "none", background: "transparent",
        cursor: "pointer", fontFamily: "inherit", borderRadius: 10, textAlign: "left",
        borderBottom: last ? "none" : "1px solid rgba(45,110,70,.2)",
      }}
    >
      {showImg ? (
        <span
          style={{
            width: 34, height: 34, borderRadius: 9, flexShrink: 0,
            overflow: "hidden", background: "#f2f7f4",
          }}
        >
          <img
            src={img}
            alt=""
            onError={() => setImgFailed(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </span>
      ) : Icon ? (
        <span style={{ flexShrink: 0, display: "flex", width: 20, justifyContent: "center" }}>
          <Icon size={18} color={iconColor || GREEN} strokeWidth={2} />
        </span>
      ) : null}
      <span
        style={{
          flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: checked ? 800 : 600,
          color: checked ? GREEN : "#142f1d",
          transition: "color .16s ease",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      <span
        className="filter-check"
        style={{
          width: 22, height: 22, flexShrink: 0,
          borderRadius: single ? 999 : 6,
          border: `1.5px solid ${checked ? GREEN : "#cdd8d0"}`,
          background: checked ? GREEN : "#fff",
          color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {checked && <Check className="filter-check-icon" size={14} strokeWidth={3} />}
      </span>
    </button>
  );
}

const iconBtnStyle = {
  border: "none", background: "#f0f4f1", borderRadius: 999,
  width: 32, height: 32, cursor: "pointer", flexShrink: 0,
  display: "flex", alignItems: "center", justifyContent: "center",
};

function SelectedChip({ kind, label, onClear }) {
  const Icon = kind === "guarnicion" ? Salad : Utensils;
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
        borderRadius: 10, border: `1.5px solid ${GREEN}`, background: "#eaf6ee",
      }}
    >
      <Icon size={14} color={GREEN} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: GREEN, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {kind === "guarnicion" ? "Guarnición: " : "Plato: "}{label}
      </span>
      <button
        type="button"
        onClick={onClear}
        aria-label="Quitar selección"
        style={{
          width: 22, height: 22, borderRadius: 6, border: "none", background: "#fff",
          color: GREEN, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}
      >
        <X size={12} />
      </button>
    </div>
  );
}

function GatePickCard({ kind, item, selected, onToggle, animDelay = 0 }) {
  const isPlato = kind === "plato";
  const color = isPlato ? categoryColor(item.category) : "#3f9656";
  const photo = isPlato ? (item.photo ?? dishImageUrl(item.id)) : null;

  return (
    <button
      type="button"
      onClick={onToggle}
      className="catalog-card-enter"
      style={{
        width: "100%", textAlign: "left", cursor: "pointer", fontFamily: "inherit",
        flexShrink: 0, borderRadius: 14,
        border: `1.5px solid ${selected ? "#bfe6cb" : "#eef3f0"}`,
        background: selected ? "#f2fbf5" : "#fff",
        transition: "border-color .15s ease, background .15s ease",
        overflow: "hidden", animationDelay: `${animDelay}ms`,
        padding: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 8 }}>
        <div
          style={{
            width: 52, height: 52, borderRadius: 12, flexShrink: 0, overflow: "hidden",
            boxSizing: "border-box", border: `2.5px solid ${color}`,
            background: `${color}14`, display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {photo ? (
            <img src={deckImg(photo, 104)} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : isPlato ? (
            <CategoryIcon category={item.category} size={22} />
          ) : (
            <Salad size={22} color={color} />
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              margin: 0, fontSize: 13.5, fontWeight: 800, color: "#142f1d", lineHeight: 1.25,
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
            }}
          >
            {item.name}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 800, color }}>
              {isPlato ? categoryLabel(item.category) : "Guarnición"}
            </span>
            {item.source === "user" && (
              <span
                style={{
                  fontSize: 10, fontWeight: 800, color: GREEN, background: "#eaf6ee",
                  padding: "2px 6px", borderRadius: 6, letterSpacing: ".2px",
                }}
              >
                Tuya
              </span>
            )}
            {item.time != null && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, color: "#7a9485" }}>
                <Clock size={11} /> {item.time} min
              </span>
            )}
          </div>
        </div>

        <span
          style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            border: "none", background: selected ? GREEN : "#eaf3ed", color: selected ? "#fff" : GREEN,
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "background .15s ease, color .15s ease",
          }}
        >
          {selected ? <Check size={18} /> : <Plus size={18} />}
        </span>
      </div>
    </button>
  );
}

// Inline visibility quick-change pill for user-owned recipes (browse mode).
const VIS_META = {
  public:  { icon: Globe,  label: "Pública",     color: "#2d5a3d", bg: "#e6f3ea" },
  friends: { icon: Users2, label: "Solo amigos", color: "#7a4e00", bg: "#fff8e7" },
  private: { icon: Lock,   label: "Privada",     color: "#5a2d7a", bg: "#f5edfc" },
};

function VisibilityMiniPill({ visibility = "private", onChange }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const [menuPos, setMenuPos] = useState(null);
  const current = VIS_META[visibility] ?? VIS_META.private;
  const Icon = current.icon;

  // The card clips overflow (rounded thumbnail), so an absolutely-positioned
  // dropdown was invisible. Render it in a portal with fixed coords measured
  // from the trigger, and flip above if there's no room below.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const measure = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const MENU_H = 150;
      const below = window.innerHeight - r.bottom;
      const openUp = below < MENU_H && r.top > below;
      setMenuPos({
        left: r.left,
        top: openUp ? undefined : r.bottom + 4,
        bottom: openUp ? window.innerHeight - r.top + 4 : undefined,
      });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = () => setOpen(false);
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [open]);

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "3px 8px 3px 6px", borderRadius: 999, border: "none", cursor: "pointer",
          background: current.bg, fontFamily: "inherit",
        }}
      >
        <Icon size={10} color={current.color} />
        <span style={{ fontSize: 10, fontWeight: 700, color: current.color }}>{current.label}</span>
        <ChevronDown size={9} color={current.color} />
      </button>
      {open && menuPos && createPortal(
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed", left: menuPos.left, top: menuPos.top, bottom: menuPos.bottom, zIndex: 400,
            background: "#fff", borderRadius: 12, border: "1.5px solid #e8efe9",
            boxShadow: "0 6px 20px rgba(0,0,0,.12)", minWidth: 146, overflow: "hidden",
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
        </div>,
        document.body
      )}
    </div>
  );
}

function RecipeCard({
  recipe, reference = false, added, garnishId, onAdd, onRemove, onOpenGarnish,
  onOpenRecipe, favorite, onSetFavoriteScope, scopeGroups = [], onOpenScopePicker, onChangeVisibility, onDelete, onEdit, onCombine, ownView = false, animDelay = 0,
}) {
  const hasScopeChoice = scopeGroups.length > 1 && onOpenScopePicker;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const color = categoryColor(recipe.category);
  const isPrincipal = recipe.type === "principal";
  const garnish = garnishId ? GARNISH_BY_ID[garnishId] : null;
  const photo = recipe.photo ?? dishImageUrl(recipe.id, garnishId ?? undefined);

  const card = (
    <div
      className="catalog-card-enter"
      style={{
        flexShrink: 0,
        borderRadius: 14,
        border: `1.5px solid ${added ? "#bfe6cb" : "#eef3f0"}`,
        background: added ? "#f2fbf5" : "#fff",
        transition: "border-color .15s ease, background .15s ease",
        overflow: "hidden",
        animationDelay: `${animDelay}ms`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 8 }}>
        {/* thumbnail — colored ring per category. Its own open-recipe button so
            the favorite button below is a SIBLING, never nested inside another
            <button> (invalid HTML → React hydration warning + flaky taps). */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button
            type="button"
            onClick={reference && onOpenRecipe ? () => onOpenRecipe(recipe) : undefined}
            disabled={!reference || !onOpenRecipe}
            aria-label={reference && onOpenRecipe ? `Ver ${recipe.name}` : undefined}
            style={{
              display: "block", padding: 0, border: "none", background: "transparent",
              cursor: reference && onOpenRecipe ? "pointer" : "default",
            }}
          >
            <div
              style={{
                width: 52, height: 52, borderRadius: 12, overflow: "hidden",
                boxSizing: "border-box", border: `2.5px solid ${color}`,
                background: `${color}14`, display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {photo ? (
                <img src={deckImg(photo, 104)} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <CategoryIcon category={recipe.category} size={22} />
              )}
            </div>
          </button>
          {/* Favorite badge — floats over the photo corner, sibling of the
              thumbnail button above. */}
          {reference && onSetFavoriteScope && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (hasScopeChoice) onOpenScopePicker();
                else onSetFavoriteScope(recipe.id, favorite ? null : "all");
              }}
              aria-label={favorite ? "Quitar de favoritas" : "Añadir a favoritas"}
              title={favorite ? "Quitar de favoritas" : "Añadir a favoritas"}
              style={{
                position: "absolute", top: -6, right: -6,
                width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                border: "2px solid #fff", cursor: "pointer",
                background: favorite ? "#e0405a" : "#fff",
                boxShadow: "0 1px 4px rgba(0,0,0,.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all .15s ease",
              }}
            >
              <Heart
                size={11}
                color={favorite ? "#fff" : "#c9b8ae"}
                strokeWidth={2.4}
                fill={favorite ? "#fff" : "none"}
              />
            </button>
          )}
        </div>

        {/* info — its own open-recipe button (sibling of the thumbnail one) */}
        <button
          type="button"
          onClick={reference && onOpenRecipe ? () => onOpenRecipe(recipe) : undefined}
          disabled={!reference || !onOpenRecipe}
          style={{
            flex: 1, minWidth: 0, display: "block",
            padding: 0, border: "none", background: "transparent",
            cursor: reference && onOpenRecipe ? "pointer" : "default",
            fontFamily: "inherit", textAlign: "left",
          }}
        >
          <p
            style={{
              margin: 0, fontSize: 13.5, fontWeight: 800, color: "#142f1d", lineHeight: 1.25,
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
            }}
          >
            {recipe.name}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 800, color }}>{categoryLabel(recipe.category)}</span>
            {recipe.source === "user" && !ownView && (
              <span
                style={{
                  fontSize: 10, fontWeight: 800, color: GREEN, background: "#eaf6ee",
                  padding: "2px 6px", borderRadius: 6, letterSpacing: ".2px",
                }}
              >
                Tuya
              </span>
            )}
            {favorite && (
              <span style={{ fontSize: 10, fontWeight: 800, color: GREEN, background: "#eaf6ee", padding: "2px 6px", borderRadius: 6 }}>
                Favorita
              </span>
            )}
            {recipe.time != null && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, color: "#7a9485" }}>
                <Clock size={11} /> {recipe.time} min
              </span>
            )}
            {recipe.kcal != null && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, color: "#7a9485" }}>
                <Flame size={11} /> {recipe.kcal} kcal
              </span>
            )}
          </div>
          {isPrincipal && added && garnish && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 5, fontSize: 11, fontWeight: 700, color: GREEN }}>
              <Salad size={12} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 170 }}>
                {garnish.name}
              </span>
            </div>
          )}
        </button>

        {/* Reference mode: owner + votes column (+ optional garnish combo) */}
        {reference ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {onCombine && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onCombine(); }}
                aria-label={`Guardar ${recipe.name} con guarnición`}
                title="Guardar con guarnición en Mis recetas"
                style={{
                  width: 34, height: 34, borderRadius: 10, flexShrink: 0, cursor: "pointer",
                  border: `1.5px dashed ${GREEN}`, background: "#fff", color: GREEN,
                  display: "flex", alignItems: "center", justifyContent: "center", position: "relative",
                }}
              >
                <Salad size={16} />
                <span
                  style={{
                    position: "absolute", bottom: -3, right: -3, width: 15, height: 15,
                    borderRadius: "50%", background: GREEN, color: "#fff", border: "1.5px solid #fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Plus size={9} strokeWidth={3} />
                </span>
              </button>
            )}
            <RecipeProvenance recipe={recipe} />
          </div>
        ) : (
          <>
            {/* garnish icon button — only for principal dishes once added */}
            {isPrincipal && added && (
              <button
                type="button"
                onClick={onOpenGarnish}
                aria-label={garnish ? `Cambiar guarnición de ${recipe.name}` : `Añadir guarnición a ${recipe.name}`}
                title={garnish ? "Cambiar guarnición" : "Añadir guarnición"}
                style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0, cursor: "pointer",
                  border: garnish ? "none" : `1.5px dashed ${GREEN}`,
                  background: garnish ? GREEN : "#fff",
                  color: garnish ? "#fff" : GREEN,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all .12s ease",
                }}
              >
                <Salad size={17} />
              </button>
            )}

            {/* add / added toggle */}
            <button
              type="button"
              onClick={added ? onRemove : onAdd}
              aria-label={added ? `Quitar ${recipe.name}` : `Añadir ${recipe.name}`}
              className={added ? "catalog-added-pop" : undefined}
              style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0, cursor: "pointer",
                border: "none",
                background: added ? GREEN : "#eaf3ed",
                color: added ? "#fff" : GREEN,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background .15s ease, color .15s ease",
              }}
            >
              {added ? <Check size={18} /> : <Plus size={18} />}
            </button>
          </>
        )}
      </div>
      {/* Owner-only: inline visibility control (Mis recetas). Delete/edit now
          live OUTSIDE the card (see actions column below). */}
      {reference && recipe.source === "user" && onChangeVisibility && (
        <div
          style={{ padding: "0 8px 9px 66px", display: "flex", alignItems: "center", gap: 8 }}
          onClick={(e) => e.stopPropagation()}
        >
          <VisibilityMiniPill
            visibility={recipe.visibility ?? "private"}
            onChange={(v) => onChangeVisibility(recipe.id, v)}
          />
        </div>
      )}
    </div>
  );

  // "Mis recetas" view: edit + delete icons live OUTSIDE the card, on the
  // right, as a vertical column (delete asks for confirmation inline).
  if (!ownView || (!onEdit && !onDelete)) return card;
  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: 8 }}>
      <div style={{ flex: 1, minWidth: 0 }}>{card}</div>
      <div
        style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 8, flexShrink: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        {confirmDelete ? (
          <>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
              aria-label={`Borrar ${recipe.name}`}
              title="Confirmar borrado"
              style={{
                width: 38, height: 38, borderRadius: 11, flexShrink: 0, border: "none", cursor: "pointer",
                background: "#c0392b", color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <Trash2 size={16} />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
              aria-label="Cancelar"
              title="Cancelar"
              style={{
                width: 38, height: 38, borderRadius: 11, flexShrink: 0, cursor: "pointer",
                border: "1.5px solid #e8efe9", background: "#fff", color: "#7a9485",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <X size={16} />
            </button>
          </>
        ) : (
          <>
            {onEdit && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                aria-label={`Editar ${recipe.name}`}
                title="Editar receta"
                style={{
                  width: 38, height: 38, borderRadius: 11, flexShrink: 0, cursor: "pointer",
                  border: "1.5px solid #e0e8e3", background: "#fff", color: GREEN,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <Pencil size={15} />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
                aria-label={`Borrar ${recipe.name}`}
                title="Borrar receta"
                style={{
                  width: 38, height: 38, borderRadius: 11, flexShrink: 0, cursor: "pointer",
                  border: "none", background: "#fdecea", color: "#c0392b",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <Trash2 size={15} />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Small centered popup shown when tapping the heart on a recipe card in a
// multi-group household: picks whether the favorite applies to everyone or
// to one specific group, in a single tap.
function GarnishPickerSheet({ recipe, currentGarnishId, onSelect, onClose, title, subtitle }) {
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 220,
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="catalog-sheet-inner"
        style={{
          background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 420,
          maxHeight: "82dvh", display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        {/* grabber */}
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 8, flexShrink: 0 }}>
          <span style={{ width: 38, height: 4, borderRadius: 999, background: "#dde7e0" }} />
        </div>

        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px 12px", flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: "#142f1d" }}>{title ?? "Elige guarnición"}</h3>
            {subtitle !== null && (
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "#7a9485", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {subtitle ?? `para ${recipe.name}`}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={iconBtnStyle}>
            <X size={18} />
          </button>
        </div>

        {/* list — lean, tabulated rows */}
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "0 18px 18px" }}>
          <GarnishRow
            label="Sin guarnición"
            selected={currentGarnishId == null}
            onSelect={() => onSelect(null)}
          />
          {GARNISHES.map((g) => (
            <GarnishRow
              key={g.id}
              label={g.name}
              time={g.time}
              selected={g.id === currentGarnishId}
              onSelect={() => onSelect(g.id === currentGarnishId ? null : g.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function GarnishRow({ label, time, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10,
        padding: "11px 2px", border: "none", borderBottom: "1px solid #eef3f0",
        background: "transparent", cursor: "pointer", fontFamily: "inherit",
      }}
    >
      <span
        style={{
          flex: 1, minWidth: 0, textAlign: "left",
          fontSize: 14, fontWeight: selected ? 800 : 600,
          color: selected ? GREEN : "#142f1d",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      {time != null && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11.5, color: "#9ab0a1", flexShrink: 0 }}>
          <Clock size={11} /> {time} min
        </span>
      )}
      <span
        style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: selected ? GREEN : "#eaf3ed",
          color: selected ? "#fff" : GREEN,
        }}
      >
        {selected ? <Check size={16} /> : <Plus size={16} />}
      </span>
    </button>
  );
}

