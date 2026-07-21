import { useEffect, useState } from "react";
import {
  Apple,
  Bean,
  Croissant,
  Drumstick,
  Egg,
  Fish,
  House,
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
  clearPantry,
  setPantryItemQty,
  loadLocalPantry,
  removeLocalPantryItem,
  clearLocalPantry,
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
const MINT_BG = "#eaf3ec";
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

// name | categoría (icon) | peso | cantidad | precio | trash
const ROW_GRID = {
  display: "grid",
  gridTemplateColumns: "minmax(0,1.3fr) 28px minmax(52px,0.7fr) minmax(52px,0.75fr) minmax(52px,0.65fr) 28px",
  gap: 6,
  alignItems: "center",
};

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

  const handleClear = async () => {
    if (items.length === 0) return;
    if (!window.confirm("¿Vaciar todo lo que tienes en casa?")) return;
    setItems([]);
    if (user) await clearPantry(user.id);
    else clearLocalPantry();
  };

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
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
                padding: "0 2px",
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 8,
                    background: MINT_BG,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <House size={13} color={GREEN} />
                </span>
                <span style={{ fontSize: 13, fontWeight: 800, color: GREEN }}>
                  {loading ? "…" : `${items.length} ${items.length === 1 ? "ingrediente" : "ingredientes"}`}
                </span>
              </span>
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={handleClear}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    border: "none",
                    background: "transparent",
                    color: "#c0392b",
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    padding: 0,
                  }}
                >
                  <Trash2 size={13} /> Vaciar todo
                </button>
              )}
            </div>

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
                  <div
                    style={{
                      ...ROW_GRID,
                      background: GREEN,
                      padding: "9px 10px",
                    }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 800, color: "#fff", letterSpacing: ".2px" }}>
                      Ingrediente
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        color: "#fff",
                        textAlign: "center",
                        letterSpacing: ".2px",
                      }}
                      title="Categoría"
                    >
                      Cat.
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: "#fff", textAlign: "center", letterSpacing: ".2px" }}>
                      Peso
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: "#fff", textAlign: "center", letterSpacing: ".2px" }}>
                      Cantidad
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: "#fff", textAlign: "center", letterSpacing: ".2px" }}>
                      Precio
                    </span>
                    <span />
                  </div>
                  {items.map((item, i) => {
                    const editing = editingId === item.id;
                    const aisle = guessShoppingAisle(item.ingredientName);
                    const { peso, cantidad } = splitStockDisplay(item.ingredientName, item.qty, item.unit);
                    const priceLabel = stockPriceLabel(item, priceObs);
                    return (
                      <div
                        key={item.id}
                        style={{
                          ...ROW_GRID,
                          padding: "10px",
                          borderBottom: i === items.length - 1 ? "none" : "1px solid #eef3f0",
                        }}
                      >
                        <span
                          style={{
                            minWidth: 0,
                            fontSize: 13,
                            fontWeight: 700,
                            color: INK,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={item.ingredientName}
                        >
                          {item.ingredientName}
                        </span>
                        <AisleIcon aisle={aisle} />
                        {editing ? (
                          <span style={{ gridColumn: "3 / 5", display: "flex", gap: 4, justifyContent: "center", minWidth: 0 }}>
                            <input
                              type="text"
                              inputMode="decimal"
                              autoFocus
                              value={editQty}
                              onChange={(e) => setEditQty(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && saveEdit(item.id)}
                              style={{ ...fieldStyle, width: 36, flexShrink: 0, padding: "5px 2px", fontSize: 12, textAlign: "center" }}
                            />
                            <select
                              value={editUnit}
                              onChange={(e) => setEditUnit(e.target.value)}
                              style={{ ...fieldStyle, width: 48, flexShrink: 0, padding: "5px 2px", fontSize: 12 }}
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
                                padding: "5px 7px",
                                borderRadius: 8,
                                border: "none",
                                background: GREEN,
                                color: "#fff",
                                fontSize: 11,
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
                            <button
                              type="button"
                              onClick={() => startEdit(item)}
                              aria-label={`Editar peso de ${item.ingredientName}`}
                              style={{
                                justifySelf: "center",
                                padding: "4px 6px",
                                borderRadius: 8,
                                border: "1.5px solid #e8efe9",
                                background: "#f7faf8",
                                color: peso === "—" ? MUTED : INK,
                                fontSize: 12,
                                fontWeight: 700,
                                fontFamily: "inherit",
                                cursor: "pointer",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {peso}
                            </button>
                            <button
                              type="button"
                              onClick={() => startEdit(item)}
                              aria-label={`Editar cantidad de ${item.ingredientName}`}
                              style={{
                                justifySelf: "center",
                                padding: "4px 6px",
                                borderRadius: 8,
                                border: "1.5px solid #e8efe9",
                                background: "#f7faf8",
                                color: cantidad === "—" ? MUTED : INK,
                                fontSize: 12,
                                fontWeight: 700,
                                fontFamily: "inherit",
                                cursor: "pointer",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {cantidad}
                            </button>
                          </>
                        )}
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: priceLabel === "—" ? MUTED : INK,
                            textAlign: "center",
                            whiteSpace: "nowrap",
                          }}
                          title={priceLabel === "—" ? "Sin precio en tus tickets" : "Estimado con tus compras"}
                        >
                          {priceLabel}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemove(item.id)}
                          aria-label={`Quitar ${item.ingredientName}`}
                          style={{
                            width: 28,
                            height: 28,
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
