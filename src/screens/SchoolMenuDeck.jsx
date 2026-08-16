import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Check, Pencil, Fish, Drumstick, Egg, Soup, Wheat, Leaf, ChefHat, Apple, X, Trash2 } from "lucide-react";
import { SCHOOL_DAYS, SCHOOL_COURSES } from "../lib/schoolMenu.js";
import { visualForRecipe } from "../assets/dishes/dishVisuals.js";
import { dishImageForRecipe, dishImageUrl } from "../assets/dishes/dishImages.js";
import { deckImg, deckSrcSet } from "../lib/dishPhotoOptimize.js";
import { catalogMatchesForFixedDish } from "../lib/fixedDishes.js";
import { recipeCatalog } from "../data/recipeCatalog.js";
import { Avatar } from "../components/ui.jsx";
import { memberAvatarColor, memberAvatarThumbSrc } from "../lib/stages.js";

// Fast lookup by catalog id — built once at module init.
const CATALOG_BY_ID = Object.fromEntries(recipeCatalog.map((r) => [r.id, r]));

const SCHOOL_DAY_LABELS = {
  Lun: "Lunes",
  Mar: "Martes",
  "Mié": "Miércoles",
  Jue: "Jueves",
  Vie: "Viernes",
};

const COURSE_LABEL = { Primero: "1º", Segundo: "2º", Postre: "Postre" };

// Mirrors aiPlanner's ICON_TYPE_MAP / CATEGORY_ICON — inlined so this review
// component doesn't pull the whole planner (and its AI client) into the
// onboarding bundle just for two constant lookup tables.
const ICON_TYPE_MAP = {
  pescado_blanco: "fish", pescado_azul: "fish", marisco: "fish",
  pollo: "meat", cerdo: "meat", ternera: "meat",
  huevo: "egg",
  legumbre: "legume",
  none: "chef",
};
const CATEGORY_ICON = {
  pasta_arroces: "pasta",
  sopas_cremas: "soup",
  ensaladas_verduras: "greens",
  platos_unicos: "chef",
  cenas_rapidas: "chef",
};

// Postres have no catalog match / dish photo — give them a warm fruit surface so
// they don't fall back to the generic "chef" grey.
const FRUIT_VISUAL = { surface: "#f7d9e6", ink: "#8a2a56", accent: "#d1568c", label: "Postre" };

// When there's no dish photo, we still show "an image of the category type".
// Preferred: the vivid category illustration (public/categories/*.png). If even
// that fails to load, we fall back to a big lucide icon over the coloured
// surface.
const TYPE_ICON = {
  fish: Fish,
  meat: Drumstick,
  egg: Egg,
  legume: Soup,
  pasta: Wheat,
  rice: Wheat,
  greens: Leaf,
  soup: Soup,
  fruit: Apple,
  chef: ChefHat,
};

const TYPE_ILLUSTRATION = {
  fish: "/categories/pescados.png",
  meat: "/categories/carnes.png",
  egg: "/categories/huevos.png",
  legume: "/categories/legumbres.png",
  pasta: "/categories/pasta_arroces.png",
  rice: "/categories/pasta_arroces.png",
  greens: "/categories/ensaladas_verduras.png",
  soup: "/categories/sopas_cremas.png",
  fruit: "/categories/frutas.png",
  chef: "/categories/platos_unicos.png",
};

// Categories that have their own illustration in public/categories.
const CATEGORY_WITH_ILLUSTRATION = new Set([
  "legumbres", "carnes", "pescados", "huevos", "pasta_arroces", "sopas_cremas",
  "ensaladas_verduras", "platos_unicos", "cenas_rapidas", "postres",
]);

function illustrationFor(category, iconType) {
  if (category && CATEGORY_WITH_ILLUSTRATION.has(category)) return `/categories/${category}.png`;
  return TYPE_ILLUSTRATION[iconType] ?? TYPE_ILLUSTRATION.chef;
}

// Manual category choices offered in the edit popup. `key` is the persisted
// override (matches a public/categories/*.png) and drives both the illustration
// and the fallback icon/colour.
const CATEGORY_CHOICES = [
  { key: "pescados", label: "Pescado", iconType: "fish" },
  { key: "carnes", label: "Carne", iconType: "meat" },
  { key: "huevos", label: "Huevos", iconType: "egg" },
  { key: "legumbres", label: "Legumbre", iconType: "legume" },
  { key: "pasta_arroces", label: "Pasta / Arroz", iconType: "pasta" },
  { key: "sopas_cremas", label: "Sopa / Crema", iconType: "soup" },
  { key: "ensaladas_verduras", label: "Verdura", iconType: "greens" },
  { key: "platos_unicos", label: "Plato único", iconType: "chef" },
  { key: "postres", label: "Postre", iconType: "fruit" },
];
const CATEGORY_BY_KEY = Object.fromEntries(CATEGORY_CHOICES.map((c) => [c.key, c]));
// Reverse of the auto-resolved iconType → the category illustration it maps to,
// so we can preselect the right chip when the dish had no manual override.
const ICONTYPE_TO_CATEGORY = { fish: "pescados", meat: "carnes", egg: "huevos", legume: "legumbres", pasta: "pasta_arroces", rice: "pasta_arroces", soup: "sopas_cremas", greens: "ensaladas_verduras", fruit: "postres", chef: "platos_unicos" };

function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// Short function words to skip when extracting content keywords from a dish name.
const STOP = new Set(["con","del","una","los","las","para","sin","por","que","muy","hay","esta","este","como","mas","sus","les","nos","son","han","fue","ser","unos","unas"]);

function extractKeywords(name) {
  return norm(name)
    .split(/[\s\-/,;]+/)
    .filter((w) => w.length > 3 && !STOP.has(w));
}

function wordOverlapScore(school, catalog) {
  const ws = new Set(extractKeywords(school));
  const wc = new Set(extractKeywords(catalog));
  if (!ws.size || !wc.size) return 0;
  let n = 0;
  for (const w of ws) if (wc.has(w)) n++;
  return n / Math.min(ws.size, wc.size);
}

// Best-effort catalog recipe for a free-text school dish name.
// Strategy (per each "/" part of the name):
//   1. Exact substring match via catalogMatchesForFixedDish (fast, precise).
//   2. Keyword fallback: union of matches from each significant word, scored by
//      word overlap with the original school name → picks the best one.
//      Tiebreaker: prefer the candidate whose name length is closest to the school name.
function matchCatalogRecipe(name) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return null;

  // "A / B" menus (alternating days): try each part; return the first hit.
  const parts = trimmed.split(/\s*[\/;]\s*/).filter(Boolean);

  const byOverlap = (part) => (a, b) => {
    const sa = wordOverlapScore(part, a.name);
    const sb = wordOverlapScore(part, b.name);
    if (sb !== sa) return sb - sa;
    // Tiebreaker: closest name length to the school dish fragment.
    const wantedLen = norm(part).length;
    return Math.abs(norm(a.name).length - wantedLen) - Math.abs(norm(b.name).length - wantedLen);
  };

  for (const part of parts) {
    // 1. Direct substring match (existing logic, fast).
    const direct = catalogMatchesForFixedDish({ name: part });
    if (direct.length) {
      const wanted = norm(part);
      const exact = direct.find((r) => norm(r.name) === wanted);
      if (exact) return exact;
      // Among direct hits, prefer by word overlap then length proximity.
      return direct.slice().sort(byOverlap(part))[0];
    }

    // 2. Keyword fallback: try each content word in turn, collect all candidate
    //    recipes from any keyword hit, then rank by word overlap.
    const keywords = extractKeywords(part);
    const seen = new Map();
    for (const kw of keywords) {
      for (const r of catalogMatchesForFixedDish({ name: kw })) {
        if (!seen.has(r.id)) seen.set(r.id, r);
      }
    }
    if (seen.size) {
      return [...seen.values()].sort(byOverlap(part))[0];
    }
  }
  return null;
}

function guessIconType(name, course) {
  const n = norm(name);
  if (/(merluz|pescad|salm|atun|bacalao|boquer|calamar|marisc|gamba|langost|lubina|dorada|caball|sardin|rape|lengua|trucha|mejill|pulpo|chipiron)/.test(n)) return "fish";
  if (/(pollo|ternera|cerdo|lomo|filete|albondig|hamburg|carne|pavo|salchich|chuleta|jamon|solomill|estofad|guisad|redondo|pincho|magro|costill|escalop|san jacobo|fricando)/.test(n)) return "meat";
  if (/(huevo|tortilla|revuelt)/.test(n)) return "egg";
  if (/(lenteja|garbanz|judia|alubia|legumbre|potaje|cocido|fabada|fabes)/.test(n)) return "legume";
  if (/(pasta|macarr|espagueti|espagueti|fideo|lasa|canel|ravioli|tallarin|ñoqui|noqui)/.test(n)) return "pasta";
  if (/(arroz|paella|risotto)/.test(n)) return "rice";
  if (/(sopa|crema|pure|gazpacho|caldo|salmorejo)/.test(n)) return "soup";
  if (/(ensalad|verdura|menestra|espinac|acelg|brocol|judia verde|judias verdes|pisto|salteado|calabac|coliflor|guisant|zanahoria|berenjen|champi|setas)/.test(n)) return "greens";
  if (course === "Postre") return "fruit";
  if (course === "Primero") return "greens";
  if (course === "Segundo") return "meat";
  return "chef";
}

// Resolve a catalog match into the display object used by SchoolDeckTile.
// `precomputedId` comes from the parse-time enrichment (most reliable);
// falls back to runtime fuzzy matching for legacy data.
function resolveSchoolDish(name, course, overrideCategory, precomputedId) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return { empty: true };

  // Manual category override always wins (user corrected the auto-match).
  if (overrideCategory && CATEGORY_BY_KEY[overrideCategory]) {
    const iconType = CATEGORY_BY_KEY[overrideCategory].iconType;
    return { empty: false, recipe: null, srcUrl: null, iconType, illustration: illustrationFor(overrideCategory, iconType) };
  }

  // Use pre-computed catalog id (parse-time enrichment) or fall back to runtime matching.
  const catalogEntry = (precomputedId && CATALOG_BY_ID[precomputedId]) || matchCatalogRecipe(trimmed);
  if (catalogEntry) {
    const iconType = ICON_TYPE_MAP[catalogEntry.mainProtein] ?? CATEGORY_ICON[catalogEntry.category] ?? "chef";
    const recipe = { id: catalogEntry.id, baseRecipeId: catalogEntry.id, name: catalogEntry.name, iconType, category: catalogEntry.category, mainProtein: catalogEntry.mainProtein };
    return {
      empty: false,
      recipe,
      srcUrl: dishImageForRecipe(recipe),
      iconType,
      illustration: illustrationFor(catalogEntry.category, iconType),
    };
  }

  const iconType = guessIconType(trimmed, course);
  const category = course === "Postre" ? "postres" : null;
  return { empty: false, recipe: null, srcUrl: null, iconType, illustration: illustrationFor(category, iconType) };
}

function visualFor(iconType) {
  if (iconType === "fruit") return FRUIT_VISUAL;
  return visualForRecipe({ iconType });
}

// Category chip thumbnail: our vivid illustration, full-bleed, with the lucide
// icon over the category surface as a graceful fallback if the image fails.
function CategoryThumb({ category, iconType, ink, surface }) {
  const [failed, setFailed] = useState(false);
  const src = illustrationFor(category, iconType);
  if (failed || !src) {
    const Icon = TYPE_ICON[iconType] ?? ChefHat;
    return (
      <span style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: surface }}>
        <Icon size={26} strokeWidth={1.9} color={ink} />
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
    />
  );
}

// Icon that represents the course in the popup header bubble.
function CourseIcon({ course, size = 20 }) {
  if (course === "Postre") return <Apple size={size} strokeWidth={2.1} />;
  if (course === "Primero") return <Soup size={size} strokeWidth={2.1} />;
  return <Drumstick size={size} strokeWidth={2.1} />;
}

function SchoolEditPopup({ course, day, name, category, onSave, onClose }) {
  const inputRef = useRef(null);
  const [draft, setDraft] = useState(name ?? "");
  const [cat, setCat] = useState(category ?? null);

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const courseTxt = COURSE_LABEL[course] ?? course;
  const dayTxt = SCHOOL_DAY_LABELS[day] ?? day;
  const save = () => onSave?.({ name: draft.trim(), category: draft.trim() ? cat : null });
  const clearDish = () => onSave?.({ name: "", category: null });

  // Use the visual accent of the course as the icon bubble colour.
  const courseVisual = visualFor(course === "Postre" ? "fruit" : course === "Primero" ? "greens" : "meat");

  return createPortal(
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(8,16,11,.52)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18, fontFamily: "inherit" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 370, background: "#f3f8f4", borderRadius: 26, padding: "22px 20px 20px", boxShadow: "0 28px 64px rgba(10,24,15,.34)", border: "1px solid #deeae1" }}
      >
        {/* ── Header (matches WizardSheet) ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <span style={{ width: 44, height: 44, borderRadius: 13, background: courseVisual.accent, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: `0 4px 14px ${courseVisual.accent}66`, color: "#fff" }}>
              <CourseIcon course={course} size={21} />
            </span>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: "#142f1d", letterSpacing: "-.3px" }}>Editar plato</h3>
              <p style={{ margin: "2px 0 0", fontSize: 12.5, fontWeight: 700, color: "#4f6a5a" }}>{dayTxt} · {courseTxt}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{ width: 32, height: 32, borderRadius: 999, border: "1px solid #cfe0d6", background: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, color: "#2d5a3d" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Input (white card for contrast on the tinted bg) ── */}
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") onClose?.(); }}
          placeholder={course === "Postre" ? "Postre…" : course === "Primero" ? "Primer plato…" : "Segundo plato…"}
          style={{ width: "100%", boxSizing: "border-box", height: 48, padding: "0 16px", borderRadius: 14, border: "1.5px solid #d2e4d8", outline: "none", fontSize: 15, fontWeight: 700, fontFamily: "inherit", background: "#fff", color: "#142f1d", boxShadow: "0 1px 4px rgba(20,47,29,.07)" }}
        />

        <div style={{ fontSize: 11, fontWeight: 800, color: "#5b7566", margin: "16px 0 9px", textTransform: "uppercase", letterSpacing: ".5px" }}>Categoría</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {CATEGORY_CHOICES.map(({ key, label, iconType }) => {
            const v = visualFor(iconType);
            const sel = cat === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setCat(sel ? null : key)}
                style={{
                  position: "relative",
                  height: 78,
                  borderRadius: 14,
                  overflow: "hidden",
                  padding: 0,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  border: `2.5px solid ${sel ? v.accent : "transparent"}`,
                  boxShadow: sel ? `0 0 0 3px ${v.accent}44, 0 6px 16px rgba(20,47,29,.2)` : "0 1px 5px rgba(20,47,29,.14)",
                }}
              >
                <span style={{ position: "absolute", inset: 0 }}>
                  <CategoryThumb category={key} iconType={iconType} ink={v.ink} surface={v.surface} />
                </span>
                <span style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,.66) 0%, rgba(0,0,0,.14) 46%, rgba(0,0,0,0) 72%)" }} />
                {sel && (
                  <span style={{ position: "absolute", top: 5, right: 5, width: 20, height: 20, borderRadius: 999, background: v.accent, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,.3)" }}>
                    <Check size={13} strokeWidth={3.2} />
                  </span>
                )}
                <span style={{ position: "absolute", left: 6, right: 6, bottom: 6, color: "#fff", fontSize: 10.5, fontWeight: 800, lineHeight: 1.1, textAlign: "center", textShadow: "0 1px 6px rgba(0,0,0,.55)" }}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          {(name ?? "").trim() && (
            <button
              type="button"
              onClick={clearDish}
              style={{ flexShrink: 0, height: 46, padding: "0 16px", borderRadius: 14, border: "1.5px solid #f0d5cf", background: "#fff", color: "#c0492e", fontSize: 13, fontWeight: 800, fontFamily: "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7 }}
            >
              <Trash2 size={15} /> Vaciar
            </button>
          )}
          <button
            type="button"
            onClick={save}
            style={{ flex: 1, height: 46, borderRadius: 14, border: "none", background: "#2d5a3d", color: "#fff", fontSize: 14.5, fontWeight: 800, fontFamily: "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, boxShadow: "0 6px 20px rgba(20,60,30,.28)" }}
          >
            <Check size={17} strokeWidth={3} /> Guardar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function SchoolDeckTile({ name, course, day, editable, override, catalogId, onEdit }) {
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);

  const resolved = useMemo(
    () => resolveSchoolDish(name, course, override, catalogId),
    [name, course, override, catalogId]
  );
  const visual = visualFor(resolved.iconType ?? "chef");
  const courseTxt = COURSE_LABEL[course] ?? course;

  // Preselect the chip: manual override first, else the auto-resolved category.
  const currentCategory = override || (resolved.empty ? null : ICONTYPE_TO_CATEGORY[resolved.iconType] ?? null);

  const startEdit = () => { if (editable) setEditing(true); };
  const handleSave = ({ name: nextName, category }) => {
    setEditing(false);
    onEdit?.({ name: nextName, category });
  };

  const popup = editing && (
    <SchoolEditPopup
      course={course}
      day={day}
      name={name}
      category={currentCategory}
      onSave={handleSave}
      onClose={() => setEditing(false)}
    />
  );

  const tileBase = {
    position: "relative",
    width: "46%",
    flexShrink: 0,
    height: 150,
    borderRadius: 16,
    overflow: "hidden",
    fontFamily: "inherit",
  };

  if (resolved.empty) {
    return (
      <button
        type="button"
        onClick={startEdit}
        style={{
          ...tileBase,
          border: "2px dashed #cbd8cf",
          background: "#f6faf7",
          cursor: editable ? "pointer" : "default",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          padding: 8,
        }}
      >
        {popup}
        <span style={{ width: 34, height: 34, borderRadius: 999, background: "#e3f0e8", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#2d5a3d" }}>
          <Plus size={17} strokeWidth={3} />
        </span>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: "#4f6a5b", letterSpacing: ".4px", textTransform: "uppercase" }}>{courseTxt}</span>
        <span style={{ fontSize: 9.5, fontWeight: 600, color: "#9bb0a4" }}>Toca para añadir</span>
      </button>
    );
  }

  // Real dish photo when we found a catalog match; otherwise the vivid category
  // illustration; and if even that fails to load, a colored surface + icon.
  const isRealPhoto = Boolean(resolved.srcUrl);
  const heroUrl = resolved.srcUrl || resolved.illustration || null;
  const optimized = heroUrl ? (isRealPhoto ? deckImg(heroUrl, 360) : heroUrl) : null;
  const showPhoto = optimized && !failed;

  return (
    <button
      type="button"
      onClick={startEdit}
      style={{ ...tileBase, border: "none", padding: 0, cursor: editable ? "pointer" : "default", background: visual.surface, display: "block", textAlign: "left", boxShadow: "0 6px 20px rgba(20,47,29,.14)" }}
    >
      {popup}
      {showPhoto ? (
        <img
          src={optimized}
          srcSet={isRealPhoto ? deckSrcSet(resolved.srcUrl, 360) : undefined}
          sizes="360px"
          alt={name}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", background: visual.surface }}
        />
      ) : (
        <div style={{ position: "absolute", inset: 0, background: visual.surface, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {(() => {
            const TypeIcon = TYPE_ICON[resolved.iconType] ?? ChefHat;
            return <TypeIcon size={46} strokeWidth={1.6} color={visual.ink} style={{ opacity: 0.34 }} />;
          })()}
        </div>
      )}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,.74) 0%, rgba(0,0,0,.25) 42%, rgba(0,0,0,0) 66%)" }} />
      {editable && (
        <span
          style={{ position: "absolute", top: 7, right: 7, width: 24, height: 24, borderRadius: 999, background: "rgba(12,22,15,.44)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,.28)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff" }}
        >
          <Pencil size={12} strokeWidth={2.6} />
        </span>
      )}
      <div style={{ position: "absolute", left: 10, right: 10, bottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: visual.accent, flexShrink: 0, boxShadow: "0 0 0 2px rgba(255,255,255,.6)" }} />
          <span style={{ color: "rgba(255,255,255,.95)", fontSize: 9, fontWeight: 800, letterSpacing: ".7px", textTransform: "uppercase", textShadow: "0 1px 6px rgba(0,0,0,.5)" }}>{courseTxt}</span>
        </div>
        <div style={{ color: "#fff", fontSize: 13, fontWeight: 900, lineHeight: 1.15, letterSpacing: "-.3px", textShadow: "0 2px 12px rgba(0,0,0,.45)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", height: 30 }}>
          {name}
        </div>
      </div>
    </button>
  );
}

/**
 * "Todos comen lo mismo" compact eaters row — small member avatars that shrink
 * to a strip above the menu, mirroring the compact cards in "En casa".
 */
export function SchoolEatersRow({ members = [], allMembers = [], label }) {
  if (!members.length) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        borderRadius: 14,
        background: "#f2f8f4",
        border: "1px solid #dcebe1",
        marginBottom: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center" }}>
        {members.slice(0, 5).map((m, i) => (
          <span key={m.id} style={{ marginLeft: i === 0 ? 0 : -8, borderRadius: 999, boxShadow: "0 0 0 2px #f2f8f4" }}>
            <Avatar name={m.name} size={26} photo={memberAvatarThumbSrc(m)} color={memberAvatarColor(m.id, allMembers.length ? allMembers : members)} />
          </span>
        ))}
      </div>
      <span style={{ fontSize: 12.5, fontWeight: 800, color: "#1a3a24", minWidth: 0 }}>{label}</span>
    </div>
  );
}

/**
 * Deck-style review of a single school week, matching the Menús section look:
 * one row per weekday with photo-forward course tiles (1º / 2º / Postre) and a
 * fallback colored surface when there's no catalog photo. Tapping a tile edits
 * the dish name in place.
 */
export function SchoolMenuDeck({ entries = {}, overrides = {}, catalogIds = {}, editable = true, onEditDish }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {SCHOOL_DAYS.map((day) => (
        <div key={day}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 2px", marginBottom: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 900, color: "#142f1d", letterSpacing: "-.2px" }}>
              {SCHOOL_DAY_LABELS[day] ?? day}
            </span>
            <span style={{ flex: 1, height: 1, background: "#dbe8df", marginLeft: 2 }} />
          </div>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
            {SCHOOL_COURSES.map((course) => {
              const key = `${day}-${course}`;
              return (
                <SchoolDeckTile
                  key={course}
                  name={entries[key] ?? ""}
                  course={course}
                  day={day}
                  editable={editable}
                  override={overrides[key] ?? null}
                  catalogId={catalogIds[key] ?? null}
                  onEdit={({ name, category }) => onEditDish?.(day, course, { name, category })}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
