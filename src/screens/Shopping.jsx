import { useEffect, useMemo, useRef, useState } from "react";
import {
  Apple,
  Bean,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Coffee,
  Croissant,
  Drumstick,
  Egg,
  Fish,
  Home,
  Leaf,
  Loader2,
  Milk,
  Moon,
  Package,
  Plus,
  Receipt,
  Share2,
  ShoppingCart,
  Sprout,
  Sun,
  Trash2,
  Undo2,
  Wheat,
  X,
} from "lucide-react";
import {
  BottomNav,
  SegmentedControl,
  bottomNavSpacer,
} from "../components/ui.jsx";
import { INGREDIENT_CATEGORIES } from "../data/recipes.js";
import { normalizeIngredientKey } from "../lib/ingredientCategories.js";
import { kitchenHint } from "../lib/kitchenUnits.js";
import { extractReceiptProducts } from "../lib/receiptParser.js";
import {
  enrichItem,
  formatDisplay,
  isActiveItem,
  isDoneItem,
  isPantryItem,
  itemsByAisle,
  mergeShoppingItems,
  matchReceiptProducts,
} from "../lib/shoppingListUtils.js";
import { formatWeekRangeLabel, getWeekDates } from "../lib/weekCalendar.js";
import { shareShoppingList } from "../lib/menuExport.js";

const DAY_LETTERS = { Lun: "L", Mar: "M", Mié: "X", Jue: "J", Vie: "V", Sáb: "S", Dom: "D" };

const MEAL_BADGE = {
  Desayuno: { Icon: Coffee, color: "#a16207" },
  Comida: { Icon: Sun, color: "#0d9488" },
  Cena: { Icon: Moon, color: "#6366f1" },
};

const ICON_LEGEND_HEADER = [
  { icon: Receipt, label: "Ticket", hint: "Sube una foto y marca lo comprado." },
  { icon: Plus, label: "Añadir", hint: "Añade un producto a mano." },
];

const ICON_LEGEND_ROW = [
  { icon: Home, label: "En casa", hint: "Ya lo tienes. Sale de la lista." },
  { icon: Check, label: "Comprado", hint: "Lo acabas de comprar." },
  { icon: BookOpen, label: "Recetas", hint: "Días y platos donde entra." },
  { icon: Trash2, label: "Quitar", hint: "Eliminar de la lista." },
];

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
  // Not a real store aisle — the "Despensa" section (ingredients matched
  // against the user's saved pantry, see src/lib/pantry.js). Named "Despensa"
  // to match "Tu despensa" in Tu perfil, now that the supermarket aisle above
  // has its own distinct name and doesn't collide with it.
  __pantry: { Icon: Home, color: "#8a6d1f" },
};

export function ShoppingScreen({ shopping, setShopping, onNav, onToast }) {
  const [listScope, setListScope] = useState("pending");
  const [openSections, setOpenSections] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  const [showLegend, setShowLegend] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receiptMatches, setReceiptMatches] = useState(null);
  const [editingQtyId, setEditingQtyId] = useState(null);
  const fileRef = useRef(null);

  const weekLabel = formatWeekRangeLabel(getWeekDates());

  useEffect(() => {
    setShopping((s) => {
      const merged = mergeShoppingItems(s.items);
      const same =
        merged.length === s.items.length &&
        merged.every(
          (it, i) => it.id === s.items[i]?.id && it.category === s.items[i]?.category
        );
      return same ? s : { items: merged };
    });
  }, [setShopping]);

  const patchItem = (id, patch) =>
    setShopping((s) => ({
      ...s,
      items: mergeShoppingItems(
        s.items.map((it) =>
          normalizeIngredientKey(it.name, it.unit ?? "ud") === id ? { ...it, ...patch } : it
        )
      ),
    }));

  const removeItem = (id) =>
    setShopping((s) => ({
      ...s,
      items: s.items.filter(
        (it) => normalizeIngredientKey(it.name, it.unit ?? "ud") !== id
      ),
    }));

  const addItem = (newItem) =>
    setShopping((s) => ({
      ...s,
      items: [
        ...s.items,
        {
          ...newItem,
          id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          have: false,
          atHome: false,
          manual: true,
          sources: [],
        },
      ],
    }));

  const markPurchased = (ids) =>
    setShopping((s) => ({
      ...s,
      items: s.items.map((it) => (ids.includes(it.id) ? { ...it, have: true } : it)),
    }));

  const saveItemQty = (id, rawValue) => {
    const parsed = parseFloat(String(rawValue).replace(",", "."));
    if (!isNaN(parsed) && parsed > 0) {
      const item = mergedItems.find((it) => it.id === id);
      if (item) {
        patchItem(id, {
          qty: parsed,
          displayQty: formatDisplay(parsed, item.unit ?? "ud"),
        });
      }
    }
    setEditingQtyId(null);
  };

  const mergedItems = useMemo(
    () => mergeShoppingItems(shopping.items),
    [shopping.items]
  );
  // Pantry matches get their own "Despensa" section (always shown, regardless
  // of the pending/done toggle below) instead of being mixed into the aisle
  // groups or the manual "en casa"/"comprado" bookkeeping.
  const shoppingOnlyItems = useMemo(
    () => mergedItems.filter((it) => !isPantryItem(it)),
    [mergedItems]
  );
  const pantryItems = useMemo(
    () => mergedItems.filter(isPantryItem).map(enrichItem).sort((a, b) => a.name.localeCompare(b.name)),
    [mergedItems]
  );
  const enrichedItems = useMemo(() => shoppingOnlyItems.map(enrichItem), [shoppingOnlyItems]);
  const { doneCount, totalCount, progress } = useMemo(() => {
    const totalCount = shoppingOnlyItems.length;
    const doneCount = shoppingOnlyItems.filter(isDoneItem).length;
    return { doneCount, totalCount, progress: totalCount > 0 ? doneCount / totalCount : 0 };
  }, [shoppingOnlyItems]);
  const visibleItems = useMemo(() => {
    if (listScope === "pending") return enrichedItems.filter(isActiveItem);
    if (listScope === "done") return enrichedItems.filter(isDoneItem);
    return enrichedItems;
  }, [enrichedItems, listScope]);
  const sections = useMemo(
    () => itemsByAisle(visibleItems).map((g) => ({ key: g.aisle, title: g.aisle, items: g.items })),
    [visibleItems]
  );

  const isEmpty = sections.every((s) => s.items.length === 0) && pantryItems.length === 0;
  const hasPendingItems = shoppingOnlyItems.some(isActiveItem);
  const hasDoneItems = shoppingOnlyItems.some(isDoneItem);

  const handleReceiptPick = async (file) => {
    if (!file) return;
    setReceiptBusy(true);
    try {
      const products = await extractReceiptProducts(file);
      const matches = matchReceiptProducts(products, mergedItems);
      if (matches.length === 0) {
        onToast?.("No coinciden productos del ticket");
        return;
      }
      setReceiptMatches(matches);
    } catch {
      onToast?.("No se pudo leer el ticket");
    } finally {
      setReceiptBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div style={{ background: "#f7f9f7", minHeight: "100dvh" }}>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => handleReceiptPick(e.target.files?.[0])}
      />

      <div style={{ padding: "20px 16px 0", position: "relative" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 4,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h2 style={titleStyle}>Tu compra</h2>
            <button
              type="button"
              onClick={() => setShowLegend((v) => !v)}
              style={{
                ...iconBtnStyle,
                width: 32,
                height: 32,
                borderRadius: 999,
                background: showLegend ? "#e8f0ea" : "#fff",
              }}
              aria-label="Ayuda iconos"
              aria-expanded={showLegend}
            >
              <CircleHelp size={17} strokeWidth={2.2} />
            </button>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => shareShoppingList(shopping).then((r) => {
                if (r.method === "clipboard") onToast?.("Lista copiada al portapapeles");
                else if (r.method === "download") onToast?.("Lista descargada");
              })}
              style={iconBtnStyle}
              aria-label="Compartir lista"
              title="Compartir lista"
            >
              <Share2 size={18} strokeWidth={2.2} />
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={receiptBusy}
              style={iconBtnStyle}
              aria-label="Subir ticket"
            >
              {receiptBusy ? (
                <Loader2 size={18} className="rotating" />
              ) : (
                <Receipt size={18} strokeWidth={2.2} />
              )}
            </button>
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              style={iconBtnStyle}
              aria-label="Añadir"
            >
              <Plus size={20} strokeWidth={2.4} />
            </button>
          </div>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#7a8a7f", marginBottom: 16 }}>
          {weekLabel}
        </div>

        {showLegend && (
          <IconLegendBubble onClose={() => setShowLegend(false)} />
        )}

        {totalCount > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 13,
                fontWeight: 800,
                color: "#142f1d",
                marginBottom: 8,
              }}
            >
              <span>
                {doneCount}/{totalCount}
              </span>
              <span style={{ color: "#2d5a3d" }}>{Math.round(progress * 100)}%</span>
            </div>
            <div style={progressTrackStyle}>
              <div style={{ ...progressFillStyle, width: `${progress * 100}%` }} />
            </div>
          </div>
        )}

        <SegmentedControl
          value={listScope}
          onChange={setListScope}
          options={[
            { id: "pending", label: "Por comprar" },
            { id: "done", label: "Comprado" },
          ]}
          style={{ marginBottom: 12 }}
        />
      </div>

      <div
        style={{
          padding: "0 16px",
          paddingBottom: `calc(${bottomNavSpacer()} + 12px)`,
        }}
      >
        {isEmpty && (
          <EmptyList
            onAdd={() => setShowAdd(true)}
            scope={listScope}
            hasPending={hasPendingItems}
            hasDone={hasDoneItems}
          />
        )}

        {sections.map((section) => {
          if (section.items.length === 0) return null;
          const open = Boolean(openSections[section.key]);
          return (
            <div key={section.key} style={{ marginBottom: 10 }}>
              <button
                type="button"
                onClick={() =>
                  setOpenSections((c) => ({ ...c, [section.key]: !c[section.key] }))
                }
                style={{
                  ...sectionHeaderStyle,
                  ...sectionLabelCardStyle,
                  borderRadius: open ? "14px 14px 0 0" : 14,
                  borderBottom: open ? "none" : sectionLabelCardStyle.border,
                }}
              >
                <AisleIcon aisle={section.key} />
                <span
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    minWidth: 0,
                    textAlign: "left",
                  }}
                >
                  {open ? (
                    <ChevronDown size={16} color="#7a8a7f" />
                  ) : (
                    <ChevronRight size={16} color="#7a8a7f" />
                  )}
                  <span
                    style={{
                      fontSize: 15,
                      fontWeight: 800,
                      color: "#142f1d",
                      letterSpacing: "-.2px",
                    }}
                  >
                    {section.title}
                  </span>
                </span>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color: "#7a8a7f",
                    minWidth: 28,
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {section.items.length}
                </span>
              </button>
              {open && (
                <div style={aisleItemsStyle}>
                  {section.items.map((item) => (
                    <ShoppingRow
                      key={`${section.key}-${item.id}`}
                      item={item}
                      doneView={listScope === "done"}
                      expanded={expandedId === item.id}
                      isEditingQty={editingQtyId === item.id}
                      onToggleRecipes={() =>
                        setExpandedId(expandedId === item.id ? null : item.id)
                      }
                      onEditQty={() => setEditingQtyId(item.id)}
                      onSaveQty={(val) => saveItemQty(item.id, val)}
                      onCancelQty={() => setEditingQtyId(null)}
                      onAtHome={() => patchItem(item.id, { atHome: true, have: false })}
                      onPurchased={() => patchItem(item.id, { have: true })}
                      onUndo={() => patchItem(item.id, { atHome: false, have: false })}
                      onRemove={() => removeItem(item.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {pantryItems.length > 0 && (() => {
          const open = Boolean(openSections.__pantry);
          return (
            <div style={{ marginBottom: 10 }}>
              <button
                type="button"
                onClick={() => setOpenSections((c) => ({ ...c, __pantry: !c.__pantry }))}
                style={{
                  ...sectionHeaderStyle,
                  ...sectionLabelCardStyle,
                  borderRadius: open ? "14px 14px 0 0" : 14,
                  borderBottom: open ? "none" : sectionLabelCardStyle.border,
                }}
              >
                <AisleIcon aisle="__pantry" />
                <span
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    minWidth: 0,
                    textAlign: "left",
                  }}
                >
                  {open ? (
                    <ChevronDown size={16} color="#7a8a7f" />
                  ) : (
                    <ChevronRight size={16} color="#7a8a7f" />
                  )}
                  <span
                    style={{
                      fontSize: 15,
                      fontWeight: 800,
                      color: "#142f1d",
                      letterSpacing: "-.2px",
                    }}
                  >
                    Despensa
                  </span>
                </span>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color: "#7a8a7f",
                    minWidth: 28,
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {pantryItems.length}
                </span>
              </button>
              {open && (
                <div style={aisleItemsStyle}>
                  {pantryItems.map((item) => (
                    <ShoppingRow
                      key={`pantry-${item.id}`}
                      item={item}
                      expanded={expandedId === item.id}
                      onToggleRecipes={() =>
                        setExpandedId(expandedId === item.id ? null : item.id)
                      }
                      // "No lo tengo" — the user disagrees with the pantry
                      // match, so it rejoins the normal aisle-grouped list.
                      onUndo={() => patchItem(item.id, { fromPantry: false })}
                      onRemove={() => removeItem(item.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {showAdd && <AddItemModal onClose={() => setShowAdd(false)} onAdd={addItem} />}

      {receiptMatches && (
        <ReceiptSheet
          matches={receiptMatches}
          onClose={() => setReceiptMatches(null)}
          onConfirm={() => {
            markPurchased(receiptMatches.map((m) => m.id));
            onToast?.(`${receiptMatches.length} marcados`);
            setReceiptMatches(null);
          }}
        />
      )}

      <BottomNav active="shopping" onNav={onNav} />
    </div>
  );
}

function AisleIcon({ aisle, size = 36 }) {
  const meta = AISLE_UI[aisle] ?? { Icon: Package, color: "#64748b" };
  const Icon = meta.Icon;
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 11,
        background: meta.color,
        color: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Icon size={size * 0.48} strokeWidth={2.2} />
    </span>
  );
}

function QtyInput({ item, onSave, onCancel }) {
  const [val, setVal] = useState(String(item.qty ?? 1));
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const commit = () => onSave(val);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, justifyContent: "flex-end" }}>
      <input
        ref={inputRef}
        type="number"
        inputMode="decimal"
        min="0"
        step="any"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { e.preventDefault(); onCancel(); }
        }}
        style={{
          width: "2.8rem",
          textAlign: "right",
          border: "1.5px solid #2d5a3d",
          borderRadius: 7,
          padding: "3px 5px",
          fontSize: 13,
          fontWeight: 800,
          fontVariantNumeric: "tabular-nums",
          fontFamily: "inherit",
          color: "#142f1d",
          background: "#fff",
          outline: "none",
        }}
      />
      <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", flexShrink: 0 }}>
        {item.unit !== "ud" ? item.unit : "uds"}
      </span>
    </div>
  );
}

function ShoppingRow({
  item,
  doneView,
  expanded,
  isEditingQty,
  onToggleRecipes,
  onEditQty,
  onSaveQty,
  onCancelQty,
  onAtHome,
  onPurchased,
  onUndo,
  onRemove,
}) {
  const qty = item.displayQty ?? formatDisplay(item.qty ?? 0, item.unit ?? "ud");
  // Same kitchen-friendly reading used in the menu's DishDetail (≈ 3 muslos,
  // al gusto…) so buying-by-count is obvious for meat/produce still shown in g.
  const hint = kitchenHint(item.name, item.qty, item.unit);
  // Pantry-matched rows are always struck through (the whole "Despensa"
  // section is inherently "done"), independent of the doneView convention
  // used elsewhere, which only dims within the mixed "all" scope.
  const dimmed = item.fromPantry || (!doneView && (item.have || item.atHome));
  const canEditQty = !item.fromPantry && !dimmed;

  return (
    <div
      style={{
        borderBottom: "1px solid #dde8e1",
        opacity: dimmed ? 0.45 : 1,
        padding: "10px 4px 10px 4px",
      }}
    >
      <div style={rowGridStyle}>
        <div style={{ minWidth: 0 }}>
          <span
            style={{
              display: "block",
              fontSize: 15,
              fontWeight: 800,
              color: "#142f1d",
              textDecoration: dimmed ? "line-through" : "none",
              lineHeight: 1.2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {item.name}
          </span>
          {hint && (
            <span style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", lineHeight: 1.2, marginTop: 1 }}>
              {hint}
            </span>
          )}
        </div>
        {isEditingQty ? (
          <QtyInput item={item} onSave={onSaveQty} onCancel={onCancelQty} />
        ) : (
          <button
            type="button"
            onClick={canEditQty ? onEditQty : undefined}
            style={{
              ...qtyColStyle,
              background: "transparent",
              border: canEditQty ? "1px dashed #c0cfc5" : "none",
              borderRadius: 6,
              cursor: canEditQty ? "pointer" : "default",
              padding: "2px 4px",
              fontFamily: "inherit",
            }}
            title={canEditQty ? "Tocar para editar cantidad" : undefined}
          >
            {qty}
          </button>
        )}
        <div style={actionsColStyle}>
          {item.fromPantry ? (
            // No purchase-status badge here — being in the pantry already
            // means "I'm not buying this", so "Comprado"/"En casa" would be
            // redundant. Just the two actions that actually apply.
            <>
              <ActionBtn icon={ShoppingCart} label="No lo tengo" onClick={onUndo} />
              {item.recipeCount > 0 && (
                <ActionBtn
                  icon={BookOpen}
                  label="Recetas"
                  onClick={onToggleRecipes}
                  active={expanded}
                />
              )}
              <ActionBtn icon={Trash2} label="Quitar" onClick={onRemove} muted />
            </>
          ) : doneView ? (
            <>
              {item.atHome ? (
                <ActionBtn icon={Home} label="En casa" active readOnly />
              ) : (
                <ActionBtn icon={Check} label="Comprado" active readOnly />
              )}
              <ActionBtn icon={Undo2} label="Deshacer" onClick={onUndo} />
              {item.recipeCount > 0 && (
                <ActionBtn
                  icon={BookOpen}
                  label="Recetas"
                  onClick={onToggleRecipes}
                  active={expanded}
                />
              )}
            </>
          ) : (
            <>
              <ActionBtn icon={Home} label="En casa" onClick={onAtHome} active={item.atHome} />
              <ActionBtn icon={Check} label="Comprado" onClick={onPurchased} active={item.have} />
              {item.recipeCount > 0 && (
                <ActionBtn
                  icon={BookOpen}
                  label="Recetas"
                  onClick={onToggleRecipes}
                  active={expanded}
                />
              )}
              <ActionBtn icon={Trash2} label="Quitar" onClick={onRemove} muted />
            </>
          )}
        </div>
      </div>

      {expanded && item.recipeUsage?.length > 0 && (
        <div style={{ paddingTop: 8 }}>
          {item.recipeUsage
            .flatMap((recipe) =>
              recipe.slots.map((slot) => ({ ...slot, recipeName: recipe.recipeName }))
            )
            .sort((a, b) => a.sort - b.sort)
            .map((slot, idx) => (
              <div
                key={`${slot.day}-${slot.meal}-${slot.recipeName}-${idx}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 0",
                  borderTop: idx === 0 ? "none" : "1px solid #eef2ef",
                  minHeight: 32,
                }}
              >
                <DayBadge day={slot.day} />
                <MealBadge meal={slot.meal} />
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#142f1d",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {slot.recipeName}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: "#64748b",
                    flexShrink: 0,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {slot.displayQty}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function DayBadge({ day }) {
  return (
    <span
      style={{
        width: 26,
        height: 26,
        borderRadius: 8,
        background: "#64748b",
        color: "#fff",
        fontSize: 12,
        fontWeight: 900,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        lineHeight: 1,
      }}
    >
      {DAY_LETTERS[day] ?? "?"}
    </span>
  );
}

function MealBadge({ meal }) {
  const meta = MEAL_BADGE[meal] ?? { Icon: Sun, color: "#64748b" };
  const Icon = meta.Icon;
  return (
    <span
      style={{
        width: 26,
        height: 26,
        borderRadius: 8,
        background: meta.color,
        color: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Icon size={13} strokeWidth={2.4} />
    </span>
  );
}

function IconLegendBubble({ onClose }) {
  return (
    <div
      style={{
        marginBottom: 14,
        padding: "14px 14px 12px",
        borderRadius: 14,
        background: "#fff",
        border: "1px solid #e0eae3",
        boxShadow: "0 8px 28px rgba(20,47,29,.1)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 900, color: "#142f1d" }}>Iconos</span>
        <button type="button" onClick={onClose} style={{ ...iconBtnStyle, width: 28, height: 28 }}>
          <X size={14} />
        </button>
      </div>
      <LegendGroup title="Lista" items={ICON_LEGEND_HEADER} />
      <LegendGroup title="Producto" items={ICON_LEGEND_ROW} />
    </div>
  );
}

function LegendGroup({ title, items }) {
  return (
    <div style={{ marginTop: title === "Producto" ? 10 : 0 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: "#8d978f",
          textTransform: "uppercase",
          letterSpacing: ".04em",
          marginBottom: 4,
        }}
      >
        {title}
      </div>
      {items.map(({ icon: Icon, label, hint }) => (
        <div
          key={label}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "8px 0",
            borderTop: "1px solid #f0f4f1",
          }}
        >
          <span
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              border: "1px solid #e0eae3",
              background: "#f7f9f7",
              color: "#2d5a3d",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Icon size={16} strokeWidth={2.2} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#142f1d" }}>{label}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#8d978f", marginTop: 1 }}>
              {hint}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ActionBtn({ icon: Icon, label, onClick, active, muted, readOnly }) {
  const style = {
    width: 32,
    height: 32,
    borderRadius: 9,
    border: `1px solid ${active ? "#2d5a3d" : "#e0eae3"}`,
    background: active ? "#eef4ef" : "#fff",
    color: muted ? "#b0bab4" : "#3d5245",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: readOnly ? "default" : "pointer",
    fontFamily: "inherit",
    flexShrink: 0,
    padding: 0,
  };

  if (readOnly) {
    return (
      <span aria-label={label} title={label} style={style}>
        <Icon size={15} strokeWidth={2.2} />
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      style={style}
    >
      <Icon size={15} strokeWidth={2.2} />
    </button>
  );
}

function ReceiptSheet({ matches, onClose, onConfirm }) {
  return (
    <div className="mp-overlay-in" style={overlayStyle} onClick={onClose}>
      <div className="mp-sheet-up" onClick={(e) => e.stopPropagation()} style={sheetStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: 18, fontWeight: 900, color: "#142f1d", margin: 0 }}>
            Ticket
          </h3>
          <button type="button" onClick={onClose} style={iconBtnStyle} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        <p style={{ fontSize: 13, fontWeight: 600, color: "#7a8a7f", margin: "12px 0 16px" }}>
          {matches.length} coincidencias
        </p>
        <div style={{ maxHeight: "40dvh", overflow: "auto", marginBottom: 16 }}>
          {matches.map((m) => (
            <div
              key={m.id}
              style={{
                padding: "10px 0",
                borderBottom: "1px solid #e8f0ea",
                fontSize: 14,
                fontWeight: 700,
                color: "#142f1d",
              }}
            >
              {m.name}
            </div>
          ))}
        </div>
        <button type="button" onClick={onConfirm} style={{ ...primaryBtnStyle, width: "100%" }}>
          Marcar comprados
        </button>
      </div>
    </div>
  );
}

function EmptyList({ onAdd, scope, hasPending, hasDone }) {
  let message = "Sin productos";
  if (scope === "pending" && hasDone) message = "Nada pendiente";
  else if (scope === "done" && hasPending) message = "Nada comprado aún";

  return (
    <div style={{ padding: "48px 0", textAlign: "center" }}>
      <p style={{ fontSize: 14, fontWeight: 600, color: "#7a8a7f", margin: "0 0 16px" }}>
        {message}
      </p>
      <button type="button" onClick={onAdd} style={primaryBtnStyle}>
        Añadir
      </button>
    </div>
  );
}

function AddItemModal({ onClose, onAdd }) {
  const [name, setName] = useState("");
  const disabled = !name.trim();
  const submit = () => {
    if (disabled) return;
    onAdd({
      name: name.trim(),
      qty: 1,
      unit: "ud",
      category: INGREDIENT_CATEGORIES[0],
      displayQty: "1 ud",
    });
    onClose();
  };

  return (
    <div className="mp-overlay-in" style={overlayStyle} onClick={onClose}>
      <div className="mp-sheet-up" onClick={(e) => e.stopPropagation()} style={sheetStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: 18, fontWeight: 900, color: "#142f1d", margin: 0 }}>
            Añadir
          </h3>
          <button type="button" onClick={onClose} style={iconBtnStyle} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre"
          style={{ ...inputStyle, marginTop: 16, padding: "12px" }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={submit}
          style={{
            ...primaryBtnStyle,
            width: "100%",
            marginTop: 14,
            opacity: disabled ? 0.5 : 1,
          }}
        >
          Añadir
        </button>
      </div>
    </div>
  );
}

const titleStyle = {
  fontSize: 26,
  fontWeight: 900,
  color: "#142f1d",
  margin: 0,
  letterSpacing: "-.7px",
};

const iconBtnStyle = {
  width: 40,
  height: 40,
  borderRadius: 12,
  border: "1px solid #e0eae3",
  background: "#fff",
  color: "#2d5a3d",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  fontFamily: "inherit",
  flexShrink: 0,
};

const primaryBtnStyle = {
  padding: "12px 20px",
  borderRadius: 12,
  border: "none",
  background: "#2d5a3d",
  color: "#fff",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
  fontFamily: "inherit",
};

const rowGridStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 4.5rem auto",
  alignItems: "center",
  gap: 8,
  minHeight: 36,
};

const qtyColStyle = {
  fontSize: 13,
  fontWeight: 800,
  color: "#64748b",
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
};

const actionsColStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 4,
};

const sectionLabelCardStyle = {
  background: "#fff",
  border: "1px solid #e8f0ea",
  padding: "4px 12px",
  boxShadow: "0 1px 3px rgba(20, 47, 29, 0.04)",
};

const aisleItemsStyle = {
  background: "#eef4ef",
  border: "1px solid #e8f0ea",
  borderTop: "none",
  borderRadius: "0 0 14px 14px",
  padding: "2px 10px 6px",
};

const sectionHeaderStyle = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 2px",
  border: "none",
  background: "transparent",
  cursor: "pointer",
  fontFamily: "inherit",
};

const progressTrackStyle = {
  height: 6,
  borderRadius: 999,
  background: "#e0eae3",
  overflow: "hidden",
};

const progressFillStyle = {
  height: "100%",
  background: "#2d5a3d",
  borderRadius: 999,
  transition: "width .25s ease",
};

const inputStyle = {
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid #e0eae3",
  fontSize: 14,
  fontWeight: 600,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
  fontFamily: "inherit",
  color: "#142f1d",
};

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.45)",
  zIndex: 150,
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
};

const sheetStyle = {
  background: "#fff",
  borderRadius: "20px 20px 0 0",
  width: "100%",
  maxWidth: 420,
  padding: "20px 20px calc(20px + env(safe-area-inset-bottom, 0px))",
};
