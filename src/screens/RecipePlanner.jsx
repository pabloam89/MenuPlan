import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Plus,
  Trash2,
  Sparkles,
  Loader2,
  RotateCw,
  CheckCircle2,
  AlertTriangle,
  ChefHat,
  Carrot,
  ClipboardCheck,
  Users,
  Clock,
  Beef,
  Fish,
  Egg,
  Bean,
  Salad,
  Soup,
  Zap,
  UtensilsCrossed,
  Moon,
  Flame,
  ListOrdered,
  Check,
  Wind,
  Microwave,
  Bot,
  CookingPot,
  Layers2,
  Camera,
  ImagePlus,
  Search,
  SlidersHorizontal,
  Apple,
  Wheat,
  Milk,
  Croissant,
  Droplet,
  Leaf,
  Drumstick,
  Sprout,
  Package,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  ThumbsUp,
  ThumbsDown,
  CalendarDays,
  UserCircle2,
  Gauge,
  Globe,
  Users2,
  Lock,
  IceCream,
} from "lucide-react";
import { ProgressDots, SegmentedControl } from "../components/ui.jsx";
import { CatalogBrowserSheet } from "./CatalogBrowserSheet.jsx";
import { recipeCatalog } from "../data/recipeCatalog.js";
import { dishImageForRecipe } from "../assets/dishes/dishImages.js";
import {
  USAGE_TAGS,
  deriveTypeFromUsageTags,
  INGREDIENT_UNITS,
  ALLERGEN_OPTIONS,
  INGREDIENT_CATALOG,
  INGREDIENT_CATALOG_BY_AISLE,
  COOKING_METHODS,
  generateUserRecipeDraft,
  generateDishPhotoWithAI,
  suggestRecipeIngredients,
  filterOwnCreatedRecipes,
} from "../lib/userRecipes.js";
import { isMontaje } from "../data/recipeSchema.js";
import { SHOPPING_AISLES, isQualitativeUnit, guessShoppingAisle, ingredientStem } from "../lib/ingredientCategories.js";
import { RecipeStepList } from "../components/RecipeSteps.jsx";
import { STEP_KIND_META, removeRichStep, richToPlainSteps } from "../lib/recipeSteps.js";
import { ingredientThumbSrc, aisleImageSrc } from "../lib/ingredientImages.js";
import { deriveRecipeAllergens } from "../lib/ingredients.js";
import { mealTimeColor } from "../lib/mealTimes.js";
import { deckImg, deckSrcSet } from "../lib/dishPhotoOptimize.js";

const GREEN = "#2d5a3d";
const INK = "#142f1d";
const BG = "#f5f9f6";

const STEP_META = [
  { title: "El plato", icon: ChefHat, color: GREEN },
  { title: "Ingredientes", icon: Carrot, color: "#c96a1c" },
  { title: "¿Cuándo se sirve?", icon: Clock, color: "#2f6fb8" },
  { title: "Preparación", icon: Sparkles, color: GREEN },
  { title: "Foto", icon: Camera, color: "#0f9d8c" },
  { title: "Revisión", icon: ClipboardCheck, color: "#b8860f" },
];

const AISLE_ICONS = {
  Verduras: Carrot,
  Frutas: Apple,
  Carne: Beef,
  Pescado: Fish,
  Legumbres: Bean,
  "Pasta y arroz": Wheat,
  Lácteos: Milk,
  Huevos: Egg,
  Panadería: Croissant,
  Especias: Flame,
  "Aceites y conservas": Droplet,
};

const AISLE_COLORS = {
  Verduras: "#3f9656",
  Frutas: "#e0973f",
  Carne: "#c0392b",
  Pescado: "#2f6f9f",
  Legumbres: "#b9770e",
  "Pasta y arroz": "#cf7833",
  Lácteos: "#4f8fc9",
  Huevos: "#d4a017",
  Panadería: "#a97449",
  Especias: "#a8452e",
  "Aceites y conservas": "#6b8e23",
};

// Category chip look for the ingredient edit-list — kept 1:1 with the Pantry
// ("En casa") AISLE_UI (same icons + colors) so an ingredient reads with the
// exact same category glyph across both screens.
const PANTRY_AISLE_UI = {
  Verduras: { Icon: Leaf, color: "#3d9b5f" },
  Frutas: { Icon: Apple, color: "#e07b39" },
  Carne: { Icon: Drumstick, color: "#c45c4a" },
  Pescado: { Icon: Fish, color: "#2072b8" },
  Legumbres: { Icon: Bean, color: "#8b6914" },
  "Pasta y arroz": { Icon: Wheat, color: "#c9922a" },
  Lácteos: { Icon: Milk, color: "#4a9ec5" },
  Huevos: { Icon: Egg, color: "#ca9a14" },
  Panadería: { Icon: Croissant, color: "#a67c52" },
  Especias: { Icon: Sprout, color: "#7c5cbf" },
  "Aceites y conservas": { Icon: Package, color: "#64748b" },
};

function PantryCategoryIcon({ name, size = 26 }) {
  const meta = PANTRY_AISLE_UI[guessShoppingAisle(name)] ?? { Icon: Package, color: "#64748b" };
  const Icon = meta.Icon;
  const img = ingredientThumbSrc(name);
  const [failed, setFailed] = useState(false);
  const showImg = Boolean(img) && !failed;
  return (
    <span
      style={{
        width: size, height: size, borderRadius: 8,
        background: showImg ? "#f2f7f4" : meta.color, color: "#fff",
        display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        overflow: "hidden",
      }}
    >
      {showImg ? (
        <img
          src={img}
          alt=""
          onError={() => setFailed(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : (
        <Icon size={size * 0.5} strokeWidth={2.2} />
      )}
    </span>
  );
}

const USAGE_TAG_ICONS = {
  plato_unico: UtensilsCrossed,
  plato_normal: Beef,
  guarnicion: Salad,
};

const USAGE_TAG_COLORS = {
  plato_unico: "#6b4fa0",
  plato_normal: "#c96a1c",
  guarnicion: "#2d8659",
};

// Minimal snapshot of the signed-in Google account stamped on a saved recipe
// so the catalog can show who created it. Mirrors Settings.jsx#googleInfo.
//
// Deliberately does NOT store the email: a recipe published with
// visibility="public" is readable by the `anon` role (see the "Public recipes
// readable" RLS policy), so anything kept here is world-readable. The UI only
// ever renders `name` and `avatar` (Menu.jsx#RecipeProvenance), so the email
// was pure exposure — it leaked every publisher's address to anyone hitting
// the REST endpoint unauthenticated.
function ownerFromUser(user) {
  if (!user) return null;
  const meta = user.user_metadata ?? {};
  return {
    id: user.id ?? null,
    name: meta.full_name ?? meta.name ?? user.email?.split("@")[0] ?? "Anónimo",
    avatar: meta.avatar_url ?? meta.picture ?? null,
  };
}

// "hace un momento" / "hace 3 días" / "6 jul 2026" — compact relative date for
// the recipe's generation stamp.
function formatGeneratedAt(ts) {
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

function normDishName(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// Common Spanish connectors that inflate false matches when two unrelated
// dishes just happen to share a preposition or a single generic ingredient
// (e.g. "Arroz blanco con tomate" vs "Magro con tomate" only share "con" +
// "tomate" — nowhere near the same dish).
const DISH_NAME_STOPWORDS = new Set([
  "de", "del", "la", "el", "los", "las", "y", "con", "sin", "al", "a", "en",
  "un", "una", "unos", "unas", "por", "para", "su", "sus", "estilo",
]);

function dishNameTokens(name) {
  return new Set(
    normDishName(name)
      .split(/\s+/)
      .filter((w) => w.length > 2 && !DISH_NAME_STOPWORDS.has(w)),
  );
}

// Live "is this an existing dish?" check for step 1 (Eje A / identidad).
// Token-overlap similarity against the catalog + the user's own recipes, so a
// new "Salmón al horno con eneldo" surfaces the existing "Salmón al horno"
// and offers to link it as another recipe for the same dish (baseDishId).
// Requires at least 2 shared *meaningful* words (unless one of the names only
// has 1 to begin with) so sharing a single common ingredient never triggers a
// false positive on its own.
function findBaseDishMatches(name, pool) {
  const q = normDishName(name);
  if (q.length < 4) return [];
  const qTokens = dishNameTokens(name);
  if (qTokens.size === 0) return [];
  const scored = [];
  for (const r of pool) {
    const rn = normDishName(r.name);
    if (!rn) continue;
    if (rn === q) { scored.push({ r, score: 1 }); continue; }
    const rTokens = dishNameTokens(r.name);
    if (rTokens.size === 0) continue;
    let shared = 0;
    for (const t of qTokens) if (rTokens.has(t)) shared += 1;
    const minSize = Math.min(qTokens.size, rTokens.size);
    const minShared = minSize <= 1 ? 1 : 2;
    if (shared < minShared) continue;
    const score = shared / minSize;
    if (score < 0.6) continue;
    scored.push({ r, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, 3).map((s) => s.r);
}

// The "revisa las cantidades" hint explains how AI suggestions work, so it's
// worth one interruption and no more — remembered across recipes and sessions.
const SUGGEST_HINT_SEEN_KEY = "mp_recipe_suggest_hint_seen";

/** Claims the one-time hint. True the first time ever, false afterwards. */
function markSuggestHintSeen() {
  try {
    if (localStorage.getItem(SUGGEST_HINT_SEEN_KEY)) return false;
    localStorage.setItem(SUGGEST_HINT_SEEN_KEY, "1");
    return true;
  } catch {
    // Storage blocked (private mode): show it, just don't remember.
    return true;
  }
}

const MEAL_ROLE_ICONS = {
  primero: Soup,
  segundo: UtensilsCrossed,
  plato_unico: UtensilsCrossed,
  cena: Moon,
  postre: IceCream,
};

// Lunch is not a stored mealRole — we infer primero/segundo/plato_unico from
// the usage tag when the user marks "Comida".
const COMIDA_POSITIONS = ["plato_unico", "primero", "segundo"];

function defaultComidaRole(usageTags = []) {
  if (usageTags[0] === "plato_unico") return "plato_unico";
  return "segundo";
}

const APPLIANCE_ICONS = {
  "Airfryer": Wind,
  "Horno": Flame,
  "Microondas": Microwave,
  "Thermomix": Bot,
  "Olla rápida": CookingPot,
  "Vaporera": Layers2,
};

const APPLIANCE_COLORS = {
  "Airfryer": "#2f6fb8",
  "Horno": "#c0392b",
  "Microondas": "#0f9d8c",
  "Thermomix": "#6b4fa0",
  "Olla rápida": "#c96a1c",
  "Vaporera": "#2d8659",
};

const headerBtnStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "8px 14px",
  borderRadius: 10,
  border: `1.5px solid ${GREEN}`,
  background: "#fff",
  color: GREEN,
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};

function FieldLabel({ icon: Icon, color = GREEN, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, margin: "0 0 8px" }}>
      {Icon && (
        <span
          style={{
            width: 22, height: 22, borderRadius: 7, background: `${color}1a`,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
        >
          <Icon size={12.5} color={color} />
        </span>
      )}
      <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: INK }}>{children}</p>
    </div>
  );
}

// Sub-copy under a FieldLabel/section title — always the same size/weight/
// color/line-height so every step reads with the same visual hierarchy.
function FieldHint({ children }) {
  return (
    <p style={{ margin: "-4px 0 8px", fontSize: 11.5, fontWeight: 600, color: "#7a9485", lineHeight: 1.4 }}>
      {children}
    </p>
  );
}

function TextField({ value, onChange, placeholder, type = "text", suffix, ...rest }) {
  return (
    <div style={{ position: "relative" }}>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%", boxSizing: "border-box", padding: suffix ? "11px 44px 11px 14px" : "11px 14px",
          borderRadius: 12, border: "1.5px solid #e8efe9", background: "#fff", fontSize: 13.5,
          color: INK, fontFamily: "inherit", outline: "none",
        }}
        {...rest}
      />
      {suffix && (
        <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 12.5, color: "#9ab0a1", fontWeight: 700 }}>
          {suffix}
        </span>
      )}
    </div>
  );
}

// ── Allergen-style option list (matches Onboarding's AvoidSection/AllergenRow):
// colored icon + label + a real checkbox, 2-column matrix, thin row dividers ──

function OptionSection({ icon: Icon, title, subtitle, children }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #ebf0ed", borderRadius: 16, marginBottom: 12, boxShadow: "0 1px 3px rgba(20,47,29,.05)", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#dcebe1", borderBottom: "1px solid #c9ddd0" }}>
        <span style={{ width: 28, height: 28, borderRadius: 9, background: GREEN, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon size={14} strokeWidth={2.2} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: "#1a3a24" }}>{title}</p>
          {subtitle && <p style={{ margin: "1px 0 0", fontSize: 11.5, color: "#5e7a68", fontWeight: 600, lineHeight: 1.3 }}>{subtitle}</p>}
        </div>
      </div>
      <div style={{ padding: "16px 14px 10px", display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", columnGap: 12 }}>
        {children}
      </div>
    </div>
  );
}

function optionRowIsLast(index, total) {
  return Math.floor(index / 2) === Math.floor((total - 1) / 2);
}

// Icon segmented control for "¿Cómo se sirve?" (plato único / normal /
// guarnición). Single-select — asked on the "cuándo se sirve" step so the
// review stays a pure preview.
function UsageSegmentedControl({ value = [], onChange }) {
  const selected = value[0] ?? null;
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {USAGE_TAGS.map((t) => {
        const Icon = USAGE_TAG_ICONS[t.id] ?? UtensilsCrossed;
        const color = USAGE_TAG_COLORS[t.id] ?? GREEN;
        const sel = selected === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 7,
              padding: "13px 6px 11px", borderRadius: 13, cursor: "pointer", fontFamily: "inherit",
              border: `2px solid ${sel ? GREEN : "#e8efe9"}`,
              background: sel ? "#eef6f0" : "#fff",
              boxShadow: sel ? "0 2px 10px rgba(45,90,61,.12)" : "none",
              transition: "all .15s",
            }}
          >
            <span style={{ width: 30, height: 30, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", background: sel ? `${color}1f` : "#f2f6f3" }}>
              <Icon size={16} color={color} strokeWidth={2.3} />
            </span>
            <span style={{ fontSize: 11.5, fontWeight: sel ? 800 : 700, color: sel ? INK : "#5a6b60", textAlign: "center", lineHeight: 1.15 }}>
              {t.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Preset-grid number picker (servings / time): 4 cols × 2 rows,
// 7 presets + a "+" cell that turns into a custom input ──

function GridNumberPicker({ values, value, onChange }) {
  const [editing, setEditing] = useState(false);
  const num = Number(value);
  const isPreset = values.includes(num);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
      {values.map((v) => {
        const sel = isPreset && !editing && num === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => { onChange(String(v)); setEditing(false); }}
            style={{
              height: 40, borderRadius: 11, cursor: "pointer", fontFamily: "inherit",
              border: `1.5px solid ${sel ? GREEN : "#e8efe9"}`,
              background: sel ? GREEN : "#fff",
              color: sel ? "#fff" : INK,
              fontSize: 13, fontWeight: 750,
            }}
          >
            {v}
          </button>
        );
      })}
      {editing || !isPreset ? (
        <input
          autoFocus={editing}
          type="number"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setEditing(true)}
          onBlur={() => setEditing(false)}
          style={{
            height: 40, width: "100%", boxSizing: "border-box", borderRadius: 11, textAlign: "center",
            fontFamily: "inherit", border: `1.5px solid ${GREEN}`, outline: "none",
            fontSize: 13.5, fontWeight: 750, color: INK,
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Otro número"
          style={{
            height: 40, borderRadius: 11, border: "1.5px dashed #bcd6c4", background: "#fafcfa",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: GREEN,
          }}
        >
          <Plus size={16} strokeWidth={2.6} />
        </button>
      )}
    </div>
  );
}

function OptionRow({ icon: Icon, label, checked, onToggle, color = GREEN, last }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      style={{
        width: "100%", boxSizing: "border-box", display: "flex", alignItems: "center", gap: 8,
        padding: "8px 2px", border: "none", background: "transparent", cursor: "pointer",
        fontFamily: "inherit", textAlign: "left",
        borderBottom: last ? "none" : "1px solid #eef3f0",
      }}
    >
      <span
        style={{
          width: 24, height: 24, borderRadius: 7, flexShrink: 0,
          background: `${color}1a`, color,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <Icon size={13} strokeWidth={2.2} />
      </span>
      <span
        style={{
          flex: 1, minWidth: 0, fontSize: 12, fontWeight: checked ? 800 : 650,
          color: checked ? "#142f1d" : "#3a4a42", overflow: "hidden", textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      <span
        style={{
          width: 18, height: 18, borderRadius: 5, flexShrink: 0,
          border: `1.5px solid ${checked ? GREEN : "#cdd8d0"}`,
          background: checked ? GREEN : "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {checked && <Check size={11} strokeWidth={3} color="#fff" />}
      </span>
    </button>
  );
}

// ── Ingredients ────────────────────────────────────────────────
// Search-and-add pattern (same idea as onboarding's catalog pickers):
// one entry row to search/type + confirm, and everything already added
// lands in a table-like card below with a bin to remove it.

function normText(s) {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const inputBase = {
  boxSizing: "border-box", borderRadius: 10, border: "1.5px solid #e8efe9",
  fontFamily: "inherit", color: INK, outline: "none",
};

// Sensible defaults so tapping an ingredient lands a valid amount+unit that
// the user can fine-tune in the list below (no blank/zero amounts).
const LIQUID_INGREDIENT_RE = /leche|nata|caldo|aceite|vinagre|\bvino\b|zumo|bebida|crema de/;
const UNIT_INGREDIENT_RE = /huevo|manzana|platano|banana|naranja|limon|lima|\bpera\b|kiwi|mango|aguacate|rebanada|loncha/;

function guessUnitFor(name) {
  const n = normText(name);
  if (/\bajo\b|diente/.test(n)) return "diente";
  if (UNIT_INGREDIENT_RE.test(n)) return "ud";
  if (LIQUID_INGREDIENT_RE.test(n)) return "ml";
  return "g";
}

function defaultAmountForUnit(unit) {
  return unit === "ud" || unit === "diente" ? "1" : "100";
}

function makeIngredient(name) {
  const unit = guessUnitFor(name);
  return { name: String(name).trim(), amount: defaultAmountForUnit(unit), unit };
}

// ── Browsable ingredient picker: search-first (autocomplete over the full
// catalog), with an optional "Filtros" panel — same pattern as the catalog
// browser's search bar — to browse by aisle instead of typing from scratch.
// Tapping an aisle shows its full derived catalog right away (2026-08-28: no
// more curated-short-list + "Ver todos" expand step).

function AisleTile({ label, icon: Icon, color, active, onClick }) {
    return (
        <button
          type="button"
      onClick={onClick}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5,
        padding: "11px 4px", borderRadius: 12, cursor: "pointer", fontFamily: "inherit",
        border: `2px solid ${color}`,
        background: active ? color : "#fff",
        transition: "background .14s ease",
      }}
    >
      <Icon size={17} strokeWidth={2.2} color={active ? "#fff" : color} />
      <span style={{ fontSize: 10.5, fontWeight: 800, color: active ? "#fff" : INK, textAlign: "center", lineHeight: 1.15 }}>
        {label}
      </span>
        </button>
    );
  }

function SelectedAisleChip({ label, onClear }) {
  const Icon = AISLE_ICONS[label] ?? UtensilsCrossed;
  const color = AISLE_COLORS[label] ?? GREEN;
  return (
        <div
          style={{
        display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", marginBottom: 10,
        borderRadius: 10, border: `2px solid ${color}`, background: "#fff",
      }}
    >
      <Icon size={14} color={color} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        Explorando: {label}
      </span>
            <button
              type="button"
        onClick={onClear}
        aria-label="Quitar categoría"
              style={{
          width: 22, height: 22, borderRadius: 6, border: "none", background: "#f0f4f1",
          color, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}
            >
        <X size={12} />
            </button>
    </div>
  );
}

function IngredientPickCard({ name, added, onToggle }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(name)}
      style={{
        display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
        padding: "10px 11px", borderRadius: 11, cursor: "pointer", fontFamily: "inherit",
        border: `1.5px solid ${added ? GREEN : "#e8efe9"}`,
        background: added ? "#f2fbf5" : "#fff",
        transition: "border-color .14s ease, background .14s ease",
      }}
    >
      <span
        style={{
          width: 18, height: 18, borderRadius: 5, flexShrink: 0,
          border: `1.5px solid ${added ? GREEN : "#cdd8d0"}`,
          background: added ? GREEN : "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {added && <Check size={11} strokeWidth={3} color="#fff" />}
      </span>
      <span
        style={{
          flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700,
          color: added ? "#142f1d" : "#3a4a42",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}
      >
        {name}
      </span>
    </button>
  );
}

// Category card for the compact 3-column illustrated grid
function CategoryCard({ aisle, onSelect }) {
  const Icon = AISLE_ICONS[aisle] ?? UtensilsCrossed;
  const color = AISLE_COLORS[aisle] ?? GREEN;
  const img = aisleImageSrc(aisle);
  const [failed, setFailed] = useState(false);
  const showImg = Boolean(img) && !failed;
  return (
    <button
      type="button"
      onClick={() => onSelect(aisle)}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end",
        gap: 0, padding: 0, border: "none", borderRadius: 14, cursor: "pointer",
        fontFamily: "inherit", overflow: "hidden", background: "transparent",
        aspectRatio: "1 / 1", position: "relative",
      }}
    >
      <span
        style={{
          position: "absolute", inset: 0, borderRadius: 14,
          background: showImg ? `${color}22` : `${color}18`,
          border: `1.5px solid ${color}33`,
        }}
      />
      {showImg ? (
        <img
          src={img}
          alt=""
          onError={() => setFailed(true)}
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            objectFit: "cover", borderRadius: 14,
          }}
        />
      ) : (
        <span
          style={{
            position: "absolute", inset: 0, display: "flex",
            alignItems: "center", justifyContent: "center",
          }}
        >
          <Icon size={32} color={color} strokeWidth={1.8} />
        </span>
      )}
      <span
        style={{
          position: "relative", zIndex: 1, width: "100%", padding: "5px 6px 7px",
          background: `linear-gradient(to top, ${color}dd 0%, ${color}88 60%, transparent 100%)`,
          borderBottomLeftRadius: 13, borderBottomRightRadius: 13,
          fontSize: 10.5, fontWeight: 800, color: "#fff", textAlign: "center",
          lineHeight: 1.2, letterSpacing: "-.1px",
          textShadow: "0 1px 3px rgba(0,0,0,.4)",
        }}
      >
        {aisle}
      </span>
    </button>
  );
}

// Ingredient card for the compact 5-column grid (illustration + name + check)
function IngredientThumbCard({ name, added, onToggle }) {
  const img = ingredientThumbSrc(name);
  const [failed, setFailed] = useState(false);
  const showImg = Boolean(img) && !failed;
  return (
    <button
      type="button"
      onClick={() => onToggle(name)}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: 0, padding: 0, border: "none", borderRadius: 8, cursor: "pointer",
        fontFamily: "inherit", overflow: "hidden",
        background: added ? "#e8f5ec" : "#eef2f0",
        outline: added ? `2px solid ${GREEN}` : "none",
        outlineOffset: -2,
        transition: "background .14s ease, outline .14s ease",
        aspectRatio: "1 / 1", position: "relative",
      }}
    >
      {showImg ? (
        <img
          src={img}
          alt=""
          onError={() => setFailed(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }}
        />
      ) : (
        <span style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <UtensilsCrossed size={14} color="#bcc9c4" strokeWidth={1.5} />
        </span>
      )}
      <span
        style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          padding: "3px 2px 4px",
          background: added
            ? `linear-gradient(to top, ${GREEN}ee 0%, ${GREEN}77 60%, transparent 100%)`
            : "linear-gradient(to top, rgba(20,47,29,.72) 0%, rgba(20,47,29,.3) 60%, transparent 100%)",
          fontSize: 7.5, fontWeight: 800, color: "#fff", textAlign: "center",
          lineHeight: 1.1, letterSpacing: "-.05px",
          textShadow: "0 1px 2px rgba(0,0,0,.5)",
        }}
      >
        {name}
      </span>
      {added && (
        <span
          style={{
            position: "absolute", top: 2, right: 2,
            width: 12, height: 12, borderRadius: 999,
            background: GREEN, display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 1px 3px rgba(0,0,0,.25)",
          }}
        >
          <Check size={7} strokeWidth={3.5} color="#fff" />
        </span>
      )}
    </button>
  );
}

// Exported so PantryInput (src/components/PantryInput.jsx) can reuse the
// exact same search/browse-by-category ingredient picker for its "Escrito"
// mode instead of re-implementing it.
//
// `compact` (Pantry): narrower search + Categorías as icon+label button on
// the right (dropdown keeps its usual width). The "+" lives outside the
// selected-ingredients card, not next to the search. RecipePlanner keeps
// the full non-compact button.
export function IngredientPicker({
  query,
  onQueryChange,
  aisle,
  onAisleChange,
  addedNames,
  onToggle,
  onAddCustom,
  compact = false,
  hideSearch = false,
  hideBackButton = false,
  onPlus: _onPlus,
  plusDisabled: _plusDisabled = false,
  onUpload,
  uploadOpen = false,
  uploadLoading = false,
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const catBtnRef = useRef(null);
  const q = normText(query);

  const setAisle = (a) => {
    onAisleChange(a);
    setFiltersOpen(false);
  };

  const full = useMemo(() => (aisle ? INGREDIENT_CATALOG_BY_AISLE[aisle] ?? [] : []), [aisle]);
  const results = useMemo(() => {
    if (q) {
      const qStem = ingredientStem(q);
      return INGREDIENT_CATALOG.filter((n) => normText(n).includes(q) || ingredientStem(n).includes(qStem)).slice(0, 40);
    }
    if (!aisle) return [];
    return full;
  }, [q, aisle, full]);
  const exactExists = q.length > 0 && INGREDIENT_CATALOG.some((n) => normText(n) === q);

  // Compact mode: illustrated category grid → ingredient grid
  if (compact) {
    return (
      <div style={{ marginBottom: 14 }}>
        {/* Con búsqueda externa (hideSearch) solo hace falta el "Volver a
            categorías" cuando hay un aisle abierto; el input vive fuera. Si el
            caller ya pinta su propio botón (hideBackButton), lo omitimos. */}
        {hideSearch && !hideBackButton && aisle && (
          <button
            type="button"
            onClick={() => setAisle(null)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5, marginBottom: 10,
              height: 34, padding: "0 12px 0 8px", borderRadius: 11,
              border: "1.5px solid #d7e6dc", background: "#fff", color: GREEN,
              cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 800,
            }}
          >
            <ChevronLeft size={14} strokeWidth={2.6} />
            Categorías
          </button>
        )}
        {!hideSearch && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
        <div
          style={{
            flex: 1, display: "flex", alignItems: "center", gap: 7, height: 40,
            padding: "0 10px 0 10px", borderRadius: 12, minWidth: 0,
            background: (q || aisle) ? "#fff" : "#f0f5f2",
            border: `1.5px solid ${(q || aisle) ? GREEN : "transparent"}`,
            transition: "background .15s, border-color .15s",
          }}
        >
          <Search size={15} color={(q || aisle) ? GREEN : "#9ab0a1"} style={{ flexShrink: 0 }} />
          <input
            value={query}
            onChange={(e) => { onQueryChange(e.target.value); if (e.target.value) onAisleChange(null); }}
            placeholder={aisle && !q ? `Buscar en ${aisle}...` : "Buscar ingrediente..."}
            style={{
              flex: 1, minWidth: 0, border: "none", outline: "none",
              background: "transparent", fontFamily: "inherit",
              fontSize: 12, fontWeight: 700, color: INK,
            }}
          />
          {/* Dismiss: clear query OR clear aisle */}
          {(query || (!query && aisle)) && (
            <button
              type="button"
              onClick={() => query ? onQueryChange("") : setAisle(null)}
              aria-label="Limpiar"
              style={{ border: "none", background: "transparent", cursor: "pointer", color: "#c0cfc8", display: "flex", padding: 2, flexShrink: 0 }}
            >
              <X size={14} />
            </button>
          )}
          {/* Upload button — only shown when caller wires onUpload */}
          {onUpload && (
            <button
              type="button"
              onClick={onUpload}
              aria-label="Subir foto o ticket"
              style={{
                border: "none", cursor: "pointer", display: "inline-flex",
                alignItems: "center", justifyContent: "center", flexShrink: 0,
                width: 30, height: 30, borderRadius: 8, padding: 0,
                background: uploadOpen ? GREEN : "#eaf3ec",
                color: uploadOpen ? "#fff" : GREEN,
                transition: "background .15s, color .15s",
              }}
            >
              {uploadLoading
                ? <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} />
                : <Camera size={14} strokeWidth={2.2} />}
            </button>
          )}
        </div>
        {/* Categorías button — same row as search, always visible when an aisle is active */}
        {aisle && (
          <button
            type="button"
            onClick={() => setAisle(null)}
            aria-label="Volver a categorías"
            style={{
              flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5,
              height: 40, padding: "0 10px 0 8px", borderRadius: 11,
              border: "1.5px solid #d7e6dc", background: "#fff",
              color: GREEN, cursor: "pointer",
              fontFamily: "inherit", fontSize: 12, fontWeight: 800,
              whiteSpace: "nowrap",
            }}
          >
            <ChevronLeft size={14} strokeWidth={2.6} />
            Categorías
          </button>
        )}
        </div>
        )}

        {/* Search results (4-col thumb grid) */}
        {q && results.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 9 }}>
            {results.map((name) => (
              <IngredientThumbCard
                key={name}
                name={name}
                added={addedNames.has(name.toLowerCase())}
                onToggle={onToggle}
              />
            ))}
          </div>
        )}
        {q && results.length === 0 && (
          <p style={{ textAlign: "center", color: "#9ab0a1", fontSize: 12.5, margin: "20px 0 8px" }}>
            Sin resultados
          </p>
        )}

        {/* Category grid (default, no search, no aisle) */}
        {!q && !aisle && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 7 }}>
            {SHOPPING_AISLES.map((a) => (
              <CategoryCard key={a} aisle={a} onSelect={setAisle} />
            ))}
          </div>
        )}

        {/* Ingredient grid (aisle selected, no search) */}
        {!q && aisle && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 9 }}>
              {full.map((name) => (
                <IngredientThumbCard
                  key={name}
                  name={name}
                  added={addedNames.has(name.toLowerCase())}
                  onToggle={onToggle}
                />
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  // Non-compact (RecipePlanner) mode: search + dropdown Categorias button
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
        <div
          style={{
            flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8,
            height: 42, padding: "0 12px", borderRadius: 12,
            background: "#fff", border: `2px solid ${GREEN}`,
          }}
        >
          <Search size={16} color={GREEN} style={{ flexShrink: 0 }} />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Buscar..."
            style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontFamily: "inherit", fontSize: 12.5, fontWeight: 800, color: INK }}
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="Limpiar busqueda"
              style={{ border: "none", background: "transparent", cursor: "pointer", color: "#9ab0a1", display: "flex", padding: 2 }}
            >
              <X size={15} />
            </button>
          )}
        </div>
        <button
          ref={catBtnRef}
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={filtersOpen}
          aria-label="Categorias"
          title="Categorias"
          style={{
            position: "relative", display: "inline-flex", alignItems: "center",
            justifyContent: "center", gap: 6, height: 42, padding: "0 12px",
            borderRadius: 12, cursor: "pointer", flexShrink: 0,
            border: `1.5px solid ${filtersOpen || aisle ? GREEN : "#e8efe9"}`,
            background: filtersOpen || aisle ? GREEN : "#fff",
            color: filtersOpen || aisle ? "#fff" : "#5a7066",
            fontSize: 12.5, fontWeight: 800, fontFamily: "inherit",
          }}
        >
          <SlidersHorizontal size={15} />
          {"Categor\u00EDas"}
          {filtersOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {filtersOpen && (
        <AisleDropdown
          aisle={aisle}
          anchorRef={catBtnRef}
          onClose={() => setFiltersOpen(false)}
          onSelect={(a) => setAisle(aisle === a ? null : a)}
        />
      )}

      {!filtersOpen && aisle && !q && (
        <SelectedAisleChip label={aisle} onClear={() => setAisle(null)} />
      )}

      {results.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 8 }}>
          {results.map((name) => (
            <IngredientPickCard
              key={name}
              name={name}
              added={addedNames.has(name.toLowerCase())}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}

      {q && !exactExists && (
        <button
          type="button"
          onClick={() => onAddCustom(query.trim())}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%",
            marginTop: results.length > 0 ? 10 : 0, padding: "11px 12px", borderRadius: 11,
            border: "1.5px dashed #bfe6cb", background: "#f2fbf5", color: GREEN, cursor: "pointer",
            fontFamily: "inherit", fontSize: 13, fontWeight: 800,
          }}
        >
          <Plus size={15} strokeWidth={2.6} />
          {`A\u00F1adir "${query.trim()}"`}
        </button>
      )}
    </div>
  );
}

// Aisle chip for the Categorías list: the category illustration when we have
// one, otherwise the flat icon on its tinted square. Selection is carried by a
// coloured ring so it reads the same either way.
function AisleBadge({ aisle, Icon, color, selected, size = 30 }) {
  const img = aisleImageSrc(aisle);
  const [failed, setFailed] = useState(false);
  const showImg = Boolean(img) && !failed;
  return (
    <span
      style={{
        width: size, height: size, borderRadius: 9, flexShrink: 0,
        overflow: "hidden",
        background: showImg ? "#f2f7f4" : selected ? color : "#f0f4f1",
        color: selected && !showImg ? "#fff" : color,
        boxShadow: selected ? `0 0 0 2px ${color}` : "none",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {showImg ? (
        <img
          src={img}
          alt=""
          onError={() => setFailed(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : (
        <Icon size={14} strokeWidth={2.2} />
      )}
    </span>
  );
}

// Floating aisle list for the Categorías button — portaled so it isn't clipped
// by overflow parents; icons + horizontal dividers match StorePicker's language.
function AisleDropdown({ aisle, anchorRef, onSelect, onClose }) {
  const menuRef = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    const reposition = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const spaceBelow = vh - r.bottom;
      const openUp = spaceBelow < 280 && r.top > spaceBelow;
      setPos({
        left: Math.max(12, r.right - 220),
        width: 220,
        top: openUp ? null : r.bottom + 6,
        bottom: openUp ? vh - r.top + 6 : null,
        maxHeight: Math.max(180, (openUp ? r.top : spaceBelow) - 18),
      });
    };
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [anchorRef]);

  useEffect(() => {
    const onPointerDown = (e) => {
      if (menuRef.current?.contains(e.target) || anchorRef.current?.contains(e.target)) return;
      onClose();
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [anchorRef, onClose]);

  if (!pos) return null;

  return createPortal(
    <div
      ref={menuRef}
      role="listbox"
      style={{
        position: "fixed",
        left: pos.left,
        width: pos.width,
        top: pos.top ?? undefined,
        bottom: pos.bottom ?? undefined,
        maxHeight: pos.maxHeight,
        overflowY: "auto",
        background: "#fff",
        borderRadius: 14,
        border: "1px solid #d7e6dc",
        boxShadow: "0 20px 48px -10px rgba(20,47,29,.32)",
        zIndex: 400,
        padding: 5,
      }}
    >
      {SHOPPING_AISLES.map((a, i) => {
        const selected = aisle === a;
        const Icon = AISLE_ICONS[a] ?? UtensilsCrossed;
        const color = AISLE_COLORS[a] ?? GREEN;
        return (
          <div key={a}>
            {i > 0 && <div style={{ height: 1, margin: "3px 8px", background: "#d7e6dc" }} />}
            <button
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onSelect(a)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 10px",
                border: "none",
                borderRadius: 10,
                background: selected ? "#eaf3ec" : "transparent",
                color: selected ? GREEN : INK,
                fontWeight: selected ? 800 : 600,
                fontSize: 13,
                textAlign: "left",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <AisleBadge aisle={a} Icon={Icon} color={color} selected={selected} />
              <span style={{ flex: 1, minWidth: 0 }}>{a}</span>
              {selected && <Check size={15} strokeWidth={2.8} color={GREEN} style={{ flexShrink: 0 }} />}
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}

// Custom unit selector — the native <select> looked out of place (system
// styling). This mirrors the app's dropdown language (AisleDropdown /
// StorePicker): a rounded trigger + a portaled floating list with rounded
// corners, thin horizontal dividers and a check on the selected unit.
function UnitDropdown({ value, anchorRef, onSelect, onClose }) {
  const menuRef = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    const reposition = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const width = Math.max(r.width, 124);
      const spaceBelow = vh - r.bottom;
      const openUp = spaceBelow < 240 && r.top > spaceBelow;
      setPos({
        left: Math.min(r.left, window.innerWidth - width - 12),
        width,
        top: openUp ? null : r.bottom + 6,
        bottom: openUp ? vh - r.top + 6 : null,
        maxHeight: Math.max(180, (openUp ? r.top : spaceBelow) - 18),
      });
    };
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [anchorRef]);

  useEffect(() => {
    const onPointerDown = (e) => {
      if (menuRef.current?.contains(e.target) || anchorRef.current?.contains(e.target)) return;
      onClose();
    };
    const onKeyDown = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [anchorRef, onClose]);

  if (!pos) return null;

  return createPortal(
    <div
      ref={menuRef}
      role="listbox"
      style={{
        position: "fixed", left: pos.left, width: pos.width,
        top: pos.top ?? undefined, bottom: pos.bottom ?? undefined,
        maxHeight: pos.maxHeight, overflowY: "auto",
        background: "#fff", borderRadius: 14, border: "1px solid #d7e6dc",
        boxShadow: "0 20px 48px -10px rgba(20,47,29,.32)", zIndex: 400, padding: 5,
      }}
    >
      {INGREDIENT_UNITS.map((u, i) => {
        const selected = value === u;
        return (
          <div key={u}>
            {i > 0 && <div style={{ height: 1, margin: "3px 8px", background: "#d7e6dc" }} />}
            <button
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onSelect(u)}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: 10, padding: "9px 11px", border: "none", borderRadius: 10,
                background: selected ? "#eaf3ec" : "transparent",
                color: selected ? GREEN : INK, fontWeight: selected ? 800 : 600,
                fontSize: 13, textAlign: "left", cursor: "pointer", fontFamily: "inherit",
              }}
            >
              <span>{u}</span>
              {selected && <Check size={15} strokeWidth={2.8} color={GREEN} style={{ flexShrink: 0 }} />}
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}

function UnitPicker({ value, onChange, width }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          ...inputBase, flexShrink: 0, width, height: 34, padding: "0 8px",
          display: "inline-flex", alignItems: "center", justifyContent: "space-between", gap: 4,
          background: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700, color: INK,
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>
        {open ? <ChevronUp size={14} color="#9ab0a1" style={{ flexShrink: 0 }} /> : <ChevronDown size={14} color="#9ab0a1" style={{ flexShrink: 0 }} />}
      </button>
      {open && (
        <UnitDropdown
          value={value}
          anchorRef={btnRef}
          onSelect={(u) => { onChange(u); setOpen(false); }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function IngredientEditList({ items, onUpdate, onRemove }) {
  if (items.length === 0) {
    return (
      <div style={{ marginTop: 12, padding: "18px 14px", borderRadius: 14, border: "1.5px dashed #d8e6dc", textAlign: "center" }}>
        <p style={{ margin: 0, fontSize: 12.5, color: "#9ab0a1", fontWeight: 600 }}>Marca ingredientes arriba y ajusta aquí las cantidades</p>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 12 }}>
      {items.map((it, i) => (
        <div
          key={`${it.name}-${i}`}
          style={{
            display: "flex", alignItems: "center", gap: 8, padding: "9px 2px",
            borderBottom: i === items.length - 1 ? "none" : "1px solid rgba(45,110,70,.2)",
          }}
        >
          <PantryCategoryIcon name={it.name} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: INK, lineHeight: 1.25, overflowWrap: "anywhere" }}>
            {it.name}
          </span>
          {!isQualitativeUnit(it.unit) && (
            <input
              value={it.amount}
              onChange={(e) => onUpdate(i, { amount: e.target.value })}
              inputMode="decimal"
              placeholder="0"
              style={{ ...inputBase, width: 50, height: 34, flexShrink: 0, padding: "0 4px", fontSize: 13, fontWeight: 700, textAlign: "center" }}
            />
          )}
          <UnitPicker
            value={it.unit}
            width={isQualitativeUnit(it.unit) ? 100 : 84}
            onChange={(unit) =>
              // Qualitative units don't carry a fixed number — drop any amount
              // so the ingredient isn't left with a stale/meaningless quantity.
              onUpdate(i, isQualitativeUnit(unit) ? { unit, amount: "" } : { unit })
            }
          />
          <button
            type="button"
            onClick={() => onRemove(i)}
            aria-label="Quitar ingrediente"
            style={{
              width: 28, height: 28, borderRadius: 8, border: "none", flexShrink: 0,
              background: "#fdf1ef", color: "#c0392b", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

// Grows a textarea to fit its content instead of scrolling inside a fixed
// height box — re-measured on every value change (typing or a fresh AI
// draft loading in with long steps already in it).
function autoGrowTextarea(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

// Editable preview of the AI-generated steps (step 3) — same list carries
// through to the review step, so tweaking a step here or there is enough,
// no need to re-run the AI just to fix a small wording issue.
/**
 * Pasos del borrador en formato rico. Una receta antigua (o un modelo que se
 * despistó y devolvió strings) solo tiene `steps` planos: se envuelven para que
 * el editor tenga siempre la misma forma con la que trabajar.
 */
function draftRichSteps(draft) {
  if (draft?.stepsRich?.length) return draft.stepsRich;
  return (draft?.steps ?? []).map((text) => ({ text }));
}

/**
 * Ingredientes del borrador en la forma que espera el resolutor de marcadores
 * ({{Ajo}} → "2 dientes de ajo"), que lee `qty` y no `amount`.
 */
function stepPreviewIngredients(draft) {
  return (draft?.ingredients ?? []).map((i) => ({
    name: i.name,
    qty: Number(i.amount) || 0,
    unit: i.unit,
  }));
}

/**
 * Editor del paso a paso. Trabaja sobre `stepsRich` ({ text, minutes, kind }),
 * el mismo formato que el catálogo, para que lo que se edita aquí sea
 * exactamente lo que luego pinta el stepper del detalle del menú.
 * El texto puede llevar marcadores ({{Ajo}}, {{@Sartén}}): se editan en crudo
 * y se resuelven al pintar, así que la vista previa del último paso del asistente
 * es donde se ve el resultado final.
 */
function EditableStepsList({ steps, onUpdate, onRemove, onAdd }) {
  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {steps.map((s, i) => {
          const meta = STEP_KIND_META[s.kind] ?? null;
          return (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <span style={{
                flexShrink: 0, width: 20, height: 20, marginTop: 6, borderRadius: 999,
                fontSize: 11, fontWeight: 900, color: "#fff",
                background: meta?.color ?? GREEN,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {i + 1}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <textarea
                  ref={autoGrowTextarea}
                  value={s.text}
                  onChange={(e) => { onUpdate(i, { text: e.target.value }); autoGrowTextarea(e.target); }}
                  rows={1}
                  style={{
                    width: "100%", resize: "none", overflow: "hidden", boxSizing: "border-box",
                    border: "none", background: "#fff", borderRadius: 10, padding: "6px 8px",
                    fontSize: 13.5, fontFamily: "inherit", color: INK, outline: "none", lineHeight: 1.4,
                  }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                  <select
                    value={s.kind ?? "activo"}
                    onChange={(e) => onUpdate(i, { kind: e.target.value })}
                    aria-label="Tipo de paso"
                    style={{
                      border: "none", borderRadius: 999, padding: "3px 8px",
                      background: `${(STEP_KIND_META[s.kind] ?? STEP_KIND_META.activo).color}1a`,
                      color: (STEP_KIND_META[s.kind] ?? STEP_KIND_META.activo).color,
                      fontSize: 10.5, fontWeight: 800, fontFamily: "inherit", cursor: "pointer",
                    }}
                  >
                    {Object.entries(STEP_KIND_META).map(([id, m]) => (
                      <option key={id} value={id}>{m.label}</option>
                    ))}
                  </select>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 3,
                    padding: "3px 8px", borderRadius: 999, background: "#f4f7f4",
                  }}>
                    <input
                      type="number"
                      min={0}
                      value={s.minutes ?? ""}
                      placeholder="–"
                      onChange={(e) => onUpdate(i, { minutes: e.target.value === "" ? undefined : Number(e.target.value) })}
                      aria-label="Minutos del paso"
                      style={{
                        width: 30, border: "none", background: "transparent", outline: "none",
                        fontSize: 10.5, fontWeight: 800, color: "#5a7066", fontFamily: "inherit",
                        textAlign: "right",
                      }}
                    />
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: "#5a7066" }}>min</span>
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label="Quitar paso"
                disabled={steps.length <= 1}
                style={{
                  width: 28, height: 28, marginTop: 4, borderRadius: 8, border: "none", flexShrink: 0,
                  background: steps.length <= 1 ? "#f3f5f3" : "#fdf1ef",
                  color: steps.length <= 1 ? "#c3cdc7" : "#c0392b",
                  cursor: steps.length <= 1 ? "default" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onAdd}
        style={{
          marginTop: 8, padding: "8px 12px", borderRadius: 10, border: "1.5px dashed #c8ddcf",
          background: "transparent", color: GREEN, fontFamily: "inherit", fontSize: 12.5, fontWeight: 700,
          cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
        }}
      >
        <Plus size={14} /> Añadir paso
      </button>
    </div>
  );
}

// ── Visibility options ─────────────────────────────────────────────────────

const VISIBILITY_OPTIONS = [
  {
    id: "public",
    icon: Globe,
    label: "Pública",
    sub: "Cualquier usuario de HoMenu puede verla y valorarla.",
    color: "#2d5a3d",
    bg: "#e6f3ea",
    border: "#a8d5b5",
  },
  {
    id: "friends",
    icon: Users2,
    label: "Solo amigos",
    sub: "Solo la ven las personas que sigues y que te siguen.",
    color: "#7a4e00",
    bg: "#fff8e7",
    border: "#f0d090",
  },
  {
    id: "private",
    icon: Lock,
    label: "Privada",
    sub: "Solo tú puedes verla. No aparece en ningún listado.",
    color: "#5a2d7a",
    bg: "#f5edfc",
    border: "#c9a0e8",
  },
];

function VisibilitySheet({ onConfirm, onClose }) {
  const [selected, setSelected] = useState("public");

  // Rendered via a portal (matching every other position:fixed sheet in the
  // app — CatalogBrowserSheet, MenusScreen, Menu.jsx, ui.jsx's BottomNav):
  // without it, this was the one overlay left rendering inline inside
  // RecipePlannerScreen's own tree, so a transform/animation on an ancestor
  // (e.g. mid-transition) could turn it into position:fixed's containing
  // block instead of the viewport — the backdrop still covers the screen,
  // but the white sheet itself renders off-position/invisible.
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(0,0,0,.45)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: "22px 22px 0 0",
          width: "100%", maxWidth: 420,
          padding: "22px 20px calc(28px + env(safe-area-inset-bottom, 0px))",
          boxSizing: "border-box",
        }}
      >
        {/* Handle */}
        <div style={{ width: 36, height: 4, background: "#dde5df", borderRadius: 99, margin: "0 auto 18px" }} />

        <p style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 900, color: "#142f1d", textAlign: "center" }}>
          ¿Quién puede ver esta receta?
        </p>
        <p style={{ margin: "0 0 18px", fontSize: 13, color: "#7a9485", textAlign: "center", lineHeight: 1.45 }}>
          Podrás cambiarlo después desde tu recetario.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 18 }}>
          {VISIBILITY_OPTIONS.map((opt) => {
            const active = selected === opt.id;
            const Icon = opt.icon;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSelected(opt.id)}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 13,
                  padding: "13px 14px", borderRadius: 14, cursor: "pointer",
                  fontFamily: "inherit", textAlign: "left",
                  border: `2px solid ${active ? opt.border : "#eef3f0"}`,
                  background: active ? opt.bg : "#fafcfa",
                  transition: "all .15s",
                }}
              >
                <div
                  style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    background: active ? opt.border : "#f0f4f1",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Icon size={17} color={active ? opt.color : "#9ab0a1"} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 800, color: active ? opt.color : "#1a3a24" }}>
                    {opt.label}
                  </p>
                  <p style={{ margin: 0, fontSize: 12, color: active ? opt.color : "#7a9485", lineHeight: 1.4, opacity: active ? 0.85 : 1 }}>
                    {opt.sub}
                  </p>
                </div>
                <div
                  style={{
                    width: 20, height: 20, borderRadius: 99, flexShrink: 0, marginTop: 2,
                    border: `2px solid ${active ? opt.color : "#c8d9ce"}`,
                    background: active ? opt.color : "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all .15s",
                  }}
                >
                  {active && <Check size={11} color="#fff" strokeWidth={3} />}
                </div>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => onConfirm(selected)}
          style={{
            width: "100%", padding: 13, borderRadius: 13, border: "none",
            background: "linear-gradient(135deg, #2d5a3d 0%, #4cba6e 100%)",
            color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Guardar receta
        </button>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Recipe-creation wizard. Collects name/ingredients/time/servings from the
 * user, lets Claude fill in what's missing (macros, allergens, difficulty,
 * steps), and — once the user confirms the allergen list — saves the result
 * into data.userRecipes, where it becomes usable exactly like a catalog dish
 * (see filterRecipes.js / aiPlanner.js / CatalogBrowserSheet.jsx).
 */
export function RecipePlannerScreen({ userRecipes = [], user = null, kitchenTools = [], setData, onClose, onSaved, editRecipe = null, autoDemo = false, onDemoStep = null, onDemoScroll = null }) {
  // Editing an existing recipe: jump straight to the review step with the
  // recipe already loaded (no AI re-run), and let "Atrás" walk back through
  // the wizard to tweak anything. Saving updates the same recipe (by id).
  const isEditing = !!editRecipe;
  const reviewStepIndex = STEP_META.length - 1;
  const [step, setStep] = useState(isEditing ? reviewStepIndex : 0);
  const [form, setForm] = useState(
    isEditing
      ? {
          name: editRecipe.name ?? "",
          baseServings: editRecipe.baseServings ?? 4,
          time: editRecipe.time ?? 30,
          ingredients: editRecipe.ingredients ?? [],
          category: editRecipe.category ?? "",
          mealRole: editRecipe.mealRole ?? [],
          // "Cena rápida" = plato de montaje. Persistido en `montaje`;
          // isMontaje cae a la categoría deprecada para recetas anteriores.
          quickDinner: isMontaje(editRecipe),
          mainProtein: editRecipe.mainProtein ?? "",
          usageTags: editRecipe.usageTags ?? [],
          baseDishId: editRecipe.baseDishId ?? null,
          linkedCatalogId: editRecipe.linkedCatalogId ?? null,
          pinnedGarnishId: editRecipe.pinnedGarnishId ?? null,
          requiredAppliances: editRecipe.requiredAppliances ?? [],
          kidFriendly: editRecipe.kidFriendly ?? null,
          allergens: editRecipe.allergens ?? [],
          preparationNotes: editRecipe.preparationNotes ?? "",
        }
      : {
    name: "",
    baseServings: 4,
    time: 30,
    ingredients: [],
    category: "",
    mealRole: [],
    quickDinner: false,
    mainProtein: "",
    usageTags: [], // Eje B: proposed by AI at review, editable there (multi)
    baseDishId: null, // Eje A: this is another recipe for an existing dish
    linkedCatalogId: null, // guarnición → plato de referencia (foto combo)
    pinnedGarnishId: null, // plato normal → guarnición fijada
    requiredAppliances: [],
    kidFriendly: null,
    allergens: [],
    preparationNotes: "",
  });
  // Eje A decision on the name step: null (undecided) | "new" | "variant".
  const [baseDishDecision, setBaseDishDecision] = useState(null);
  // Visibility popup shown just before the final save.
  const [showVisibilitySheet, setShowVisibilitySheet] = useState(false);

  // Every existing garnish a "plato normal" can pin: the bundled
  // guarniciones.json plus any garnish the user created earlier (type/role
  // "guarnicion"), so the pool grows as the user adds their own.
  const userGarnishesOnly = useMemo(
    () => filterOwnCreatedRecipes(userRecipes, user).filter(
      (r) => r.type === "guarnicion" || r.mealRole?.includes?.("guarnicion"),
    ),
    [userRecipes, user],
  );

  const baseDishPool = useMemo(
    () => [...recipeCatalog, ...(userRecipes ?? [])],
    [userRecipes],
  );
  const baseDishMatches = useMemo(
    () => findBaseDishMatches(form.name, baseDishPool),
    [form.name, baseDishPool],
  );
  const [ingredientQuery, setIngredientQuery] = useState("");
  const [ingredientAisle, setIngredientAisle] = useState(null);
  const [aiState, setAiState] = useState(isEditing ? "done" : "idle"); // idle | loading | error | done
  const [aiError, setAiError] = useState(null);
  const [draft, setDraft] = useState(isEditing ? editRecipe : null);
  // Alérgenos mostrados en la vista previa (Fase 4 del catálogo de
  // ingredientes). Antes era un `useState` fijado UNA vez con el guess de la
  // IA (`setConfirmedAllergens(new Set(result.allergens))`) y nunca vuelto a
  // tocar — así que si el usuario volvía atrás (el wizard lo permite,
  // `onJump`/`goBack` más abajo) y cambiaba los ingredientes, la ficha seguía
  // enseñando los alérgenos de la lista vieja. Al ser ahora un `useMemo` sobre
  // `form.ingredients`, se recalcula solo con cualquier cambio.
  //
  // Cuando el 100% de los ingredientes resuelve contra el catálogo
  // (`ingredients.json`), los alérgenos dejan de ser una estimación de la IA y
  // pasan a ser el hecho computado por `deriveRecipeAllergens` — mismo cálculo
  // que ya usa el catálogo curado. Si algo no resuelve, se cae al guess de la
  // IA (`draft.allergens`, idéntico comportamiento a hoy) y `verified` queda a
  // `false` para quien quiera mostrarlo más adelante.
  const derivedAllergens = useMemo(() => {
    const derived = deriveRecipeAllergens({ ingredients: form.ingredients });
    if (derived.unknownNames.length === 0) {
      return { allergens: derived.allergens, verified: true };
    }
    return { allergens: draft?.allergens ?? [], verified: false };
  }, [form.ingredients, draft]);
  const [photo, setPhoto] = useState(isEditing ? editRecipe.photo ?? null : null);
  const [photoGenState, setPhotoGenState] = useState("idle"); // idle | loading | error
  const [photoGenError, setPhotoGenError] = useState(null);
  const [saved, setSaved] = useState(false);
  const abortRef = useRef(null);
  const photoAbortRef = useRef(null);
  // Pre-fills the ingredient step with AI suggestions (item: "ir más rápido").
  const [suggestState, setSuggestState] = useState("idle"); // idle | loading | done | error
  const suggestAbortRef = useRef(null);
  const suggestedForNameRef = useRef(null);
  // "Revisa las cantidades" is onboarding for the suggestion feature, not a
  // status: it shows for 3s on the first recipe ever and never again.
  const [showSuggestHint, setShowSuggestHint] = useState(false);

  const updateForm = (patch) => setForm((f) => ({ ...f, ...patch }));

  // Editing the name invalidates any earlier "same dish?" decision.
  const setName = (name) => {
    setForm((f) => ({ ...f, name, baseDishId: null }));
    setBaseDishDecision(null);
  };

  const toggleMealRole = (id) =>
    setForm((f) => ({
      ...f,
      mealRole: f.mealRole.includes(id) ? f.mealRole.filter((r) => r !== id) : [...f.mealRole, id],
    }));

  const comidaChecked = form.mealRole.some((r) => COMIDA_POSITIONS.includes(r));

  const toggleComida = () => {
    if (comidaChecked) {
      setForm((f) => ({ ...f, mealRole: f.mealRole.filter((r) => !COMIDA_POSITIONS.includes(r)) }));
    } else {
      const role = defaultComidaRole(form.usageTags);
      setForm((f) => ({
        ...f,
        mealRole: [...f.mealRole.filter((r) => !COMIDA_POSITIONS.includes(r)), role],
      }));
    }
  };

  // "Cena rápida" is a proxy sub-type of dinner (quick + easy). Turning it on
  // implies "Cena", so we tick that role too; it persists as category
  // "cenas_rapidas" on save.
  const toggleQuickDinner = () => {
    setForm((f) => {
      const next = !f.quickDinner;
      const mealRole = next && !f.mealRole.includes("cena") ? [...f.mealRole, "cena"] : f.mealRole;
      return { ...f, quickDinner: next, mealRole };
    });
  };

  // Single-select ("¿Cómo se sirve?" segmented control on the cuándo se
  // sirve step). Switching role clears any pairing that only made sense for
  // the previous one.
  const setUsage = (id) =>
    setForm((f) => ({
      ...f,
      usageTags: f.usageTags[0] === id ? [] : [id],
      pinnedGarnishId: id === "plato_normal" ? f.pinnedGarnishId : null,
      linkedCatalogId: id === "guarnicion" ? f.linkedCatalogId : null,
    }));

  const toggleIngredient = (name) =>
    setForm((f) => {
      const key = String(name).trim().toLowerCase();
      if (!key) return f;
      const exists = f.ingredients.some((i) => i.name.toLowerCase() === key);
      return {
        ...f,
        ingredients: exists
          ? f.ingredients.filter((i) => i.name.toLowerCase() !== key)
          : [...f.ingredients, makeIngredient(name)],
      };
    });
  const addCustomIngredient = (name) => {
    const key = String(name).trim().toLowerCase();
    if (!key) return;
    setForm((f) =>
      f.ingredients.some((i) => i.name.toLowerCase() === key)
        ? f
        : { ...f, ingredients: [...f.ingredients, makeIngredient(name)] },
    );
    setIngredientQuery("");
  };
  const updateIngredientAt = (idx, patch) =>
    setForm((f) => ({ ...f, ingredients: f.ingredients.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));
  const removeIngredient = (idx) =>
    setForm((f) => ({ ...f, ingredients: f.ingredients.filter((_, i) => i !== idx) }));
  const addedIngredientNames = useMemo(
    () => new Set(form.ingredients.map((i) => i.name.toLowerCase())),
    [form.ingredients],
  );

  const canNext = [
    form.name.trim().length > 0 && Number(form.baseServings) > 0 && Number(form.time) > 0,
    form.ingredients.length > 0,
    true,
    true,
    true,
  ];

  const runAI = async () => {
    setAiState("loading");
    setAiError(null);
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const result = await generateUserRecipeDraft(
        {
          name: form.name.trim(),
          baseServings: Number(form.baseServings),
          time: Number(form.time),
          ingredients: form.ingredients,
          mealRole: form.mealRole,
          kidFriendly: form.kidFriendly,
          allergens: form.allergens,
          preparationNotes: form.preparationNotes.trim() || undefined,
        },
        { signal: ctrl.signal },
      );
      setDraft(result);
      // Los alérgenos de la ficha ya no se fijan aquí: `derivedAllergens`
      // (useMemo, arriba) los recalcula solo a partir de `form.ingredients` +
      // este `draft` como fallback.
      // The user already chose "¿Cómo se sirve?" on the cuándo se sirve step.
      // Category and main protein are AI-only (internal catalog ordering); we
      // seed them silently and never surface them for editing.
      setForm((f) => ({
        ...f,
        usageTags: f.usageTags?.length ? f.usageTags : (result.usageTags ?? []),
        category: result.category || f.category,
        mainProtein: result.mainProtein || f.mainProtein,
      }));
      setAiState("done");
    } catch (err) {
      if (err?.name === "AbortError") return;
      setAiError(err?.message || "No se pudo generar la receta.");
      setAiState("error");
    }
  };

  // Pre-fill the ingredient step with AI suggestions the first time the user
  // lands on it with an empty list — a head start they can freely edit/remove.
  // Keyed by name so retyping the dish name (and coming back) re-suggests once.
  useEffect(() => {
    if (autoDemo) return; // en demo sembramos ingredientes, sin red
    const ingredientsStepIndex = 1;
    if (step !== ingredientsStepIndex) return;
    const name = form.name.trim();
    if (!name) return;
    if (form.ingredients.length > 0) return;
    if (suggestedForNameRef.current === name.toLowerCase()) return;
    suggestedForNameRef.current = name.toLowerCase();
    setSuggestState("loading");
    const ctrl = new AbortController();
    suggestAbortRef.current = ctrl;
    suggestRecipeIngredients(name, { servings: Number(form.baseServings) || 4, signal: ctrl.signal })
      .then((list) => {
        if (ctrl.signal.aborted) return;
        if (list.length) {
          const asIngredients = list.map((i) =>
            i.unit
              ? { name: String(i.name).trim(), amount: i.amount != null ? i.amount : defaultAmountForUnit(i.unit), unit: i.unit }
              : makeIngredient(i.name),
          );
          setForm((f) => (f.ingredients.length === 0 ? { ...f, ingredients: asIngredients } : f));
        }
        setSuggestState("done");
        if (markSuggestHintSeen()) setShowSuggestHint(true);
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setSuggestState("error");
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, form.name]);

  // The hint has said its piece after 3s; leaving it up just pushes the
  // ingredient list down for the rest of the session.
  useEffect(() => {
    if (!showSuggestHint) return undefined;
    const t = setTimeout(() => setShowSuggestHint(false), 3000);
    return () => clearTimeout(t);
  }, [showSuggestHint]);

  // Kick off the AI draft once we land on the review step (the last one).
  useEffect(() => {
    if (autoDemo) return undefined; // demo siembra el draft, sin red
    if (step === reviewStepIndex && aiState === "idle") runAI();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Value-prop carousel demo: recorre el asistente PULSANDO cada opción (no
  // rellena de golpe). Usa una receta REAL del catálogo, así el nombre y la FOTO
  // son coherentes (nada inventado). En bucle. `onDemoStep` sincroniza el paneo.
  useEffect(() => {
    if (!autoDemo) return undefined;
    const seed = recipeCatalog.find((r) => r.id === "pescados_002") ?? null;
    if (!seed) return undefined;
    let cancelled = false;
    const timers = [];
    const wait = (ms) =>
      new Promise((res) => {
        const id = setTimeout(res, ms);
        timers.push(id);
      });
    // Entra a un paso: salto instantáneo al top (sin rebote) y limpia el scroll.
    const enterStep = (s) => {
      setStep(s);
      onDemoStep?.(s);
    };
    const run = async () => {
      while (!cancelled) {
        // Reset del formulario y vuelta al paso 0 arriba del todo.
        enterStep(0);
        setDraft(null);
        setPhoto(null);
        setPhotoGenState("idle");
        setAiState("idle");
        setBaseDishDecision(null);
        setForm((f) => ({
          ...f,
          name: "",
          ingredients: [],
          usageTags: [],
          mealRole: [],
          quickDinner: false,
          kidFriendly: null,
          requiredAppliances: [],
          baseServings: 4,
          time: 30,
        }));
        await wait(650);
        if (cancelled) return;

        // ── Paso 0 · El plato ────────────────────────────────────────────────
        for (let i = 1; i <= seed.name.length; i += 1) {
          setName(seed.name.slice(0, i));
          await wait(32);
          if (cancelled) return;
        }
        await wait(700);
        if (cancelled) return;
        setBaseDishDecision("new"); // "es una receta nueva"
        await wait(700);
        if (cancelled) return;
        onDemoScroll?.(-120);
        await wait(700);
        if (cancelled) return;
        setForm((f) => ({ ...f, baseServings: seed.baseServings ?? 4 })); // Nº personas
        await wait(650);
        if (cancelled) return;
        onDemoScroll?.(-210);
        await wait(650);
        if (cancelled) return;
        setForm((f) => ({ ...f, time: seed.time ?? 25 })); // Tiempo
        await wait(650);
        if (cancelled) return;
        onDemoScroll?.(-360); // baja hasta "¿Cómo se prepara?"
        await wait(700);
        if (cancelled) return;
        setForm((f) => ({ ...f, requiredAppliances: ["Horno"] })); // Método
        await wait(950);
        if (cancelled) return;

        // Siembra ingredientes ANTES de su paso (sin sugerencia por red).
        setForm((f) => ({
          ...f,
          category: seed.category ?? "pescados",
          mainProtein: seed.mainProtein ?? "pescado_blanco",
          allergens: seed.allergens ?? [],
          ingredients: seed.ingredients ?? [],
        }));

        // ── Paso 1 · Ingredientes ────────────────────────────────────────────
        enterStep(1);
        await wait(1100);
        if (cancelled) return;
        onDemoScroll?.(-180);
        await wait(1100);
        if (cancelled) return;
        onDemoScroll?.(-360); // baja hasta el final de la lista
        await wait(1300);
        if (cancelled) return;

        // ── Paso 2 · ¿Cuándo se sirve? ──────────────────────────────────────
        enterStep(2);
        await wait(700);
        if (cancelled) return;
        setForm((f) => ({ ...f, usageTags: ["plato_normal"] })); // ¿Cómo se sirve?
        await wait(800);
        if (cancelled) return;
        onDemoScroll?.(-120);
        await wait(500);
        if (cancelled) return;
        setForm((f) => ({ ...f, mealRole: [...new Set([...f.mealRole, "segundo"])] })); // Comida
        await wait(800);
        if (cancelled) return;
        onDemoScroll?.(-260); // baja hasta "¿Apto para niños?"
        await wait(600);
        if (cancelled) return;
        setForm((f) => ({ ...f, kidFriendly: true })); // Apto niños: Sí
        await wait(950);
        if (cancelled) return;

        // ── Paso 3 · Preparación → "Procesar con IA" ────────────────────────
        enterStep(3);
        await wait(700);
        if (cancelled) return;
        setForm((f) => ({
          ...f,
          preparationNotes: seed.description || "Hornea el salmón con las patatas y la cebolla hasta que esté jugoso.",
        }));
        await wait(800);
        if (cancelled) return;
        setAiState("loading");
        await wait(1300);
        if (cancelled) return;
        setDraft(seed);
        setAiState("done");
        await wait(900);
        if (cancelled) return;
        onDemoScroll?.(-240); // ver los pasos generados
        await wait(1100);
        if (cancelled) return;
        onDemoScroll?.(-420); // baja hasta el final
        await wait(1300);
        if (cancelled) return;

        // ── Paso 4 · Foto → "Generar con IA" ────────────────────────────────
        enterStep(4);
        await wait(700);
        if (cancelled) return;
        setPhotoGenState("loading");
        await wait(1400);
        if (cancelled) return;
        setPhoto(dishImageForRecipe(seed)); // foto coherente con el plato
        setPhotoGenState("idle");
        await wait(1000);
        if (cancelled) return;
        onDemoScroll?.(-160);
        await wait(1300);
        if (cancelled) return;

        // ── Paso 5 · Revisión ───────────────────────────────────────────────
        enterStep(reviewStepIndex);
        await wait(900);
        if (cancelled) return;
        onDemoScroll?.(-200);
        await wait(1200);
        if (cancelled) return;
        onDemoScroll?.(-420); // baja hasta el CTA final
        await wait(1600);
        if (cancelled) return;
      }
    };
    run();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDemo]);

  const generatePhoto = async () => {
    if (!form.name.trim()) return;
    setPhotoGenState("loading");
    setPhotoGenError(null);
    if (photoAbortRef.current) photoAbortRef.current.abort();
    const ctrl = new AbortController();
    photoAbortRef.current = ctrl;
    try {
      const dataUrl = await generateDishPhotoWithAI(form.name.trim(), { signal: ctrl.signal, category: form.category });
      setPhoto(dataUrl);
      setPhotoGenState("idle");
    } catch (err) {
      if (err?.name === "AbortError") return;
      setPhotoGenError(err?.message || "No se pudo generar la foto.");
      setPhotoGenState("error");
    }
  };

  const saveRecipe = (visibility = "public") => {
    if (!draft) return;
    // The user may have tweaked the AI's classification at review — the
    // canonical `type` the rest of the app reads is derived from usageTags.
    const usageTags = form.usageTags.length ? form.usageTags : draft.usageTags ?? [];
    const type = deriveTypeFromUsageTags(usageTags);
    const isGarnishOnly = type === "guarnicion";

    // A pinned garnish only makes sense for a dish that can act as a main;
    // it's read back by pairGarnishes.js when the recipe is scheduled.
    const pinnedGarnishId =
      type === "principal" && form.pinnedGarnishId ? form.pinnedGarnishId : undefined;
    // A garnish can reference an existing plato for the combo photo lookup.
    const linkedCatalogId =
      usageTags.includes("guarnicion") && form.linkedCatalogId ? form.linkedCatalogId : undefined;

    const finalRecipe = {
      ...draft,
      // Editing keeps the original id so it updates in place; a new recipe
      // keeps whatever id the draft already carries.
      id: editRecipe?.id ?? draft.id,
      usageTags,
      type,
      // Cena rápida: viaja en su propio eje (`montaje`), no secuestrando
      // `category` — que ahora solo responde "qué lleva el plato". El rol
      // "cena" se sigue añadiendo abajo para que sea elegible en cenas.
      montaje: isGarnishOnly ? undefined : form.quickDinner,
      category: isGarnishOnly ? "guarniciones" : form.category || draft.category,
      mainProtein: isGarnishOnly ? "none" : form.mainProtein || draft.mainProtein,
      mealRole: isGarnishOnly
        ? ["guarnicion"]
        : form.quickDinner
          ? Array.from(new Set([...(draft.mealRole ?? []), "cena"]))
          : draft.mealRole,
      allergens: derivedAllergens.allergens,
      requiredAppliances: form.requiredAppliances.length ? form.requiredAppliances : undefined,
      baseDishId: form.baseDishId || undefined,
      pinnedGarnishId,
      linkedCatalogId,
      photo: photo || undefined,
      // Provenance + community signal. `rating` is a scaffold for up/down
      // voting (persisting votes across users needs a Supabase table, wired
      // later); the owner never counts as a voter on their own recipe.
      owner: ownerFromUser(user),
      source: "user",
      createdAt: draft.createdAt ?? Date.now(),
      rating: draft.rating ?? { up: 0, down: 0, score: 0 },
      // Visibility: "public" | "friends" | "private"
      visibility,
    };
    setData((d) => {
      const list = d.userRecipes ?? [];
      const idx = editRecipe ? list.findIndex((r) => r.id === editRecipe.id) : -1;
      const next = idx >= 0
        ? list.map((r, i) => (i === idx ? finalRecipe : r))
        : [...list, finalRecipe];
      return { ...d, userRecipes: next };
    });
    setSaved(true);
    onSaved?.(finalRecipe, { edited: !!editRecipe });
  };

  // El paso a paso se edita en formato rico ({ text, minutes, kind }) porque es
  // lo que pinta el detalle del menú. `steps` (plano) se deriva en cada cambio
  // en vez de editarse aparte: si se tocaran por separado acabarían diciendo
  // cosas distintas y el detalle mostraría la versión vieja.
  const editableSteps = useMemo(
    () => draftRichSteps(draft),
    [draft],
  );

  const setSteps = (updater) =>
    setDraft((d) => {
      if (!d) return d;
      const next = updater(draftRichSteps(d));
      return { ...d, stepsRich: next, steps: richToPlainSteps(next) };
    });

  const updateStepAt = (idx, patch) =>
    setSteps((list) => list.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  const removeStepAt = (idx) =>
    setSteps((list) => (list.length > 1 ? removeRichStep(list, idx) : list));
  const addStep = () => setSteps((list) => [...list, { text: "", kind: "activo" }]);

  const goBack = () => {
    if (step === 0) { onClose(); return; }
    setStep((s) => Math.max(0, s - 1));
  };
  const goNext = () => setStep((s) => Math.min(STEP_META.length - 1, s + 1));

  return (
    <div style={{ minHeight: "100dvh", background: BG, display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
      {/* Header: back / progress dots / close — same language as onboarding */}
      <div style={{ minHeight: 38, padding: "16px 20px 0", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <div style={{ flex: "0 0 auto" }}>
          <button type="button" onClick={goBack} style={headerBtnStyle}>
            Atrás
          </button>
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", justifyContent: "center" }}>
          <ProgressDots
            current={step}
            total={STEP_META.length}
            onJump={(i) => { if (i < step) setStep(i); }}
            compact
          />
        </div>
        <div style={{ flex: "0 0 auto" }}>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              width: 36, height: 36, borderRadius: 10, border: "1.5px solid #e0e8e3", background: "#fff",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <X size={16} color={INK} />
          </button>
        </div>
      </div>

      {/* Step title — small colored icon badge + underline accent, no big hero */}
      <div style={{ padding: "10px 20px 26px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <span
          style={{
            width: 34, height: 34, borderRadius: 11, background: `${STEP_META[step].color}17`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {(() => {
            const StepIcon = STEP_META[step].icon;
            return <StepIcon size={17} color={STEP_META[step].color} />;
          })()}
        </span>
        <p style={{ margin: 0, fontSize: 17, fontWeight: 900, color: INK, letterSpacing: "-.3px", position: "relative" }}>
          {STEP_META[step].title}
          <span
            style={{
              position: "absolute", left: "14%", right: "14%", bottom: -5, height: 3,
              borderRadius: 3, background: STEP_META[step].color, opacity: 0.45,
            }}
          />
        </p>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 20px 20px" }}>
        {step === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <FieldLabel icon={ChefHat}>Nombre del plato</FieldLabel>
              <TextField
                value={form.name}
                onChange={setName}
                placeholder="Ej. Salteado de pollo con verduras"
              />
              <BaseDishDetector
                matches={baseDishMatches}
                decision={baseDishDecision}
                selectedId={form.baseDishId}
                onNew={() => { setBaseDishDecision("new"); updateForm({ baseDishId: null }); }}
                onVariant={(id) => { setBaseDishDecision("variant"); updateForm({ baseDishId: id }); }}
              />
            </div>
            <div style={{ height: 1, background: "#e3ebe6" }} />
            <div>
              <FieldLabel icon={Users}>Nº de personas</FieldLabel>
              <GridNumberPicker
                values={[1, 2, 3, 4, 5, 6, 8]}
                value={form.baseServings}
                onChange={(v) => updateForm({ baseServings: v })}
              />
            </div>
            <div style={{ height: 1, background: "#e3ebe6" }} />
            <div>
              <FieldLabel icon={Clock}>Tiempo aproximado (min)</FieldLabel>
              <GridNumberPicker
                values={[5, 10, 15, 20, 25, 30, 40]}
                value={form.time}
                onChange={(v) => updateForm({ time: v })}
              />
            </div>
            <div style={{ height: 1, background: "#e3ebe6" }} />
            <OptionSection
              icon={CookingPot}
              title="¿Cómo se prepara?"
              subtitle="Elige una. Si no marcas nada, asumimos la forma tradicional (fuego / sartén / olla)."
            >
              {COOKING_METHODS.map((m, i) => (
                <OptionRow
                  key={m.id}
                  icon={APPLIANCE_ICONS[m.id] ?? UtensilsCrossed}
                  color={APPLIANCE_COLORS[m.id] ?? GREEN}
                  label={m.label}
                  checked={form.requiredAppliances[0] === m.id}
                  onToggle={() =>
                    updateForm({
                      requiredAppliances: form.requiredAppliances[0] === m.id ? [] : [m.id],
                    })
                  }
                  last={optionRowIsLast(i, COOKING_METHODS.length)}
                />
              ))}
            </OptionSection>
          </div>
        )}

        {step === 1 && (
          <div>
            {suggestState === "loading" ? (
              <div style={{
                display: "flex", alignItems: "center", gap: 8, margin: "0 0 12px",
                padding: "9px 11px", borderRadius: 12, background: "#fff7ed",
                border: "1px solid #f6dcc0",
              }}>
                <Sparkles size={14} color="#c96a1c" />
                <span style={{ fontSize: 12, fontWeight: 700, color: "#a85a15" }}>
                  Sugiriendo ingredientes para «{form.name.trim()}»…
                </span>
              </div>
            ) : showSuggestHint && form.ingredients.length > 0 ? (
              <div style={{
                display: "flex", alignItems: "center", gap: 8, margin: "0 0 12px",
                padding: "9px 11px", borderRadius: 12, background: "#fff7ed",
                border: "1px solid #f6dcc0",
              }}>
                <Sparkles size={14} color="#c96a1c" />
                <span style={{ fontSize: 12, fontWeight: 700, color: "#a85a15" }}>
                  Sugerencia lista: revisa, ajusta cantidades o quita lo que no lleve.
                </span>
              </div>
            ) : null}
            <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 800, color: "#9ab0a1", letterSpacing: ".3px" }}>
              MARCA LOS INGREDIENTES QUE LLEVA
            </p>
            <IngredientPicker
              query={ingredientQuery}
              onQueryChange={setIngredientQuery}
              aisle={ingredientAisle}
              onAisleChange={setIngredientAisle}
              addedNames={addedIngredientNames}
              onToggle={toggleIngredient}
              onAddCustom={addCustomIngredient}
            />
            <IngredientEditList
              items={form.ingredients}
              onUpdate={updateIngredientAt}
              onRemove={removeIngredient}
            />
          </div>
        )}

        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
            <div>
              <FieldLabel icon={UtensilsCrossed}>¿Cómo se sirve?</FieldLabel>
              <FieldHint>Si no lo tienes claro, la IA lo decide por los ingredientes.</FieldHint>
              <UsageSegmentedControl value={form.usageTags} onChange={setUsage} />
            </div>

            <div style={{ height: 1, background: "#e3ebe6" }} />

            <div>
              <OptionSection
                icon={Clock}
                title="¿Cuándo se sirve?"
                subtitle="La cena rápida es una cena de poca elaboración y tiempo. Sin marcar nada, decide la IA."
              >
                <OptionRow
                  icon={Soup}
                  color={mealTimeColor("Comida")}
                  label="Comida"
                  checked={comidaChecked}
                  onToggle={toggleComida}
                />
                <OptionRow
                  icon={MEAL_ROLE_ICONS.cena}
                  color={mealTimeColor("Cena")}
                  label="Cena"
                  checked={form.mealRole.includes("cena")}
                  onToggle={() => toggleMealRole("cena")}
                />
                <OptionRow
                  icon={Zap}
                  color="#d56b9a"
                  label="Cena rápida"
                  checked={form.quickDinner}
                  onToggle={toggleQuickDinner}
                />
                <OptionRow
                  icon={Apple}
                  color="#c0504d"
                  label="Merienda"
                  checked={form.mealRole.includes("merienda")}
                  onToggle={() => toggleMealRole("merienda")}
                />
                <OptionRow
                  icon={IceCream}
                  color="#c0568f"
                  label="Postre"
                  checked={form.mealRole.includes("postre")}
                  onToggle={() => toggleMealRole("postre")}
                  last
                />
              </OptionSection>
            </div>

            <div style={{ height: 1, background: "#e3ebe6" }} />

            <div>
              <FieldLabel icon={Users}>¿Apto para niños?</FieldLabel>
              <SegmentedControl
                options={[
                  { id: "yes", label: "Sí" },
                  { id: "no", label: "No" },
                  { id: "unsure", label: "La IA decide" },
                ]}
                value={form.kidFriendly === null ? "unsure" : form.kidFriendly ? "yes" : "no"}
                onChange={(v) => updateForm({ kidFriendly: v === "unsure" ? null : v === "yes" })}
                activeDark
              />
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <FieldLabel icon={ChefHat}>¿Cómo lo preparas? (opcional)</FieldLabel>
              <FieldHint>
                Cuéntalo con tus palabras — la IA solo lo ordena en pasos claros, sin inventarse su propio método.
              </FieldHint>
              <textarea
                value={form.preparationNotes}
                onChange={(e) => updateForm({ preparationNotes: e.target.value })}
                placeholder="Ej. Sofríe la cebolla 5 min, añade el arroz y tuesta 2 min, vierte el caldo caliente poco a poco sin dejar de remover…"
                rows={4}
                style={{
                  width: "100%", boxSizing: "border-box", padding: 12, borderRadius: 12,
                  border: "1.5px solid #e8efe9", fontSize: 13.5, fontFamily: "inherit", color: INK,
                  outline: "none", resize: "vertical",
                }}
              />
              <button
                type="button"
                onClick={runAI}
                disabled={aiState === "loading"}
                style={{
                  width: "100%", marginTop: 10, padding: 12, borderRadius: 12, border: "none",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  fontFamily: "inherit", fontSize: 13.5, fontWeight: 800,
                  cursor: aiState === "loading" ? "default" : "pointer",
                  background: aiState === "loading" ? "#d8e2dc" : GREEN,
                  color: "#fff",
                }}
              >
                {aiState === "loading" ? (
                  <>
                    <Loader2 size={16} style={{ animation: "mp-spin 1s linear infinite" }} />
                    Procesando…
                  </>
                ) : aiState === "done" ? (
                  <>
                    <Sparkles size={16} /> Reprocesar
                  </>
                ) : (
                  <>
                    <Sparkles size={16} /> Procesar con IA
                  </>
                )}
              </button>
              {aiState === "error" && (
                <p style={{ margin: "8px 0 0", fontSize: 12, color: "#c0392b", fontWeight: 600 }}>{aiError}</p>
              )}
              <style>{`@keyframes mp-spin { to { transform: rotate(360deg); } }`}</style>
            </div>

            {aiState === "done" && draft?.steps?.length > 0 && (
              <div style={{ borderTop: "1px solid #e8efe9", paddingTop: 16 }}>
                <FieldLabel icon={ListOrdered} color={GREEN}>Así ha quedado el paso a paso (editable)</FieldLabel>
                <EditableStepsList
                  steps={editableSteps}
                  onUpdate={updateStepAt}
                  onRemove={removeStepAt}
                  onAdd={addStep}
                />
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <PhotoStep
            dishName={form.name}
            photo={photo}
            genState={photoGenState}
            genError={photoGenError}
            onGenerate={generatePhoto}
            onRemovePhoto={() => { setPhoto(null); setPhotoGenState("idle"); }}
          />
        )}

        {step === reviewStepIndex && (
          <ReviewStep
            aiState={aiState}
            aiError={aiError}
            draft={draft}
            form={form}
            user={user}
            updateForm={updateForm}
            userRecipes={userRecipes}
            userGarnishesOnly={userGarnishesOnly}
            kitchenTools={kitchenTools}
            confirmedAllergens={derivedAllergens.allergens}
            onRetry={runAI}
            saved={saved}
            photo={photo}
          />
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: "12px 20px calc(14px + env(safe-area-inset-bottom))", flexShrink: 0, background: BG, boxShadow: "0 -10px 16px -10px rgba(0,0,0,0.1)" }}>
        {step < reviewStepIndex ? (
          <button
            type="button"
            onClick={goNext}
            disabled={!canNext[step]}
            style={{
              width: "100%", padding: 13, borderRadius: 12, border: "none",
              background: canNext[step] ? GREEN : "#c8d9ce", color: "#fff",
              fontSize: 14, fontWeight: 800, cursor: canNext[step] ? "pointer" : "not-allowed",
              fontFamily: "inherit",
            }}
          >
            {step === reviewStepIndex - 1 ? "Ver revisión" : "Siguiente"}
          </button>
        ) : saved ? (
          <button
            type="button"
            onClick={onClose}
            style={{
              width: "100%", padding: 13, borderRadius: 12, border: "none",
              background: GREEN, color: "#fff", fontSize: 14, fontWeight: 800,
              cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            <CheckCircle2 size={17} /> Volver al panel
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setShowVisibilitySheet(true)}
            disabled={aiState !== "done"}
            style={{
              width: "100%", padding: 13, borderRadius: 12, border: "none",
              background: aiState === "done" ? "linear-gradient(135deg, #2d5a3d 0%, #4cba6e 100%)" : "#c8d9ce",
              color: "#fff", fontSize: 14, fontWeight: 800,
              cursor: aiState === "done" ? "pointer" : "not-allowed", fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            <Sparkles size={16} /> {isEditing ? "Guardar cambios" : "Guardar receta"}
          </button>
        )}
      </div>

      {showVisibilitySheet && (
        <VisibilitySheet
          onClose={() => setShowVisibilitySheet(false)}
          onConfirm={(vis) => { setShowVisibilitySheet(false); saveRecipe(vis); }}
        />
      )}
    </div>
  );
}

// ── Photo step — AI-generated only, using the exact same fixed style formula
// as the curated catalog (see api/generate-dish-photo.js). No manual upload:
// every dish photo in MenuPlan — catalog or user-created — shares the same
// look, so the gallery never feels inconsistent. Whatever ends up in `photo`
// here shows up read-only in the Revisión step right after.

function PhotoStep({ dishName, photo, genState, genError, onGenerate, onRemovePhoto }) {
  const busy = genState === "loading";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ margin: 0, fontSize: 12.5, color: "#7a9485", textAlign: "center" }}>
        La generamos con IA, con el mismo estilo que el resto del catálogo de MenuPlan.
      </p>

      <div style={{ position: "relative", height: 220, borderRadius: 16, overflow: "hidden" }}>
        {photo ? (
          <>
            <img
              src={deckImg(photo, 440)}
              srcSet={deckSrcSet(photo, 440)}
              alt=""
              loading="lazy"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
            <button
              type="button"
              onClick={onRemovePhoto}
              aria-label="Quitar foto"
              style={{
                position: "absolute", top: 8, right: 8, width: 32, height: 32, borderRadius: 10,
                border: "none", background: "rgba(20,30,24,.55)", color: "#fff", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <Trash2 size={15} />
            </button>
          </>
        ) : (
          <div
            style={{
              width: "100%", height: "100%", borderRadius: 16, border: "1.5px dashed #bcd6c4", background: "#fafcfa",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            {busy ? (
              <>
                <Loader2 size={24} color={GREEN} style={{ animation: "mp-spin 1s linear infinite" }} />
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: GREEN }}>Generando foto con IA…</p>
              </>
            ) : (
              <>
                <ImagePlus size={24} color="#9ab0a1" />
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#9ab0a1" }}>Aún no tienes foto</p>
              </>
            )}
          </div>
        )}
        <style>{`@keyframes mp-spin { to { transform: rotate(360deg); } }`}</style>
      </div>

      {genState === "error" && (
        <p style={{ margin: 0, fontSize: 12, color: "#c0392b", fontWeight: 600, textAlign: "center" }}>{genError}</p>
      )}

      <button
        type="button"
        onClick={onGenerate}
        disabled={busy || !dishName.trim()}
        style={{
          width: "100%", padding: 13, borderRadius: 12, border: "none",
          background: busy || !dishName.trim() ? "#c8d9ce" : GREEN, color: "#fff",
          fontSize: 13.5, fontWeight: 800, cursor: busy || !dishName.trim() ? "not-allowed" : "pointer",
          fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
        }}
      >
        <Sparkles size={15} /> {photo ? "Regenerar con IA" : "Generar con IA"}
      </button>
    </div>
  );
}

const PREVIEW_TAG_STYLE = {
  display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 9px",
  borderRadius: 999, background: "#f3f7f4", color: "#526057", fontSize: 11, fontWeight: 800,
};

const PREVIEW_MACROS = [
  { key: "protein_g", label: "Proteína", color: "#3b82f6" },
  { key: "carbs_g", label: "Carbohidratos", color: "#f97316" },
  { key: "fat_g", label: "Grasas", color: "#eab308" },
];

// Google account pictures expire, so a stamped owner avatar can 404 long after
// the recipe was saved; degrade to the neutral placeholder instead of a broken
// image. Mirrors OwnerBadge in RecipeProvenance.jsx.
function OwnerPhoto({ owner }) {
  const [failed, setFailed] = useState(false);
  if (owner?.avatar && !failed) {
    return (
      <img
        src={owner.avatar}
        alt=""
        onError={() => setFailed(true)}
        style={{ width: 32, height: 32, borderRadius: 999, objectFit: "cover", flexShrink: 0 }}
      />
    );
  }
  return (
    <span style={{ width: 32, height: 32, borderRadius: 999, background: "#eef3ef", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <UserCircle2 size={22} color="#9ab0a1" />
    </span>
  );
}

// A read-only preview that mirrors the real DishDetail (Menu.jsx): photo hero
// with the name overlaid, info pills, allergen strip, macro rings — plus the
// provenance/community strip (owner, generation date, up/down rating).
function DishPreviewCard({ draft, photo, allergens = [], user }) {
  const owner = ownerFromUser(user);
  const rating = draft.rating ?? { up: 0, down: 0 };
  const when = formatGeneratedAt(draft.createdAt ?? Date.now());
  const allergenChips = ALLERGEN_OPTIONS.filter((a) => allergens.includes(a.id));

  return (
    <div style={{ background: "#fff", border: "1px solid #eef2ef", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 3px rgba(20,47,29,.05)" }}>
      {/* Hero */}
      <div style={{ position: "relative", height: 170, background: "#eef3ef" }}>
        {photo ? (
          <img
            src={deckImg(photo, 440)}
            srcSet={deckSrcSet(photo, 440)}
            alt=""
            loading="lazy"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Camera size={26} color="#b6c8bc" />
          </div>
        )}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(10,30,18,.78) 0%, rgba(10,30,18,0) 58%)" }} />
        <div style={{ position: "absolute", left: 14, right: 14, bottom: 11 }}>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 800, letterSpacing: ".5px", textTransform: "uppercase", color: "rgba(255,255,255,.82)" }}>
            Vista previa
          </p>
          <p style={{ margin: "3px 0 0", fontSize: 18, fontWeight: 900, color: "#fff", lineHeight: 1.15 }}>{draft.name}</p>
        </div>
      </div>

      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 13 }}>
        {/* Info pills */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span style={PREVIEW_TAG_STYLE}><Users size={12} /> {draft.baseServings} comensales</span>
          <span style={PREVIEW_TAG_STYLE}><Clock size={12} /> {draft.time} min</span>
          <span style={{ ...PREVIEW_TAG_STYLE, textTransform: "capitalize" }}><Gauge size={12} /> {draft.difficulty}</span>
        </div>

        {draft.description && (
          <p style={{ margin: 0, fontSize: 12.5, color: "#7a9485", lineHeight: 1.4 }}>{draft.description}</p>
        )}

        {/* Allergens */}
        {allergenChips.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "11px 13px", borderRadius: 14, border: "2px solid #2d5a3d" }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: GREEN, letterSpacing: ".4px", textTransform: "uppercase" }}>Alérgenos</span>
            {allergenChips.map((a) => (
              <span key={a.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, color: a.color, fontSize: 12, fontWeight: 700 }}>
                <a.Icon size={14} strokeWidth={2.2} /> {a.label}
              </span>
            ))}
          </div>
        )}

        {/* Macro rings */}
        <div style={{ borderRadius: 14, padding: "14px 12px", border: "2px solid #2d5a3d" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
            <Flame size={15} color={GREEN} />
            <span style={{ fontSize: 13, fontWeight: 900, color: GREEN }}>{draft.kcal} kcal por ración</span>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "space-around" }}>
            {PREVIEW_MACROS.map(({ key, label, color }) => (
              <div key={key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
                <div style={{
                  width: 64, height: 64, borderRadius: "50%", background: "#fff",
                  border: `3.5px solid ${color}`, boxShadow: `0 2px 12px ${color}28`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{ fontSize: 16, fontWeight: 900, color: INK, lineHeight: 1 }}>
                    {draft[key]}<span style={{ fontSize: 13, fontWeight: 900 }}>g</span>
                  </span>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#7a8a7f" }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ height: 1, background: "#eef3f0" }} />

        {/* Owner + date + rating */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <OwnerPhoto owner={owner} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {owner?.name ?? "Tú"}
            </p>
            <p style={{ margin: "1px 0 0", fontSize: 11, color: "#9ab0a1", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
              <CalendarDays size={11} /> {when}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 9px", borderRadius: 999, background: "#eef6f0", color: "#2d8659", fontSize: 12, fontWeight: 800 }}>
              <ThumbsUp size={13} /> {rating.up ?? 0}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 9px", borderRadius: 999, background: "#fbeeec", color: "#c0392b", fontSize: 12, fontWeight: 800 }}>
              <ThumbsDown size={13} /> {rating.down ?? 0}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewStep({
  aiState, aiError, draft, form, user, updateForm,
  userRecipes = [], userGarnishesOnly = [], kitchenTools = [],
  confirmedAllergens, onRetry, saved, photo,
}) {
  if (aiState === "loading" || aiState === "idle") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "40px 10px", textAlign: "center" }}>
        <Loader2 size={30} color={GREEN} style={{ animation: "mp-spin 1s linear infinite" }} />
        <style>{`@keyframes mp-spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: INK }}>Completando tu receta con IA…</p>
        <p style={{ margin: 0, fontSize: 12.5, color: "#7a9485" }}>Macros, alérgenos, dificultad y pasos de preparación.</p>
      </div>
    );
  }

  if (aiState === "error") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "40px 10px", textAlign: "center" }}>
        <AlertTriangle size={28} color="#c0392b" />
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: INK }}>{aiError}</p>
        <button
          type="button"
          onClick={onRetry}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 18px", borderRadius: 10,
            border: "none", background: GREEN, color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <RotateCw size={14} /> Reintentar
        </button>
      </div>
    );
  }

  if (!draft) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {saved && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#eaf6ee", border: "1px solid #bfe6cb", borderRadius: 12, padding: "10px 12px" }}>
          <CheckCircle2 size={17} color={GREEN} />
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: GREEN }}>
            Guardada. Ya puedes añadirla desde "¿Qué repetimos?" en el onboarding.
          </p>
        </div>
      )}

      <div>
        <FieldLabel icon={ClipboardCheck} color={GREEN}>Así se verá tu receta</FieldLabel>
        <DishPreviewCard draft={draft} photo={photo} allergens={confirmedAllergens} user={user} />
      </div>

      <ClassificationEditor
        form={form}
        updateForm={updateForm}
        userRecipes={userRecipes}
        userGarnishesOnly={userGarnishesOnly}
      />

      <div>
        <FieldLabel icon={ListOrdered} color={GREEN}>Pasos</FieldLabel>
        {/* Mismo componente que el detalle del menú: lo que se ve aquí, con los
            marcadores ya resueltos, es exactamente lo que verá al cocinar. */}
        <RecipeStepList
          rich={draft.stepsRich ?? null}
          plain={draft.steps ?? []}
          ingredients={stepPreviewIngredients(draft)}
          kitchenTools={kitchenTools}
        />
      </div>
    </div>
  );
}

// ── Eje A: "is this an existing dish?" prompt shown live on the name field.
// Offers to link the new recipe to an existing dish (baseDishId) so it shows
// up as another way to cook the same dish instead of a duplicate.
// Same card language as the onboarding wizard (OnboardingMenuModel /
// BabyMenuBubble in Onboarding.jsx): full-width, equal-size, rounded-rect
// options with a thick border that fills solid green when selected. The
// "No, es distinto" option keeps the exact same shape but uses the
// secondary (outlined) palette instead of the primary fill, so it reads as
// a different kind of action without breaking the grid.
function BaseDishOptionCard({ selected, icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
        padding: "13px 14px", borderRadius: 14, cursor: "pointer", fontFamily: "inherit",
        border: `2px solid ${selected ? GREEN : "#e8ede9"}`,
        background: selected ? GREEN : "#fff",
        transition: "all .16s ease",
        boxShadow: selected ? "0 4px 14px rgba(45,90,61,.25)" : "none",
      }}
    >
      <span
        style={{
          width: 26, height: 26, borderRadius: 8, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: selected ? "rgba(255,255,255,.18)" : "#eef5f0",
        }}
      >
        <Icon size={14} color={selected ? "#fff" : GREEN} strokeWidth={2.4} />
      </span>
      <span
        style={{
          flex: 1, minWidth: 0, fontSize: 13, fontWeight: 750,
          color: selected ? "#fff" : INK,
        }}
      >
        {label}
      </span>
    </button>
  );
}

function BaseDishDetector({ matches, decision, selectedId, onNew, onVariant }) {
  if (!matches || matches.length === 0) return null;
  return (
    <div style={{ marginTop: 12, background: "#f7faf8", border: "1px solid #e3ebe6", borderRadius: 16, padding: 14 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 11 }}>
        <Layers2 size={14} color={GREEN} style={{ flexShrink: 0, marginTop: 1 }} />
        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#5a7a66", lineHeight: 1.45 }}>
          ¿Es otra forma de cocinar un plato que ya existe, o un plato distinto? No te
          preocupes — si es una variación, la guardamos junto al original en vez de duplicarla.
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {matches.map((m) => (
          <BaseDishOptionCard
            key={m.id}
            icon={Layers2}
            label={m.name}
            selected={decision === "variant" && selectedId === m.id}
            onClick={() => onVariant(m.id)}
          />
        ))}
        <BaseDishOptionCard
          icon={Sparkles}
          label="No, es un plato distinto"
          selected={decision === "new"}
          onClick={onNew}
        />
      </div>
    </div>
  );
}

// ── Eje B: classification the AI proposed, editable at review. Multi-select
// usage tags + category/protein (hidden when it's only a garnish) + the
// conditional catalog pairing (garnish for a main, or a reference dish for a
// garnish → combo photo).
// Optional pairing refinements shown in the review. "¿Cómo se sirve?" is chosen
// on the cuándo se sirve step, and category / main protein are filled by the
// AI (internal catalog ordering, invisible to the user), so the review only
// offers the meaningful choice left: pinning a specific garnish or the plate a
// garnish accompanies.
function ClassificationEditor({ form, updateForm, userRecipes, userGarnishesOnly }) {
  const usageTags = form.usageTags ?? [];
  const showGarnishPicker = usageTags.includes("plato_normal");
  const showPlatoPicker = usageTags.includes("guarnicion");

  if (!showGarnishPicker && !showPlatoPicker) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {showGarnishPicker && (
        <div style={{ marginTop: 6 }}>
          <FieldLabel icon={Salad}>Guarnición (opcional)</FieldLabel>
          <FieldHint>
            Fija una guarnición del catálogo para este plato, o déjalo en blanco y rotará sola cada semana.
          </FieldHint>
          <CatalogBrowserSheet
            inline
            gatePick
            gatePickType="guarnicion"
            extraRecipes={userRecipes}
            extraGarnishes={userGarnishesOnly}
            selectedGarnishId={form.pinnedGarnishId}
            onPickGarnish={(id) => updateForm({ pinnedGarnishId: id })}
          />
        </div>
      )}

      {showPlatoPicker && (
        <div style={{ marginTop: 6 }}>
          <FieldLabel icon={UtensilsCrossed}>Plato al que acompaña (opcional)</FieldLabel>
          <FieldHint>
            Asóciala a un plato del catálogo para generar la foto del combo. Si no, se guarda como guarnición de uso general.
          </FieldHint>
          <CatalogBrowserSheet
            inline
            gatePick
            gatePickType="plato"
            extraRecipes={userRecipes}
            selectedPlatoId={form.linkedCatalogId}
            onPickPlato={(id) => updateForm({ linkedCatalogId: id })}
          />
        </div>
      )}
    </div>
  );
}
