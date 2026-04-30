import { useState, useMemo } from "react";
import { BottomNav } from "../components/ui.jsx";
import { INGREDIENT_CATEGORIES } from "../data/recipes.js";
import { DAYS } from "../lib/planner.js";

function formatDisplay(qty, unit) {
  if (unit === "g" && qty >= 1000)
    return `${(qty / 1000).toFixed(qty % 1000 === 0 ? 0 : 1)}kg`;
  if (unit === "ml" && qty >= 1000)
    return `${(qty / 1000).toFixed(qty % 1000 === 0 ? 0 : 1)}L`;
  if (unit === "ud")
    return Math.ceil(qty) === 1 ? "1 ud" : `${Math.ceil(qty)} uds`;
  return `${Math.ceil(qty)}${unit}`;
}

export function ShoppingScreen({ shopping, setShopping, onNav }) {
  const [view, setView] = useState("category");
  const [editingId, setEditingId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const toggleHave = (id) =>
    setShopping((s) => ({
      ...s,
      items: s.items.map((it) => (it.id === id ? { ...it, have: !it.have } : it)),
    }));

  const updateItem = (id, patch) =>
    setShopping((s) => ({
      ...s,
      items: s.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    }));

  const removeItem = (id) =>
    setShopping((s) => ({ ...s, items: s.items.filter((it) => it.id !== id) }));

  const addItem = (newItem) =>
    setShopping((s) => ({
      ...s,
      items: [
        ...s.items,
        {
          ...newItem,
          id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          have: false,
          manual: true,
          sources: [],
        },
      ],
    }));

  const { byCategory, byDay, total, totalItems } = useMemo(() => {
    const itemsPending = shopping.items.filter((it) => !it.have);
    const total = itemsPending.reduce((s, it) => s + (it.price ?? 0), 0);

    const byCategoryMap = {};
    for (const it of shopping.items) {
      const cat = it.category || "Otros";
      if (!byCategoryMap[cat]) byCategoryMap[cat] = [];
      byCategoryMap[cat].push(it);
    }
    const byCategory = INGREDIENT_CATEGORIES.map((cat) => ({
      cat,
      items: (byCategoryMap[cat] || []).sort((a, b) => a.name.localeCompare(b.name)),
    }))
      .concat(
        Object.keys(byCategoryMap)
          .filter((c) => !INGREDIENT_CATEGORIES.includes(c))
          .map((c) => ({
            cat: c,
            items: byCategoryMap[c].sort((a, b) => a.name.localeCompare(b.name)),
          }))
      )
      .filter((g) => g.items.length > 0);

    const byDayMap = Object.fromEntries(DAYS.map((d) => [d, []]));
    for (const it of shopping.items) {
      if (it.sources && it.sources.length > 0) {
        const daySet = new Set(it.sources.map((s) => s.day));
        for (const d of daySet) {
          byDayMap[d].push(it);
        }
      } else {
        byDayMap.__manual = byDayMap.__manual ?? [];
        byDayMap.__manual.push(it);
      }
    }
    const byDay = DAYS.map((day) => ({ day, items: byDayMap[day] })).filter(
      (d) => d.items.length > 0
    );
    if (byDayMap.__manual && byDayMap.__manual.length > 0) {
      byDay.push({ day: "Añadidos por ti", items: byDayMap.__manual });
    }

    return {
      byCategory,
      byDay,
      total: Math.round(total * 100) / 100,
      totalItems: itemsPending.length,
    };
  }, [shopping.items]);

  return (
    <div style={{ paddingBottom: 0 }}>
      <div style={{ padding: "16px 20px 0" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "start",
            marginBottom: 6,
          }}
        >
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1a3a24", margin: "0 0 4px" }}>
              Lista de la compra
            </h2>
            <p style={{ fontSize: 13, color: "#888", margin: 0 }}>
              {totalItems} productos - {total.toFixed(2)}€ estimado
            </p>
          </div>
          <span
            onClick={() => setShowAdd(true)}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              background: "#2d5a3d",
              color: "#fff",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            + Añadir
          </span>
        </div>

        <div
          style={{
            display: "flex",
            gap: 4,
            background: "#f0f0f0",
            borderRadius: 8,
            padding: 3,
            margin: "12px 0 16px",
          }}
        >
          {[
            ["category", "Categorías"],
            ["day", "Por días"],
          ].map(([id, label]) => (
            <span
              key={id}
              onClick={() => setView(id)}
              style={{
                flex: 1,
                padding: "8px",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                textAlign: "center",
                background: view === id ? "#fff" : "transparent",
                color: view === id ? "#2d5a3d" : "#999",
                boxShadow: view === id ? "0 1px 4px rgba(0,0,0,.1)" : "none",
              }}
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      <div style={{ padding: "0 14px" }}>
        {view === "category" && (
          <>
            {byCategory.length === 0 && (
              <EmptyList onAdd={() => setShowAdd(true)} />
            )}
            {byCategory.map((cat) => (
              <CategoryBlock
                key={cat.cat}
                title={cat.cat}
                items={cat.items}
                editingId={editingId}
                onEdit={setEditingId}
                onToggle={toggleHave}
                onUpdate={updateItem}
                onRemove={removeItem}
              />
            ))}
          </>
        )}
        {view === "day" && (
          <>
            {byDay.length === 0 && <EmptyList onAdd={() => setShowAdd(true)} />}
            {byDay.map((d) => (
              <CategoryBlock
                key={d.day}
                title={d.day}
                items={d.items}
                editingId={editingId}
                onEdit={setEditingId}
                onToggle={toggleHave}
                onUpdate={updateItem}
                onRemove={removeItem}
                showRecipes
              />
            ))}
          </>
        )}
      </div>

      {showAdd && <AddItemModal onClose={() => setShowAdd(false)} onAdd={addItem} />}

      <BottomNav active="shopping" onNav={onNav} />
    </div>
  );
}

function EmptyList({ onAdd }) {
  return (
    <div
      style={{
        padding: "40px 20px",
        textAlign: "center",
        color: "#888",
        background: "#fafafa",
        borderRadius: 14,
        margin: "0 6px",
      }}
    >
      <p style={{ fontSize: 14, marginBottom: 14 }}>Todavía no hay productos.</p>
      <button
        onClick={onAdd}
        style={{
          background: "#2d5a3d",
          color: "#fff",
          border: "none",
          borderRadius: 10,
          padding: "10px 16px",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        + Añadir producto
      </button>
    </div>
  );
}

function CategoryBlock({
  title,
  items,
  editingId,
  onEdit,
  onToggle,
  onUpdate,
  onRemove,
  showRecipes,
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 800,
          color: "#888",
          textTransform: "uppercase",
          letterSpacing: 1,
          padding: "0 8px",
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      {items.map((item) => (
        <ShoppingRow
          key={item.id}
          item={item}
          editing={editingId === item.id}
          onEdit={() => onEdit(editingId === item.id ? null : item.id)}
          onToggle={() => onToggle(item.id)}
          onUpdate={(patch) => onUpdate(item.id, patch)}
          onRemove={() => onRemove(item.id)}
          showRecipes={showRecipes}
        />
      ))}
    </div>
  );
}

function ShoppingRow({ item, editing, onEdit, onToggle, onUpdate, onRemove, showRecipes }) {
  return (
    <div
      style={{
        background: item.have ? "#f8f8f8" : "#fff",
        borderRadius: 12,
        marginBottom: 4,
        border: "1px solid #f0f0f0",
        opacity: item.have ? 0.6 : 1,
        transition: "all .2s",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
        }}
      >
        <div
          onClick={onToggle}
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            border: `2px solid ${item.have ? "#2d5a3d" : "#ddd"}`,
            background: item.have ? "#2d5a3d" : "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: 14,
            flexShrink: 0,
            cursor: "pointer",
          }}
        >
          {item.have ? "✓" : ""}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#1a3a24",
              textDecoration: item.have ? "line-through" : "none",
            }}
          >
            {item.name}
            {item.manual && (
              <span
                style={{
                  marginLeft: 6,
                  fontSize: 9,
                  background: "#eef5ef",
                  color: "#2d5a3d",
                  padding: "1px 5px",
                  borderRadius: 4,
                  fontWeight: 700,
                }}
              >
                MANUAL
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: "#999" }}>
            {item.displayQty ?? formatDisplay(item.qty ?? 0, item.unit ?? "ud")}
            {showRecipes && item.sources && item.sources.length > 0 && (
              <>
                {" "}
                -{" "}
                {Array.from(new Set(item.sources.map((s) => s.recipeName))).join(", ")}
              </>
            )}
          </div>
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#2d5a3d", minWidth: 48, textAlign: "right" }}>
          {(item.price ?? 0).toFixed(2)}€
        </span>
        <span
          onClick={onEdit}
          style={{
            fontSize: 16,
            color: editing ? "#2d5a3d" : "#bbb",
            cursor: "pointer",
            padding: "0 4px",
          }}
          title="Editar"
        >
          ⋯
        </span>
      </div>
      {editing && (
        <div
          style={{
            padding: "10px 12px 12px",
            borderTop: "1px dashed #eee",
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr",
            gap: 8,
          }}
        >
          <input
            value={item.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder="Nombre"
            style={inputStyle}
          />
          <input
            value={item.qty ?? 0}
            onChange={(e) => onUpdate({ qty: parseFloat(e.target.value) || 0 })}
            type="number"
            placeholder="Cant."
            style={inputStyle}
          />
          <input
            value={item.price ?? 0}
            onChange={(e) => onUpdate({ price: parseFloat(e.target.value) || 0 })}
            type="number"
            step="0.01"
            placeholder="€"
            style={inputStyle}
          />
          <select
            value={item.unit ?? "ud"}
            onChange={(e) => onUpdate({ unit: e.target.value })}
            style={inputStyle}
          >
            {["g", "ml", "ud"].map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
          <select
            value={item.category}
            onChange={(e) => onUpdate({ category: e.target.value })}
            style={{ ...inputStyle, gridColumn: "span 1" }}
          >
            {INGREDIENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            onClick={onRemove}
            style={{
              border: "1.5px solid #e0a0a0",
              background: "#fff5f5",
              color: "#c04040",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              padding: "6px 8px",
            }}
          >
            🗑 Eliminar
          </button>
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #ddd",
  fontSize: 12,
  outline: "none",
  minWidth: 0,
  width: "100%",
  boxSizing: "border-box",
};

function AddItemModal({ onClose, onAdd }) {
  const [form, setForm] = useState({
    name: "",
    qty: 1,
    unit: "ud",
    price: 0,
    category: INGREDIENT_CATEGORIES[0],
  });
  const disabled = !form.name.trim();
  const submit = () => {
    if (disabled) return;
    onAdd({
      ...form,
      displayQty: formatDisplay(form.qty, form.unit),
    });
    onClose();
  };
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.5)",
        zIndex: 100,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: "24px 24px 0 0",
          width: "100%",
          maxWidth: 400,
          padding: 24,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: "#1a3a24", margin: 0 }}>Añadir producto</h3>
          <span onClick={onClose} style={{ fontSize: 22, cursor: "pointer", color: "#ccc" }}>
            ×
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
          <input
            autoFocus
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Nombre del producto"
            style={{ ...inputStyle, fontSize: 14, padding: "10px 12px" }}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <input
              type="number"
              value={form.qty}
              onChange={(e) => setForm((f) => ({ ...f, qty: parseFloat(e.target.value) || 0 }))}
              placeholder="Cantidad"
              style={{ ...inputStyle, fontSize: 14, padding: "10px 12px" }}
            />
            <select
              value={form.unit}
              onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
              style={{ ...inputStyle, fontSize: 14, padding: "10px 12px" }}
            >
              {["g", "ml", "ud"].map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: parseFloat(e.target.value) || 0 }))}
              placeholder="€"
              style={{ ...inputStyle, fontSize: 14, padding: "10px 12px" }}
            />
          </div>
          <select
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            style={{ ...inputStyle, fontSize: 14, padding: "10px 12px" }}
          >
            {INGREDIENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <button
          disabled={disabled}
          onClick={submit}
          style={{
            marginTop: 18,
            width: "100%",
            padding: "14px",
            borderRadius: 12,
            border: "none",
            background: disabled ? "#ccc" : "#2d5a3d",
            color: "#fff",
            fontSize: 14,
            fontWeight: 700,
            cursor: disabled ? "default" : "pointer",
          }}
        >
          Añadir
        </button>
      </div>
    </div>
  );
}
