import { useEffect, useMemo, useState } from "react";
import {
  Apple,
  Bean,
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
import { APP_SHELL_MAX_WIDTH, BottomNav, bottomNavSpacer, ToggleSwitch } from "../components/ui.jsx";
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
import { guessShoppingAisle } from "../lib/ingredientCategories.js";
import { ingredientThumbSrc, aisleImageSrc } from "../lib/ingredientImages.js";
import { DATE_BUCKET_OPTIONS, estimateListCost, formatEuro, matchesDateBucket } from "../lib/priceHistory.js";

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

// Empty-state tiles (nevera + despensa) shown when there's no stock yet —
// filled tinted tiles with saturated icons, matching the "Recetas" empty state.
const emptyTile = {
  width: 60,
  height: 60,
  borderRadius: 18,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#e0eef5",
};

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

// name (wraps — free to break onto 2 lines, it's the column that gives up
// room) | categoría (icon) | gap-only spacer (keeps Cat. from crowding
// Cantidad) | valor (toggled: cantidad/peso) | precio (always on — a
// ticket-sourced item always has one) | trash.
const ROW_GRID = {
  display: "grid",
  gridTemplateColumns: "minmax(0,1fr) 26px 14px 62px 48px 24px",
  gap: 6,
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
  // Cuestionario de despensa (solo modo avanzado): 4 decisiones sobre cómo la
  // despensa interactúa con el menú. Se abre solo la primera vez, y el icono de
  // ajustes del header lo reabre cuando se quiera.
  const expertMode = Boolean(data?.expertMode);
  const canEditPantryPrefs = Boolean(setData) && expertMode && !embedded;
  const [showPantryPrefs, setShowPantryPrefs] = useState(false);
  // Header options drawer (burger → sliding sidebar), mirroring the Menu screen.
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  useEffect(() => {
    if (canEditPantryPrefs && !data?.pantryPrefsSeen) setShowPantryPrefs(true);
  }, [canEditPantryPrefs, data?.pantryPrefsSeen]);
  // "Añadir ingredientes" (escrito/voz/foto) starts collapsed so the screen
  // reads as "here's what you have", not a form — expands on demand.
  const [showAddInput, setShowAddInput] = useState(false);
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
    for (const it of items) seen.add(guessShoppingAisle(it.ingredientName));
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
        if (effectiveAisleFilters.size > 0 && !effectiveAisleFilters.has(guessShoppingAisle(it.ingredientName))) {
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
    setItems(user ? await loadPantry(user.id) : loadLocalPantry());
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
      key: "prefs", label: "Ajustes de despensa", Icon: Settings, coach: "pantry-settings",
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

  const pantryIsEmpty = !embedded && !loading && items.length === 0;

  const content = (
    <>
        {embedded && (onToggleHomeStock || (!loading && items.length > 0)) && (
          // Breathing room + a soft rule below the "En casa / Favoritas"
          // tab cards (rendered by the onboarding parent right above this)
          // before the toggle+segmented row — without it the row felt glued
          // straight onto the cards.
          <div style={{ height: 1, background: "#e5ebe7", margin: "6px 0 18px" }} />
        )}

        {(onToggleHomeStock || (!loading && items.length > 0)) && (
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

        {(loading || items.length > 0) && (
          <>
            <div style={{ marginBottom: 14 }}>
              {loading ? (
                <p style={{ margin: 0, padding: 14, fontSize: 13, color: MUTED }}>Cargando…</p>
              ) : (
                <>
                  {visibleItems.length === 0 ? (
                    <p style={{ margin: 0, padding: 16, fontSize: 12.5, color: MUTED, textAlign: "center" }}>
                      Sin ingredientes con estos filtros.
                    </p>
                  ) : (
                  visibleItems.map((item, i) => {
                    const editing = editingId === item.id;
                    const aisle = guessShoppingAisle(item.ingredientName);
                    const { peso, cantidad } = splitStockDisplay(item.ingredientName, item.qty, item.unit);
                    const priceLabel = stockPriceLabel(item, priceObs);
                    const valueText = stockView === "peso" ? peso : cantidad;
                    const lastUpdated = formatShortDay(item.updatedAt);
                    return (
                      <div
                        key={item.id}
                        style={{
                          ...ROW_GRID,
                          padding: "10px",
                          // Same thin divider as the Recetas category list and
                          // the Compra aisle rows, for a consistent flat look.
                          borderBottom: i === visibleItems.length - 1 ? "none" : "1px solid rgba(45,110,70,.2)",
                        }}
                      >
                        {editing ? (
                          <span style={{ gridColumn: "1 / 6", display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
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
                            <span style={{ minWidth: 0 }}>
                              <span
                                style={{
                                  display: "block",
                                  // Matches the allergy checklist's label size
                                  // (Onboarding.jsx AllergenRow) so "copy" reads
                                  // consistently across both list-style screens.
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: INK,
                                  lineHeight: 1.25,
                                  whiteSpace: "normal",
                                  overflowWrap: "anywhere",
                                }}
                              >
                                {item.ingredientName}
                              </span>
                            </span>
                            <AisleIcon aisle={aisle} name={item.ingredientName} />
                            <span />
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
                                fontSize: 11,
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
                                fontSize: 11,
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

        {pantryIsEmpty && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "40px 20px 4px", textAlign: "center" }}>
            <div style={{ display: "inline-flex", gap: 14 }}>
              <span style={emptyTile}>
                <Refrigerator size={26} color="#2f6d8a" strokeWidth={2} />
              </span>
              <span style={{ ...emptyTile, background: "#f3ecdf" }}>
                <Package size={26} color="#bf9256" strokeWidth={2} />
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: INK }}>
              Tu nevera y tu despensa están vacías
            </p>
            <p style={{ margin: 0, maxWidth: 280, fontSize: 13, color: "#7a9485", lineHeight: 1.5 }}>
              Añade lo que tienes en casa y lo usaremos en tus recetas y en tu lista de la compra.
            </p>
          </div>
        )}

        <div style={pantryIsEmpty ? { textAlign: "center", marginTop: 12 } : undefined}>
          {pantryIsEmpty ? (
            <button
              type="button"
              data-coach="pantry-add"
              onClick={() => setShowAddInput((v) => !v)}
              aria-expanded={showAddInput}
              style={{
                display: "inline-flex",
                alignItems: "center",
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
              <Plus size={15} strokeWidth={2.8} />
              Añadir ingredientes
            </button>
          ) : (
            <button
              type="button"
              data-coach="pantry-add"
              onClick={() => setShowAddInput((v) => !v)}
              aria-expanded={showAddInput}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                boxSizing: "border-box",
                padding: "6px 10px",
                borderRadius: 10,
                border: `1.5px solid ${showAddInput ? "#c7ddce" : "#e5ebe7"}`,
                background: showAddInput ? "#eef5f0" : "#fff",
                cursor: "pointer",
                fontFamily: "inherit",
                textAlign: "left",
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 6,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  // Embedded: this is a secondary/utility action sitting under an
                  // already green-heavy screen, so it's an outline instead of a
                  // 6th solid-green block. Standalone "En casa" (Nav) keeps the
                  // original solid fill — it's the only accent on that screen.
                  ...(embedded
                    ? { border: "1.5px solid #2d5a3d", color: "#2d5a3d", background: "transparent" }
                    : { background: GREEN, color: "#fff" }),
                }}
              >
                <Plus size={11} strokeWidth={2.8} />
              </span>
              <span style={{ minWidth: 0, fontSize: 12, fontWeight: 800, color: INK }}>
                Añadir ingredientes
              </span>
              <ChevronDown
                size={14}
                color="#8aa092"
                style={{ transform: showAddInput ? "rotate(180deg)" : "none", transition: "transform .15s", flexShrink: 0 }}
              />
            </button>
          )}

          {showAddInput && (
            <div style={{ marginTop: 12 }}>
              <PantryInput
                onSaved={handleSaved}
                onUploadReceipt={canUploadReceipt ? () => setShowReceiptFlow(true) : null}
              />
            </div>
          )}
        </div>
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
