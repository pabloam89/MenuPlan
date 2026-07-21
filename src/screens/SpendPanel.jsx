import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Apple,
  Bean,
  Check,
  ChevronDown,
  Croissant,
  Drumstick,
  Egg,
  Fish,
  Home,
  Leaf,
  Milk,
  Package,
  Plus,
  ShoppingBag,
  Sprout,
  Store,
  Trash2,
  Wallet,
  Wheat,
  X,
} from "lucide-react";
import { WizardSheet } from "../components/ui.jsx";
import {
  estimateListCost,
  formatEuro,
  formatEuro0,
  ingredientIdFor,
  matchReceiptLine,
  spendByAisle,
  spendByAisleDetail,
} from "../lib/priceHistory.js";
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
  const key = Object.keys(STORE_LOGOS).find((k) => {
    const file = k.slice(k.lastIndexOf("/") + 1);
    return file.slice(0, file.lastIndexOf(".")) === slug;
  });
  return key ? STORE_LOGOS[key] : null;
}

function StoreBadge({ name, size = 24 }) {
  const url = storeLogoUrl(name);
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        width={size}
        height={size}
        style={{ width: size, height: size, borderRadius: 6, objectFit: "contain", flexShrink: 0, background: "#fff" }}
      />
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
                <StoreBadge name={opt.value} size={24} />
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
// selection, not itself an interactive control.
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
};

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
        {value ? <StoreBadge name={value} size={26} /> : <Store size={18} color="#9aa8a0" strokeWidth={2} />}
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
export function SpendPanel({ data, setData, shopping, onUndoReceiptTachado, onToast }) {
  const { user } = useAuth();
  const obs = data.priceObs ?? [];
  const receipts = data.receipts ?? [];
  const [openReceiptId, setOpenReceiptId] = useState(null);

  const byAisle = useMemo(() => spendByAisle(obs), [obs]);
  const aisleDetail = useMemo(() => spendByAisleDetail(obs), [obs]);
  const maxAisle = byAisle[0]?.total ?? 0;

  const menuEstimate = useMemo(
    () => estimateListCost(shopping?.items ?? [], obs),
    [shopping, obs],
  );
  // Days the current shopping list actually spans (distinct days across item
  // sources), so "por día / por mes" scale off the real menu length, not a
  // hardcoded 7. Falls back to a week when there's no day info.
  const menuDays = useMemo(() => {
    const days = new Set();
    for (const it of shopping?.items ?? []) {
      for (const s of it.sources ?? []) if (s.day) days.add(s.day);
    }
    return days.size > 0 ? days.size : 7;
  }, [shopping]);
  const [estScope, setEstScope] = useState("semana");
  const estValue =
    estScope === "dia"
      ? menuEstimate.total / menuDays
      : estScope === "mes"
        ? (menuEstimate.total / menuDays) * 30
        : menuEstimate.total;

  // Deleting a ticket undoes everything it caused, not just its spend
  // numbers: un-tacha the list items it marked bought (through the same
  // multi-week write path the wizard used, so the undo persists and reaches
  // every week the ticket touched — see App.undoReceiptTachado) and removes
  // the pantry entries it created (leaves anything the user added separately).
  const deleteReceipt = (receiptId) => {
    const receipt = receipts.find((r) => r.id === receiptId);
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
    setOpenReceiptId((cur) => (cur === receiptId ? null : cur));
    onToast?.(tachedKeys.length || receipt?.pantryIds?.length ? "Ticket eliminado · deshecho de la lista y de En casa" : "Ticket eliminado");
  };

  const empty = obs.length === 0;

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
          {/* Estimated cost of current menu — ONLY from prices the user recorded.
              Metric-in-circle KPI + day/week/month toggle, inside a card. */}
          {menuEstimate.matched > 0 && (
            <Card>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <KpiStat color="#e07b39" value={formatEuro0(estValue)} label="Coste del menú" />
                <ScopeToggle value={estScope} onChange={setEstScope} />
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

          {/* Receipts inbox */}
          {receipts.length > 0 && (
            <Card title={`Tickets subidos · ${receipts.length}`}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {receipts.map((r) => {
                  const open = openReceiptId === r.id;
                  const lines = open ? obs.filter((o) => o.receiptId === r.id) : [];
                  return (
                    <div key={r.id} style={{ borderBottom: "1px solid #eef2ef" }}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setOpenReceiptId(open ? null : r.id)}
                        onKeyDown={(e) => e.key === "Enter" && setOpenReceiptId(open ? null : r.id)}
                        style={{ ...receiptRow, borderBottom: "none", cursor: "pointer" }}
                      >
                        {r.store ? (
                          <StoreBadge name={r.store} size={34} />
                        ) : (
                          <span style={receiptIcon}>
                            <Store size={16} color={GREEN} strokeWidth={2.2} />
                          </span>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 800, color: "#142f1d", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {r.store || "Ticket"}
                          </div>
                          <div style={{ fontSize: 11.5, fontWeight: 600, color: "#7a8a7f" }}>
                            {formatDate(r.purchasedAt)} · {r.lineCount} productos
                          </div>
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 900, color: GREEN, fontVariantNumeric: "tabular-nums" }}>
                          {formatEuro(r.total)}
                        </span>
                        <ChevronDown
                          size={15}
                          color="#9db3a4"
                          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s", flexShrink: 0 }}
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteReceipt(r.id);
                          }}
                          style={smallIconBtn}
                          aria-label="Eliminar ticket"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      {open && (
                        <div style={{ padding: "0 0 12px 44px", display: "flex", flexDirection: "column", gap: 6 }}>
                          {lines.length === 0 ? (
                            <div style={{ fontSize: 12, fontWeight: 600, color: "#9db3a4" }}>Sin líneas guardadas</div>
                          ) : (
                            lines.map((l) => (
                              <div key={l.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5 }}>
                                <span style={{ color: "#3a4a3f", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {l.name}
                                </span>
                                <span style={{ color: "#7a8a7f", fontWeight: 600, flexShrink: 0 }}>
                                  {l.qty} {l.unit} · {formatEuro(l.price)}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      )}
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

// KPI with the metric INSIDE the coloured ring and the name OUTSIDE — the exact
// model used by Cocina's CookKpiStrip.
function KpiStat({ color, value, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span
        style={{
          width: 52,
          height: 52,
          borderRadius: 999,
          background: "#fff",
          border: `2.5px solid ${color}`,
          color,
          fontSize: 14,
          fontWeight: 900,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
      <span style={{ fontSize: 12, fontWeight: 800, color, lineHeight: 1.25, letterSpacing: "-.1px" }}>{label}</span>
    </div>
  );
}

// Compact day/week/month lens for the estimate (lives outside any card).
function ScopeToggle({ value, onChange }) {
  const opts = [
    { id: "dia", label: "Día" },
    { id: "semana", label: "Sem" },
    { id: "mes", label: "Mes" },
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

// White rounded panel matching Analytics' Card (Cocina/Objetivos).
function Card({ title, children }) {
  return (
    <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e8f0ea", padding: "16px 14px", boxShadow: "0 1px 4px rgba(20, 47, 29, 0.04)" }}>
      {title && (
        <div style={{ fontSize: 13, fontWeight: 900, color: "#142f1d", letterSpacing: "-.2px", marginBottom: 12 }}>
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

// One aisle in "Dónde se va el dinero": category icon badge + name + amount + a
// colour-matched bar, plus a chevron that reveals the product-level breakdown.
function AisleSpendRow({ aisle, total, max, detail }) {
  const [open, setOpen] = useState(false);
  const { Icon, color } = aisleMeta(aisle);
  const pct = max > 0 ? Math.max(6, Math.round((total / max) * 100)) : 0;
  const canExpand = detail.length > 0;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: 11,
            background: color,
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon size={17} strokeWidth={2.2} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: "#142f1d" }}>{aisle}</span>
            <span style={{ fontSize: 13, fontWeight: 900, color, fontVariantNumeric: "tabular-nums" }}>{formatEuro0(total)}</span>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: "#eef4ef", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, borderRadius: 999, background: color, transition: "width .35s ease" }} />
          </div>
        </div>
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
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
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

const receiptRow = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 0",
  borderBottom: "1px solid #eef2ef",
};

const receiptIcon = {
  width: 34,
  height: 34,
  borderRadius: 10,
  background: "#eef4ef",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const smallIconBtn = {
  width: 32,
  height: 32,
  borderRadius: 9,
  border: "1px solid #e0eae3",
  background: "#fff",
  color: "#7a8a7f",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  fontFamily: "inherit",
  flexShrink: 0,
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

