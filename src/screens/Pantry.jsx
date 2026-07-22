import { useEffect, useState } from "react";
import {
  Apple,
  Bean,
  Croissant,
  Drumstick,
  Egg,
  Fish,
  Leaf,
  Milk,
  Package,
  Sprout,
  Trash2,
  Wheat,
} from "lucide-react";
import { PantryInput } from "../components/PantryInput.jsx";
import { BottomNav, bottomNavSpacer } from "../components/ui.jsx";
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
  shoppingUnitsLabel,
  toCanonicalStockQty,
} from "../lib/kitchenUnits.js";
import { guessShoppingAisle } from "../lib/ingredientCategories.js";
import { estimateListCost, formatEuro } from "../lib/priceHistory.js";

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
  return {
    peso: formatStockQty(n, unit),
    cantidad: shoppingUnitsLabel(name, n, unit) ?? "—",
  };
}

const PAGE_BG = "#f7f9f7";
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

const headerBtn = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "8px 14px",
  borderRadius: 10,
  border: "1.5px solid #2d5a3d",
  background: "#fff",
  color: GREEN,
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};

const pageTitle = { fontSize: 22, fontWeight: 900, color: INK, margin: 0, letterSpacing: "-.5px" };

const cardShadow = "0 2px 10px rgba(20,47,29,.05)";

const fieldStyle = {
  boxSizing: "border-box",
  borderRadius: 10,
  border: "1.5px solid #e8efe9",
  fontFamily: "inherit",
  color: INK,
  outline: "none",
  background: "#fff",
};

// name (wraps, gets all spare width) | categoría (icon) | valor (toggled:
// cantidad/peso/precio) | trash. Collapsing the three data columns into one
// toggled column is what frees the horizontal room the name needs on mobile.
const ROW_GRID = {
  display: "grid",
  gridTemplateColumns: "minmax(0,1fr) 26px 78px 26px",
  gap: 8,
  alignItems: "center",
};

const STOCK_VIEWS = [
  ["cantidad", "Cantidad"],
  ["peso", "Peso"],
  ["precio", "Precio"],
];

function AisleIcon({ aisle, size = 26 }) {
  const meta = AISLE_UI[aisle] ?? { Icon: Package, color: "#64748b" };
  const Icon = meta.Icon;
  return (
    <span
      title={aisle}
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        background: meta.color,
        color: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        justifySelf: "center",
      }}
    >
      <Icon size={size * 0.5} strokeWidth={2.2} />
    </span>
  );
}

/**
 * "En casa" — nevera + despensa: lo que tienes disponible para cocinar.
 * Reached from Compra / nav Inicio. Works signed out via localStorage mirror
 * (lib/pantry.js); merge on login folds it into the account.
 */
export function PantryScreen({
  user,
  onBack,
  priceObs = [],
  onNav,
  navActive = "pantry",
  navContext = "home",
  // When true (onboarding «¿Qué repetimos?»), skip page chrome / BottomNav
  // so the stock UI nests inside the parent panel.
  embedded = false,
  // Bumps after login merge so we reload once local→cloud fold finishes.
  pantryEpoch = 0,
}) {
  const [items, setItems] = useState(() => (user ? [] : loadLocalPantry()));
  const [loading, setLoading] = useState(() => Boolean(user));
  const [editingId, setEditingId] = useState(null);
  const [editQty, setEditQty] = useState(1);
  const [editUnit, setEditUnit] = useState("ud");
  // Which reading the single value column shows (mobile: one column, toggled).
  const [stockView, setStockView] = useState("cantidad");
  const viewLabel = stockView === "peso" ? "Peso" : stockView === "precio" ? "Precio" : "Cantidad";

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
    setItems((prev) => (qty > 0 ? prev.map((i) => (i.id === id ? { ...i, qty, unit } : i)) : prev.filter((i) => i.id !== id)));
    setEditingId(null);
    if (user) await setPantryItemQty(user.id, id, qty, unit);
    else setLocalPantryItemQty(id, qty, unit);
  };

  const content = (
    <>
      {!embedded && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <button type="button" onClick={onBack} style={headerBtn}>
              Atrás
            </button>
            <h2 style={pageTitle}>En casa</h2>
          </div>
          <p style={{ margin: "0 0 14px 2px", fontSize: 12.5, color: "#7a8a7f", lineHeight: 1.4 }}>
            Nevera y despensa, listo para tus recetas.
          </p>
        </>
      )}

        {(loading || items.length > 0) && (
          <>
            {!loading && items.length > 0 && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                <div
                  style={{
                    display: "inline-flex",
                    gap: 2,
                    padding: 2,
                    borderRadius: 10,
                    background: "#eef4ef",
                    border: "1px solid #dce8e0",
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
                          padding: "5px 11px",
                          borderRadius: 8,
                          border: "none",
                          cursor: "pointer",
                          fontFamily: "inherit",
                          fontSize: 11.5,
                          fontWeight: 800,
                          background: on ? GREEN : "transparent",
                          color: on ? "#fff" : "#5a7066",
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div
              style={{
                background: "#fff",
                border: "1.5px solid #e5ebe7",
                borderRadius: 16,
                overflow: "hidden",
                marginBottom: 14,
                boxShadow: cardShadow,
              }}
            >
              {loading ? (
                <p style={{ margin: 0, padding: 14, fontSize: 13, color: MUTED }}>Cargando…</p>
              ) : (
                <>
                  <div style={{ ...ROW_GRID, background: GREEN, padding: "9px 10px" }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: "#fff", letterSpacing: ".2px" }}>
                      Ingrediente
                    </span>
                    <span
                      style={{ fontSize: 10, fontWeight: 800, color: "#fff", textAlign: "center", letterSpacing: ".2px" }}
                      title="Categoría"
                    >
                      Cat.
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: "#fff", textAlign: "center", letterSpacing: ".2px" }}>
                      {viewLabel}
                    </span>
                    <span />
                  </div>
                  {items.map((item, i) => {
                    const editing = editingId === item.id;
                    const aisle = guessShoppingAisle(item.ingredientName);
                    const { peso, cantidad } = splitStockDisplay(item.ingredientName, item.qty, item.unit);
                    const priceLabel = stockPriceLabel(item, priceObs);
                    const valueText =
                      stockView === "peso" ? peso : stockView === "precio" ? priceLabel : cantidad;
                    return (
                      <div
                        key={item.id}
                        style={{
                          ...ROW_GRID,
                          padding: "10px",
                          borderBottom: i === items.length - 1 ? "none" : "1px solid #eef3f0",
                        }}
                      >
                        {editing ? (
                          <span style={{ gridColumn: "1 / 4", display: "flex", gap: 6, alignItems: "center", minWidth: 0 }}>
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
                        ) : (
                          <>
                            <span
                              style={{
                                minWidth: 0,
                                fontSize: 13,
                                fontWeight: 700,
                                color: INK,
                                lineHeight: 1.25,
                                whiteSpace: "normal",
                                overflowWrap: "anywhere",
                              }}
                            >
                              {item.ingredientName}
                            </span>
                            <AisleIcon aisle={aisle} />
                            {stockView === "precio" ? (
                              <span
                                style={{
                                  justifySelf: "center",
                                  fontSize: 12.5,
                                  fontWeight: 800,
                                  color: valueText === "—" ? MUTED : INK,
                                  textAlign: "center",
                                }}
                                title={valueText === "—" ? "Sin precio en tus tickets" : "Estimado con tus compras"}
                              >
                                {valueText}
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => startEdit(item)}
                                aria-label={`Editar ${viewLabel.toLowerCase()} de ${item.ingredientName}`}
                                title="Tocar para editar la cantidad"
                                style={{
                                  justifySelf: "stretch",
                                  padding: "5px 6px",
                                  borderRadius: 8,
                                  border: "1.5px solid #e8efe9",
                                  background: "#f7faf8",
                                  color: valueText === "—" ? MUTED : INK,
                                  fontSize: 12,
                                  fontWeight: 700,
                                  fontFamily: "inherit",
                                  cursor: "pointer",
                                  lineHeight: 1.2,
                                }}
                              >
                                {valueText}
                              </button>
                            )}
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
                  })}
                </>
              )}
            </div>
          </>
        )}

        <div>
          <p style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 900, color: INK }}>Añadir ingredientes</p>
          <div style={{ height: 1, background: "#e5ebe7", marginBottom: 12 }} />
          <PantryInput onSaved={handleSaved} />
        </div>
    </>
  );

  if (embedded) {
    return <div>{content}</div>;
  }

  return (
    <div style={{ background: PAGE_BG, minHeight: "100dvh" }}>
      <div style={{ padding: `20px 16px calc(${bottomNavSpacer()} + 28px)` }}>
        {content}
      </div>
      {onNav && <BottomNav active={navActive} onNav={onNav} context={navContext} />}
    </div>
  );
}
