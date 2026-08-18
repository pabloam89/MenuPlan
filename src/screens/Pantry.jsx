import { useEffect, useMemo, useRef, useState } from "react";
import {
  Apple,
  Bean,
  Boxes,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Croissant,
  Drumstick,
  Egg,
  Fish,
  Leaf,
  Milk,
  Package,
  Plus,
  Snowflake,
  Soup,
  Sprout,
  Store,
  Tag,
  Trash2,
  Wheat,
  X,
  Receipt,
  BarChart3,
  SlidersHorizontal,
  Settings,
  Refrigerator,
  Menu as MenuIcon,
} from "lucide-react";
import { PantryInput } from "../components/PantryInput.jsx";
import { PantryReceiptFlow } from "./PantryReceiptFlow.jsx";
import { APP_SHELL_MAX_WIDTH, BottomNav, bottomNavSpacer, EmptyIllustration, ToggleSwitch } from "../components/ui.jsx";
import { PantryPrefsWizard } from "../components/ModeSheets.jsx";
import { PantryCoachTour, CoachHelpButton } from "../components/HomeCoachTour.jsx";
import {
  loadPantry,
  removePantryItem,
  setPantryItemQty,
  loadLocalPantry,
  removeLocalPantryItem,
  setLocalPantryItemQty,
} from "../lib/pantry.js";
import {
  formatStockQty,
  gramsPerPiece,
  pantryPieceCountLabel,
  toCanonicalStockQty,
} from "../lib/kitchenUnits.js";
import { guessShoppingAisle, isPerishableAisle } from "../lib/ingredientCategories.js";
import { ingredientThumbSrc, aisleImageSrc } from "../lib/ingredientImages.js";
import { dishImageForRecipe } from "../assets/dishes/dishImages.js";
import { DATE_BUCKET_OPTIONS, estimateListCost, formatEuro, matchesDateBucket } from "../lib/priceHistory.js";

// Las 3 ubicaciones que el usuario ve como filtros. La única que el usuario
// elige al guardar es "congelador" (frozen); nevera vs despensa se deriva del
// aisle: frescos perecederos → nevera, el resto → despensa. Los platos
// cocinados no congelados viven en la nevera.
function itemLocation(item) {
  if (item?.frozen) return "congelador";
  if ((item?.itemType ?? "ingredient") === "cooked_dish") return "nevera";
  return isPerishableAisle(guessShoppingAisle(item?.ingredientName)) ? "nevera" : "despensa";
}

const LOCATION_META = {
  nevera: {
    label: "Nevera",
    img: "/avatares/cards/nevera.png",
    tint: "#b1c9bf",
    ink: "#1f7a52",
    Icon: Refrigerator,
  },
  despensa: {
    label: "Despensa",
    img: "/avatares/cards/despensa.png",
    tint: "#dac484",
    ink: "#a06818",
    Icon: Package,
  },
  congelador: {
    label: "Congelador",
    img: "/avatares/cards/congelador.png",
    tint: "#a4bbd7",
    ink: "#2563ab",
    Icon: Snowflake,
  },
};
const LOCATION_ORDER = ["nevera", "despensa", "congelador"];

function isCookedDish(item) {
  return (item?.itemType ?? "ingredient") === "cooked_dish";
}

// Etiqueta cualitativa de frescura (chip bajo el nombre en la tabla). No es una
// fecha exacta: cubos gruesos con umbrales por ubicación (nevera = ventana de
// días → urgencia; congelador = meses). Los secos de despensa no la muestran,
// ahí la frescura no aporta. Ancla en cooked_at (plato) o updated_at (proxy).
function freshnessTag(item) {
  const loc = itemLocation(item);
  if (loc === "despensa") return null;
  const iso = isCookedDish(item) ? item?.cookedAt : item?.updatedAt;
  if (!iso) return null;
  const days = (Date.now() - new Date(iso).getTime()) / 86400000;
  if (!Number.isFinite(days) || days < 0) return null;
  if (loc === "congelador") {
    if (days <= 2) return { label: "Reciente", color: "#2f7d4f", bg: "#e8f3ec" };
    if (days <= 30) return { label: "Este mes", color: "#2f6d8a", bg: "#e8f0f6" };
    if (days <= 90) return { label: "Hace tiempo", color: "#9a7b34", bg: "#f6efe0" };
    return { label: "Muy antiguo", color: "#c0392b", bg: "#fdecea" };
  }
  // nevera
  if (days <= 1) return { label: "Hoy", color: "#2f7d4f", bg: "#e8f3ec" };
  if (days <= 3) return { label: "Reciente", color: "#2f6d8a", bg: "#e8f0f6" };
  if (days <= 7) return { label: "Esta semana", color: "#9a7b34", bg: "#f6efe0" };
  return { label: "Cómelo ya", color: "#c0392b", bg: "#fdecea" };
}

// Editing shows the canonical g/ml as the friendlier kg/L when it's ≥1000,
// mirroring PantryInput's own entry fields.
function toEditableUnit(qty, unit) {
  if (unit === "g" && qty >= 1000) return { qty: qty / 1000, unit: "kg" };
  if (unit === "ml" && qty >= 1000) return { qty: qty / 1000, unit: "l" };
  return { qty, unit };
}

function stockPriceLabel(item, priceObs) {
  const { total, matched } = estimateListCost(
    [{ name: item.ingredientName, qty: item.qty, unit: item.unit }],
    priceObs,
  );
  return matched > 0 ? formatEuro(total) : "—";
}

// Compact "12 jul" — never a full sentence, per the "sin copy muy grande"
// requirement. Intl gives "jul." in es-ES; the trailing dot reads noisy at
// this size, so it's stripped.
function formatShortDay(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" })
    .format(d)
    .replace(".", "");
}

// "Fecha de compra" filter — user_pantry is a stock table, not a purchase
// log, so `updatedAt` (bumped on every qty change: new ticket, top-up,
// manual edit) doubles as the closest proxy we have to "when I last bought
// this". Shared with the Gasto "Histórico" ticket filter (priceHistory.js)
// so both read identically.
const DATE_FILTERS = DATE_BUCKET_OPTIONS;
const matchesDateFilter = matchesDateBucket;

// "Ticket subido"/"Supermercado" filters — pantry rows don't store which
// ticket touched them (see 0009's comment: only NEW rows are ever linked
// back, top-ups aren't), so the closest honest proxy is "this item was last
// touched the same calendar day a selected ticket/store's receipt landed".
function sameCalendarDay(isoA, isoB) {
  if (!isoA || !isoB) return false;
  const a = new Date(isoA);
  const b = new Date(isoB);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Split stock into weight/capacity vs countable quantity (same dual reading
// the shopping list uses with its Peso ⇄ Unidades lens).
function splitStockDisplay(name, qty, unit) {
  const n = Number(qty) || 0;
  if (unit === "ud") {
    const gpp = gramsPerPiece(name);
    return {
      cantidad: `${Number.isInteger(n) ? n : String(n).replace(".", ",")} ud`,
      peso: gpp ? formatStockQty(n * gpp, "g") : "—",
    };
  }
  // Liquids: a volume reading ("1,5 L") IS the weight-type measure — it
  // isn't also a "how many" count, so it belongs in Peso only. Putting it in
  // Cantidad too just duplicated the exact same number in both columns.
  if (unit === "ml") {
    return {
      peso: formatStockQty(n, unit),
      cantidad: "—",
    };
  }
  return {
    peso: formatStockQty(n, unit),
    // pantryPieceCountLabel (not shoppingUnitsLabel) on purpose: this table
    // already shows the ingredient's name in its own column, so "3 tomates"
    // here is both redundant AND, for longer plurals ("melocotones"),
    // overflows the narrow Cantidad pill into an ugly 2-line wrap. This
    // collapses piece counts to a generic "3 ud" instead.
    cantidad: pantryPieceCountLabel(name, n, unit) ?? "—",
  };
}

// Title-band tint shared across En casa / Menú / Recetas / Compra — a soft
// green (accent-tinted), distinct from the white body below it.
const HEADER_BAND = "#e9f4ed";
const GREEN = "#2d5a3d";
const INK = "#142f1d";
const MUTED = "#9ab0a1";

// Same aisle icon language as Shopping.jsx.
const AISLE_UI = {
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

const pageTitle = { fontSize: 20, fontWeight: 900, color: INK, margin: 0, letterSpacing: "-.3px" };

// Teal frame shared with EmptyIllustration, so the empty-state choice cards read
// as the same family.
const EMPTY_ACCENT = "#0f766e";

// Mode card for "Añadir a mano" / "Subir foto o ticket".
//
// Default (no items added yet):  Alergias-card style — illustration on top,
//   labelled coloured strip at the bottom, side-by-side with sibling card.
// Compact (items already added):  full-bleed illustration, label overlaid on
//   the right side (saves vertical space once the user knows the affordance).
function PantryModeCard({ label, active, compact, onClick, children }) {
  const shadow = active
    ? "0 8px 22px -14px rgba(15,118,110,.55)"
    : "0 3px 10px -8px rgba(20,47,29,.35)";

  if (compact) {
    // ── Overlay mode (addedCount > 0) ─────────────────────────────────────
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        style={{
          position: "relative",
          flex: 1,
          minWidth: 0,
          height: 52,
          border: `2px solid ${active ? EMPTY_ACCENT : "transparent"}`,
          borderRadius: 14,
          overflow: "hidden",
          background: "#eef4ef",
          cursor: "pointer",
          fontFamily: "inherit",
          padding: 0,
          boxShadow: shadow,
          transition: "border-color .18s, box-shadow .18s",
        }}
      >
        <div style={{ position: "absolute", inset: 0 }}>{children}</div>
        <div style={{ position: "absolute", inset: 0, background: active ? "linear-gradient(to left, rgba(15,118,110,.88) 0%, rgba(15,118,110,.48) 42%, rgba(15,118,110,0) 70%)" : "linear-gradient(to left, rgba(10,20,14,.72) 0%, rgba(10,20,14,.32) 42%, rgba(10,20,14,0) 70%)" }} />
        <span style={{ position: "absolute", top: "50%", right: 12, left: "38%", transform: "translateY(-50%)", color: "#fff", fontSize: 12.5, fontWeight: 800, textAlign: "right", lineHeight: 1.2, textShadow: "0 1px 6px rgba(0,0,0,.5)" }}>
          {label}
        </span>
        {active && (
          <span style={{ position: "absolute", top: 6, right: 6, width: 18, height: 18, borderRadius: 999, background: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", color: EMPTY_ACCENT }}>
            <Check size={11} strokeWidth={3.2} />
          </span>
        )}
      </button>
    );
  }

  // ── Alergias-card mode (default, no items yet) ─────────────────────────
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        position: "relative",
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        padding: 0,
        overflow: "hidden",
        borderRadius: 15,
        border: `2px solid ${active ? EMPTY_ACCENT : "#dce8e0"}`,
        background: "#fff",
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "all .16s ease",
        boxShadow: shadow,
      }}
    >
      {active && (
        <span style={{ position: "absolute", top: 8, right: 8, zIndex: 2, width: 20, height: 20, borderRadius: "50%", background: EMPTY_ACCENT, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(20,47,29,.3)" }}>
          <Check size={12} color="#fff" strokeWidth={3} />
        </span>
      )}
      <div style={{ position: "relative", width: "100%", aspectRatio: "4 / 3", background: "#eef4ef", flexShrink: 0 }}>
        {children}
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "11px 8px", background: active ? EMPTY_ACCENT : "#fff", color: active ? "#fff" : "#3d6652", fontSize: 12.5, fontWeight: 800, lineHeight: 1.2, textAlign: "center" }}>
        {label}
      </div>
    </button>
  );
}

function PantryModePicker({ tab, setTab, canUploadReceipt, addedCount = 0 }) {
  const compact = addedCount > 0;
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "stretch", marginBottom: compact ? 10 : 12 }}>
      <PantryModeCard label="Añadir a mano" active={tab === "text"} compact={compact} onClick={() => setTab("text")}>
        <img
          src="/avatares/cards/subir_a_mano.jpg"
          alt="Añadir a mano"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 18%" }}
        />
      </PantryModeCard>
      <PantryModeCard label="Subir foto o ticket" active={tab === "upload"} compact={compact} onClick={() => setTab("upload")}>
        <img
          src="/avatares/cards/escanear.jpg"
          alt="Subir foto o ticket"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 18%" }}
        />
      </PantryModeCard>
    </div>
  );
}

// Doble segmented control de "En casa": Añadir (dar de alta cosas) vs
// Inventario (ver lo que tienes, filtrado por ubicación). Iconos con color.
function PantryMainTabs({ value, onChange }) {
  const tabs = [
    { id: "add", label: "Añadir", Icon: Plus, color: "#2d5a3d" },
    { id: "inventory", label: "Inventario", Icon: Boxes, color: "#2f6d8a" },
  ];
  return (
    <div
      style={{
        display: "flex",
        gap: 3,
        padding: 3,
        borderRadius: 14,
        background: "#eef4ef",
        border: "1px solid #dce8e0",
        marginBottom: 16,
      }}
    >
      {tabs.map(({ id, label, Icon, color }) => {
        const on = value === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-pressed={on}
            style={{
              flex: 1,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              padding: "9px 8px",
              borderRadius: 11,
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 13.5,
              fontWeight: 800,
              background: on ? "#fff" : "transparent",
              color: on ? INK : "#5a7066",
              boxShadow: on ? "0 2px 8px -3px rgba(20,47,29,.22)" : "none",
              transition: "all .16s ease",
            }}
          >
            <Icon size={16} strokeWidth={2.4} color={color} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

// 3 cards ilustradas (nevera / despensa / congelador) que filtran la tabla de
// inventario. Tocar una la activa; volver a tocarla la desactiva (ver todo).
function PantryLocationCards({ selected, counts, onPick }) {
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
      {LOCATION_ORDER.map((key) => {
        const meta = LOCATION_META[key];
        const on = selected.has(key);
        const count = counts[key] ?? 0;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onPick(key)}
            aria-pressed={on}
            style={{
              position: "relative",
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: 0,
              overflow: "hidden",
              borderRadius: 16,
              border: `2px solid ${on ? meta.ink : "#e3ede7"}`,
              background: "#fff",
              cursor: "pointer",
              fontFamily: "inherit",
              boxShadow: on
                ? `0 10px 24px -14px ${meta.ink}aa`
                : "0 3px 10px -8px rgba(20,47,29,.35)",
              transition: "all .16s ease",
            }}
          >
            <div
              style={{
                position: "relative",
                width: "100%",
                aspectRatio: "2 / 3",
                background: meta.tint,
                boxSizing: "border-box",
                overflow: "hidden",
              }}
            >
              <img
                src={meta.img}
                alt={meta.label}
                loading="lazy"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: "center bottom",
                  display: "block",
                }}
              />
              {count > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    minWidth: 20,
                    height: 20,
                    padding: "0 5px",
                    borderRadius: 999,
                    background: meta.ink,
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 900,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {count}
                </span>
              )}
            </div>
            <div
              style={{
                width: "100%",
                padding: "7px 6px",
                background: "#fff",
                color: meta.ink,
                fontSize: 12.5,
                fontWeight: 900,
                textAlign: "center",
                lineHeight: 1.2,
              }}
            >
              {meta.label}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// Compact icon buttons in the "En casa" header (top-right): upload a ticket
// and open the spend/tickets analytics. Square so two sit neatly beside the
// title without competing with it.
const pantryIconBtn = {
  width: 36,
  height: 36,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 12,
  border: "1.5px solid #dbe7df",
  background: "#fff",
  color: INK,
  fontFamily: "inherit",
  cursor: "pointer",
  boxShadow: "0 6px 16px -12px rgba(20,47,29,.3)",
  flexShrink: 0,
};

const fieldStyle = {
  boxSizing: "border-box",
  borderRadius: 10,
  border: "1.5px solid #e8efe9",
  fontFamily: "inherit",
  color: INK,
  outline: "none",
  background: "#fff",
};

// icon | name (wraps) | spacer | valor (toggled) | precio | trash
const ROW_GRID = {
  display: "grid",
  gridTemplateColumns: "40px minmax(0,1fr) 72px 56px 28px",
  gap: 8,
  alignItems: "center",
};

// Precio used to be a 3rd toggle option here, but it's meaningful for nearly
// every ticket-sourced item — burying it behind a click hid it more often
// than not, so it's now its own always-visible column instead.
const STOCK_VIEWS = [
  ["cantidad", "Cantidad"],
  ["peso", "Peso"],
];

// Shows the ingredient's own cartoon when we have one and falls back to the
// flat aisle icon otherwise — same 26px slot either way, so the row grid is
// unaffected.
function AisleIcon({ aisle, name, size = 26 }) {
  const meta = AISLE_UI[aisle] ?? { Icon: Package, color: "#64748b" };
  const Icon = meta.Icon;
  const img = name ? ingredientThumbSrc(name) : null;
  const [failed, setFailed] = useState(false);
  const showImg = Boolean(img) && !failed;
  return (
    <span
      title={aisle}
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        background: showImg ? "#f2f7f4" : meta.color,
        color: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        justifySelf: "center",
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

// Thumbnail for a cooked-dish row: the catalog photo when we have a recipeRef,
// otherwise a soup-pot icon. Same 36px slot as AisleIcon so the grid lines up.
function CookedDishIcon({ recipeRef, size = 36 }) {
  const [failed, setFailed] = useState(false);
  const img = recipeRef ? dishImageForRecipe({ id: recipeRef, baseRecipeId: recipeRef }) : null;
  const showImg = Boolean(img) && !failed;
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        background: showImg ? "#f2f7f4" : "#e6efe9",
        color: GREEN,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        justifySelf: "center",
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
        <Soup size={size * 0.52} strokeWidth={2.2} />
      )}
    </span>
  );
}

// Mini "flag" con el icono de dónde está el item (nevera / despensa /
// congelador). Se solapa en la esquina del thumbnail para aligerar la fila
// (antes era un chip de texto bajo el nombre).
function LocationBadge({ location, size = 16 }) {
  const meta = LOCATION_META[location];
  if (!meta) return null;
  const Icon = meta.Icon;
  return (
    <span
      style={{
        position: "absolute",
        right: -4,
        bottom: -4,
        width: size,
        height: size,
        borderRadius: 999,
        background: meta.ink,
        color: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        border: "1.5px solid #fff",
        boxShadow: "0 1px 3px rgba(20,47,29,.25)",
      }}
    >
      <Icon size={size * 0.58} strokeWidth={2.6} />
    </span>
  );
}

// Thumbnail + badge de ubicación juntos, en un slot relativo para que el badge
// se solape sin romper el grid de la fila.
function RowThumb({ item, cooked, aisle }) {
  return (
    <span style={{ position: "relative", display: "inline-flex", justifySelf: "center" }}>
      {cooked ? (
        <CookedDishIcon recipeRef={item.recipeRef} size={36} />
      ) : (
        <AisleIcon aisle={aisle} name={item.ingredientName} size={36} />
      )}
      <LocationBadge location={itemLocation(item)} />
    </span>
  );
}

// Same list → sub-view drill-down sheet as CatalogBrowserSheet's "Filtros"
// (icons, horizontal dividers between options, checkPop/sheetUp animations).
// "Ticket subido" only actually appears when there's at least one receipt to
// filter by (see PantryFiltersSheet).
const PANTRY_FILTER_ROWS = [
  { key: "cat", label: "Categoría", icon: Tag },
  { key: "date", label: "Fecha de compra", icon: CalendarDays },
  { key: "store", label: "Supermercado", icon: Store },
  { key: "ticket", label: "Ticket subido", icon: Receipt },
];

const dateInputStyle = {
  boxSizing: "border-box",
  flex: 1,
  minWidth: 0,
  padding: "8px 9px",
  borderRadius: 9,
  border: "1.5px solid #dce8e0",
  fontFamily: "inherit",
  fontSize: 12.5,
  fontWeight: 700,
  color: INK,
  outline: "none",
  background: "#fff",
};

function PantryCheckRow({ icon: Icon, iconColor, img, label, checked, single, onToggle, last }) {
  // Illustration when we have one, flat icon as the fallback — see CheckRow in
  // CatalogBrowserSheet.jsx, which these filter sheets mirror.
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = Boolean(img) && !imgFailed;
  return (
    <button
      type="button"
      onClick={onToggle}
      className="pantry-filter-opt-row"
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: showImg ? "8px 10px" : "13px 10px",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        fontFamily: "inherit",
        borderRadius: 10,
        textAlign: "left",
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
          <Icon size={17} color={iconColor || GREEN} strokeWidth={2.2} />
        </span>
      ) : null}
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 14,
          fontWeight: checked ? 800 : 600,
          color: checked ? GREEN : INK,
          transition: "color .16s ease",
        }}
      >
        {label}
      </span>
      <span
        className="pantry-filter-check"
        style={{
          width: 22,
          height: 22,
          flexShrink: 0,
          borderRadius: single ? 999 : 6,
          border: `1.5px solid ${checked ? GREEN : "#cdd8d0"}`,
          background: checked ? GREEN : "#fff",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked && <Check className="pantry-filter-check-icon" size={14} strokeWidth={3} />}
      </span>
    </button>
  );
}

const pantryFilterIconBtn = {
  border: "none",
  background: "#f0f4f1",
  borderRadius: 999,
  width: 32,
  height: 32,
  cursor: "pointer",
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

function PantryFiltersSheet({
  onClose,
  availableAisles,
  aisleFilters,
  setAisleFilters,
  dateFilter,
  setDateFilter,
  customFrom,
  customTo,
  setCustomFrom,
  setCustomTo,
  availableStores,
  storeFilters,
  setStoreFilters,
  receipts,
  ticketFilters,
  setTicketFilters,
  resultCount,
  activeFilterCount,
  onClear,
}) {
  const [view, setView] = useState("list");
  const rows = PANTRY_FILTER_ROWS.filter((r) => (r.key !== "ticket" && r.key !== "store") || receipts.length > 0);
  const current = rows.find((r) => r.key === view);

  const toggleInSet = (setter) => (value) =>
    setter((prev) => {
      const next = new Set(prev);
      next.has(value) ? next.delete(value) : next.add(value);
      return next;
    });

  const dateSummary =
    dateFilter === "custom"
      ? customFrom
        ? `${formatShortDay(customFrom)}${customTo ? ` – ${formatShortDay(customTo)}` : " →"}`
        : "Fecha concreta"
      : (DATE_FILTERS.find(([id]) => id === dateFilter)?.[1] ?? "Todas");

  const summary = {
    cat:
      aisleFilters.size === 0
        ? "Todas"
        : aisleFilters.size === 1
          ? [...aisleFilters][0]
          : `${aisleFilters.size} elegidas`,
    date: dateSummary,
    store:
      storeFilters.size === 0
        ? "Todos"
        : storeFilters.size === 1
          ? [...storeFilters][0]
          : `${storeFilters.size} elegidos`,
    ticket:
      ticketFilters.size === 0
        ? "Todos"
        : ticketFilters.size === 1
          ? "1 elegido"
          : `${ticketFilters.size} elegidos`,
  };
  const rowActive = {
    cat: aisleFilters.size > 0,
    date: dateFilter === "custom" ? Boolean(customFrom) : dateFilter !== "all",
    store: storeFilters.size > 0,
    ticket: ticketFilters.size > 0,
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.45)",
        zIndex: 210,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <style>{`
        @keyframes pantrySheetUp {
          from { transform: translateY(28px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes pantryCheckPop {
          0%   { transform: scale(0.5); opacity: .4; }
          55%  { transform: scale(1.18); opacity: 1; }
          100% { transform: scale(1); }
        }
        .pantry-filter-sheet-inner { animation: pantrySheetUp .22s cubic-bezier(.25,.9,.4,1) both; }
        .pantry-filter-opt-row { transition: background .16s ease; }
        .pantry-filter-opt-row:hover { background: rgba(45,90,61,.06); }
        .pantry-filter-opt-row:active { background: rgba(45,90,61,.11); }
        .pantry-filter-check {
          transition: background .18s cubic-bezier(.34,1.4,.6,1),
                      border-color .18s ease,
                      transform .18s cubic-bezier(.34,1.4,.6,1);
        }
        .pantry-filter-opt-row:active .pantry-filter-check { transform: scale(.88); }
        .pantry-filter-check-icon { animation: pantryCheckPop .22s cubic-bezier(.34,1.5,.6,1) both; }
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        className="pantry-filter-sheet-inner"
        style={{
          background: "#f5f9f6",
          borderRadius: "20px 20px 0 0",
          width: "100%",
          maxWidth: 420,
          maxHeight: "72dvh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* grabber */}
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 8, flexShrink: 0 }}>
          <span style={{ width: 38, height: 4, borderRadius: 999, background: "#dde7e0" }} />
        </div>

        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px 12px", flexShrink: 0 }}>
          {view !== "list" ? (
            <button type="button" onClick={() => setView("list")} aria-label="Volver" style={pantryFilterIconBtn}>
              <ChevronLeft size={18} />
            </button>
          ) : null}
          <h3 style={{ flex: 1, margin: 0, fontSize: 17, fontWeight: 900, color: INK }}>
            {view === "list" ? "Filtros" : current?.label}
          </h3>
          {view === "list" && activeFilterCount > 0 && (
            <button
              type="button"
              onClick={onClear}
              style={{
                border: "none",
                background: "transparent",
                color: GREEN,
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: "inherit",
                padding: "4px 6px",
              }}
            >
              Limpiar
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Cerrar" style={pantryFilterIconBtn}>
            <X size={18} />
          </button>
        </div>

        {/* body */}
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "0 16px" }}>
          {view === "list" && (
            <div>
              {rows.map((row, i) => (
                <button
                  key={row.key}
                  type="button"
                  onClick={() => setView(row.key)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "14px 2px",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    borderTop: i === 0 ? "none" : "1px solid #eef3f0",
                  }}
                >
                  <row.icon size={18} color={GREEN} />
                  <span style={{ flex: 1, textAlign: "left", fontSize: 14.5, fontWeight: 700, color: INK }}>
                    {row.label}
                  </span>
                  <span
                    style={{
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: rowActive[row.key] ? GREEN : "#9ab0a1",
                      maxWidth: 150,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {summary[row.key]}
                  </span>
                  <ChevronRight size={17} color="#c2cfc7" />
                </button>
              ))}
            </div>
          )}

          {view === "cat" && (
            <div style={{ paddingTop: 4 }}>
              <PantryCheckRow
                label="Todas las categorías"
                checked={aisleFilters.size === 0}
                onToggle={() => setAisleFilters(new Set())}
              />
              {availableAisles.map((a, i) => (
                <PantryCheckRow
                  key={a}
                  icon={AISLE_UI[a]?.Icon}
                  iconColor={AISLE_UI[a]?.color}
                  img={aisleImageSrc(a)}
                  label={a}
                  checked={aisleFilters.has(a)}
                  last={i === availableAisles.length - 1}
                  onToggle={() => toggleInSet(setAisleFilters)(a)}
                />
              ))}
            </div>
          )}

          {view === "date" && (
            <div style={{ paddingTop: 4 }}>
              {DATE_FILTERS.map(([id, label]) => (
                <PantryCheckRow
                  key={id}
                  icon={CalendarDays}
                  label={label}
                  single
                  checked={dateFilter === id}
                  onToggle={() => setDateFilter(id)}
                />
              ))}
              {/* Fecha concreta — its own row (radio-selected like the buckets
                  above it) that reveals an inline from/to range instead of
                  jumping to yet another sub-view. */}
              <PantryCheckRow
                icon={CalendarDays}
                label="Fecha concreta"
                single
                checked={dateFilter === "custom"}
                last={dateFilter !== "custom"}
                onToggle={() => setDateFilter("custom")}
              />
              {dateFilter === "custom" && (
                <div style={{ display: "flex", gap: 8, padding: "2px 10px 16px 42px" }}>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    aria-label="Desde"
                    style={dateInputStyle}
                  />
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    aria-label="Hasta"
                    min={customFrom || undefined}
                    style={dateInputStyle}
                  />
                </div>
              )}
            </div>
          )}

          {view === "store" && (
            <div style={{ paddingTop: 4 }}>
              <PantryCheckRow
                label="Todos"
                checked={storeFilters.size === 0}
                onToggle={() => setStoreFilters(new Set())}
              />
              {availableStores.map((s, i) => (
                <PantryCheckRow
                  key={s}
                  icon={Store}
                  label={s}
                  checked={storeFilters.has(s)}
                  last={i === availableStores.length - 1}
                  onToggle={() => toggleInSet(setStoreFilters)(s)}
                />
              ))}
            </div>
          )}

          {view === "ticket" && (
            <div style={{ paddingTop: 4 }}>
              <PantryCheckRow
                label="Todos los tickets"
                checked={ticketFilters.size === 0}
                onToggle={() => setTicketFilters(new Set())}
              />
              {receipts.map((r, i) => (
                <PantryCheckRow
                  key={r.id}
                  icon={Receipt}
                  label={`${r.store || "Ticket"} (${formatShortDay(r.purchasedAt)})`}
                  checked={ticketFilters.has(r.id)}
                  last={i === receipts.length - 1}
                  onToggle={() => toggleInSet(setTicketFilters)(r.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* footer */}
        <div style={{ padding: "12px 16px calc(14px + env(safe-area-inset-bottom, 0px))", borderTop: "1px solid #eef3f0", flexShrink: 0 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: "100%",
              height: 48,
              borderRadius: 14,
              border: "none",
              background: GREEN,
              color: "#fff",
              fontSize: 14.5,
              fontWeight: 800,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Ver {resultCount} {resultCount === 1 ? "ingrediente" : "ingredientes"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * "En casa" — nevera + despensa: lo que tienes disponible para cocinar.
 * Reached from Compra / nav Inicio. Works signed out via localStorage mirror
 * (lib/pantry.js); merge on login folds it into the account.
 */
export function PantryScreen({
  user,
  priceObs = [],
  onNav,
  navActive = "pantry",
  // When true (onboarding «¿Qué repetimos?»), skip page chrome / BottomNav
  // so the stock UI nests inside the parent panel.
  embedded = false,
  // Bumps after login merge so we reload once local→cloud fold finishes.
  pantryEpoch = 0,
  // Opens the spend analytics tab (Análisis → Gasto), which also hosts the
  // accumulated ticket history. Wired by App.jsx.
  onOpenAnalytics = null,
  // Full app blob + writer + toast: lets "Subir ticket" open the receipt/spend
  // wizard IN PLACE here (En casa), instead of navigating away to Tu compra.
  data = null,
  setData = null,
  onToast = null,
  // Current week's live shopping list — lets the ticket flow tell you when a
  // restocked item covers something your active menú needs, and tach the items
  // the ticket proves you already bought.
  shopping = null,
  setShopping = null,
  // Onboarding's "¿Qué repetimos?" passes these two so the "usar despensa al
  // generar el menú" preference can live inline here (next to the
  // cantidad/peso/precio segmented control) instead of its own bulky card
  // above the whole screen. Omitted everywhere else (Nav → En casa), where
  // that menu-generation setting doesn't apply.
  useHomeStock = null,
  onToggleHomeStock = null,
}) {
  const [items, setItems] = useState(() => (user ? [] : loadLocalPantry()));
  const [loading, setLoading] = useState(() => Boolean(user));
  const [editingId, setEditingId] = useState(null);
  const [editQty, setEditQty] = useState(1);
  const [editUnit, setEditUnit] = useState("ud");
  // Which reading the single value column shows (mobile: one column, toggled).
  const [stockView, setStockView] = useState("cantidad");
  // "Subir ticket" overlay (receipt capture + intent chooser), launched in place.
  const [showReceiptFlow, setShowReceiptFlow] = useState(false);
  const [showIconCoach, setShowIconCoach] = useState(false);
  // Ajustes de despensa: una única decisión — cuándo se da por gastado lo de
  // casa que usa el menú. Se pregunta en cualquier modo (sencillo incluido),
  // porque tiene consecuencias visibles y ya no es jerga. El icono de ajustes
  // del header lo reabre cuando se quiera.
  const canEditPantryPrefs = Boolean(setData) && !embedded;
  const [showPantryPrefs, setShowPantryPrefs] = useState(false);
  // Header options drawer (burger → sliding sidebar), mirroring the Menu screen.
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  // Solo se abre solo cuando la pregunta ya significa algo: con la despensa
  // vacía, "cuándo damos por gastado lo de casa" es abstracto y se cuela como
  // un interrogatorio de bienvenida. Esperamos a que haya algo dentro.
  useEffect(() => {
    if (!canEditPantryPrefs || data?.pantryPrefsSeen) return;
    if (loading || items.length === 0) return;
    setShowPantryPrefs(true);
  }, [canEditPantryPrefs, data?.pantryPrefsSeen, loading, items.length]);
  // (showAddInput removed — PantryInput is always visible with its own tab control)
  // Empty-state entry: a centered prompt that, on tap, reveals two illustrated
  // choice cards (a mano / subir foto o ticket) and then opens PantryInput in
  // the picked mode. Local state, so leaving without adding anything resets it
  // back to the illustration on the next visit.
  const [addTab, setAddTab] = useState("text");
  // Doble segmented control: Añadir (default) · Inventario.
  const [mainTab, setMainTab] = useState("add");
  // Filtro de ubicación de la pestaña Inventario (card nevera/despensa/congelador).
  const [locationFilters, setLocationFilters] = useState(() => new Set());
  const rowRefs = useRef({});
  // Category + purchase-date + ticket filters, tucked behind a "Filtros"
  // toggle like Añadir ingredientes above — same collapsed-by-default pattern.
  const [showFilters, setShowFilters] = useState(false);
  const [aisleFilters, setAisleFilters] = useState(() => new Set());
  const [dateFilter, setDateFilter] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [storeFilters, setStoreFilters] = useState(() => new Set());
  const [ticketFilters, setTicketFilters] = useState(() => new Set());
  const canUploadReceipt = Boolean(setData);
  const viewLabel = stockView === "peso" ? "Peso" : "Cantidad";
  // Stable empty-array fallback (not a fresh `?? []` literal each render) so
  // the useMemos below that depend on it don't re-run every single render.
  const receipts = useMemo(() => data?.receipts ?? [], [data?.receipts]);

  // Only offer categories actually present — a static 11-aisle list would be
  // mostly dead filters for a pantry that only has a handful of items.
  const availableAisles = useMemo(() => {
    const seen = new Set();
    for (const it of items) if (!isCookedDish(it)) seen.add(guessShoppingAisle(it.ingredientName));
    return Object.keys(AISLE_UI).filter((a) => seen.has(a));
  }, [items]);

  // Drops any selection that no longer applies (its last item/ticket got
  // deleted) — computed at render instead of synced via an effect, so a
  // stale pick can't silently keep hiding everything else for a render or
  // two.
  const effectiveAisleFilters = useMemo(
    () => new Set([...aisleFilters].filter((a) => availableAisles.includes(a))),
    [aisleFilters, availableAisles],
  );
  const effectiveTicketFilters = useMemo(
    () => new Set([...ticketFilters].filter((id) => receipts.some((r) => r.id === id))),
    [ticketFilters, receipts],
  );
  const availableStores = useMemo(
    () => [...new Set(receipts.map((r) => r.store || "Sin súper"))],
    [receipts],
  );
  const effectiveStoreFilters = useMemo(
    () => new Set([...storeFilters].filter((s) => availableStores.includes(s))),
    [storeFilters, availableStores],
  );

  const dateActive = dateFilter === "custom" ? Boolean(customFrom) : dateFilter !== "all";

  const visibleItems = useMemo(
    () =>
      items.filter((it) => {
        if (
          effectiveAisleFilters.size > 0 &&
          (isCookedDish(it) || !effectiveAisleFilters.has(guessShoppingAisle(it.ingredientName)))
        ) {
          return false;
        }
        if (dateActive && !matchesDateFilter(it.updatedAt, dateFilter, { from: customFrom, to: customTo })) {
          return false;
        }
        if (
          effectiveStoreFilters.size > 0 &&
          !receipts.some(
            (r) => effectiveStoreFilters.has(r.store || "Sin súper") && sameCalendarDay(it.updatedAt, r.purchasedAt),
          )
        ) {
          return false;
        }
        if (
          effectiveTicketFilters.size > 0 &&
          ![...effectiveTicketFilters].some((id) => {
            const r = receipts.find((rr) => rr.id === id);
            return r && sameCalendarDay(it.updatedAt, r.purchasedAt);
          })
        ) {
          return false;
        }
        return true;
      }),
    [
      items,
      effectiveAisleFilters,
      dateActive,
      dateFilter,
      customFrom,
      customTo,
      effectiveStoreFilters,
      effectiveTicketFilters,
      receipts,
    ],
  );

  const activeFilterCount =
    effectiveAisleFilters.size + (dateActive ? 1 : 0) + effectiveStoreFilters.size + effectiveTicketFilters.size;

  // Recuento por ubicación (tras aplicar los demás filtros) para las 3 cards.
  const locationCounts = useMemo(() => {
    const c = { nevera: 0, despensa: 0, congelador: 0 };
    for (const it of visibleItems) c[itemLocation(it)] += 1;
    return c;
  }, [visibleItems]);

  // Filtro final de la tabla: los demás filtros + la card de ubicación activa.
  const inventoryItems = useMemo(
    () =>
      locationFilters.size > 0
        ? visibleItems.filter((it) => locationFilters.has(itemLocation(it)))
        : visibleItems,
    [visibleItems, locationFilters],
  );

  useEffect(() => {
    if (!user) {
      setItems(loadLocalPantry());
      setLoading(false);
      return undefined;
    }
    let active = true;
    setLoading(true);
    loadPantry(user.id).then((rows) => {
      if (active) {
        setItems(rows);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [user, pantryEpoch]);

  const handleRemove = async (id) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (editingId === id) setEditingId(null);
    if (user) await removePantryItem(user.id, id);
    else removeLocalPantryItem(id);
  };

  const handleSaved = async () => {
    const next = user ? await loadPantry(user.id) : loadLocalPantry();
    setItems(next);
    const focus = [...next].sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")))[0];
    if (!focus?.id) return;
    requestAnimationFrame(() => {
      rowRefs.current[focus.id]?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const startEdit = (item) => {
    const editable = toEditableUnit(item.qty, item.unit);
    setEditingId(item.id);
    setEditQty(editable.qty);
    setEditUnit(editable.unit);
  };

  const saveEdit = async (id) => {
    const { qty, unit } = toCanonicalStockQty(editQty, editUnit);
    const now = new Date().toISOString();
    setItems((prev) =>
      qty > 0
        ? prev.map((i) => (i.id === id ? { ...i, qty, unit, updatedAt: now } : i))
        : prev.filter((i) => i.id !== id),
    );
    setEditingId(null);
    if (user) await setPantryItemQty(user.id, id, qty, unit);
    else setLocalPantryItemQty(id, qty, unit);
  };

  // Header options — same actions as before, now behind a burger → sliding
  // sidebar (mirrors the Menú screen). Order: subir ticket, gastos, ajustes.
  const headerActions = [
    canUploadReceipt && {
      key: "receipt", label: "Subir ticket", Icon: Receipt, coach: "pantry-receipt",
      action: () => setShowReceiptFlow(true), tint: "#fdf0e0", ink: "#d97706",
    },
    onOpenAnalytics && {
      key: "analytics", label: "Gastos y tickets", Icon: BarChart3, coach: "pantry-analytics",
      action: onOpenAnalytics, tint: "#e7effe", ink: "#2563eb",
    },
    canEditPantryPrefs && {
      key: "prefs", label: "Ajustes de En casa", Icon: Settings, coach: "pantry-settings",
      action: () => setShowPantryPrefs(true), tint: "#e6f2ea", ink: "#2d5a3d",
    },
  ].filter(Boolean);

  const header = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
        <span
          style={{
            width: 36,
            height: 36,
            borderRadius: 11,
            background: "#e0eef5",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Refrigerator size={18} color="#2f6d8a" strokeWidth={2.4} />
        </span>
        <h2 style={pageTitle}>En casa</h2>
        {!embedded && (
          <CoachHelpButton active={showIconCoach} onClick={() => setShowIconCoach((v) => !v)} />
        )}
      </div>
      {headerActions.length > 0 && (
        <button
          type="button"
          data-coach="pantry-options"
          onClick={() => setHeaderMenuOpen(true)}
          aria-label="Opciones de En casa"
          aria-haspopup="menu"
          aria-expanded={headerMenuOpen}
          title="Opciones"
          style={{ ...pantryIconBtn, background: headerMenuOpen ? "#e8f0ea" : "#fff" }}
        >
          <MenuIcon size={18} color={GREEN} strokeWidth={2.4} />
        </button>
      )}
    </div>
  );

  // Con el doble segmented control, Añadir e Inventario son pestañas. En
  // embedded (onboarding «¿Qué repetimos?») no hay pestañas: se apila todo.
  const showAdd = embedded || mainTab === "add";
  const showInventory = embedded || mainTab === "inventory";
  const inventoryHasItems = !loading && items.length > 0;

  const content = (
    <>
        {!embedded && <PantryMainTabs value={mainTab} onChange={setMainTab} />}

        {showInventory && !embedded && inventoryHasItems && (
          <PantryLocationCards
            selected={locationFilters}
            counts={locationCounts}
            onPick={(key) =>
              setLocationFilters((prev) => {
                const next = new Set(prev);
                if (next.has(key)) next.delete(key);
                else next.add(key);
                return next;
              })
            }
          />
        )}

        {showInventory && !embedded && !loading && items.length === 0 && (
          <div style={{ padding: "20px 0 8px" }}>
            <EmptyIllustration
              img="/avatares/cards/empty_despensa.jpg"
              title="Tu nevera y tu despensa están vacías"
              subtitle="Añade lo que tienes en casa: ingredientes de la nevera, la despensa o el congelador, y platos que ya has cocinado."
              maxWidth={300}
              imgAspect="16 / 12"
            >
              <button
                type="button"
                onClick={() => setMainTab("add")}
                style={{
                  marginTop: 14,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 7,
                  padding: "11px 24px",
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
                <Plus size={15} strokeWidth={2.8} /> Añadir
              </button>
            </EmptyIllustration>
          </div>
        )}

        {showInventory && embedded && (onToggleHomeStock || (!loading && items.length > 0)) && (
          // Breathing room + a soft rule below the "En casa / Favoritas"
          // tab cards (rendered by the onboarding parent right above this)
          // before the toggle+segmented row — without it the row felt glued
          // straight onto the cards.
          <div style={{ height: 1, background: "#e5ebe7", margin: "6px 0 18px" }} />
        )}

        {showInventory && (onToggleHomeStock || (!loading && items.length > 0)) && (
          <div
            style={{
              display: "flex",
              flexWrap: "nowrap",
              alignItems: "center",
              justifyContent: onToggleHomeStock ? "space-between" : "flex-end",
              gap: 6,
              marginBottom: 8,
            }}
          >
            {onToggleHomeStock && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flexShrink: 1 }}>
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 800,
                    color: INK,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  Usar despensa
                </span>
                <ToggleSwitch size="sm" checked={useHomeStock !== false} onChange={onToggleHomeStock} />
              </div>
            )}
            {!loading && items.length > 0 && (
              <div
                style={{
                  display: "inline-flex",
                  gap: 2,
                  padding: 2,
                  borderRadius: 10,
                  background: "#eef4ef",
                  border: "1px solid #dce8e0",
                  flexShrink: 0,
                }}
              >
                {STOCK_VIEWS.map(([id, label]) => {
                  const on = stockView === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setStockView(id)}
                      aria-pressed={on}
                      style={{
                        padding: onToggleHomeStock ? "4px 8px" : "5px 11px",
                        borderRadius: 8,
                        // White pill on select, instead of a solid-green fill
                        // — one less block competing with the "En
                        // casa"/"Favoritas" cards above for the same
                        // full-saturation green.
                        border: "none",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        fontSize: onToggleHomeStock ? 11 : 11.5,
                        fontWeight: 800,
                        background: on ? "#fff" : "transparent",
                        color: on ? GREEN : "#5a7066",
                        boxShadow: on ? "0 1px 3px rgba(20,47,29,.1)" : "none",
                        transition: "all .15s",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
            {!loading && items.length > 0 && (
              <button
                type="button"
                onClick={() => setShowFilters(true)}
                style={{
                  position: "relative",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  flexShrink: 0,
                  padding: onToggleHomeStock ? "6px 9px" : "7px 11px",
                  borderRadius: 10,
                  border: `1.5px solid ${activeFilterCount ? GREEN : "#e5ebe7"}`,
                  background: activeFilterCount ? GREEN : "#fff",
                  color: activeFilterCount ? "#fff" : "#5a7066",
                  fontSize: 11.5,
                  fontWeight: 800,
                  fontFamily: "inherit",
                  cursor: "pointer",
                }}
              >
                <SlidersHorizontal size={13} />
                {!onToggleHomeStock && "Filtros"}
                {activeFilterCount > 0 && (
                  <span
                    style={{
                      minWidth: 15,
                      height: 15,
                      borderRadius: 999,
                      padding: "0 4px",
                      background: "#fff",
                      color: GREEN,
                      fontSize: 9.5,
                      fontWeight: 900,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {activeFilterCount}
                  </span>
                )}
              </button>
            )}
          </div>
        )}

        {showFilters && (
          <PantryFiltersSheet
            onClose={() => setShowFilters(false)}
            availableAisles={availableAisles}
            aisleFilters={effectiveAisleFilters}
            setAisleFilters={setAisleFilters}
            dateFilter={dateFilter}
            setDateFilter={setDateFilter}
            customFrom={customFrom}
            customTo={customTo}
            setCustomFrom={setCustomFrom}
            setCustomTo={setCustomTo}
            availableStores={availableStores}
            storeFilters={effectiveStoreFilters}
            setStoreFilters={setStoreFilters}
            receipts={receipts}
            ticketFilters={effectiveTicketFilters}
            setTicketFilters={setTicketFilters}
            resultCount={visibleItems.length}
            activeFilterCount={activeFilterCount}
            onClear={() => {
              setAisleFilters(new Set());
              setDateFilter("all");
              setCustomFrom("");
              setCustomTo("");
              setStoreFilters(new Set());
              setTicketFilters(new Set());
            }}
          />
        )}

        {showInventory && (loading || items.length > 0) && (
          <>
            <div style={{ marginBottom: 14 }}>
              {loading ? (
                <p style={{ margin: 0, padding: 16, fontSize: 13, color: MUTED }}>Cargando…</p>
              ) : (
                <>
                  {inventoryItems.length === 0 ? (
                    <p style={{ margin: 0, padding: 18, fontSize: 13, color: MUTED, textAlign: "center" }}>
                      {locationFilters.size > 0
                        ? `No tienes nada en ${[...locationFilters].map((k) => LOCATION_META[k].label.toLowerCase()).join(" ni ")}.`
                        : "Sin ingredientes con estos filtros."}
                    </p>
                  ) : (
                  inventoryItems.map((item, i) => {
                    const editing = editingId === item.id;
                    const cooked = isCookedDish(item);
                    const aisle = guessShoppingAisle(item.ingredientName);
                    const { peso, cantidad } = splitStockDisplay(item.ingredientName, item.qty, item.unit);
                    const priceLabel = cooked ? "—" : stockPriceLabel(item, priceObs);
                    const valueText = cooked
                      ? formatStockQty(item.qty, "racion")
                      : stockView === "peso" ? peso : cantidad;
                    const lastUpdated = formatShortDay(item.updatedAt);
                    return (
                      <div
                        key={item.id}
                        ref={(el) => { rowRefs.current[item.id] = el; }}
                        style={{
                          ...ROW_GRID,
                          padding: "14px 12px",
                          borderBottom: i === inventoryItems.length - 1 ? "none" : "1px solid rgba(45,110,70,.16)",
                        }}
                      >
                        {editing ? (
                          <span style={{ gridColumn: "1 / 5", display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                            <span style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 0 }}>
                              <input
                                type="text"
                                inputMode="decimal"
                                autoFocus
                                value={editQty}
                                onChange={(e) => setEditQty(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && saveEdit(item.id)}
                                aria-label={`Cantidad de ${item.ingredientName}`}
                                style={{ ...fieldStyle, width: 54, flexShrink: 0, padding: "6px 4px", fontSize: 13, textAlign: "center" }}
                              />
                              {cooked ? (
                                <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 700, color: INK }}>
                                  raciones
                                </span>
                              ) : (
                                <select
                                  value={editUnit}
                                  onChange={(e) => setEditUnit(e.target.value)}
                                  aria-label={`Unidad de ${item.ingredientName}`}
                                  style={{ ...fieldStyle, width: 62, flexShrink: 0, padding: "6px 4px", fontSize: 13 }}
                                >
                                  <option value="ud">ud</option>
                                  <option value="g">g</option>
                                  <option value="kg">kg</option>
                                  <option value="ml">ml</option>
                                  <option value="l">L</option>
                                </select>
                              )}
                              <button
                                type="button"
                                onClick={() => saveEdit(item.id)}
                                aria-label={`Guardar ${item.ingredientName}`}
                                style={{
                                  flexShrink: 0,
                                  padding: "6px 14px",
                                  borderRadius: 8,
                                  border: "none",
                                  background: GREEN,
                                  color: "#fff",
                                  fontSize: 12,
                                  fontWeight: 800,
                                  fontFamily: "inherit",
                                  cursor: "pointer",
                                }}
                              >
                                OK
                              </button>
                            </span>
                            {lastUpdated && (
                              // The "when did I buy this" answer lives here instead of on every
                              // row: it's one tap away (the row is already tappable-to-edit) and
                              // shown right where you're already looking at this item's detail,
                              // rather than adding a caption under every single name in the list.
                              <span style={{ fontSize: 10, fontWeight: 600, color: "#9ab0a1" }}>
                                Última actualización: {lastUpdated}
                              </span>
                            )}
                          </span>
                        ) : (
                          <>
                            <RowThumb item={item} cooked={cooked} aisle={aisle} />
                            <span style={{ minWidth: 0 }}>
                              <span
                                style={{
                                  display: "block",
                                  fontSize: 14,
                                  fontWeight: 800,
                                  color: INK,
                                  lineHeight: 1.3,
                                  whiteSpace: "normal",
                                  overflowWrap: "anywhere",
                                }}
                              >
                                {item.ingredientName}
                              </span>
                              {(() => {
                                const fresh = freshnessTag(item);
                                return fresh ? (
                                  <span
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      marginTop: 3,
                                      padding: "1px 7px",
                                      borderRadius: 999,
                                      background: fresh.bg,
                                      color: fresh.color,
                                      fontSize: 10,
                                      fontWeight: 800,
                                    }}
                                  >
                                    {fresh.label}
                                  </span>
                                ) : null;
                              })()}
                            </span>
                            <button
                              type="button"
                              onClick={() => startEdit(item)}
                              aria-label={`Editar ${viewLabel.toLowerCase()} de ${item.ingredientName}`}
                              title="Tocar para editar la cantidad"
                              style={{
                                // Plain text, same treatment as the Precio column
                                // (no pill) — just the number, tappable to edit.
                                justifySelf: "center",
                                padding: 0,
                                border: "none",
                                background: "none",
                                color: valueText === "—" ? MUTED : INK,
                                fontSize: 13,
                                fontWeight: 800,
                                fontFamily: "inherit",
                                cursor: "pointer",
                                lineHeight: 1.2,
                                textAlign: "center",
                              }}
                            >
                              {valueText}
                            </button>
                            <span
                              style={{
                                justifySelf: "center",
                                fontSize: 13,
                                fontWeight: 800,
                                color: priceLabel === "—" ? MUTED : INK,
                                textAlign: "center",
                              }}
                              title={priceLabel === "—" ? "Sin precio en tus tickets" : "Estimado con tus compras"}
                            >
                              {priceLabel}
                            </span>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemove(item.id)}
                          aria-label={`Quitar ${item.ingredientName}`}
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: 8,
                            border: "none",
                            justifySelf: "end",
                            background: "#fdf1ef",
                            color: "#c0392b",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    );
                  })
                  )}
                </>
              )}
            </div>
          </>
        )}

        {showAdd && (
          <>
            {embedded && (
              <div style={{ height: 3, borderRadius: 99, background: "#d8e8dc", margin: "16px 0 14px" }} />
            )}
            <div data-coach="pantry-add">
              <PantryModePicker tab={addTab} setTab={setAddTab} canUploadReceipt={canUploadReceipt} />
              <PantryInput
                hideTabs
                tab={addTab}
                onTabChange={setAddTab}
                onSaved={handleSaved}
                onUploadReceipt={canUploadReceipt ? () => setShowReceiptFlow(true) : null}
              />
            </div>
          </>
        )}
    </>
  );

  if (embedded) {
    return <div>{content}</div>;
  }

  return (
    <div style={{ background: "#fff", minHeight: "100dvh" }}>
      <div style={{ background: HEADER_BAND, padding: "20px 16px 14px" }}>
        {header}
      </div>
      <div style={{ padding: `16px 16px calc(${bottomNavSpacer()} + 28px)` }}>
        {content}
      </div>
      {onNav && <BottomNav active={navActive} onNav={onNav} />}
      {showReceiptFlow && (
        <PantryReceiptFlow
          data={data}
          setData={setData}
          shopping={shopping}
          setShopping={setShopping}
          onToast={onToast}
          onClose={() => setShowReceiptFlow(false)}
          onPantryChanged={handleSaved}
        />
      )}
      {showPantryPrefs && canEditPantryPrefs && (
        <PantryPrefsWizard
          initial={data?.pantryPrefs}
          onComplete={(prefs) => {
            setData((d) => ({ ...d, pantryPrefs: prefs, pantryPrefsSet: true, pantryPrefsSeen: true }));
            setShowPantryPrefs(false);
            onToast?.("Preferencias de despensa guardadas");
          }}
          onLater={() => {
            setData((d) => (d.pantryPrefsSeen ? d : { ...d, pantryPrefsSeen: true }));
            setShowPantryPrefs(false);
          }}
        />
      )}
      {showIconCoach && <PantryCoachTour onClose={() => setShowIconCoach(false)} />}

      {/* Burger → sliding options sidebar, styled like the Menú drawer. */}
      {headerMenuOpen && (
        <div
          onClick={() => setHeaderMenuOpen(false)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: bottomNavSpacer(),
            zIndex: 1000,
            background: "rgba(15,30,20,.42)",
            backdropFilter: "blur(2px)",
            WebkitBackdropFilter: "blur(2px)",
            display: "flex",
            justifyContent: "center",
            animation: "pantryDrawerFade .2s ease both",
          }}
        >
          <style>{`
            @keyframes pantrySidebarIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
            @keyframes pantrySidebarItemIn { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }
            @keyframes pantryDrawerFade { from { opacity: 0; } to { opacity: 1; } }
            .pantry-sidebar-item {
              display: flex; align-items: center; gap: 13px; width: 100%;
              padding: 13px 12px; border: none; background: transparent; cursor: pointer;
              font-family: inherit; font-size: 14.5px; font-weight: 800; color: #1f3a29;
              text-align: left; border-radius: 12px;
              animation: pantrySidebarItemIn .3s cubic-bezier(.4,0,.2,1) both;
              transition: background .15s ease;
            }
            .pantry-sidebar-item:hover { background: #f3f8f4; }
            .pantry-sidebar-item:active { background: #eef4ef; }
          `}</style>
          <div style={{ position: "relative", width: "100%", maxWidth: APP_SHELL_MAX_WIDTH }}>
            <aside
              role="menu"
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                height: "100%",
                width: 300,
                maxWidth: "82%",
                background: "#fff",
                boxShadow: "-18px 0 50px rgba(20,47,29,.22)",
                display: "flex",
                flexDirection: "column",
                animation: "pantrySidebarIn .3s cubic-bezier(.4,0,.2,1) both",
              }}
            >
              <div style={{ background: "#e9f4ed", padding: "18px 16px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 11,
                      background: "#c3e6d1",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Refrigerator size={18} color="#1f4a30" strokeWidth={2.4} />
                  </span>
                  <h2 style={{ fontSize: 18, fontWeight: 900, color: "#142f1d", margin: 0, letterSpacing: "-.3px" }}>
                    En casa
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setHeaderMenuOpen(false)}
                  aria-label="Cerrar"
                  style={{ ...pantryIconBtn, width: 34, height: 34, borderRadius: 999, flexShrink: 0 }}
                >
                  <X size={17} strokeWidth={2.5} color={INK} />
                </button>
              </div>
              <div style={{ padding: "8px 10px", overflowY: "auto" }}>
                {headerActions.map((a, i, arr) => (
                  <div key={a.key}>
                    <button
                      type="button"
                      role="menuitem"
                      data-coach={a.coach}
                      className="pantry-sidebar-item"
                      style={{ animationDelay: `${i * 40}ms` }}
                      onClick={() => { a.action?.(); setHeaderMenuOpen(false); }}
                    >
                      <span
                        style={{
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          width: 38, height: 38, borderRadius: 11, flexShrink: 0,
                          background: a.tint, color: a.ink,
                        }}
                      >
                        <a.Icon size={19} strokeWidth={2.5} />
                      </span>
                      <span style={{ flex: 1 }}>{a.label}</span>
                      <ChevronRight size={16} strokeWidth={2.4} color="#c2d3c8" />
                    </button>
                    {i < arr.length - 1 && (
                      <div style={{ height: 1, background: "rgba(45,90,61,.16)", margin: "0 12px" }} />
                    )}
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}
