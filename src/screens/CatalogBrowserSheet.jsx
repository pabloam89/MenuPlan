import React, { useEffect, useMemo, useState } from "react";
import {
  Search,
  SlidersHorizontal,
  X,
  Plus,
  Check,
  Clock,
  Flame,
  Baby,
  Boxes,
  Drumstick,
  Fish,
  Egg,
  Wheat,
  Soup,
  Salad,
  Bean,
  Utensils,
  Tag,
  ChevronRight,
  ChevronLeft,
  BarChart3,
  Sparkles,
} from "lucide-react";
import { recipeCatalog } from "../data/recipeCatalog.js";
import guarnicionesData from "../data/recipes/guarniciones.json";
import { dishImageUrl } from "../assets/dishes/dishImages.js";

const GARNISHES = guarnicionesData;
const GARNISH_BY_ID = Object.fromEntries(guarnicionesData.map((g) => [g.id, g]));

const GREEN = "#2d5a3d";

const CATEGORY_META = {
  legumbres: { label: "Legumbres", icon: Bean, color: "#b9770e" },
  carnes: { label: "Carnes", icon: Drumstick, color: "#c0392b" },
  pescados: { label: "Pescados", icon: Fish, color: "#2f6f9f" },
  huevos: { label: "Huevos", icon: Egg, color: "#d4a017" },
  pasta_arroces: { label: "Pasta y arroz", icon: Wheat, color: "#cf7833" },
  sopas_cremas: { label: "Sopas y cremas", icon: Soup, color: "#8a6cc4" },
  ensaladas_verduras: { label: "Verduras", icon: Salad, color: "#3f9656" },
  platos_unicos: { label: "Platos únicos", icon: Utensils, color: "#5a7066" },
  cenas_rapidas: { label: "Cenas rápidas", icon: Soup, color: "#d56b9a" },
  bebes: { label: "Bebés", icon: Baby, color: "#6cb4c4" },
};

const DEFAULT_COLOR = "#5a7066";
function categoryColor(cat) {
  return CATEGORY_META[cat]?.color ?? DEFAULT_COLOR;
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
  const t = String(s ?? "").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

function categoryLabel(cat) {
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
export function CatalogBrowserSheet({ onClose, addedIds, garnishByCatalogId = {}, onAdd, onRemove, onSetGarnish }) {
  const [query, setQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [cats, setCats] = useState(() => new Set());
  const [proteins, setProteins] = useState(() => new Set());
  const [maxTime, setMaxTime] = useState(0);
  const [difficulties, setDifficulties] = useState(() => new Set());
  const [kidOnly, setKidOnly] = useState(false);
  const [tupperOnly, setTupperOnly] = useState(false);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [garnishFor, setGarnishFor] = useState(null);

  const { allCats, allProteins } = useMemo(() => {
    const c = new Set();
    const p = new Set();
    for (const r of recipeCatalog) {
      if (r.category) c.add(r.category);
      if (r.mainProtein) p.add(r.mainProtein);
    }
    return {
      allCats: [...c].sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b))),
      allProteins: [...p].sort((a, b) => a.localeCompare(b)),
    };
  }, []);

  const activeFilterCount =
    cats.size +
    proteins.size +
    difficulties.size +
    (maxTime ? 1 : 0) +
    (kidOnly ? 1 : 0) +
    (tupperOnly ? 1 : 0);

  const results = useMemo(() => {
    const q = norm(query);
    const filtered = recipeCatalog.filter((r) => {
      if (q && !norm(r.name).includes(q)) return false;
      if (cats.size && !cats.has(r.category)) return false;
      if (proteins.size && !proteins.has(r.mainProtein)) return false;
      if (maxTime && (r.time ?? 999) > maxTime) return false;
      if (difficulties.size && !difficulties.has(r.difficulty)) return false;
      if (kidOnly && !r.kidFriendly) return false;
      if (tupperOnly && !r.tupperFriendly) return false;
      return true;
    });
    if (q) {
      filtered.sort((a, b) => {
        const aStarts = norm(a.name).startsWith(q) ? 0 : 1;
        const bStarts = norm(b.name).startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return a.name.localeCompare(b.name);
      });
    } else {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    }
    return filtered;
  }, [query, cats, proteins, maxTime, difficulties, kidOnly, tupperOnly]);

  // Reset pagination whenever the result set or page size changes.
  useEffect(() => {
    setLimit(pageSize);
  }, [query, cats, proteins, maxTime, difficulties, kidOnly, tupperOnly, pageSize]);

  const visible = results.slice(0, limit);
  const hasMore = results.length > visible.length;

  const clearFilters = () => {
    setCats(new Set());
    setProteins(new Set());
    setMaxTime(0);
    setDifficulties(new Set());
    setKidOnly(false);
    setTupperOnly(false);
  };

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
          background: "#fff",
          borderRadius: "20px 20px 0 0",
          width: "100%",
          maxWidth: 420,
          height: "92dvh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
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

          {/* Search + Filtros */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
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
                placeholder="Buscar plato…"
                style={{
                  flex: 1, border: "none", background: "transparent", outline: "none",
                  fontSize: 14, color: "#1a3a24", fontFamily: "inherit", minWidth: 0,
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
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              style={{
                position: "relative", display: "inline-flex", alignItems: "center", gap: 7,
                height: 42, padding: "0 14px", borderRadius: 12, cursor: "pointer",
                border: `1.5px solid ${showFilters || activeFilterCount ? GREEN : "#e8efe9"}`,
                background: showFilters || activeFilterCount ? GREEN : "#fff",
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
          </div>
        </div>

        {/* ── Results count + page size ── */}
        <div style={{ padding: "10px 18px 6px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#7a9485", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {results.length === 0
              ? "Sin resultados — prueba a quitar filtros"
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

        {/* ── Results list ── */}
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
          {visible.map((r, i) => (
            <RecipeCard
              key={r.id}
              recipe={r}
              added={addedIds.has(r.id)}
              garnishId={garnishByCatalogId[r.id] ?? null}
              onAdd={() => onAdd(r)}
              onRemove={() => onRemove(r.id)}
              onOpenGarnish={() => setGarnishFor(r)}
              animDelay={i < 12 ? i * 18 : 0}
            />
          ))}
          {results.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "#9ab0a1" }}>
              <Search size={32} color="#cdd8d0" />
              <p style={{ margin: "10px 0 0", fontSize: 13 }}>No encontramos platos con esos filtros.</p>
            </div>
          )}
        </div>

        {/* ── Sticky pager ── */}
        {hasMore && (
          <div style={{ padding: "8px 18px calc(10px + env(safe-area-inset-bottom, 0px))", borderTop: "1px solid #eef3f0", flexShrink: 0 }}>
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
        )}
      </div>

      {garnishFor && (
        <GarnishPickerSheet
          recipe={garnishFor}
          currentGarnishId={garnishByCatalogId[garnishFor.id] ?? null}
          onSelect={(gid) => { onSetGarnish?.(garnishFor, gid); setGarnishFor(null); }}
          onClose={() => setGarnishFor(null)}
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
          tupperOnly={tupperOnly}
          setTupperOnly={setTupperOnly}
          activeFilterCount={activeFilterCount}
          onClear={clearFilters}
        />
      )}
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
  kidOnly, setKidOnly, tupperOnly, setTupperOnly,
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
    extras:
      [kidOnly && "Niños", tupperOnly && "Tupper"].filter(Boolean).join(", ") || "Ninguno",
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
        style={{
          background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 420,
          maxHeight: "82dvh", display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        <style>{`
          .filter-opt-row {
            transition: background .13s ease;
          }
          .filter-opt-row:hover { background: #f4f7f5; }
          .filter-opt-row:active { background: #eaf1ec; }
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
                      color: summaryActive(row.key, { cats, proteins, maxTime, difficulties, kidOnly, tupperOnly }) ? GREEN : "#9ab0a1",
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
              {allCats.map((c) => (
                <CheckRow
                  key={c}
                  icon={CATEGORY_META[c]?.icon ?? Utensils}
                  iconColor={categoryColor(c)}
                  label={categoryLabel(c)}
                  checked={cats.has(c)}
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
              {allProteins.map((p) => (
                <CheckRow
                  key={p}
                  label={titleCase(p)}
                  checked={proteins.has(p)}
                  onToggle={() => toggleIn(setProteins)(p)}
                />
              ))}
            </div>
          )}
          {view === "time" && (
            <div style={{ paddingTop: 4 }}>
              {TIME_OPTIONS.map((t) => (
                <CheckRow
                  key={t.value}
                  icon={t.value === 0 ? null : Clock}
                  label={t.label}
                  checked={maxTime === t.value}
                  single
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
              {Object.keys(DIFFICULTY_LABEL).map((d) => (
                <CheckRow
                  key={d}
                  label={DIFFICULTY_LABEL[d]}
                  checked={difficulties.has(d)}
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
                onToggle={() => setKidOnly((v) => !v)}
              />
              <CheckRow
                icon={Boxes}
                label="Para tupper"
                checked={tupperOnly}
                onToggle={() => setTupperOnly((v) => !v)}
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

function summaryActive(key, { cats, proteins, maxTime, difficulties, kidOnly, tupperOnly }) {
  if (key === "cats") return cats.size > 0;
  if (key === "proteins") return proteins.size > 0;
  if (key === "time") return maxTime > 0;
  if (key === "difficulty") return difficulties.size > 0;
  if (key === "extras") return kidOnly || tupperOnly;
  return false;
}

function CheckRow({ icon: Icon, iconColor, label, checked, single, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="filter-opt-row"
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 12,
        padding: "12px 10px", border: "none", background: "transparent",
        cursor: "pointer", fontFamily: "inherit", borderRadius: 10, textAlign: "left",
      }}
    >
      {Icon && (
        <span style={{ flexShrink: 0, display: "flex", width: 20, justifyContent: "center" }}>
          <Icon size={18} color={iconColor || GREEN} strokeWidth={2} />
        </span>
      )}
      <span
        style={{
          flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: checked ? 800 : 600,
          color: checked ? GREEN : "#142f1d",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      <span
        style={{
          width: 22, height: 22, flexShrink: 0,
          borderRadius: single ? 999 : 6,
          border: `1.5px solid ${checked ? GREEN : "#cdd8d0"}`,
          background: checked ? GREEN : "#fff",
          color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
          transition: "background .13s ease, border-color .13s ease",
        }}
      >
        {checked && <Check size={14} strokeWidth={3} />}
      </span>
    </button>
  );
}

const iconBtnStyle = {
  border: "none", background: "#f0f4f1", borderRadius: 999,
  width: 32, height: 32, cursor: "pointer", flexShrink: 0,
  display: "flex", alignItems: "center", justifyContent: "center",
};

function RecipeCard({ recipe, added, garnishId, onAdd, onRemove, onOpenGarnish, animDelay = 0 }) {
  const color = categoryColor(recipe.category);
  const isPrincipal = recipe.type === "principal";
  const garnish = garnishId ? GARNISH_BY_ID[garnishId] : null;
  const photo = dishImageUrl(recipe.id, garnishId ?? undefined);

  return (
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
        {/* thumbnail — colored ring per category */}
        <div
          style={{
            width: 52, height: 52, borderRadius: 12, flexShrink: 0, overflow: "hidden",
            boxSizing: "border-box", border: `2.5px solid ${color}`,
            background: `${color}14`, display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {photo ? (
            <img src={photo} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <CategoryIcon category={recipe.category} size={22} />
          )}
        </div>

        {/* info */}
        <div style={{ flex: 1, minWidth: 0 }}>
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
        </div>

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
      </div>
    </div>
  );
}

function GarnishPickerSheet({ recipe, currentGarnishId, onSelect, onClose }) {
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
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: "#142f1d" }}>Elige guarnición</h3>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "#7a9485", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              para {recipe.name}
            </p>
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

