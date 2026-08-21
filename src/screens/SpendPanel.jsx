import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  Home,
  Leaf,
  Milk,
  Package,
  Plus,
  Receipt,
  Repeat,
  ShoppingBag,
  SlidersHorizontal,
  Sprout,
  Store,
  Trash2,
  TrendingUp,
  Wallet,
  Wheat,
  X,
} from "lucide-react";
import { WizardSheet } from "../components/ui.jsx";
import {
  DATE_BUCKET_OPTIONS,
  filterByDays,
  filterByRange,
  formatEuro,
  formatEuro0,
  ingredientIdFor,
  matchesDateBucket,
  matchReceiptLine,
  measureLabel,
  spendByAisle,
  spendByAisleDetail,
  spendByStore,
  spendOverTime,
  spendStats,
} from "../lib/priceHistory.js";
import { guessShoppingAisle } from "../lib/ingredientCategories.js";
import { aisleImageSrc } from "../lib/ingredientImages.js";
import { useAuth } from "../lib/useAuth.js";
import { removePantryItem } from "../lib/pantry.js";

const GREEN = "#2d5a3d";

// Same aisle icons + colours the shopping list uses (Shopping.jsx AISLE_UI), so
// "Dónde se va el dinero" reads with the exact category language of the rest of
// the app instead of a wall of green bars.
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

function aisleMeta(aisle) {
  return AISLE_UI[aisle] ?? { Icon: Home, color: "#64748b" };
}

// Common Spanish supermarket chains for the "Súper" combobox (free text still
// allowed via the datalist so any local shop works too). Exported so the
// receipt wizard (Shopping.jsx) can match a scanned store name against the
// same list before falling back to "Otra…".
export const SUPERMARKETS = [
  "Mercadona",
  "Lidl",
  "Alcampo",
  "Carrefour",
  "Dia",
  "Aldi",
  "Eroski",
  "Consum",
  "Hipercor",
  "Supercor",
  "El Corte Inglés",
  "Bonpreu",
  "Gadis",
  "Ahorramás",
  "Froiz",
  "Deza",
  "Alimerka",
];

// We can't ship real brand logos (they're licensed assets), so each chain gets
// an honest brand-coloured chip with a short monogram instead of a fake logo.
const STORE_BADGE = {
  Mercadona: { bg: "#007A3D", fg: "#fff", short: "Me" },
  Lidl: { bg: "#0050AA", fg: "#FFE500", short: "Li" },
  Alcampo: { bg: "#E30613", fg: "#fff", short: "Ac" },
  Carrefour: { bg: "#004E9F", fg: "#fff", short: "Ca" },
  Dia: { bg: "#E2001A", fg: "#fff", short: "Dia" },
  Aldi: { bg: "#002F5F", fg: "#fff", short: "Al" },
  Eroski: { bg: "#E2001A", fg: "#fff", short: "Er" },
  Consum: { bg: "#F39200", fg: "#fff", short: "Co" },
  Hipercor: { bg: "#007A33", fg: "#fff", short: "Hi" },
  Supercor: { bg: "#007A33", fg: "#fff", short: "Su" },
  "El Corte Inglés": { bg: "#0a0a0a", fg: "#fff", short: "CI" },
  Bonpreu: { bg: "#E30613", fg: "#fff", short: "Bo" },
  Gadis: { bg: "#E30613", fg: "#fff", short: "Ga" },
  Ahorramás: { bg: "#E2001A", fg: "#fff", short: "Ah" },
  Froiz: { bg: "#009640", fg: "#fff", short: "Fr" },
  Deza: { bg: "#E41819", fg: "#fff", short: "De" },
  Alimerka: { bg: "#FECF07", fg: "#142f1d", short: "Ali" },
  Otro: { bg: "#64748b", fg: "#fff", short: "···" },
};

// Real logos are licensed assets we can't bundle, but any square image dropped
// into src/assets/store-logos/<slug>.<ext> is picked up automatically by
// filename (e.g. mercadona.svg, el-corte-ingles.png). svg/png/jpg/jpeg/webp
// all work. Until one exists for a chain we fall back to a brand-coloured
// monogram chip.
const STORE_LOGOS = import.meta.glob("../assets/store-logos/*.{svg,png,jpg,jpeg,webp}", {
  eager: true,
  query: "?url",
  import: "default",
});

function storeSlug(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function storeLogoUrl(name) {
  const slug = storeSlug(name);
  const matches = Object.keys(STORE_LOGOS).filter((k) => {
    const file = k.slice(k.lastIndexOf("/") + 1);
    const stem = file.slice(0, file.lastIndexOf(".")).toLowerCase();
    return stem === slug;
  });
  if (!matches.length) return null;
  const extRank = (k) => {
    const ext = k.slice(k.lastIndexOf(".")).toLowerCase();
    if (ext === ".svg") return 0;
    if (ext === ".png") return 1;
    if (ext === ".webp") return 2;
    return 3;
  };
  matches.sort((a, b) => extRank(a) - extRank(b));
  return STORE_LOGOS[matches[0]];
}

// `maxWidth` caps how wide a real (often wordmark-shaped, e.g. Mercadona's is
// ~7:1) logo is allowed to get. Real logos are NOT forced into a square like
// the monogram fallback below — squashing a wide wordmark into a size×size
// box via object-fit:contain shrank it down to a barely-visible sliver a few
// px tall. Instead we fix the height at `size` and let width be natural,
// only capped by `maxWidth` (default a generous 2.8×size) so it stays
// legible without blowing out tight layouts.
export function StoreBadge({ name, size = 24, maxWidth = size * 2.8 }) {
  const url = storeLogoUrl(name);
  if (url) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: size, maxWidth, flexShrink: 0 }}>
        <img src={url} alt={name} style={{ height: "100%", width: "auto", maxWidth: "100%", objectFit: "contain", display: "block" }} />
      </span>
    );
  }
  const b = STORE_BADGE[name] ?? { bg: "#e0eae3", fg: "#4a5a50", short: name.slice(0, 2) };
  const fontSize = b.short.length > 2 ? size * 0.34 : size * 0.42;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0 }} aria-hidden="true">
      <rect width="24" height="24" rx="6" fill={b.bg} />
      <text
        x="12"
        y="13"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="inherit"
        fontWeight="800"
        fontSize={(fontSize / size) * 24}
        letterSpacing="-.4"
        fill={b.fg}
      >
        {b.short}
      </text>
    </svg>
  );
}

// Options shown in the store dropdown: the known chains (each with its badge)
// plus the two special rows bookending the list.
const STORE_OPTIONS = [
  { value: "", label: "Sin especificar", special: "none" },
  ...SUPERMARKETS.map((s) => ({ value: s, label: s })),
  { value: "__other", label: "Otra tienda…", special: "other" },
];

// Floating option list for StorePicker — portaled to <body> (not nested
// inside the WizardSheet) so it can't be clipped by the sheet's own
// overflow-y:auto, and repositioned on scroll/resize instead of just closing,
// which is what made the earlier portal dropdown here feel flaky. Flips to
// open upward when there isn't room below (common once the sheet is scrolled
// down on a small phone).
function StoreDropdown({ value, anchorRef, onSelect, onClose }) {
  const menuRef = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    const reposition = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const spaceBelow = vh - r.bottom;
      const openUp = spaceBelow < 260 && r.top > spaceBelow;
      setPos({
        left: r.left,
        width: r.width,
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
      className="mp-store-dropdown"
      style={{
        position: "fixed",
        left: pos.left,
        width: pos.width,
        top: pos.top ?? undefined,
        bottom: pos.bottom ?? undefined,
        maxHeight: pos.maxHeight,
        overflowY: "auto",
        background: "#fff",
        borderRadius: 16,
        border: "1px solid #d7e6dc",
        boxShadow: "0 20px 48px -10px rgba(20,47,29,.32)",
        zIndex: 400,
        padding: 5,
      }}
    >
      {STORE_OPTIONS.map((opt, i) => {
        const selected = value === opt.value;
        return (
          <div key={opt.value || "none"}>
            {i > 0 && <div style={{ height: 1, margin: "3px 8px", background: "#d7e6dc" }} />}
            <button
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onSelect(opt.value)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 9px",
                border: "none",
                borderRadius: 10,
                background: selected ? "#eaf3ec" : "transparent",
                color: selected ? GREEN : "#142f1d",
                fontWeight: selected ? 800 : 600,
                fontSize: 14,
                textAlign: "left",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {opt.special ? (
                <span
                  style={{
                    width: 24,
                    height: 24,
                    flexShrink: 0,
                    borderRadius: 7,
                    background: "#eef4ef",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#7a8a7f",
                  }}
                >
                  {opt.special === "other" ? <Plus size={13} strokeWidth={2.6} /> : <Store size={13} strokeWidth={2.2} />}
                </span>
              ) : (
                // Same 24×24 footprint as the "special" icon above, so every
                // row's leading element lines up — and a wide wordmark logo
                // (Mercadona, etc.) can't spill out past its row's icon slot.
                <span style={{ width: 24, height: 24, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  <StoreBadge name={opt.value} size={22} maxWidth={24} />
                </span>
              )}
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {opt.label}
              </span>
              {selected && <Check size={15} strokeWidth={2.8} color={GREEN} style={{ flexShrink: 0 }} />}
            </button>
          </div>
        );
      })}
    </div>,
    document.body
  );
}

// Store picker: a custom combobox (not a native <select>, so each row can
// carry the chain's real logo + a thin divider, matching the rest of the
// app's wizard styling) with the floating list above. Picking "Otra…" swaps
// in a free-text field for local shops. Exported for reuse by the receipt
// wizard's "Súper" step (Shopping.jsx).
// Own little box for the chain's logo, kept visually separate from the
// name/dropdown pill next to it — the badge is just a preview of the
// selection, not itself an interactive control. `overflow: hidden` is a
// safety net: StoreBadge itself is told to fit within `logoMaxWidth` below,
// but this catches it regardless if a future logo asset comes in wider than
// expected (a wordmark like Mercadona's real logo overflowed this exact box
// before that cap existed — it has to actually fit, not just clip).
const storeLogoBoxStyle = {
  width: 42,
  height: 42,
  borderRadius: 12,
  border: "1.5px solid #e0eae3",
  background: "#fff",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  overflow: "hidden",
};
// Inner usable width of storeLogoBoxStyle (42px box minus border/breathing room).
const logoMaxWidth = 34;

export function StorePicker({ value, otherValue, onChange, onOtherChange }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);

  if (value === "__other") {
    return (
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={storeLogoBoxStyle}>
          <Store size={18} color="#9aa8a0" strokeWidth={2} />
        </span>
        <input
          value={otherValue}
          onChange={(e) => onOtherChange(e.target.value)}
          placeholder="Nombre de la tienda"
          autoFocus
          style={{ ...inputStyle, flex: 1, minWidth: 0 }}
        />
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Volver a la lista"
          style={{ ...inputStyle, width: 40, flex: "0 0 40px", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#7a8a7f" }}
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
      {/* Logo lives in its own box, separate from the name/dropdown pill —
          only the latter opens the list, so tapping the badge itself does
          nothing surprising. */}
      <span style={storeLogoBoxStyle}>
        {value ? <StoreBadge name={value} size={24} maxWidth={logoMaxWidth} /> : <Store size={18} color="#9aa8a0" strokeWidth={2} />}
      </span>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          ...inputStyle,
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          gap: 8,
          cursor: "pointer",
        }}
      >
        <span
          style={{
            flex: 1,
            minWidth: 0,
            color: value ? "#142f1d" : "#9aa8a0",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {value || "Sin especificar"}
        </span>
        <ChevronDown
          size={16}
          color="#7a8a7f"
          style={{ flexShrink: 0, transition: "transform .15s", transform: open ? "rotate(180deg)" : "none" }}
        />
      </button>
      {open && (
        <StoreDropdown
          value={value}
          anchorRef={anchorRef}
          onClose={() => setOpen(false)}
          onSelect={(v) => {
            onChange(v);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

// Primary quantity units: bulk weight/volume, plain units, and typical
// containers so a line can read "500 g", "3 ud", "2 botes"…
const UNIT_OPTIONS = [
  { value: "ud", label: "ud", container: true },
  { value: "g", label: "g", container: false },
  { value: "kg", label: "kg", container: false },
  { value: "ml", label: "ml", container: false },
  { value: "l", label: "L", container: false },
  { value: "bote", label: "bote", container: true },
  { value: "lata", label: "lata", container: true },
  { value: "paquete", label: "paquete", container: true },
  { value: "bolsa", label: "bolsa", container: true },
  { value: "brick", label: "brick", container: true },
  { value: "pack", label: "pack", container: true },
  { value: "docena", label: "docena", container: true },
  { value: "sobre", label: "sobre", container: true },
];

// Parse a free-text per-item size like "50cl", "400 g", "1,5 L" into a
// structured { qty, unit } for later price-per-unit maths. Returns null when it
// can't confidently read a number + known unit.
function parseSize(text) {
  if (!text) return null;
  const m = String(text)
    .trim()
    .toLowerCase()
    .replace(",", ".")
    .match(/^([\d.]+)\s*(kg|g|cl|ml|l|kilos?|litros?)$/);
  if (!m) return null;
  const qty = parseFloat(m[1]);
  if (!(qty > 0)) return null;
  const raw = m[2];
  const unit = raw.startsWith("kilo") ? "kg" : raw.startsWith("litro") ? "l" : raw;
  return { qty, unit };
}

/**
 * Append one manual spend entry to `data.priceObs`. Shared so the shopping
 * screen can record a gasto from the same "Añadir a mano" modal without
 * duplicating the mapping/shape logic.
 */
export function appendManualSpend(setData, entry, dict, aliases = {}) {
  const m = matchReceiptLine(entry.name, dict, aliases);
  const ingredientId = m.ingredientId ?? ingredientIdFor(entry.name);
  const id = `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  setData((d) => ({
    ...d,
    priceObs: [
      ...(d.priceObs ?? []),
      {
        id,
        ingredientId,
        name: entry.name,
        brand: entry.brand || null,
        store: entry.store || null,
        price: entry.price,
        qty: entry.qty,
        unit: entry.unit,
        sizeQty: entry.sizeQty ?? null,
        sizeUnit: entry.sizeUnit ?? null,
        purchasedAt: entry.date ? new Date(entry.date).toISOString() : new Date().toISOString(),
        source: "manual",
        receiptId: null,
        kind: "food",
      },
    ],
  }));
}

/**
 * Persist a confirmed receipt (store + date + reviewed lines) into `data`:
 * price observations, a receipt summary, and learned name→ingredient aliases.
 * Shared so the shopping-screen receipt wizard writes the exact same shape as
 * the Gasto tab's own review flow. Returns the number of saved observations.
 */
export function appendReceiptSpend(setData, { store, date, lines, tachedKeys = [], tachedWeekStart = null, pantryIds = [] }, aliases = {}) {
  const included = (lines ?? []).filter((l) => l.include && l.price > 0);
  if (included.length === 0) return 0;

  const purchasedAt = date ? new Date(date).toISOString() : new Date().toISOString();
  const receiptId = `r-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const storeName = store?.trim() || null;

  const newObs = included.map((l, i) => {
    const ingredientId = l.kind === "prefab" ? null : (l.name ? ingredientIdFor(l.name) : null);
    return {
      id: `${receiptId}-${i}`,
      ingredientId,
      name: l.name,
      brand: null,
      store: storeName,
      price: l.price,
      qty: l.qty,
      unit: l.unit,
      purchasedAt,
      source: "receipt",
      receiptId,
      kind: l.kind,
    };
  });

  const newAliases = { ...aliases };
  for (const l of included) {
    if (l.kind === "prefab" || !l.name) continue;
    const id = ingredientIdFor(l.name);
    const key = ingredientIdFor(l.raw);
    if (id && key) newAliases[key] = id;
  }

  setData((d) => ({
    ...d,
    priceObs: [...(d.priceObs ?? []), ...newObs],
    priceAliases: newAliases,
    receipts: [
      {
        id: receiptId,
        createdAt: Date.now(),
        store: storeName,
        purchasedAt,
        total: newObs.reduce((s, o) => s + o.price, 0),
        lineCount: newObs.length,
        // Lets deleting this receipt undo exactly the tachados/despensa it
        // caused, without touching anything else the user did separately.
        // tachedWeekStart is the ONE real week this ticket's purchase landed
        // on (null when unknown) — undo must stay scoped to it too, or it'd
        // wipe out unrelated tachados in other weeks that share an ingredient.
        tachedKeys,
        tachedWeekStart,
        pantryIds,
      },
      ...(d.receipts ?? []),
    ],
  }));

  return newObs.length;
}

/**
 * "Gasto" tab: spend history built from uploaded receipts (+ manual entries).
 * Everything persists in the local `data` blob via setData (priceObs, receipts,
 * priceAliases) — the SQL tables land later without changing this UI.
 */
const PERIOD_OPTIONS = [
  { id: "30", label: "30 días" },
  { id: "90", label: "90 días" },
  { id: "365", label: "Año" },
  { id: "all", label: "Todo" },
  { id: "custom", label: "Fechas" },
];

export function SpendPanel({ data, setData, onUndoReceiptTachado, onToast, readOnly = false }) {
  const { user } = useAuth();
  const allObs = data.priceObs ?? [];
  const allReceipts = data.receipts ?? [];
  // "Resumen" (dashboard cards) vs "Histórico" (the ticket-by-ticket table) —
  // tickets used to live at the very bottom of Resumen, easy to miss; now
  // it's its own destination instead of one more card to scroll past.
  const [subTab, setSubTab] = useState("resumen");
  // Time lens applied to every Resumen section below (spend, stores,
  // categories). "all" by default so sparse early data isn't hidden.
  // "custom" swaps the day-count buckets for an explicit ad-hoc [from, to].
  const [period, setPeriod] = useState("all");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  // "Mes" used to be the default, but early on (or with a short date range)
  // all your spend usually falls inside a single month — that collapsed the
  // trend to one bucket and hid the whole card with no explanation. "Semana"
  // is much likelier to actually show a trend for a new account.
  const [trendGran, setTrendGran] = useState("week");

  const periodDays = period === "all" || period === "custom" ? null : period;
  const obs = useMemo(
    () => (period === "custom" ? filterByRange(allObs, periodFrom, periodTo) : filterByDays(allObs, periodDays)),
    [allObs, period, periodDays, periodFrom, periodTo],
  );
  const periodReceipts = useMemo(
    () =>
      period === "custom"
        ? filterByRange(allReceipts, periodFrom, periodTo)
        : filterByDays(allReceipts, periodDays),
    [allReceipts, period, periodDays, periodFrom, periodTo],
  );

  const stats = useMemo(() => spendStats(obs, periodReceipts), [obs, periodReceipts]);
  const byAisle = useMemo(() => spendByAisle(obs), [obs]);
  const aisleDetail = useMemo(() => spendByAisleDetail(obs), [obs]);
  const maxAisle = byAisle[0]?.total ?? 0;
  const byStore = useMemo(() => spendByStore(obs), [obs]);
  const maxStore = byStore[0]?.total ?? 0;
  const trend = useMemo(() => spendOverTime(obs, trendGran), [obs, trendGran]);

  // Histórico has its own independent Fecha/Supermercado filters — same look
  // as Pantry's "En casa" — instead of piggybacking on the Resumen period.
  const [ticketDateFilter, setTicketDateFilter] = useState("all");
  const [ticketFrom, setTicketFrom] = useState("");
  const [ticketTo, setTicketTo] = useState("");
  const [ticketStoreFilters, setTicketStoreFilters] = useState(() => new Set());
  const [showTicketFilters, setShowTicketFilters] = useState(false);

  const availableTicketStores = useMemo(
    () => [...new Set(allReceipts.map((r) => r.store || "Sin súper"))],
    [allReceipts],
  );
  const effectiveTicketStoreFilters = useMemo(
    () => new Set([...ticketStoreFilters].filter((s) => availableTicketStores.includes(s))),
    [ticketStoreFilters, availableTicketStores],
  );
  const ticketDateActive = ticketDateFilter === "custom" ? Boolean(ticketFrom) : ticketDateFilter !== "all";
  const ticketFilterCount = (ticketDateActive ? 1 : 0) + effectiveTicketStoreFilters.size;
  const filteredReceipts = useMemo(
    () =>
      allReceipts.filter((r) => {
        if (ticketDateActive && !matchesDateBucket(r.purchasedAt, ticketDateFilter, { from: ticketFrom, to: ticketTo })) {
          return false;
        }
        if (effectiveTicketStoreFilters.size > 0 && !effectiveTicketStoreFilters.has(r.store || "Sin súper")) {
          return false;
        }
        return true;
      }),
    [allReceipts, ticketDateActive, ticketDateFilter, ticketFrom, ticketTo, effectiveTicketStoreFilters],
  );

  // Deleting a ticket undoes everything it caused, not just its spend
  // numbers: un-tacha the list items it marked bought (through the same
  // multi-week write path the wizard used, so the undo persists and reaches
  // every week the ticket touched — see App.undoReceiptTachado) and removes
  // the pantry entries it created (leaves anything the user added separately).
  const deleteReceipt = (receiptId) => {
    if (readOnly || !setData) return;
    const receipt = allReceipts.find((r) => r.id === receiptId);
    const tachedKeys = receipt?.tachedKeys ?? [];
    if (tachedKeys.length) onUndoReceiptTachado?.(tachedKeys, receipt?.tachedWeekStart ?? null);
    if (receipt?.pantryIds?.length && user) {
      // Fire the deletes but don't block the UI; the pantry screen re-reads
      // from the DB on open, so there's no local mirror to keep in step.
      Promise.all(receipt.pantryIds.map((id) => removePantryItem(user.id, id))).catch(() => {});
    }
    setData((d) => ({
      ...d,
      receipts: (d.receipts ?? []).filter((r) => r.id !== receiptId),
      priceObs: (d.priceObs ?? []).filter((o) => o.receiptId !== receiptId),
    }));
    onToast?.(tachedKeys.length || receipt?.pantryIds?.length ? "Ticket eliminado · deshecho de la lista y de En casa" : "Ticket eliminado");
  };

  const empty = allObs.length === 0;
  const noneInPeriod = !empty && obs.length === 0;

  return (
    <div style={{ padding: "4px 0 0" }}>
      {empty ? (
        <div style={emptyCard}>
          <ShoppingBag size={30} color="#9bb0a3" strokeWidth={1.8} />
          <p style={{ fontSize: 14, fontWeight: 700, color: "#3d5245", margin: "10px 0 0" }}>
            Aún no hay gasto registrado
          </p>
          <p style={{ fontSize: 12.5, fontWeight: 600, color: "#7a8a7f", margin: "6px 0 0", lineHeight: 1.4 }}>
            Sube un ticket o añade un gasto desde <strong style={{ color: "#3d5245" }}>Tu compra</strong> y aquí verás la analítica.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Resumen ⇄ Histórico first — each manages its own filters below. */}
          <GastoSubTabs value={subTab} onChange={setSubTab} ticketCount={allReceipts.length} />

          {subTab === "historico" ? (
            <>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setShowTicketFilters(true)} style={ticketFilterBtn}>
                  <SlidersHorizontal size={13} />
                  Filtros
                  {ticketFilterCount > 0 && <span style={ticketFilterBadge}>{ticketFilterCount}</span>}
                </button>
              </div>
              <TicketHistoryTable receipts={filteredReceipts} obs={allObs} onDelete={readOnly ? undefined : deleteReceipt} />
              {showTicketFilters && (
                <TicketFiltersSheet
                  onClose={() => setShowTicketFilters(false)}
                  availableStores={availableTicketStores}
                  dateFilter={ticketDateFilter}
                  setDateFilter={setTicketDateFilter}
                  customFrom={ticketFrom}
                  customTo={ticketTo}
                  setCustomFrom={setTicketFrom}
                  setCustomTo={setTicketTo}
                  storeFilters={effectiveTicketStoreFilters}
                  setStoreFilters={setTicketStoreFilters}
                  resultCount={filteredReceipts.length}
                  activeFilterCount={ticketFilterCount}
                  onClear={() => {
                    setTicketDateFilter("all");
                    setTicketFrom("");
                    setTicketTo("");
                    setTicketStoreFilters(new Set());
                  }}
                />
              )}
            </>
          ) : (
            <>
              {/* Time lens applied to every Resumen section below. */}
              <PeriodFilter value={period} onChange={setPeriod} />
              {period === "custom" && (
                <div style={{ display: "flex", gap: 8 }}>
                  <input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} aria-label="Desde" style={{ ...inputStyle, flex: 1 }} />
                  <input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} aria-label="Hasta" min={periodFrom || undefined} style={{ ...inputStyle, flex: 1 }} />
                </div>
              )}
              {noneInPeriod ? (
                <div style={emptyCard}>
                  <CalendarDays size={26} color="#9bb0a3" strokeWidth={1.8} />
                  <p style={{ fontSize: 13.5, fontWeight: 700, color: "#3d5245", margin: "10px 0 0" }}>
                    Sin gasto en este periodo
                  </p>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "#7a8a7f", margin: "6px 0 0" }}>
                    Prueba con <strong style={{ color: "#3d5245" }}>Todo</strong> para ver tu histórico completo.
                  </p>
                </div>
              ) : (
                <>
                  {/* Headline totals for the selected period. */}
                  <SummaryStrip stats={stats} />

                  {/* Spend trend over time — day / week / month buckets, as a
                      line. Needs a real history to be worth showing at all
                      (a 2-point line from just 2 tickets isn't a "trend"),
                      so it only appears once there are ≥5 tickets recorded. */}
                  {stats.ticketCount >= 5 && (
                    <Card
                      title="Evolución del gasto"
                      headerRight={<GranToggle value={trendGran} onChange={setTrendGran} />}
                    >
                      {trend.length > 1 ? (
                        <TrendLine rows={trend} />
                      ) : (
                        <p style={{ margin: 0, padding: "18px 6px", fontSize: 12.5, fontWeight: 600, color: "#7a8a7f", textAlign: "center", lineHeight: 1.4 }}>
                          Todo tu gasto cae en un solo periodo.
                          {trendGran !== "day" && (
                            <>
                              {" "}
                              Prueba con <strong style={{ color: "#3d5245" }}>{trendGran === "month" ? "Semana" : "Día"}</strong>, o sigue
                              registrando gasto para ver la evolución.
                            </>
                          )}
                        </p>
                      )}
                    </Card>
                  )}

                  {/* Compare supermarkets — total spent + tickets per chain. */}
                  {byStore.length > 0 && (
                    <Card title="Por supermercado">
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {byStore.slice(0, 6).map((s) => (
                          <StoreSpendRow key={s.store} store={s.store} total={s.total} max={maxStore} />
                        ))}
                      </div>
                    </Card>
                  )}

                  {/* Spend by aisle — category icon + colour + colour-matched bar. */}
                  {byAisle.length > 0 && (
                    <Card title="Dónde se va el dinero">
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {byAisle.slice(0, 8).map((a) => (
                          <AisleSpendRow
                            key={a.aisle}
                            aisle={a.aisle}
                            total={a.total}
                            max={maxAisle}
                            detail={aisleDetail[a.aisle] ?? []}
                          />
                        ))}
                      </div>
                    </Card>
                  )}

                  {/* Spending habits — leading store / category / staple + ticket avg. */}
                  {stats.total > 0 && <HabitsCard stats={stats} />}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Resumen ⇄ Histórico — same full-width segmented look as PeriodFilter,
// living above whichever set of filters/content applies to each.
function GastoSubTabs({ value, onChange, ticketCount }) {
  const opts = [
    { id: "resumen", label: "Resumen" },
    { id: "historico", label: ticketCount > 0 ? `Histórico (${ticketCount})` : "Histórico" },
  ];
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {opts.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            style={{
              flex: 1,
              height: 38,
              borderRadius: 11,
              cursor: "pointer",
              fontFamily: "inherit",
              border: `1.5px solid ${active ? GREEN : "#e0eae3"}`,
              background: active ? GREEN : "#fff",
              color: active ? "#fff" : "#5a7066",
              fontSize: 12.5,
              fontWeight: 800,
              transition: "all .15s",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Fecha | súper (badge+name) | total | chevron | trash. Tapping a row
// expands it into that ticket's line items — the same shape as "En casa"'s
// table (category icon, name, cantidad, precio) minus the per-row trash
// icon, since these are historical lines, not editable live stock.
const TICKET_ROW_GRID = {
  display: "grid",
  // Fecha widened from 56 to 68px — "23 jul 26" (with year) didn't fit as
  // comfortably as the old day+month-only "23 jul".
  gridTemplateColumns: "68px minmax(0,1fr) 76px 20px 28px",
  gap: 8,
  alignItems: "center",
};

const TICKET_ITEM_GRID = {
  display: "grid",
  gridTemplateColumns: "22px minmax(0,1fr) auto 58px",
  gap: 8,
  alignItems: "center",
};

// Name, cantidad and precio all read as one sentence, same weight — the
// cantidad column used to be a smaller, muted grey and stood out as "less
// important" next to the other two for no real reason.
const ticketLineTextStyle = { fontSize: 12, fontWeight: 700, color: "#142f1d" };

// One line of a ticket's contents — read-only, so no trash icon (unlike the
// live Pantry table this mirrors: you can delete the whole ticket above, not
// pick apart a receipt that already happened). `last` skips the divider so
// the final row sits flush against the box's own bottom border.
function TicketLineRow({ o, last }) {
  const aisle = o.name ? guessShoppingAisle(o.name) : "Otros";
  const { Icon, color } = aisleMeta(aisle);
  return (
    <div style={{ ...TICKET_ITEM_GRID, padding: "8px 12px", borderBottom: last ? "none" : "1px solid #d7e3db" }}>
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: 7,
          background: `${color}18`,
          color,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={12} strokeWidth={2.3} />
      </span>
      <span style={{ ...ticketLineTextStyle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {o.name || "Producto"}
      </span>
      <span style={{ ...ticketLineTextStyle, whiteSpace: "nowrap" }}>{measureLabel(o)}</span>
      <span style={{ ...ticketLineTextStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {formatEuro(o.price)}
      </span>
    </div>
  );
}

// No outer <Card> here on purpose — this table already has its own border,
// header band and rounding, so a Card around it was just a second frame
// doubling up the padding/shadow for no reason (the Filtros button above
// already gives it a "section" feel).
function TicketHistoryTable({ receipts, obs, onDelete }) {
  const [expanded, setExpanded] = useState(null);
  return (
    <div style={{ border: "1.5px solid #e5ebe7", borderRadius: 14, overflow: "hidden", background: "#fff" }}>
      <div style={{ ...TICKET_ROW_GRID, background: "#dcebe1", borderBottom: "1px solid #c9ddd0", padding: "9px 12px" }}>
        <span style={{ ...ticketHeadCell, textAlign: "center" }}>Fecha</span>
        <span style={{ ...ticketHeadCell, textAlign: "center" }}>Supermercado</span>
        <span style={{ ...ticketHeadCell, textAlign: "center" }}>Total</span>
        <span />
        <span />
      </div>

      {receipts.length === 0 ? (
        <p style={{ margin: 0, padding: 18, fontSize: 12.5, fontWeight: 600, color: "#9db3a4", textAlign: "center" }}>
          Ningún ticket con estos filtros.
        </p>
      ) : (
        receipts.map((r, i) => {
          const last = i === receipts.length - 1;
          const isOpen = expanded === r.id;
          const lines = isOpen ? (obs ?? []).filter((o) => o.receiptId === r.id) : [];
          return (
            <div key={r.id} style={{ borderBottom: last ? "none" : "1px solid #eef3f0" }}>
              <div
                onClick={() => setExpanded(isOpen ? null : r.id)}
                style={{ ...TICKET_ROW_GRID, padding: "11px 12px", cursor: "pointer" }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: "#5a7066", textAlign: "center" }}>{formatDate(r.purchasedAt)}</span>
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, minWidth: 0 }}>
                  <StoreBadge name={r.store || "?"} size={22} maxWidth={48} />
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: "#142f1d", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.store || "Ticket"}
                  </span>
                </span>
                <span style={{ fontSize: 13, fontWeight: 900, color: GREEN, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                  {formatEuro(r.total)}
                </span>
                <ChevronDown
                  size={15}
                  strokeWidth={2.4}
                  color="#9db3a4"
                  style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .2s ease", justifySelf: "center" }}
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete?.(r.id);
                  }}
                  aria-label="Eliminar ticket"
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 8,
                    border: "none",
                    background: "transparent",
                    color: "#c0392b",
                    display: onDelete ? "inline-flex" : "none",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    flexShrink: 0,
                    justifySelf: "center",
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              {isOpen && (
                <div style={{ background: "#eef4f0", borderTop: "1px solid #d7e3db", padding: "10px 10px 12px" }}>
                  {/* Its own bordered box (same idea as the Alergias table) —
                      a flat list on the tinted background didn't read as a
                      distinct group of rows. */}
                  <div style={{ border: "1.5px solid #d7e3db", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
                    {lines.length === 0 ? (
                      <p style={{ margin: 0, padding: "10px 12px", fontSize: 11.5, fontWeight: 600, color: "#9db3a4" }}>
                        Sin detalle de productos para este ticket.
                      </p>
                    ) : (
                      lines.map((o, i) => <TicketLineRow key={o.id} o={o} last={i === lines.length - 1} />)
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

const ticketHeadCell = {
  fontSize: 10,
  fontWeight: 800,
  color: "#1c4a2e",
  letterSpacing: ".2px",
  textTransform: "uppercase",
};

const ticketFilterBtn = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 32,
  padding: "0 12px",
  borderRadius: 10,
  border: "1.5px solid #dbe7df",
  background: "#fff",
  color: GREEN,
  fontSize: 12.5,
  fontWeight: 800,
  cursor: "pointer",
  fontFamily: "inherit",
};

const ticketFilterBadge = {
  minWidth: 16,
  height: 16,
  padding: "0 4px",
  borderRadius: 999,
  background: GREEN,
  color: "#fff",
  fontSize: 10,
  fontWeight: 900,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

// Same list → sub-view drill-down sheet as Pantry's PantryFiltersSheet
// (icons, horizontal dividers, checkPop/sheetUp animations) — Fecha reuses
// the exact same bucket vocabulary (DATE_BUCKET_OPTIONS/matchesDateBucket
// from priceHistory.js) so "En casa" and "Histórico" read identically.
const TICKET_FILTER_ROWS = [
  { key: "date", label: "Fecha", icon: CalendarDays },
  { key: "store", label: "Supermercado", icon: Store },
];

function formatShortDay(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(d).replace(".", "");
}

function TicketCheckRow({ icon: Icon, label, checked, single, onToggle, last }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="ticket-filter-opt-row"
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "13px 10px",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        fontFamily: "inherit",
        borderRadius: 10,
        textAlign: "left",
        borderBottom: last ? "none" : "1px solid rgba(45,90,61,.1)",
      }}
    >
      {Icon && (
        <span style={{ flexShrink: 0, display: "flex", width: 20, justifyContent: "center" }}>
          <Icon size={17} color={GREEN} strokeWidth={2.2} />
        </span>
      )}
      <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: checked ? 800 : 600, color: checked ? GREEN : "#142f1d" }}>
        {label}
      </span>
      <span
        className="ticket-filter-check"
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
        {checked && <Check className="ticket-filter-check-icon" size={14} strokeWidth={3} />}
      </span>
    </button>
  );
}

const ticketFilterIconBtn = {
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

function TicketFiltersSheet({
  onClose,
  availableStores,
  dateFilter,
  setDateFilter,
  customFrom,
  customTo,
  setCustomFrom,
  setCustomTo,
  storeFilters,
  setStoreFilters,
  resultCount,
  activeFilterCount,
  onClear,
}) {
  const [view, setView] = useState("list");
  const current = TICKET_FILTER_ROWS.find((r) => r.key === view);

  const toggleStore = (s) =>
    setStoreFilters((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });

  const dateSummary =
    dateFilter === "custom"
      ? customFrom
        ? `${formatShortDay(customFrom)}${customTo ? ` – ${formatShortDay(customTo)}` : " →"}`
        : "Fecha concreta"
      : (DATE_BUCKET_OPTIONS.find(([id]) => id === dateFilter)?.[1] ?? "Todas");

  const summary = {
    date: dateSummary,
    store:
      storeFilters.size === 0 ? "Todos" : storeFilters.size === 1 ? [...storeFilters][0] : `${storeFilters.size} elegidos`,
  };
  const rowActive = {
    date: dateFilter === "custom" ? Boolean(customFrom) : dateFilter !== "all",
    store: storeFilters.size > 0,
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 210, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <style>{`
        @keyframes ticketSheetUp {
          from { transform: translateY(28px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes ticketCheckPop {
          0%   { transform: scale(0.5); opacity: .4; }
          55%  { transform: scale(1.18); opacity: 1; }
          100% { transform: scale(1); }
        }
        .ticket-filter-sheet-inner { animation: ticketSheetUp .22s cubic-bezier(.25,.9,.4,1) both; }
        .ticket-filter-opt-row { transition: background .16s ease; }
        .ticket-filter-opt-row:hover { background: rgba(45,90,61,.06); }
        .ticket-filter-opt-row:active { background: rgba(45,90,61,.11); }
        .ticket-filter-check-icon { animation: ticketCheckPop .22s cubic-bezier(.34,1.5,.6,1) both; }
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        className="ticket-filter-sheet-inner"
        style={{ background: "#f5f9f6", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 420, maxHeight: "72dvh", display: "flex", flexDirection: "column", overflow: "hidden" }}
      >
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 8, flexShrink: 0 }}>
          <span style={{ width: 38, height: 4, borderRadius: 999, background: "#dde7e0" }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px 12px", flexShrink: 0 }}>
          {view !== "list" ? (
            <button type="button" onClick={() => setView("list")} aria-label="Volver" style={ticketFilterIconBtn}>
              <ChevronLeft size={18} />
            </button>
          ) : null}
          <h3 style={{ flex: 1, margin: 0, fontSize: 17, fontWeight: 900, color: "#142f1d" }}>
            {view === "list" ? "Filtros" : current?.label}
          </h3>
          {view === "list" && activeFilterCount > 0 && (
            <button type="button" onClick={onClear} style={{ border: "none", background: "transparent", color: GREEN, fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", padding: "4px 6px" }}>
              Limpiar
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Cerrar" style={ticketFilterIconBtn}>
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "0 16px" }}>
          {view === "list" && (
            <div>
              {TICKET_FILTER_ROWS.map((row, i) => (
                <button
                  key={row.key}
                  type="button"
                  onClick={() => setView(row.key)}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 2px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", borderTop: i === 0 ? "none" : "1px solid #eef3f0" }}
                >
                  <row.icon size={18} color={GREEN} />
                  <span style={{ flex: 1, textAlign: "left", fontSize: 14.5, fontWeight: 700, color: "#142f1d" }}>{row.label}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: rowActive[row.key] ? GREEN : "#9ab0a1", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {summary[row.key]}
                  </span>
                  <ChevronRight size={17} color="#c2cfc7" />
                </button>
              ))}
            </div>
          )}

          {view === "date" && (
            <div style={{ paddingTop: 4 }}>
              {DATE_BUCKET_OPTIONS.map(([id, label]) => (
                <TicketCheckRow key={id} icon={CalendarDays} label={label} single checked={dateFilter === id} onToggle={() => setDateFilter(id)} />
              ))}
              <TicketCheckRow
                icon={CalendarDays}
                label="Fecha concreta"
                single
                checked={dateFilter === "custom"}
                last={dateFilter !== "custom"}
                onToggle={() => setDateFilter("custom")}
              />
              {dateFilter === "custom" && (
                <div style={{ display: "flex", gap: 8, padding: "2px 10px 16px 42px" }}>
                  <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} aria-label="Desde" style={{ ...inputStyle, background: "#fff" }} />
                  <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} aria-label="Hasta" min={customFrom || undefined} style={{ ...inputStyle, background: "#fff" }} />
                </div>
              )}
            </div>
          )}

          {view === "store" && (
            <div style={{ paddingTop: 4 }}>
              <TicketCheckRow label="Todos" checked={storeFilters.size === 0} onToggle={() => setStoreFilters(new Set())} />
              {availableStores.map((s, i) => (
                <TicketCheckRow key={s} icon={Store} label={s} checked={storeFilters.has(s)} last={i === availableStores.length - 1} onToggle={() => toggleStore(s)} />
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: "12px 16px calc(14px + env(safe-area-inset-bottom, 0px))", borderTop: "1px solid #eef3f0", flexShrink: 0 }}>
          <button type="button" onClick={onClose} style={{ width: "100%", height: 48, borderRadius: 14, border: "none", background: GREEN, color: "#fff", fontSize: 14.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
            Ver {resultCount} {resultCount === 1 ? "ticket" : "tickets"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ManualEntryModal({
  onClose,
  onAdd,
  // Pre-fill when opened from a specific shopping-list row (e.g. "Comprado"
  // → "Añadir gasto") so the user isn't retyping what's already on screen.
  initialName = "",
  initialQty = "1",
  initialUnit = "ud",
}) {
  const [name, setName] = useState(initialName);
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState(initialQty);
  const [unit, setUnit] = useState(initialUnit);
  // Single free-text "medida" box (e.g. "50 cl", "400 g") — parsed into
  // qty+unit on save for later price-per-unit maths.
  const [sizeText, setSizeText] = useState("");
  // Store picker: a select with the known chains + "Otra…" that reveals a text
  // box for local shops not on the list.
  const [storeSel, setStoreSel] = useState("");
  const [storeOther, setStoreOther] = useState("");
  const store = storeSel === "__other" ? storeOther : storeSel;
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const disabled = !name.trim() || !(parseFloat(price) > 0);
  // Bulk weight/volume (500 g, 1 L) is already fully specified by qty+unit, so
  // the "medida" (size per unit) box only shows for ud/containers where a
  // compound reading like "2 botes de 50 cl" or "1 ud de 400 g" makes sense.
  const isContainer = UNIT_OPTIONS.find((u) => u.value === unit)?.container ?? false;
  const nQty = parseFloat(qty) > 0 ? parseFloat(qty) : 1;
  const size = isContainer ? parseSize(sizeText) : null;

  const submit = () => {
    if (disabled) return;
    onAdd({
      name: name.trim(),
      price: parseFloat(price),
      qty: nQty,
      unit,
      sizeQty: size?.qty ?? null,
      sizeUnit: size?.unit ?? null,
      store: store.trim(),
      date,
    });
  };

  return (
    <WizardSheet
      icon={Wallet}
      iconColor="#2d5a3d"
      title="Añadir gasto"
      onClose={onClose}
    >
      {/* Fila 1: Producto + Precio. Ancho total = referencia para las otras 2 filas. */}
      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <div style={{ flex: "1 1 auto", minWidth: 0 }}>
          <label style={fieldLabelStyle}>Producto</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tomate triturado" autoFocus style={inputStyle} />
        </div>
        <div style={{ flex: "0 0 88px" }}>
          <label style={fieldLabelStyle}>Precio (€)</label>
          <input type="number" step="0.01" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" style={{ ...inputStyle, textAlign: "right" }} />
        </div>
      </div>

      {/* Fila 2: Cantidad fija + Unidad/Medida repartiéndose el resto — así
          suma el mismo ancho total que las filas 1 y 3, con o sin Medida. */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <div style={{ flex: "0 0 56px" }}>
          <label style={fieldLabelStyle}>Cantidad</label>
          <input type="number" step="0.01" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} style={{ ...inputStyle, textAlign: "center" }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <label style={fieldLabelStyle}>Unidad</label>
          <select value={unit} onChange={(e) => setUnit(e.target.value)} style={inputStyle}>
            {UNIT_OPTIONS.map((u) => (
              <option key={u.value} value={u.value}>{u.label}</option>
            ))}
          </select>
        </div>
        {isContainer && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <label style={fieldLabelStyle}>Medida</label>
            <input value={sizeText} onChange={(e) => setSizeText(e.target.value)} placeholder="50 cl" style={inputStyle} />
          </div>
        )}
      </div>

      {/* Fila 3: Fecha + Súper. */}
      <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
        <div style={{ flex: "0 0 132px" }}>
          <label style={fieldLabelStyle}>Fecha</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <label style={fieldLabelStyle}>Súper (opcional)</label>
          <StorePicker
            value={storeSel}
            otherValue={storeOther}
            onChange={setStoreSel}
            onOtherChange={setStoreOther}
          />
        </div>
      </div>

      <button type="button" disabled={disabled} onClick={submit} style={{ ...primaryBtn, width: "100%", opacity: disabled ? 0.5 : 1 }}>
        Guardar gasto
      </button>
    </WizardSheet>
  );
}

const fieldLabelStyle = {
  display: "block",
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: ".5px",
  textTransform: "uppercase",
  color: "#142f1d",
  marginBottom: 6,
};

// White rounded panel matching Analytics' Card (Cocina/Objetivos) — but with
// a tinted header band (same idea as the Pantry table's "En casa" header)
// instead of a plain small caption, so a title like "Hábitos de gasto" reads
// as a section, not just another line of text. Also actually wires up
// `headerRight` now — it was accepted as a prop everywhere it's used
// (GranToggle on "Evolución del gasto", etc.) but silently dropped, so that
// toggle never rendered at all.
function Card({ title, headerRight, children }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 16,
        border: "1px solid #e8f0ea",
        overflow: "hidden",
        boxShadow: "0 1px 4px rgba(20, 47, 29, 0.04)",
      }}
    >
      {(title || headerRight) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "11px 14px",
            background: "#eaf4ee",
            borderBottom: "1px solid #d8e9de",
          }}
        >
          {title && (
            <span style={{ fontSize: 14, fontWeight: 900, color: "#1c4a2e", letterSpacing: "-.2px", minWidth: 0 }}>
              {title}
            </span>
          )}
          {headerRight}
        </div>
      )}
      <div style={{ padding: "14px 14px 16px" }}>{children}</div>
    </div>
  );
}

// Fixed-width, right-aligned column so every euro amount in a list — aisles,
// stores — lands on the exact same vertical line regardless of how long the
// label next to it is. Plain dark text on purpose (no pill, no per-category
// colour): the colour-coded icon + bar already carry the category, repeating
// it on the number too just made it noisier.
const spendAmountCellStyle = {
  fontSize: 13.5,
  fontWeight: 900,
  color: "#142f1d",
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};

// One aisle in "Dónde se va el dinero": category icon badge + name + amount +
// a colour-matched bar, plus a chevron that reveals the product-level
// breakdown. Grid (not flex) so the amount column stays fixed-width and the
// trailing chevron gets its own column instead of fighting the amount for space.
function AisleSpendRow({ aisle, total, max, detail }) {
  const [open, setOpen] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const { Icon, color } = aisleMeta(aisle);
  const img = aisleImageSrc(aisle);
  const showImg = Boolean(img) && !imgFailed;
  const pct = max > 0 ? Math.max(6, Math.round((total / max) * 100)) : 0;
  const canExpand = detail.length > 0;
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "34px minmax(0,1fr) 60px 28px", alignItems: "center", gap: 10 }}>
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: 11,
            background: showImg ? `${color}1f` : color,
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            overflow: "hidden",
          }}
        >
          {showImg ? (
            <img
              src={img}
              alt=""
              onError={() => setImgFailed(true)}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          ) : (
            <Icon size={17} strokeWidth={2.2} />
          )}
        </span>
        <div style={{ minWidth: 0 }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: "#142f1d" }}>{aisle}</span>
          <div style={{ height: 8, borderRadius: 999, background: "#eef4ef", overflow: "hidden", marginTop: 6 }}>
            <div style={{ height: "100%", width: `${pct}%`, borderRadius: 999, background: color, transition: "width .35s ease" }} />
          </div>
        </div>
        <span style={spendAmountCellStyle}>{formatEuro0(total)}</span>
        <button
          type="button"
          onClick={() => canExpand && setOpen((o) => !o)}
          aria-label={open ? "Ocultar desglose" : "Ver desglose"}
          disabled={!canExpand}
          style={{
            width: 28,
            height: 28,
            flexShrink: 0,
            borderRadius: 8,
            border: "none",
            background: "transparent",
            color: canExpand ? "#7a8a7f" : "#cdd8d0",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: canExpand ? "pointer" : "default",
            padding: 0,
            justifySelf: "center",
          }}
        >
          <ChevronDown size={16} strokeWidth={2.4} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s ease" }} />
        </button>
      </div>
      {open && (
        <div style={{ marginTop: 10, marginLeft: 44, borderLeft: `2px solid ${color}22`, paddingLeft: 12 }}>
          {detail.map((d, i) => {
            const parts = (d.measure ? d.measure.split(" · ") : []).filter(Boolean);
            return (
              <div
                key={d.id ?? d.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "9px 0",
                  borderTop: i === 0 ? "none" : "1px solid #cbe5d3",
                }}
              >
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 800, color: "#142f1d", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {d.name}
                </span>
                {parts.map((p, j) => (
                  <span key={j} style={measureChipStyle}>{p}</span>
                ))}
                <span style={{ ...measureChipStyle, background: `${color}14`, borderColor: `${color}33`, color, fontWeight: 900 }}>
                  {formatEuro0(d.total)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Full-width time lens at the top of the Gasto view.
function PeriodFilter({ value, onChange }) {
  return (
    <div style={{ display: "flex", background: "#eef4ef", borderRadius: 11, padding: 3, gap: 3 }}>
      {PERIOD_OPTIONS.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            style={{
              flex: 1,
              height: 34,
              borderRadius: 8,
              border: "none",
              background: active ? "#fff" : "transparent",
              color: active ? GREEN : "#7a8a7f",
              fontSize: 12,
              fontWeight: 800,
              cursor: "pointer",
              fontFamily: "inherit",
              boxShadow: active ? "0 1px 3px rgba(20,47,29,.12)" : "none",
              transition: "all .15s",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Three headline circles: total spent, tickets, average per ticket.
function SummaryStrip({ stats }) {
  const items = [
    { value: formatEuro0(stats.total), label: "Gastado", color: GREEN },
    { value: String(stats.ticketCount), label: stats.ticketCount === 1 ? "Ticket" : "Tickets", color: "#2b7cd3" },
    { value: stats.avgTicket > 0 ? formatEuro0(stats.avgTicket) : "—", label: "Media/ticket", color: "#e07b39" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
      {items.map((it) => (
        <div
          key={it.label}
          style={{
            background: "#fff",
            borderRadius: 16,
            border: "1px solid #e8f0ea",
            boxShadow: "0 1px 4px rgba(20,47,29,.04)",
            padding: "14px 6px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            style={{
              width: 46,
              height: 46,
              borderRadius: 999,
              background: "#fff",
              border: `2.5px solid ${it.color}`,
              color: it.color,
              fontSize: it.value.length > 4 ? 12 : 14,
              fontWeight: 900,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {it.value}
          </span>
          <span style={{ fontSize: 10.5, fontWeight: 800, color: it.color, textAlign: "center", lineHeight: 1.2 }}>
            {it.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// Day / week / month lens for the trend chart.
function GranToggle({ value, onChange }) {
  const opts = [
    { id: "day", label: "Día" },
    { id: "week", label: "Sem" },
    { id: "month", label: "Mes" },
  ];
  return (
    <div style={{ display: "inline-flex", background: "#f0f4f1", borderRadius: 9, padding: 2, gap: 2, flexShrink: 0 }}>
      {opts.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            style={{
              height: 28,
              padding: "0 11px",
              borderRadius: 7,
              border: "none",
              background: active ? GREEN : "transparent",
              color: active ? "#fff" : "#7a8a7f",
              fontSize: 11.5,
              fontWeight: 800,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Line chart of spend per time bucket (last 12 shown). SVG viewBox is a
// fixed 300×100 "design space" — actual pixel width comes from the
// container (viewBox scales via `width:100%`), so the maths below never
// needs to know real pixel sizes. Purely visual (no tap-to-inspect) — the
// axes now carry the scale directly instead of hiding it behind a tap.
const TREND_W = 300;
const TREND_H = 100;
const TREND_PAD_Y = 8;
// Real (non-viewBox) pixel height of the plot area — needed for the Y-axis
// labels, which live outside the SVG so they never get the non-uniform
// horizontal stretch `preserveAspectRatio="none"` applies to everything
// inside it (text inside that SVG would end up squashed/stretched).
const TREND_PLOT_PX = 128;

function TrendLine({ rows }) {
  const shown = rows.slice(-12);
  const max = Math.max(...shown.map((r) => r.total), 1);
  const n = shown.length;
  const stepX = n > 1 ? TREND_W / (n - 1) : 0;
  const points = shown.map((r, i) => ({
    x: n > 1 ? i * stepX : TREND_W / 2,
    y: TREND_PAD_Y + (1 - r.total / max) * (TREND_H - TREND_PAD_Y * 2),
    r,
  }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
  const areaPath =
    points.length > 1
      ? `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${TREND_H} L ${points[0].x.toFixed(2)} ${TREND_H} Z`
      : "";
  // Where the axis labels/gridlines sit, as a % of the plot's real height —
  // matches the same TREND_PAD_Y inset the points themselves are plotted
  // within, so "max €" lines up with a point that actually hits the top.
  const topPct = (TREND_PAD_Y / TREND_H) * 100;
  const bottomPct = ((TREND_H - TREND_PAD_Y) / TREND_H) * 100;

  return (
    <div>
      <div style={{ display: "flex", gap: 8 }}>
        {/* Y-axis: just the two reference values (top/bottom of the plotted
            range) — real HTML text, not SVG, so it stays sharp. */}
        <div style={{ position: "relative", width: 32, height: TREND_PLOT_PX, flexShrink: 0 }}>
          <span style={{ position: "absolute", top: `${topPct}%`, right: 0, transform: "translateY(-50%)", fontSize: 9.5, fontWeight: 800, color: "#9db3a4", whiteSpace: "nowrap" }}>
            {formatEuro0(max)}
          </span>
          <span style={{ position: "absolute", top: `${bottomPct}%`, right: 0, transform: "translateY(-50%)", fontSize: 9.5, fontWeight: 800, color: "#9db3a4", whiteSpace: "nowrap" }}>
            0 €
          </span>
        </div>

        <div style={{ position: "relative", flex: 1, minWidth: 0, height: TREND_PLOT_PX }}>
          <svg
            viewBox={`0 0 ${TREND_W} ${TREND_H}`}
            preserveAspectRatio="none"
            style={{ width: "100%", height: "100%", display: "block", overflow: "visible" }}
          >
            <defs>
              <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={GREEN} stopOpacity="0.2" />
                <stop offset="100%" stopColor={GREEN} stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* Axes — a left (Y) and bottom (X) reference line, so the curve
                isn't floating with no frame of reference. */}
            <line x1="0" y1="0" x2="0" y2={TREND_H} stroke="#d7e3db" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
            <line x1="0" y1={TREND_H} x2={TREND_W} y2={TREND_H} stroke="#d7e3db" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
            {areaPath && <path d={areaPath} fill="url(#trendFill)" stroke="none" />}
            {areaPath && (
              <path d={linePath} fill="none" stroke={GREEN} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            )}
            {points.map((p) => (
              <circle
                key={p.r.key}
                cx={p.x}
                cy={p.y}
                r={3}
                fill={p.r.total > 0 ? GREEN : "#cdd8d0"}
                stroke="#fff"
                strokeWidth={1.4}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
        </div>
      </div>

      <div style={{ display: "flex", gap: 5, marginTop: 6, paddingLeft: 40 }}>
        {shown.map((r) => (
          <span
            key={r.key}
            style={{
              flex: 1,
              textAlign: "center",
              fontSize: 9,
              fontWeight: 800,
              color: "#9db3a4",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              minWidth: 0,
            }}
          >
            {r.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// One supermarket in "Por supermercado": badge + name + total spent + a
// full-width colour-matched bar (item count intentionally dropped — it read
// as noise and didn't tell the user anything useful).
function StoreSpendRow({ store, total, max }) {
  const pct = max > 0 ? Math.max(6, Math.round((total / max) * 100)) : 0;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "34px minmax(0,1fr) 60px", alignItems: "center", gap: 10 }}>
      {/* This is a fixed 34px grid track — cap the logo's width to match so
          a wide wordmark (Mercadona) can't spill into the name column next
          to it the way it did in the store picker before it got this cap. */}
      <StoreBadge name={store} size={34} maxWidth={32} />
      <div style={{ minWidth: 0 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: "#142f1d", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
          {store}
        </span>
        <div style={{ height: 8, borderRadius: 999, background: "#eef4ef", overflow: "hidden", marginTop: 6 }}>
          <div style={{ height: "100%", width: `${pct}%`, borderRadius: 999, background: GREEN, transition: "width .35s ease" }} />
        </div>
      </div>
      <span style={spendAmountCellStyle}>{formatEuro0(total)}</span>
    </div>
  );
}

// Small tinted circle badge for the rows that don't have a real logo (aisle,
// frequency, avg ticket) — same footprint (34px) as StoreBadge below, so
// every row's leading element lines up regardless of which kind it is.
function habitIconBadge(color) {
  return {
    width: 34,
    height: 34,
    borderRadius: 11,
    background: `${color}18`,
    color,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  };
}

// Smaller version for the "which one exactly" confirmation badge parked at
// the far right of a HabitsCard row (category icon next to "Categoría top").
function habitIconBadgeSmall(color) {
  return {
    width: 22,
    height: 22,
    borderRadius: 7,
    background: `${color}18`,
    color,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  };
}

const habitValueTextStyle = {
  fontSize: 13.5,
  fontWeight: 900,
  color: "#142f1d",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

function AisleMiniChip({ aisle, size = 22 }) {
  const { Icon, color } = aisleMeta(aisle);
  const img = aisleImageSrc(aisle);
  const [failed, setFailed] = useState(false);
  return (
    <span
      style={{
        width: size, height: size, borderRadius: Math.round(size * 0.32),
        background: img && !failed ? `${color}1f` : `${color}18`,
        color, display: "inline-flex", alignItems: "center",
        justifyContent: "center", flexShrink: 0, overflow: "hidden",
      }}
    >
      {img && !failed
        ? <img src={img} alt="" onError={() => setFailed(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        : <Icon size={Math.round(size * 0.58)} strokeWidth={2.3} />}
    </span>
  );
}

// Leading store / category / staple + ticket average, from the user's data.
// No separate amount column on purpose — "Mercadona 38€" / "Aceites y
// conservas 9€" already duplicated the exact totals "Por supermercado" and
// "Dónde se va el dinero" show a few cards up; this one's just "who/what".
// "Día que más gastas" got dropped too — in practice it's just whichever day
// you do the weekly shop, not a real habit — swapped for "Más comprado", the
// ingredient bought the most separate times (your actual staple).
// Each row: generic "dimension" icon on the left (same language as every
// other icon+label row in the app) + a flexible right-hand slot. "Súper
// favorito" shows ONLY the real store logo, sized to actually read — text +
// a thumbnail-squashed logo was redundant AND illegible (Mercadona's file is
// a ~7:1 wordmark; forcing it into a tiny square crushed it to a sliver, see
// StoreBadge). "Categoría top" keeps text + a small category-icon badge.
function HabitsCard({ stats }) {
  const aisleIcon = stats.topAisle ? aisleMeta(stats.topAisle.aisle) : null;
  const rows = [
    stats.topStore && {
      key: "store",
      Icon: Store,
      color: "#2b7cd3",
      label: "Súper favorito",
      right: <StoreBadge name={stats.topStore.store} size={30} maxWidth={130} />,
    },
    stats.topAisle && {
      key: "aisle",
      Icon: Package,
      color: "#7c5cbf",
      label: "Categoría top",
      right: (
        <>
          <span style={habitValueTextStyle}>{stats.topAisle.aisle}</span>
          <AisleMiniChip aisle={stats.topAisle.aisle} size={22} />
        </>
      ),
    },
    stats.topIngredient && {
      key: "ingredient",
      Icon: Repeat,
      color: "#c463a0",
      label: "Más comprado",
      right: <span style={habitValueTextStyle}>{stats.topIngredient.name}</span>,
    },
    stats.avgTicket > 0 && {
      key: "ticket",
      Icon: Receipt,
      color: "#e07b39",
      label: "Ticket medio",
      right: <span style={habitValueTextStyle}>{formatEuro(stats.avgTicket)}</span>,
    },
  ].filter(Boolean);
  if (!rows.length) return null;
  return (
    <Card title="Hábitos de gasto">
      <div style={{ display: "flex", flexDirection: "column" }}>
        {rows.map((r, i) => (
          <div
            key={r.key}
            style={{
              display: "grid",
              gridTemplateColumns: "34px minmax(0, 1fr) auto",
              alignItems: "center",
              gap: 12,
              padding: "10px 0",
              borderTop: i === 0 ? "none" : "1px solid #eef2ef",
            }}
          >
            <span style={habitIconBadge(r.color)}>
              <r.Icon size={17} strokeWidth={2.2} />
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "#7a8a7f", minWidth: 0 }}>{r.label}</span>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, minWidth: 0 }}>
              {r.right}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

const measureChipStyle = {
  flexShrink: 0,
  fontSize: 11.5,
  fontWeight: 700,
  color: "#526057",
  background: "#f0f4f1",
  border: "1px solid #dce8e0",
  borderRadius: 8,
  padding: "3px 8px",
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums",
};

function formatDate(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || isNaN(d.getTime())) return "—";
  // DD/MM/AA ("23/07/26") — compact enough for the narrow Fecha column while
  // still telling two tickets from different years apart.
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

const primaryBtn = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "13px 16px",
  borderRadius: 14,
  border: "none",
  background: GREEN,
  color: "#fff",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
  fontFamily: "inherit",
  boxShadow: "0 6px 18px rgba(45,90,61,.28)",
};

const emptyCard = {
  textAlign: "center",
  padding: "34px 22px",
  background: "#fff",
  border: "1px solid #e8f0ea",
  borderRadius: 16,
};

const inputStyle = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: 10,
  // White on the WizardSheet's tinted green background — that's what makes
  // the field read as a distinct box, not a same-color border on white.
  border: "1px solid #cfe0d6",
  fontSize: 13.5,
  fontWeight: 600,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
  color: "#142f1d",
  background: "#fff",
};

