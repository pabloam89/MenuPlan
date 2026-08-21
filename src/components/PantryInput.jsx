import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Camera, Check, ChevronDown, ChevronLeft, ChevronUp, Clock, Layers, Loader2, Package, Plus, Receipt, Refrigerator, Salad, Search, Snowflake, Soup, Utensils, UtensilsCrossed, X } from "lucide-react";
import { useAuth } from "../lib/useAuth.js";
import { normalizePantryInput } from "../utils/normalizePantryInput.js";
import { addPantryItems, addLocalPantryItems } from "../lib/pantry.js";
import { extractPantryPhoto } from "../lib/receiptParser.js";
import { toCanonicalStockQty } from "../lib/kitchenUnits.js";
import {
  wantsPackFields,
  defaultPackFor,
  stockFromPack,
  PACK_KINDS,
} from "../lib/packUnits.js";
import { guessShoppingAisle, isPerishableAisle, normalizeName } from "../lib/ingredientCategories.js";
import { IngredientPicker } from "../screens/RecipePlanner.jsx";
import { GarnishPickerSheet } from "../screens/CatalogBrowserSheet.jsx";
import { recipeCatalogById } from "../data/recipeCatalog.js";
import guarnicionesData from "../data/recipes/guarniciones.json";
import { dishImageForRecipe } from "../assets/dishes/dishImages.js";
import { aisleImageSrc, categoryImageSrc, ingredientThumbSrc } from "../lib/ingredientImages.js";

const GARNISH_BY_ID = Object.fromEntries(guarnicionesData.map((g) => [g.id, g]));
const GREEN = "#2d5a3d";
const INK = "#142f1d";
const FIELD_BG = "#fff";

const PANTRY_UNITS = ["ud", "g", "kg", "ml", "l"];

function chipPackDefaults(name) {
  if (!wantsPackFields(name)) return { usePack: false };
  const d = defaultPackFor(name);
  return {
    usePack: true,
    packKind: d.kind,
    packSizeQty: d.sizeQty,
    packSizeUnit: d.sizeUnit,
  };
}

function packSizeUnitOptions(name) {
  const d = defaultPackFor(name);
  return d.sizeUnit === "l" || d.sizeUnit === "ml" ? ["ml", "l"] : ["g", "kg"];
}

// Soft mint card + white fields so inputs don't dissolve into the card.
const editInputBase = {
  boxSizing: "border-box",
  borderRadius: 10,
  border: "1.5px solid #cfe0d6",
  fontFamily: "inherit",
  color: INK,
  outline: "none",
  background: FIELD_BG,
};

// Barra de búsqueda compartida (arriba del todo): filtra el modo activo
// (ingrediente o plato). Debajo va el grid. Cuando hay un modo elegido, muestra
// a su derecha (misma altura) un botón para volver — a Categorías si hay una
// categoría abierta, o al selector de miniaturas si estás en la parrilla raíz.
function PantrySearchBar({ query, onQueryChange, mode, onBack, backLabel = "Categorías" }) {
  const active = query.trim().length > 0;
  const field = (
    <div
      style={{
        flex: onBack ? 1 : undefined, minWidth: 0,
        display: "flex", alignItems: "center", gap: 7, height: 42,
        padding: "0 10px", borderRadius: 12,
        background: active ? "#fff" : "#f0f5f2",
        border: `1.5px solid ${active ? GREEN : "transparent"}`,
        transition: "background .15s, border-color .15s",
      }}
    >
      <Search size={16} color={active ? GREEN : "#9ab0a1"} style={{ flexShrink: 0 }} />
      <input
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={mode === "cooked_dish" ? "Busca un plato que hayas cocinado…" : "Busca un ingrediente…"}
        style={{
          flex: 1, minWidth: 0, border: "none", outline: "none",
          background: "transparent", fontFamily: "inherit",
          fontSize: 13, fontWeight: 700, color: INK,
        }}
      />
      {active && (
        <button
          type="button"
          onClick={() => onQueryChange("")}
          aria-label="Limpiar"
          style={{ border: "none", background: "transparent", cursor: "pointer", color: "#c0cfc8", display: "flex", padding: 2, flexShrink: 0 }}
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
  if (!onBack) {
    return <div style={{ marginBottom: 12 }}>{field}</div>;
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
      {field}
      <button
        type="button"
        onClick={onBack}
        aria-label={backLabel === "Categorías" ? "Volver a categorías" : "Volver"}
        style={{
          flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5,
          height: 42, padding: "0 12px 0 9px", borderRadius: 12,
          border: "1.5px solid #d7e6dc", background: "#fff", color: GREEN,
          cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 800,
          whiteSpace: "nowrap",
        }}
      >
        <ChevronLeft size={14} strokeWidth={2.6} />
        {backLabel}
      </button>
    </div>
  );
}

// Dos ilustraciones que hacen de selector: ingrediente (fruta) vs plato
// cocinado (plato). Al tocar una, aparece su grid debajo.
function AddModeIllustrations({ active, onPick }) {
  const opts = [
    { id: "ingredient", label: "Ingrediente", img: aisleImageSrc("Frutas") },
    { id: "cooked_dish", label: "Plato cocinado", img: categoryImageSrc("platos_unicos") },
  ];
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 14, maxWidth: 300, marginLeft: "auto", marginRight: "auto" }}>
      {opts.map(({ id, label, img }) => {
        const on = active === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onPick(id)}
            aria-pressed={on}
            style={{
              flex: 1, minWidth: 0, padding: 0, border: "none", background: "transparent",
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <div
              style={{
                position: "relative", width: "100%", aspectRatio: "4 / 3", overflow: "hidden",
                borderRadius: 16, background: "#eef4ef",
                border: `2px solid ${on ? GREEN : "transparent"}`,
                boxShadow: on ? "0 12px 26px -14px rgba(45,90,61,.6)" : "0 4px 14px -10px rgba(20,47,29,.4)",
                transition: "all .16s ease",
              }}
            >
              {img && (
                <img src={img} alt={label} loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              )}
            </div>
            <div style={{ marginTop: 6, textAlign: "center", fontSize: 12, fontWeight: 800, color: on ? GREEN : "#3d6652", lineHeight: 1.2 }}>
              {label}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// Opciones cualitativas de "¿cuándo lo cocinaste?" → estimación de cooked_at.
// Sin fecha exacta a propósito: un dropdown coarse basta para calcular
// frescura/caducidad y evita fricción (ver discusión de En casa).
const COOKED_DATE_OPTS = [
  { key: "today", label: "Hoy", days: 0, Icon: CalendarDays },
  { key: "yesterday", label: "Ayer", days: 1, Icon: CalendarDays },
  { key: "few", label: "Hace unos días", days: 3, Icon: Clock },
  { key: "week", label: "Hace una semana", days: 7, Icon: Clock },
];

function cookedAtFromKey(key) {
  const opt = COOKED_DATE_OPTS.find((o) => o.key === key) ?? COOKED_DATE_OPTS[0];
  return new Date(Date.now() - opt.days * 86400000).toISOString();
}

const qLabelStyle = { fontSize: 11.5, fontWeight: 800, color: "#5a7066", marginBottom: 5 };

// Portaled picker — same language as RecipePlanner UnitPicker / CualDropdown.
function StyledPickerMenu({ value, options, anchorRef, onSelect, onClose }) {
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
      const openUp = spaceBelow < 220 && r.top > spaceBelow;
      setPos({
        left: Math.min(r.left, window.innerWidth - width - 12),
        width,
        top: openUp ? null : r.bottom + 6,
        bottom: openUp ? vh - r.top + 6 : null,
        maxHeight: Math.max(160, (openUp ? r.top : spaceBelow) - 18),
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
        position: "fixed",
        left: pos.left,
        width: pos.width,
        top: pos.top ?? undefined,
        bottom: pos.bottom ?? undefined,
        maxHeight: pos.maxHeight,
        overflowY: "auto",
        background: "#fff",
        borderRadius: 14,
        border: "1.5px solid #d7e6dc",
        boxShadow: "0 16px 40px -12px rgba(20,47,29,.28)",
        zIndex: 400,
        padding: 4,
      }}
    >
      {options.map((opt, i) => {
        const selected = value === opt.value;
        return (
          <div key={opt.value}>
            {i > 0 && <div style={{ height: 1, margin: "2px 8px", background: "#cfe0d6" }} />}
            <button
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onSelect(opt.value)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "9px 11px",
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
              <span>{opt.label}</span>
              {selected && <Check size={15} strokeWidth={2.8} color={GREEN} style={{ flexShrink: 0 }} />}
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}

function StyledPicker({ value, onChange, options, width, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const label = options.find((o) => o.value === value)?.label ?? value;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          ...editInputBase,
          flexShrink: 0,
          width,
          height: 34,
          padding: "0 8px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 4,
          background: FIELD_BG,
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 800,
          color: INK,
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        {open
          ? <ChevronUp size={14} color="#9ab0a1" style={{ flexShrink: 0 }} />
          : <ChevronDown size={14} color="#9ab0a1" style={{ flexShrink: 0 }} />}
      </button>
      {open && (
        <StyledPickerMenu
          value={value}
          options={options}
          anchorRef={btnRef}
          onSelect={(v) => { onChange(v); setOpen(false); }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// Dropdown de fecha cualitativa reutilizando el picker portalizado (CualDropdown)
// para que herede los estilos de MenuPlan (bordes redondeados, divisores verdes).
function CookedDatePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const current = COOKED_DATE_OPTS.find((o) => o.key === value) ?? COOKED_DATE_OPTS[0];
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="¿Cuándo lo cocinaste?"
        style={{
          ...modeToggleStyle, marginBottom: 0, width: "100%", height: 34,
          justifyContent: "space-between", padding: "6px 10px", cursor: "pointer",
        }}
      >
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 11.5, fontWeight: 600, color: INK, minWidth: 0 }}>
          <CalendarDays size={13} color={GREEN} style={{ flexShrink: 0 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{current.label}</span>
        </span>
        <ChevronDown size={14} color="#7a9082" style={{ flexShrink: 0 }} />
      </button>
      {open && (
        <CualDropdown
          anchorRef={btnRef}
          candidates={COOKED_DATE_OPTS.map((o) => ({ normalized: o.key, label: o.label, Icon: o.Icon, selected: o.key === value }))}
          onSelect={(c) => { onChange(c.normalized); setOpen(false); }}
          onClose={() => setOpen(false)}
          optionStyle={{ fontSize: 11.5, fontWeight: 600, color: INK }}
        />
      )}
    </>
  );
}

// Rol del plato en el menú. Se INFIERE del catálogo (mealRole/type) y queda
// editable, porque "principal vs guarnición" solo tiene sentido preguntarlo a
// veces. Alimentará al planner (consumir el tupper como slot resuelto).
const DISH_ROLE_OPTS = [
  { key: "principal", label: "Principal", Icon: Utensils },
  { key: "unico", label: "Plato único", Icon: UtensilsCrossed },
  { key: "guarnicion", label: "Guarnición", Icon: Salad },
  { key: "principal_guarnicion", label: "Plato + guarnición", Icon: Layers },
];

function inferDishRole(recipe) {
  const roles = Array.isArray(recipe?.mealRole) ? recipe.mealRole : [];
  const type = recipe?.type;
  if (type === "guarnicion" || (roles.includes("guarnicion") && !roles.includes("primero") && !roles.includes("segundo"))) {
    return "guarnicion";
  }
  if (type === "completo" || roles.includes("plato_unico")) return "unico";
  return "principal";
}

// Chip editable que hace de subtítulo del plato (sustituye a "Plato cocinado").
function DishRolePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const current = DISH_ROLE_OPTS.find((o) => o.key === value) ?? DISH_ROLE_OPTS[0];
  const Icon = current.Icon;
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Tipo de plato"
        style={{
          display: "inline-flex", alignItems: "center", gap: 5, marginTop: 3,
          padding: "2px 8px", borderRadius: 999, border: "1px solid #dce8e0",
          background: "#eef4ef", cursor: "pointer", fontFamily: "inherit",
          color: "#3d6652", fontSize: 11, fontWeight: 800,
        }}
      >
        <Icon size={12} strokeWidth={2.2} color={GREEN} />
        {current.label}
        <ChevronDown size={12} color="#7a9082" />
      </button>
      {open && (
        <CualDropdown
          anchorRef={btnRef}
          candidates={DISH_ROLE_OPTS.map((o) => ({ normalized: o.key, label: o.label, Icon: o.Icon, selected: o.key === value }))}
          onSelect={(c) => { onChange(c.normalized); setOpen(false); }}
          onClose={() => setOpen(false)}
          optionStyle={{ fontSize: 12, fontWeight: 700, color: INK }}
        />
      )}
    </>
  );
}

// Categorías de platos para el grid (réplica del grid de ingredientes). El id
// coincide con la category del catálogo y con /categories/{id}.png.
const DISH_CATEGORIES = [
  { id: "legumbres", label: "Legumbres" },
  { id: "carnes", label: "Carne" },
  { id: "pescados", label: "Pescado" },
  { id: "pasta_arroces", label: "Pasta y arroz" },
  { id: "sopas_cremas", label: "Sopas y cremas" },
  { id: "huevos", label: "Huevos" },
  { id: "ensaladas_verduras", label: "Verduras" },
  { id: "platos_unicos", label: "Platos únicos" },
  { id: "cenas_rapidas", label: "Cenas rápidas" },
  { id: "bebes", label: "Bebés" },
];

// Tile cuadrada ilustrada de categoría de plato — mismo lenguaje visual que
// CategoryCard del picker de ingredientes.
function DishCategoryCard({ id, label, onSelect }) {
  const img = categoryImageSrc(id);
  const [failed, setFailed] = useState(false);
  const showImg = Boolean(img) && !failed;
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      style={{
        position: "relative", aspectRatio: "1 / 1", padding: 0, border: "none",
        borderRadius: 14, overflow: "hidden", cursor: "pointer",
        fontFamily: "inherit", background: "#eef4ef",
      }}
    >
      {showImg ? (
        <img
          src={img}
          alt=""
          onError={() => setFailed(true)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Soup size={30} color={GREEN} strokeWidth={1.8} />
        </span>
      )}
      <span
        style={{
          position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 1, padding: "5px 6px 7px",
          background: "linear-gradient(to top, rgba(20,47,29,.82) 0%, rgba(20,47,29,.4) 55%, transparent 100%)",
          fontSize: 10.5, fontWeight: 800, color: "#fff", textAlign: "center", lineHeight: 1.2,
          textShadow: "0 1px 3px rgba(0,0,0,.4)",
        }}
      >
        {label}
      </span>
    </button>
  );
}

// Card de plato (foto + nombre) para el grid de una categoría / resultados.
function DishThumbCard({ recipe, onSelect }) {
  const [failed, setFailed] = useState(false);
  const img = dishImageForRecipe(recipe);
  const showImg = Boolean(img) && !failed;
  return (
    <button
      type="button"
      onClick={() => onSelect(recipe)}
      style={{
        position: "relative", aspectRatio: "1 / 1", padding: 0, border: "none",
        borderRadius: 12, overflow: "hidden", cursor: "pointer", fontFamily: "inherit",
        background: "#eef4ef",
      }}
    >
      {showImg ? (
        <img src={img} alt="" onError={() => setFailed(true)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
          <Soup size={22} color={GREEN} />
        </span>
      )}
      <span
        style={{
          position: "absolute", left: 0, right: 0, bottom: 0, padding: "16px 6px 6px",
          background: "linear-gradient(to top, rgba(20,47,29,.86) 0%, rgba(20,47,29,.42) 55%, transparent 100%)",
          fontSize: 10.5, fontWeight: 800, color: "#fff", textAlign: "center", lineHeight: 1.2,
          textShadow: "0 1px 3px rgba(0,0,0,.45)",
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}
      >
        {recipe.name}
      </span>
    </button>
  );
}

// Alta de plato ya cocinado: grid de categorías (réplica) → platos de la
// categoría → confirmar (raciones + nevera/congelador). El buscador es el
// compartido de arriba (prop `query`); recipeRef enlaza con DishDetail luego.
function CookedDishPicker({ query = "", dishCat = null, onDishCatChange, onSave, saving }) {
  const [selected, setSelected] = useState(null);
  const [portions, setPortions] = useState(2);
  const [dishFrozen, setDishFrozen] = useState(true);
  const [dishDate, setDishDate] = useState("today");
  const [dishRole, setDishRole] = useState("principal");
  const [garnishId, setGarnishId] = useState(null);
  const [garnishOpen, setGarnishOpen] = useState(false);
  useEffect(() => { if (selected) { setDishRole(inferDishRole(selected)); setGarnishId(null); } }, [selected]);
  // Volver a la parrilla de categorías (desde el botón externo) también cierra
  // el detalle del plato abierto, para que "Categorías" siempre suba un nivel.
  useEffect(() => { if (!dishCat) setSelected(null); }, [dishCat]);

  const allRecipes = useMemo(() => Object.values(recipeCatalogById), []);
  const q = normalizeName((query ?? "").trim());
  const searching = q.length >= 2;

  const results = useMemo(
    () => (searching ? allRecipes.filter((r) => normalizeName(r.name).includes(q)).slice(0, 30) : []),
    [searching, q, allRecipes],
  );
  const catDishes = useMemo(
    () => (dishCat ? allRecipes.filter((r) => r.category === dishCat) : []),
    [dishCat, allRecipes],
  );

  if (selected) {
    const photo = dishImageForRecipe(selected, garnishId ?? undefined);
    const showGarnish = dishRole === "principal" || dishRole === "principal_guarnicion";
    const garnish = garnishId ? GARNISH_BY_ID[garnishId] : null;
    return (
      <div style={{ border: "1.5px solid #cfe0d6", borderRadius: 14, background: FIELD_BG, padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          {photo ? (
            <img src={photo} alt="" style={{ width: 48, height: 48, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
          ) : (
            <div style={{ width: 48, height: 48, borderRadius: 10, background: "#eef4ef", display: "grid", placeItems: "center", flexShrink: 0 }}>
              <Soup size={22} color={GREEN} />
            </div>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: INK, lineHeight: 1.2 }}>
              {garnish ? `${selected.name} con ${garnish.shortName ?? garnish.name}` : selected.name}
            </div>
            <DishRolePicker value={dishRole} onChange={(role) => {
              setDishRole(role);
              if (role !== "principal" && role !== "principal_guarnicion") setGarnishId(null);
            }} />
          </div>
          <button
            type="button"
            onClick={() => setSelected(null)}
            style={{ border: "none", background: "transparent", cursor: "pointer", padding: 4, color: "#7a9082" }}
            aria-label="Cambiar plato"
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 12 }}>
          <div style={{ flexShrink: 0 }}>
            <div style={qLabelStyle}>Raciones</div>
            <input
              type="text"
              inputMode="numeric"
              value={portions}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
                setPortions(digits === "" ? "" : Math.min(30, Number(digits)));
              }}
              onBlur={() => { if (!(Number(portions) > 0)) setPortions(1); }}
              aria-label="Raciones"
              style={{ ...editInputBase, background: FIELD_BG, width: 50, height: 34, padding: "0 6px", textAlign: "center", fontSize: 14, fontWeight: 800 }}
            />
          </div>
          {showGarnish && (
            <div style={{ flexShrink: 0, paddingTop: 6, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div
                style={{
                  ...qLabelStyle,
                  marginBottom: 5,
                  lineHeight: 1.15,
                  textAlign: "center",
                  minWidth: 54,
                }}
              >
                {garnish ? (
                  <>
                    Guarnición
                    <br />
                    añadida
                  </>
                ) : (
                  <>
                    Añadir
                    <br />
                    guarnición
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => setGarnishOpen(true)}
                aria-label={garnish ? "Guarnición añadida — pulsa para cambiar" : "Añadir guarnición"}
                title={garnish ? "Guarnición añadida — pulsa para cambiar" : "Añadir guarnición"}
                style={{
                  ...editInputBase,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 50,
                  height: 34,
                  padding: 0,
                  cursor: "pointer",
                  background: garnish ? GREEN : FIELD_BG,
                  borderColor: garnish ? GREEN : "#cfe0d6",
                  color: garnish ? "#fff" : GREEN,
                }}
              >
                <Salad size={16} strokeWidth={garnish ? 2.4 : 2.2} />
              </button>
            </div>
          )}
          <div style={{ flexShrink: 0 }}>
            <div style={qLabelStyle}>¿Dónde?</div>
            <div style={{ ...modeToggleStyle, marginBottom: 0 }}>
              <button
                type="button"
                onClick={() => setDishFrozen(false)}
                aria-label="Guardar en la nevera"
                aria-pressed={!dishFrozen}
                style={{ ...modeToggleBtnStyle, padding: "7px 11px", ...(!dishFrozen ? modeToggleBtnOnStyle : null) }}
              >
                <Refrigerator size={15} strokeWidth={2.2} />
              </button>
              <button
                type="button"
                onClick={() => setDishFrozen(true)}
                aria-label="Guardar en el congelador"
                aria-pressed={dishFrozen}
                style={{ ...modeToggleBtnStyle, padding: "7px 11px", ...(dishFrozen ? { background: "#3f7fb0", color: "#fff" } : null) }}
              >
                <Snowflake size={15} strokeWidth={2.2} />
              </button>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={qLabelStyle}>¿Cuándo?</div>
            <CookedDatePicker value={dishDate} onChange={setDishDate} />
          </div>
        </div>

        <button
          type="button"
          disabled={saving}
          onClick={() => {
            const p = Number(portions) > 0 ? Number(portions) : 1;
            onSave?.({
              recipe: selected,
              portions: p,
              frozen: dishFrozen,
              cookedAt: cookedAtFromKey(dishDate),
              dishRole,
              garnishRef: showGarnish ? garnishId : null,
            });
            setSelected(null);
            setPortions(2);
            setDishFrozen(true);
            setDishDate("today");
            setGarnishId(null);
          }}
          style={{
            width: "100%", padding: "11px 12px", borderRadius: 12, border: "none",
            background: GREEN, color: "#fff", fontSize: 13.5, fontWeight: 800,
            fontFamily: "inherit", cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1,
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
          }}
        >
          {saving ? <Loader2 size={16} className="mp-spin" /> : <Plus size={16} />}
          Guardar plato cocinado
        </button>

        {garnishOpen && (
          <GarnishPickerSheet
            recipe={selected}
            currentGarnishId={garnishId}
            title="Elige guarnición"
            subtitle="Opcional — para tuppers ya montados"
            onSelect={(id) => {
              setGarnishId(id);
              setDishRole(id ? "principal_guarnicion" : inferDishRole(selected));
              setGarnishOpen(false);
            }}
            onClose={() => setGarnishOpen(false)}
          />
        )}
      </div>
    );
  }

  // Buscando: resultados en toda la biblioteca.
  if (searching) {
    return results.length > 0 ? (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 7 }}>
        {results.map((r) => (
          <DishThumbCard key={r.id} recipe={r} onSelect={setSelected} />
        ))}
      </div>
    ) : (
      <p style={{ textAlign: "center", color: "#9ab0a1", fontSize: 12.5, margin: "20px 0 8px" }}>
        No encontramos ese plato
      </p>
    );
  }

  // Categoría abierta: platos de esa categoría. El botón "Categorías" para
  // volver vive ahora junto a la barra de búsqueda (en PantryInput).
  if (dishCat) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 7 }}>
        {catDishes.map((r) => (
          <DishThumbCard key={r.id} recipe={r} onSelect={setSelected} />
        ))}
      </div>
    );
  }

  // Grid de categorías (réplica del grid de ingredientes).
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 7 }}>
      {DISH_CATEGORIES.map((c) => (
        <DishCategoryCard key={c.id} id={c.id} label={c.label} onSelect={onDishCatChange} />
      ))}
    </div>
  );
}

// Custom "¿Cuál?" menu — native <select> can't do rounded corners / green
// dividers on the option list, so we portal a MenuPlan-styled picker.
function CualDropdown({ candidates, onSelect, onClose, anchorRef, optionStyle = null }) {
  const menuRef = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    const reposition = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = Math.min(240, Math.max(180, window.innerWidth - 24));
      const left = Math.min(Math.max(12, r.right - width), window.innerWidth - width - 12);
      const vh = window.innerHeight;
      const spaceBelow = vh - r.bottom;
      const openUp = spaceBelow < 220 && r.top > spaceBelow;
      setPos({
        left,
        width,
        top: openUp ? null : r.bottom + 6,
        bottom: openUp ? vh - r.top + 6 : null,
        maxHeight: Math.max(160, (openUp ? r.top : spaceBelow) - 16),
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
        border: "1.5px solid #d7e6dc",
        boxShadow: "0 16px 40px -12px rgba(20,47,29,.28)",
        zIndex: 400,
        padding: 4,
      }}
    >
      {candidates.map((c, i) => (
        <div key={c.normalized}>
          {i > 0 && <div style={{ height: 1, margin: "2px 8px", background: "#cfe0d6" }} />}
          <button
            type="button"
            role="option"
            aria-selected={c.selected ? true : undefined}
            onClick={() => onSelect(c)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 9,
              padding: "10px 12px",
              border: "none",
              borderRadius: 10,
              background: c.selected ? "#eaf3ec" : "transparent",
              color: INK,
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "inherit",
              textAlign: "left",
              cursor: "pointer",
              lineHeight: 1.3,
              ...(optionStyle ?? {}),
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#eaf3ec";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = c.selected ? "#eaf3ec" : "transparent";
            }}
          >
            {c.Icon && <c.Icon size={15} color={GREEN} strokeWidth={2.2} style={{ flexShrink: 0 }} />}
            <span style={{ minWidth: 0 }}>{c.label}</span>
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}

function CualPicker({ candidates, onSelect, ariaLabel }) {
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
        aria-label={ariaLabel}
        title="¿Cuál?"
        style={{
          ...editInputBase,
          flexShrink: 0,
          // Match qty(42) + gap(6) + unit(56) so the ingredient textbox keeps
          // the exact same width whether or not the row is ambiguous.
          width: 104,
          height: 34,
          padding: "0 6px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 3,
          fontSize: 11.5,
          fontWeight: 800,
          color: INK,
          borderColor: open ? GREEN : "#cfe0d6",
          background: FIELD_BG,
          cursor: "pointer",
        }}
      >
        ¿Cuál?
        <ChevronDown size={12} color={GREEN} strokeWidth={2.6} />
      </button>
      {open && (
        <CualDropdown
          candidates={candidates}
          anchorRef={btnRef}
          onClose={() => setOpen(false)}
          onSelect={(c) => {
            onSelect(c);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

// Ubicación por defecto de un ingrediente recién añadido: nevera si es fresco
// perecedero, despensa en el resto. Es solo el punto de partida — el usuario
// puede cambiarla (p. ej. peras en la despensa para que maduren).
function defaultLocationForName(name) {
  return isPerishableAisle(guessShoppingAisle(name)) ? "nevera" : "despensa";
}

const CHIP_LOCATIONS = [
  { id: "nevera", label: "Nevera", Icon: Refrigerator, color: "#2f6d8a" },
  { id: "despensa", label: "Despensa", Icon: Package, color: "#9a7b34" },
  { id: "congelador", label: "Congelador", Icon: Snowflake, color: "#3f7fb0" },
];

// Selector "¿Dónde?" (mismo modelo que el plato cocinado): va DEBAJO de la fila
// para no saturarla. Solo la opción activa muestra su texto; el usuario elige
// libremente nevera / despensa / congelador.
function ChipLocationRow({ value, onChange }) {
  return (
    <div style={{ display: "inline-flex", gap: 2, padding: 2, borderRadius: 9, background: "#fff", border: "1px solid #dbe7df", height: 34, boxSizing: "border-box", alignItems: "center" }}>
      {CHIP_LOCATIONS.map(({ id, label, Icon, color }) => {
        const on = value === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-pressed={on}
            aria-label={label}
            title={label}
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              height: 28, padding: "0 9px", borderRadius: 7, border: "none",
              cursor: "pointer", fontFamily: "inherit",
              background: on ? color : "transparent",
              color: on ? "#fff" : "#7a9082",
              transition: "all .15s",
            }}
          >
            <Icon size={15} strokeWidth={2.2} />
          </button>
        );
      })}
    </div>
  );
}

// Miniatura del ingrediente para la ficha de edición (mismo lenguaje que la
// tarjeta del plato cocinado): ilustración si la hay, icono neutro si no.
function ChipThumb({ name }) {
  const [failed, setFailed] = useState(false);
  const src = ingredientThumbSrc(name);
  const show = Boolean(src) && !failed;
  return show ? (
    <img
      src={src}
      alt=""
      onError={() => setFailed(true)}
      style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover", flexShrink: 0, background: "#eef4ef" }}
    />
  ) : (
    <div style={{ width: 44, height: 44, borderRadius: 10, background: "#eef4ef", display: "grid", placeItems: "center", flexShrink: 0 }}>
      <Salad size={20} color={GREEN} />
    </div>
  );
}

function PantryEditList({
  chips,
  onUpdateQty,
  onUpdateUnit,
  onUpdatePackKind,
  onUpdatePackSizeQty,
  onUpdatePackSizeUnit,
  onUpdateName,
  onUpdateLocation,
  onResolve,
  onRemove,
  onConfirmRow,
  confirming = false,
  focusQtyIndex = null,
}) {
  const qtyRefs = useRef([]);

  useEffect(() => {
    if (focusQtyIndex == null || focusQtyIndex < 0) return;
    const el = qtyRefs.current[focusQtyIndex];
    if (!el) return;
    el.focus();
    el.select?.();
  }, [focusQtyIndex, chips.length]);

  if (chips.length === 0) return null;
  return (
    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      {chips.map((chip, idx) => {
        const rowDisabled = Boolean(chip.ambiguous) || confirming;
        const usePack = Boolean(chip.usePack);
        const sizeUnits = packSizeUnitOptions(chip.raw);
        return (
          <div
            key={idx}
            style={{
              border: "1.5px solid #cfe0d6",
              borderRadius: 14,
              background: FIELD_BG,
              padding: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: chip.ambiguous ? 10 : 12 }}>
              <ChipThumb name={chip.raw} />
              <input
                value={chip.raw}
                onChange={(e) => onUpdateName(idx, e.target.value)}
                aria-label="Nombre del ingrediente"
                style={{
                  ...editInputBase,
                  flex: 1,
                  minWidth: 0,
                  padding: "8px 9px",
                  fontSize: 13.5,
                  fontWeight: 800,
                  color: INK,
                }}
              />
              <button
                type="button"
                onClick={() => onRemove(idx)}
                aria-label={`Quitar ${chip.raw}`}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  padding: 4,
                  color: "#7a9082",
                  flexShrink: 0,
                }}
              >
                <X size={18} />
              </button>
            </div>

            {chip.ambiguous ? (
              <CualPicker
                candidates={chip.candidates}
                ariaLabel={`Elegir coincidencia para ${chip.raw}`}
                onSelect={(candidate) => onResolve(idx, candidate)}
              />
            ) : (
              <>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: usePack ? 8 : 12 }}>
                  <div style={{ flexShrink: 0 }}>
                    <div style={qLabelStyle}>Cantidad</div>
                    <input
                      ref={(el) => {
                        qtyRefs.current[idx] = el;
                      }}
                      value={chip.entryQty}
                      onChange={(e) => onUpdateQty(idx, e.target.value)}
                      inputMode="decimal"
                      placeholder="0"
                      aria-label={`Cantidad de ${chip.raw}`}
                      style={{ ...editInputBase, background: FIELD_BG, width: 54, height: 34, padding: "0 6px", textAlign: "center", fontSize: 14, fontWeight: 800 }}
                    />
                  </div>
                  {usePack ? (
                    <div style={{ flexShrink: 0 }}>
                      <div style={qLabelStyle}>Envase</div>
                      <StyledPicker
                        value={chip.packKind ?? "bote"}
                        onChange={(v) => onUpdatePackKind(idx, v)}
                        options={PACK_KINDS}
                        width={88}
                        ariaLabel={`Envase de ${chip.raw}`}
                      />
                    </div>
                  ) : (
                    <div style={{ flexShrink: 0 }}>
                      <div style={qLabelStyle}>Unidad</div>
                      <StyledPicker
                        value={chip.entryUnit}
                        onChange={(v) => onUpdateUnit(idx, v)}
                        options={PANTRY_UNITS.map((u) => ({ value: u, label: u === "l" ? "L" : u }))}
                        width={62}
                        ariaLabel={`Unidad de ${chip.raw}`}
                      />
                    </div>
                  )}
                  <div style={{ flexShrink: 0 }}>
                    <div style={qLabelStyle}>¿Dónde?</div>
                    <ChipLocationRow
                      value={chip.location ?? "nevera"}
                      onChange={(loc) => onUpdateLocation(idx, loc)}
                    />
                  </div>
                </div>

                {usePack && (
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 12 }}>
                    <div style={{ flexShrink: 0 }}>
                      <div style={qLabelStyle}>Contenido</div>
                      <input
                        value={chip.packSizeQty ?? ""}
                        onChange={(e) => onUpdatePackSizeQty(idx, e.target.value)}
                        inputMode="decimal"
                        placeholder="500"
                        aria-label={`Tamaño del envase de ${chip.raw}`}
                        style={{ ...editInputBase, background: FIELD_BG, width: 72, height: 34, padding: "0 6px", textAlign: "center", fontSize: 14, fontWeight: 800 }}
                      />
                    </div>
                    <div style={{ flexShrink: 0 }}>
                      <div style={qLabelStyle}>Ud</div>
                      <StyledPicker
                        value={chip.packSizeUnit ?? sizeUnits[0]}
                        onChange={(v) => onUpdatePackSizeUnit(idx, v)}
                        options={sizeUnits.map((u) => ({ value: u, label: u === "l" ? "L" : u }))}
                        width={62}
                        ariaLabel={`Unidad del contenido de ${chip.raw}`}
                      />
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => onConfirmRow(idx)}
                  disabled={rowDisabled}
                  aria-label={`Guardar ${chip.raw} en casa`}
                  style={{
                    width: "100%", padding: "11px 12px", borderRadius: 12, border: "none",
                    background: rowDisabled ? "#c8d9ce" : GREEN, color: "#fff", fontSize: 13.5, fontWeight: 800,
                    fontFamily: "inherit", cursor: rowDisabled ? "default" : "pointer",
                    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
                  }}
                >
                  {confirming ? <Loader2 size={16} className="mp-spin" /> : <Plus size={16} />}
                  Guardar ingrediente
                </button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// A photo-detected canonical amount (g/ml) reads better scaled up for
// editing — "1000 g de arroz" is really "1 kg" to a person filling the field.
function toDisplayUnit(qty, unit) {
  if (unit === "g" && qty >= 1000) return { qty: qty / 1000, unit: "kg" };
  if (unit === "ml" && qty >= 1000) return { qty: qty / 1000, unit: "l" };
  return { qty, unit };
}

// Ways in, each landing in the same chip list below for quantity/unit review —
// only how a chip gets there changes. "Ticket" is an action (opens the receipt
// (modesFor removed — upload is now a single combined button)

function ModeToggle({ mode, onSelect, modes }) {
  return (
    <div style={modeToggleStyle}>
      {modes.map(({ id, label, Icon }) => {
        const selected = mode === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            aria-pressed={selected}
            title={id === "ticket" ? "Subir ticket de compra" : label}
            style={{
              ...modeToggleBtnStyle,
              ...(selected ? modeToggleBtnOnStyle : {}),
            }}
          >
            <Icon size={14} strokeWidth={2.3} />
            {selected && (
              <span style={{ fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" }}>
                {label}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Pantry input with three ways in — texto, voz (dictado) y foto (OCR de
 * nevera/despensa) — chosen via a segmented control, all funnelling into the
 * same editable-chip review list before saving. Each chip carries a quantity
 * + unit (despensa tracks real stock, not just presence — see
 * 0006_pantry_quantity.sql), so cooking a recipe can later subtract from it.
 *
 * Works signed out too: user_pantry requires auth.uid() (see migration
 * 0002), so a signed-out save goes to the localStorage mirror in
 * lib/pantry.js instead (mergeLocalPantryIntoCloud folds it into the account
 * on first login).
 */
export function PantryInput({
  // Prefer the parent-provided user (PantryScreen already has it) so saves and
  // reloads always hit the same backend — useAuth() alone can lag behind on
  // first paint after login.
  user: userProp = null,
  onSaved,
  onUploadReceipt = null,
  initialTab = "text",
  // Optional controlled tab: when `tab`/`onTabChange` are passed (e.g. the empty
  // state drives the mode from its big illustrated cards), PantryInput follows
  // them and `hideTabs` drops its own segmented control to avoid a double selector.
  tab: tabProp,
  onTabChange,
  hideTabs = false,
  householdId = null,
}) {
  const { user: authUser } = useAuth();
  const user = userProp ?? authUser;
  const [tabState, setTabState] = useState(initialTab); // "text" | "upload"
  const tab = tabProp ?? tabState;
  const setTab = onTabChange ?? setTabState;
  // Under "A mano": qué se está dando de alta. null = aún no elegido (se ven las
  // dos ilustraciones); al tocar una sale su grid. "ingredient" | "cooked_dish".
  const [addCategory, setAddCategory] = useState(null);
  const [chips, setChips] = useState([]);
  const [saving, setSaving] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [pickQuery, setPickQuery] = useState("");
  const [pickAisle, setPickAisle] = useState(null);
  const [dishCat, setDishCat] = useState(null);
  const [focusQtyIndex, setFocusQtyIndex] = useState(null);
  const fileInputRef = useRef(null);

  const addChips = (parsedList, source, qtyUnitByRaw) => {
    setChips((prev) => {
      const next = [...prev];
      for (const item of parsedList) {
        const key = item.ambiguous ? item.raw.toLowerCase() : item.normalized;
        if (next.some((c) => (c.ambiguous ? c.raw.toLowerCase() : c.normalized) === key)) continue;
        const guess = qtyUnitByRaw?.get(item.raw) ?? { qty: 1, unit: "ud" };
        next.push({
          ...item,
          entryQty: guess.qty,
          entryUnit: guess.unit,
          source,
          location: defaultLocationForName(item.raw ?? item.normalized),
          ...chipPackDefaults(item.raw ?? item.normalized),
        });
      }
      return next;
    });
  };

  // ── Photo input (OCR) — multi-select so several fridge shots can go in one go ──
  const handlePhotoFiles = async (files) => {
    if (!files?.length) return;
    setPhotoLoading(true);
    setPhotoError("");
    let addedAny = false;
    try {
      for (const file of files) {
        const found = await extractPantryPhoto(file);
        if (found.length === 0) continue;
        const qtyUnitByRaw = new Map();
        const parsedAll = [];
        for (const item of found) {
          const [parsed] = normalizePantryInput(item.name);
          if (!parsed) continue;
          qtyUnitByRaw.set(parsed.raw, toDisplayUnit(item.qty, item.unit));
          parsedAll.push(parsed);
        }
        if (parsedAll.length > 0) {
          addChips(parsedAll, "photo", qtyUnitByRaw);
          addedAny = true;
        }
      }
      if (!addedAny) setPhotoError("No reconocimos ningún alimento en las fotos.");
    } catch (err) {
      const msg = err instanceof Error && err.message ? err.message : "";
      setPhotoError(msg || "No se pudo leer la foto. Inténtalo de nuevo.");
    } finally {
      setPhotoLoading(false);
    }
  };

  const onPhotoInputChange = (e) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length > 0) handlePhotoFiles(files);
  };

  const triggerPhoto = () => { fileInputRef.current?.click(); };
  const triggerTicket = () => { onUploadReceipt?.(); };

  // ── Chip actions ──
  const removeChip = (idx) => {
    setChips((prev) => prev.filter((_, i) => i !== idx));
    setFocusQtyIndex(null);
  };

  const updateChipQty = (idx, qty) =>
    setChips((prev) => prev.map((c, i) => (i === idx ? { ...c, entryQty: qty } : c)));

  const updateChipUnit = (idx, unit) =>
    setChips((prev) => prev.map((c, i) => (i === idx ? { ...c, entryUnit: unit } : c)));

  const updateChipPackKind = (idx, packKind) =>
    setChips((prev) => prev.map((c, i) => (i === idx ? { ...c, packKind } : c)));

  const updateChipPackSizeQty = (idx, packSizeQty) =>
    setChips((prev) => prev.map((c, i) => (i === idx ? { ...c, packSizeQty } : c)));

  const updateChipPackSizeUnit = (idx, packSizeUnit) =>
    setChips((prev) => prev.map((c, i) => (i === idx ? { ...c, packSizeUnit } : c)));

  // Ubicación por fila: el usuario elige nevera / despensa / congelador con el
  // control "¿Dónde?" que va bajo cada fila (modelo del plato cocinado).
  const updateChipLocation = (idx, loc) =>
    setChips((prev) => prev.map((c, i) => (i === idx ? { ...c, location: loc } : c)));

  // Live rename (esp. after OCR). Re-match after a short pause so typing
  // "pasta" can open ¿Cuál? without fighting every keystroke.
  const nameDebounceRef = useRef(null);
  const updateChipName = (idx, name) => {
    setChips((prev) => prev.map((c, i) => (i === idx ? { ...c, raw: name } : c)));
    if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current);
    nameDebounceRef.current = setTimeout(() => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const [parsed] = normalizePantryInput(trimmed);
      if (!parsed) return;
      setChips((prev) =>
        prev.map((c, i) => {
          if (i !== idx) return c;
          return {
            ...parsed,
            raw: name,
            entryQty: c.entryQty,
            entryUnit: c.entryUnit,
            source: c.source,
            location: c.location ?? defaultLocationForName(name),
            ...chipPackDefaults(name),
          };
        }),
      );
    }, 450);
  };

  const resolveAmbiguous = (idx, candidate) =>
    setChips((prev) =>
      prev.map((c, i) =>
        i === idx
          ? {
              raw: candidate.label,
              normalized: candidate.normalized,
              matched: true,
              ambiguous: false,
              entryQty: c.entryQty,
              entryUnit: c.entryUnit,
              source: c.source,
              location: c.location ?? defaultLocationForName(candidate.label),
              ...chipPackDefaults(candidate.label),
            }
          : c,
      ),
    );

  // ── "Escrito" mode: RecipePlanner's own search/browse-by-category picker.
  // Toggling a catalog name just adds/removes it from the SAME chip list
  // voice/photo feed, so quantity editing and Guardar stay identical no
  // matter which mode added an item.
  const addedNames = new Set(chips.map((c) => c.raw.toLowerCase()));

  const appendChipAndFocusQty = (parsed) => {
    if (!parsed) return;
    const key = parsed.ambiguous ? parsed.raw.toLowerCase() : parsed.normalized;
    const existing = chips.findIndex((c) => (c.ambiguous ? c.raw.toLowerCase() : c.normalized) === key);
    if (existing >= 0) {
      setFocusQtyIndex(existing);
      setPickQuery("");
      return;
    }
    setChips((prev) => [
      ...prev,
      {
        ...parsed,
        entryQty: 1,
        entryUnit: "ud",
        source: "manual",
        location: defaultLocationForName(parsed.raw ?? parsed.normalized),
        ...chipPackDefaults(parsed.raw ?? parsed.normalized),
      },
    ]);
    setFocusQtyIndex(chips.length);
    setPickQuery("");
  };

  const toggleIngredient = (name) => {
    const key = name.toLowerCase();
    const idx = chips.findIndex((c) => c.raw.toLowerCase() === key);
    if (idx >= 0) {
      removeChip(idx);
      return;
    }
    const [parsed] = normalizePantryInput(name);
    appendChipAndFocusQty(parsed);
  };

  const addCustomIngredient = (name) => {
    const trimmed = name.trim();
    if (!trimmed || addedNames.has(trimmed.toLowerCase())) return;
    const [parsed] = normalizePantryInput(trimmed);
    appendChipAndFocusQty(parsed);
  };

  // Per-row "+": commit only that chip to the pantry.
  const handleSaveRow = async (idx) => {
    const chip = chips[idx];
    if (!chip || chip.ambiguous || saving) return;
    setSaving(true);
    let qty;
    let unit;
    let pack = null;
    if (chip.usePack) {
      const converted = stockFromPack({
        count: chip.entryQty,
        kind: chip.packKind,
        sizeQty: chip.packSizeQty,
        sizeUnit: chip.packSizeUnit,
      });
      if (converted) {
        qty = converted.qty;
        unit = converted.unit;
        pack = converted.pack;
      } else {
        ({ qty, unit } = toCanonicalStockQty(chip.entryQty, chip.entryUnit));
      }
    } else {
      ({ qty, unit } = toCanonicalStockQty(chip.entryQty, chip.entryUnit));
    }
    const location = chip.location ?? defaultLocationForName(chip.raw);
    const items = [{
      name: chip.raw,
      normalized: chip.normalized,
      qty,
      unit,
      pack,
      source: chip.source ?? "manual",
      location,
      frozen: location === "congelador",
    }];
    const saved = user ? await addPantryItems(user.id, items, householdId) : addLocalPantryItems(items);
    setSaving(false);
    setChips((prev) => prev.filter((_, i) => i !== idx));
    setFocusQtyIndex(null);
    onSaved?.(saved);
  };

  // Enter / custom add: put the typed name on the pending list and jump
  // focus to its quantity. Each row's "+" commits that item to pantry.
  const handlePlus = () => {
    const trimmed = pickQuery.trim();
    if (trimmed && !addedNames.has(trimmed.toLowerCase())) {
      const [parsed] = normalizePantryInput(trimmed);
      appendChipAndFocusQty(parsed);
    }
  };

  // Cooked dish → its own row (raciones + nevera/congelador). recipeRef keeps a
  // link back to the catalog recipe so DishDetail can reopen it later.
  const handleSaveCookedDish = async ({ recipe, portions, frozen: dishFrozen, cookedAt, dishRole, garnishRef }) => {
    if (!recipe || saving) return;
    setSaving(true);
    const garnish = garnishRef ? GARNISH_BY_ID[garnishRef] : null;
    const displayName = garnish
      ? `${recipe.name} con ${garnish.shortName ?? garnish.name}`
      : recipe.name;
    const items = [{
      name: displayName,
      normalized: recipe.id,
      itemType: "cooked_dish",
      portions,
      recipeRef: recipe.id,
      garnishRef: garnishRef ?? null,
      frozen: dishFrozen,
      cookedAt,
      dishRole,
      source: "manual",
    }];
    const saved = user ? await addPantryItems(user.id, items, householdId) : addLocalPantryItems(items);
    setSaving(false);
    onSaved?.(saved);
  };

  return (
    <div>
      {/* Segmented control: Añadir a mano | Subir */}
      {!hideTabs && (
      <div style={{
        display: "flex", gap: 2, padding: 2, borderRadius: 10,
        background: "#eef4ef", border: "1px solid #dce8e0", marginBottom: 10,
      }}>
        <button
          type="button"
          onClick={() => setTab("text")}
          aria-pressed={tab === "text"}
          style={{
            flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center",
            gap: 6, padding: "7px 10px", borderRadius: 8, border: "none",
            background: tab === "text" ? GREEN : "transparent",
            color: tab === "text" ? "#fff" : "#5a7066",
            fontSize: 12, fontWeight: 800, fontFamily: "inherit", cursor: "pointer",
          }}
        >
          <Pencil size={13} strokeWidth={2.3} />
          A mano
        </button>
        <button
          type="button"
          onClick={() => setTab("upload")}
          aria-pressed={tab === "upload"}
          style={{
            flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center",
            gap: 6, padding: "7px 10px", borderRadius: 8, border: "none",
            background: tab === "upload" ? GREEN : "transparent",
            color: tab === "upload" ? "#fff" : "#5a7066",
            fontSize: 12, fontWeight: 800, fontFamily: "inherit", cursor: "pointer",
          }}
        >
          <Camera size={13} strokeWidth={2.3} />
          Subir
        </button>
      </div>
      )}

      {/* A mano: search bar (+ botón Volver) → grid de categorías → grid */}
      {tab === "text" && (() => {
        const searching = pickQuery.trim().length > 0;
        const effMode = addCategory ?? "ingredient";
        // Nivel abierto dentro del modo: categoría (aisle) o categoría de platos.
        const subLevel = addCategory === "cooked_dish" ? dishCat : pickAisle;
        // El botón de volver acompaña a la barra solo cuando ya hay un modo
        // elegido y no estás buscando (buscar se limpia con su propia X).
        const showBack = Boolean(addCategory) && !searching;
        const handleBack = () => {
          setPickQuery("");
          if (subLevel) {
            setPickAisle(null);
            setDishCat(null);
          } else {
            setAddCategory(null);
            setPickAisle(null);
            setDishCat(null);
          }
        };
        return (
          <>
            <PantrySearchBar
              query={pickQuery}
              onQueryChange={(v) => { setPickQuery(v); if (v) setPickAisle(null); }}
              mode={effMode}
              onBack={showBack ? handleBack : undefined}
              backLabel={subLevel ? "Categorías" : "Volver"}
            />

            {!searching && !addCategory && (
              <AddModeIllustrations
                active={addCategory}
                onPick={(m) => { setAddCategory(m); setPickAisle(null); setDishCat(null); }}
              />
            )}

            {effMode === "ingredient" && (searching || addCategory === "ingredient") && (
              <IngredientPicker
                query={pickQuery}
                onQueryChange={setPickQuery}
                aisle={pickAisle}
                onAisleChange={setPickAisle}
                addedNames={addedNames}
                onToggle={toggleIngredient}
                onAddCustom={addCustomIngredient}
                compact
                hideSearch
                hideBackButton
                onPlus={handlePlus}
                plusDisabled={!pickQuery.trim()}
              />
            )}

            {effMode === "cooked_dish" && (searching || addCategory === "cooked_dish") && (
              <CookedDishPicker
                query={pickQuery}
                dishCat={dishCat}
                onDishCatChange={setDishCat}
                onSave={handleSaveCookedDish}
                saving={saving}
              />
            )}
          </>
        );
      })()}

      {/* Subir: foto + ticket cards */}
      {tab === "upload" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          <button type="button" onClick={triggerPhoto} disabled={photoLoading} style={uploadCardStyle}>
            {photoLoading
              ? <Loader2 size={20} className="mp-spin" color={GREEN} />
              : <Camera size={20} color={GREEN} strokeWidth={2} />}
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#142f1d" }}>Foto de despensa</div>
              <div style={{ fontSize: 11, color: "#7a9082", marginTop: 1 }}>Sube una foto de tu nevera o armario</div>
            </div>
          </button>
          {onUploadReceipt && (
            <button type="button" onClick={triggerTicket} style={uploadCardStyle}>
              <Receipt size={20} color={GREEN} strokeWidth={2} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#142f1d" }}>Ticket de compra</div>
                <div style={{ fontSize: 11, color: "#7a9082", marginTop: 1 }}>Escanea un ticket para rellenar la despensa</div>
              </div>
            </button>
          )}
          {photoError && <p style={{ margin: 0, fontSize: 11.5, color: "#c0392b" }}>{photoError}</p>}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={onPhotoInputChange}
        style={{ display: "none" }}
      />

      <style>{`
        @keyframes mpSpin { to { transform: rotate(360deg); } }
        .mp-spin { animation: mpSpin 0.8s linear infinite; }
      `}</style>

      {tab === "text" && addCategory !== "cooked_dish" && chips.length > 0 && (
        <PantryEditList
          chips={chips}
          onUpdateQty={updateChipQty}
          onUpdateUnit={updateChipUnit}
          onUpdatePackKind={updateChipPackKind}
          onUpdatePackSizeQty={updateChipPackSizeQty}
          onUpdatePackSizeUnit={updateChipPackSizeUnit}
          onUpdateName={updateChipName}
          onUpdateLocation={updateChipLocation}
          onResolve={resolveAmbiguous}
          onRemove={removeChip}
          onConfirmRow={handleSaveRow}
          confirming={saving}
          focusQtyIndex={focusQtyIndex}
        />
      )}
    </div>
  );
}

const uploadCardStyle = {
  display: "flex", alignItems: "center", gap: 12, width: "100%",
  padding: "12px 14px", borderRadius: 12,
  border: "1.5px solid #dde9e2", background: "#fff",
  cursor: "pointer", fontFamily: "inherit", textAlign: "left",
};

const modeToggleStyle = {
  display: "flex",
  gap: 2,
  padding: 2,
  borderRadius: 10,
  background: "#eef4ef",
  border: "1px solid #dce8e0",
  marginBottom: 10,
};

const modeToggleBtnStyle = {
  flex: 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 5,
  padding: "5px 8px",
  borderRadius: 8,
  border: "none",
  background: "transparent",
  color: "#5a7066",
  fontSize: 11,
  fontWeight: 800,
  fontFamily: "inherit",
  cursor: "pointer",
  minWidth: 0,
};

const modeToggleBtnOnStyle = { background: GREEN, color: "#fff" };

