import { useEffect, useRef, useState } from "react";
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
import { ShoppingCoachTour } from "../components/HomeCoachTour.jsx";
import { INGREDIENT_CATEGORIES } from "../data/recipes.js";
import { normalizeIngredientKey, isPerishableAisle, guessShoppingAisle } from "../lib/ingredientCategories.js";
import { formatISODateShort } from "../lib/menuArchive.js";
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
import { formatWeekRangeLabel, getWeekDates, getWeekDatesByMenuWeek } from "../lib/weekCalendar.js";
import { shareShoppingList } from "../lib/menuExport.js";

const DAY_LETTERS = { Lun: "L", Mar: "M", Mié: "X", Jue: "J", Vie: "V", Sáb: "S", Dom: "D" };

const MEAL_BADGE = {
  Desayuno: { Icon: Coffee, color: "#a16207" },
  Comida: { Icon: Sun, color: "#0d9488" },
  Cena: { Icon: Moon, color: "#6366f1" },
};

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

export function ShoppingScreen({
  shopping,
  setShopping,
  onNav,
  onToast,
  // The menú's own week (offset + startDayIdx). Drives the date label so a
  // mid-week menú shows only its real days, matching the Menú screen.
  menuWeek = null,
  // Multi-week support: every week of the ACTIVE menú (orderedWeeks shape:
  // { weekStart, offset, startISO, endISO, startDayIdx, shopping }). When
  // present with >1 entries the screen shows a week multi-select and merges
  // the selected weeks (staples summed, perishables kept per week). Empty/
  // absent → falls back to the single live `shopping` list (guests, demo,
  // legacy menús with no archive).
  menuWeeks = null,
  // Offset of the menú's currently-active week (drives the default selection
  // and which week reads the live `shopping` instead of the archived copy).
  activeOffset = null,
  // Writes one week's shopping back to the archive (and mirrors the live list
  // when it's the active week). Signature: (weekStart, { items }).
  onUpdateWeek = null,
  // Optional demo hooks (first-run value-prop carousel): preset the list filter
  // and pre-open one aisle so the category "zoom" is visible on mount. Default
  // to the normal collapsed behaviour; never passed in the real app.
  initialOpenAisle = null,
  initialListScope = null,
}) {
  const [listScope, setListScope] = useState(initialListScope ?? "pending");
  const [openSections, setOpenSections] = useState(
    initialOpenAisle ? { [initialOpenAisle]: true } : {},
  );

  // Demo only (value-prop carousel): let the parent drive the tab from
  // outside by changing `initialListScope`. Never happens in the real app,
  // where this prop is passed once and never updated.
  useEffect(() => {
    if (initialListScope) setListScope(initialListScope);
  }, [initialListScope]);
  const [expandedId, setExpandedId] = useState(null);
  const [showIconCoach, setShowIconCoach] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receiptMatches, setReceiptMatches] = useState(null);
  const [editingQtyId, setEditingQtyId] = useState(null);
  const fileRef = useRef(null);

  const menuMode = Array.isArray(menuWeeks) && menuWeeks.length > 0;

  // Each week's item list. The ACTIVE week reads the live `shopping` (freshest
  // edits) rather than its archived copy; the rest read the archive. In
  // fallback mode (guests / demo / legacy menús with no archive) there's a
  // single synthetic week wrapping the live list.
  const weeks = menuMode
    ? menuWeeks.map((w) => ({
        ...w,
        items: w.offset === activeOffset ? shopping.items : (w.shopping?.items ?? []),
      }))
    : [
        {
          weekStart: "__live",
          offset: activeOffset ?? 0,
          startISO: null,
          endISO: null,
          startDayIdx: menuWeek?.startDayIdx ?? 0,
          items: shopping.items,
        },
      ];

  const orderedAll = [...weeks].sort((a, b) => a.offset - b.offset);
  const weekNumByStart = new Map(orderedAll.map((w, i) => [w.weekStart, i + 1]));
  const weeksSig = orderedAll.map((w) => w.offset).join(",");

  // Which weeks are included in the list right now. Defaults to the active
  // week; the user can add more to buy for several weeks at once. Never empty.
  const [selectedOffsets, setSelectedOffsets] = useState(null);
  useEffect(() => {
    const avail = weeksSig.split(",").filter(Boolean).map(Number);
    setSelectedOffsets((cur) => {
      if (!avail.length) return cur && cur.size === 0 ? cur : new Set();
      let base = cur ? [...cur].filter((o) => avail.includes(o)) : [];
      if (base.length === 0) base = [avail.includes(activeOffset) ? activeOffset : avail[0]];
      const next = new Set(base);
      if (cur && cur.size === next.size && [...next].every((o) => cur.has(o))) return cur;
      return next;
    });
  }, [weeksSig, activeOffset]);

  const activeSelected = weeks
    .filter((w) => selectedOffsets?.has(w.offset))
    .sort((a, b) => a.offset - b.offset);
  const selectedWeeks = activeSelected.length ? activeSelected : [orderedAll[0]].filter(Boolean);
  const multiWeek = selectedWeeks.length > 1;

  const toggleWeek = (offset) =>
    setSelectedOffsets((cur) => {
      const next = new Set(cur ?? []);
      if (next.has(offset)) {
        if (next.size <= 1) return cur; // keep at least one week selected
        next.delete(offset);
      } else {
        next.add(offset);
      }
      return next;
    });

  // Writes one week's shopping through the parent (archive + live mirror for
  // the active week). Fallback mode drives the live `shopping` state directly.
  const updateWeek = (weekStart, updater) => {
    const w = weeks.find((x) => x.weekStart === weekStart);
    const next = updater(w?.items ?? []);
    if (menuMode) onUpdateWeek?.(weekStart, { items: next });
    else setShopping((s) => ({ ...s, items: next }));
  };

  // Apply a patch to a display row across every week it came from: a merged
  // Despensa line can span several weeks; a Frescos line belongs to one.
  const applyToSources = (row, patch) => {
    const byWeek = new Map();
    for (const s of row?.__sources ?? []) {
      if (!byWeek.has(s.weekStart)) byWeek.set(s.weekStart, new Set());
      byWeek.get(s.weekStart).add(s.ikey);
    }
    for (const [weekStart, ikeys] of byWeek) {
      // Merge first so a patch (esp. an absolute qty) lands once even if the
      // stored week still carries legacy duplicate rows for the same key.
      updateWeek(weekStart, (items) =>
        mergeShoppingItems(items).map((it) =>
          ikeys.has(normalizeIngredientKey(it.name, it.unit ?? "ud")) ? { ...it, ...patch } : it,
        ),
      );
    }
  };

  // ── Combined, enriched view of the selected weeks ──
  // Perishables (Frescos) stay per week; staples (Despensa) and pantry matches
  // are merged/summed across the selected weeks.
  const perishRows = [];
  const stapleAgg = new Map(); // ikey -> { items:[], sources:[] }
  const pantryAgg = new Map();
  const accumulate = (agg, ikey, it, weekStart) => {
    if (!agg.has(ikey)) agg.set(ikey, { items: [], sources: [] });
    const e = agg.get(ikey);
    e.items.push(it);
    e.sources.push({ weekStart, ikey });
  };
  for (const w of selectedWeeks) {
    for (const it of mergeShoppingItems(w.items ?? [])) {
      const ikey = it.id;
      if (isPantryItem(it)) {
        accumulate(pantryAgg, ikey, it, w.weekStart);
        continue;
      }
      if (isPerishableAisle(guessShoppingAisle(it.name))) {
        const row = enrichItem(it);
        row.id = multiWeek ? `${w.weekStart}::${ikey}` : ikey;
        row.__sources = [{ weekStart: w.weekStart, ikey }];
        row.__weekLabel = multiWeek ? `Sem ${weekNumByStart.get(w.weekStart)}` : null;
        row.__weekOffset = w.offset;
        perishRows.push(row);
      } else {
        accumulate(stapleAgg, ikey, it, w.weekStart);
      }
    }
  }
  const aggToRows = (agg, idPrefix) =>
    [...agg.values()].map(({ items, sources }) => {
      const merged = mergeShoppingItems(items)[0];
      const row = enrichItem(merged);
      row.id = `${idPrefix}${merged.id}`;
      row.__sources = sources;
      row.__qtyLocked = sources.length > 1;
      return row;
    });
  const enrichedItems = [...perishRows, ...aggToRows(stapleAgg, "")];
  const pantryItems = aggToRows(pantryAgg, "p::").sort((a, b) => a.name.localeCompare(b.name));

  const rowById = new Map();
  for (const r of [...enrichedItems, ...pantryItems]) rowById.set(r.id, r);
  const mergedItems = enrichedItems; // receipt matching / qty lookups

  const patchItem = (id, patch) => {
    const row = rowById.get(id);
    if (row) applyToSources(row, patch);
  };
  const removeItem = (id) => {
    const row = rowById.get(id);
    if (!row) return;
    const byWeek = new Map();
    for (const s of row.__sources ?? []) {
      if (!byWeek.has(s.weekStart)) byWeek.set(s.weekStart, new Set());
      byWeek.get(s.weekStart).add(s.ikey);
    }
    for (const [weekStart, ikeys] of byWeek) {
      updateWeek(weekStart, (items) =>
        mergeShoppingItems(items).filter(
          (it) => !ikeys.has(normalizeIngredientKey(it.name, it.unit ?? "ud")),
        ),
      );
    }
  };
  const addItem = (newItem) => {
    const target = selectedWeeks[0]?.weekStart ?? orderedAll[0]?.weekStart;
    if (target == null) return;
    updateWeek(target, (items) => [
      ...items,
      {
        ...newItem,
        id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        have: false,
        atHome: false,
        manual: true,
        sources: [],
      },
    ]);
  };
  const markPurchased = (ids) => {
    for (const id of ids) {
      const row = rowById.get(id);
      if (row) applyToSources(row, { have: true });
    }
  };
  const saveItemQty = (id, rawValue) => {
    const parsed = parseFloat(String(rawValue).replace(",", "."));
    const row = rowById.get(id);
    if (row && !row.__qtyLocked && !isNaN(parsed) && parsed > 0) {
      applyToSources(row, {
        qty: parsed,
        displayQty: formatDisplay(parsed, row.unit ?? "ud"),
      });
    }
    setEditingQtyId(null);
  };

  const shoppingOnlyItems = enrichedItems;
  const totalCount = shoppingOnlyItems.length;
  const doneCount = shoppingOnlyItems.filter(isDoneItem).length;
  const progress = totalCount > 0 ? doneCount / totalCount : 0;
  const visibleItems =
    listScope === "pending"
      ? enrichedItems.filter(isActiveItem)
      : listScope === "done"
        ? enrichedItems.filter(isDoneItem)
        : enrichedItems;
  const sections = itemsByAisle(visibleItems).map((g) => ({
    key: g.aisle,
    title: g.aisle,
    items: g.items,
  }));
  // Two always-visible macro-groups: Frescos (perishable aisles) vs Despensa.
  const freshSections = sections.filter((s) => isPerishableAisle(s.key));
  const stapleSections = sections.filter((s) => !isPerishableAisle(s.key));

  const isEmpty = sections.every((s) => s.items.length === 0) && pantryItems.length === 0;
  const hasPendingItems = shoppingOnlyItems.some(isActiveItem);
  const hasDoneItems = shoppingOnlyItems.some(isDoneItem);

  // Date label for the current selection: real span of the selected weeks in
  // menú mode; the single-week label otherwise.
  const weekLabel = (() => {
    const withISO = selectedWeeks.filter((w) => w.startISO && w.endISO);
    if (menuMode && withISO.length) {
      const start = withISO.reduce((m, w) => (w.startISO < m ? w.startISO : m), withISO[0].startISO);
      const end = withISO.reduce((m, w) => (w.endISO > m ? w.endISO : m), withISO[0].endISO);
      const range = `${formatISODateShort(start)} – ${formatISODateShort(end)}`;
      return multiWeek ? `${selectedWeeks.length} semanas · ${range}` : range;
    }
    const { dates: weekDates, activeDays } = menuWeek
      ? getWeekDatesByMenuWeek(menuWeek)
      : { dates: getWeekDates(), activeDays: undefined };
    return formatWeekRangeLabel(weekDates, activeDays);
  })();

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

  const toggleIconCoach = () => {
    setShowIconCoach((on) => {
      if (on) return false;
      // The per-product icons only exist in the DOM when a section is open, so
      // make sure the first available aisle is expanded before the spotlight
      // starts hunting for its targets.
      const firstKey = freshSections[0]?.key ?? stapleSections[0]?.key;
      if (firstKey) setOpenSections((c) => ({ ...c, [firstKey]: true }));
      return true;
    });
  };

  const renderAisleSection = (section) => {
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
              onClick={toggleIconCoach}
              style={{
                ...iconBtnStyle,
                width: 32,
                height: 32,
                borderRadius: 999,
                background: showIconCoach ? "#e8f0ea" : "#fff",
              }}
              aria-label="Explicar iconos"
              aria-pressed={showIconCoach}
            >
              <CircleHelp size={17} strokeWidth={2.2} />
            </button>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              data-coach="shop-share"
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
              data-coach="shop-receipt"
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
              data-coach="shop-add"
              onClick={() => setShowAdd(true)}
              style={iconBtnStyle}
              aria-label="Añadir"
            >
              <Plus size={20} strokeWidth={2.4} />
            </button>
          </div>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#7a8a7f", marginBottom: orderedAll.length > 1 ? 10 : 16 }}>
          {weekLabel}
        </div>

        {orderedAll.length > 1 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {orderedAll.map((w, i) => {
              const sel = selectedOffsets?.has(w.offset);
              return (
                <button
                  key={w.weekStart}
                  type="button"
                  onClick={() => toggleWeek(w.offset)}
                  aria-pressed={sel}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "7px 13px",
                    borderRadius: 999,
                    border: `1.5px solid ${sel ? "#2d5a3d" : "#dbe6df"}`,
                    background: sel ? "#2d5a3d" : "#fff",
                    color: sel ? "#fff" : "#3d5245",
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition: "background .15s, border-color .15s, color .15s",
                  }}
                >
                  {sel && <Check size={14} strokeWidth={3} />}
                  Sem {i + 1}
                </button>
              );
            })}
          </div>
        )}

        {showIconCoach && (
          <ShoppingCoachTour onClose={() => setShowIconCoach(false)} />
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

        {freshSections.length > 0 && (
          <MacroHeader
            icon={Apple}
            title="Frescos"
            count={freshSections.reduce((n, s) => n + s.items.length, 0)}
            first
          />
        )}
        {freshSections.map(renderAisleSection)}

        {stapleSections.length > 0 && (
          <MacroHeader
            icon={Package}
            title="Despensa"
            count={stapleSections.reduce((n, s) => n + s.items.length, 0)}
          />
        )}
        {stapleSections.map(renderAisleSection)}

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
                    Ya en casa
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
          width: "3.4rem",
          textAlign: "right",
          border: "1.5px solid #2d5a3d",
          borderRadius: 7,
          padding: "3px 5px",
          fontSize: 16,
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
  // Merged Despensa lines spanning several weeks have no single editable qty.
  const canEditQty = !item.fromPantry && !dimmed && !item.__qtyLocked;

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
          {item.__weekLabel && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                fontSize: 10,
                fontWeight: 800,
                color: "#2d5a3d",
                background: "#eef4ef",
                border: "1px solid #d7e6dc",
                borderRadius: 999,
                padding: "1px 7px",
                marginTop: 2,
              }}
            >
              {item.__weekLabel}
            </span>
          )}
          {item.adapted && (
            <span
              title="Adaptado por una intolerancia — asegúrate de comprar este producto y no el habitual"
              style={{
                display: "flex", alignItems: "center", gap: 3,
                fontSize: 10, fontWeight: 800, color: "#2f9e52",
                marginTop: 1,
              }}
            >
              <Leaf size={11} strokeWidth={2.6} />
              Adaptado
            </span>
          )}
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
              <ActionBtn icon={Home} label="En casa" onClick={onAtHome} active={item.atHome} coach="shop-athome" />
              <ActionBtn icon={Check} label="Comprado" onClick={onPurchased} active={item.have} coach="shop-purchased" />
              {item.recipeCount > 0 && (
                <ActionBtn
                  icon={BookOpen}
                  label="Recetas"
                  onClick={onToggleRecipes}
                  active={expanded}
                  coach="shop-recipes"
                />
              )}
              <ActionBtn icon={Trash2} label="Quitar" onClick={onRemove} muted coach="shop-remove" />
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

function MacroHeader({ icon: Icon, title, subtitle, count, first }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        margin: first ? "2px 2px 10px" : "22px 2px 10px",
      }}
    >
      <span
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          background: "#e8f0ea",
          color: "#2d5a3d",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={18} strokeWidth={2.4} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 15,
            fontWeight: 900,
            color: "#142f1d",
            letterSpacing: "-.3px",
            lineHeight: 1.1,
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "#7a8a7f", marginTop: 1 }}>
            {subtitle}
          </div>
        )}
      </div>
      {typeof count === "number" && count > 0 && (
        <span
          style={{
            fontSize: 12,
            fontWeight: 900,
            color: "#2d5a3d",
            background: "#eef4ef",
            border: "1px solid #d7e6dc",
            borderRadius: 999,
            padding: "3px 9px",
            fontVariantNumeric: "tabular-nums",
            flexShrink: 0,
          }}
        >
          {count}
        </span>
      )}
    </div>
  );
}

function ActionBtn({ icon: Icon, label, onClick, active, muted, readOnly, coach }) {
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
      data-coach={coach}
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
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: "#142f1d" }}>{m.name}</div>
              {m.receiptLine && (
                <div style={{ fontSize: 12, fontWeight: 600, color: "#7a8a7f", marginTop: 2 }}>
                  Ticket: {m.receiptLine}
                </div>
              )}
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
  fontSize: 16,
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
