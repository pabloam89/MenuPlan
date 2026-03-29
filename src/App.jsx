import { useState, useEffect, useRef, Fragment } from "react";

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MEALS = ["Comida", "Cena"];

const SAMPLE_DISHES = {
  "Lun-Comida": { name: "Lentejas con verduras", time: "45 min", diff: "Fácil", kcal: 520, tags: ["legumbres"], img: "🍲" },
  "Lun-Cena": { name: "Tortilla francesa + ensalada", time: "15 min", diff: "Fácil", kcal: 380, tags: ["huevos"], img: "🥚" },
  "Mar-Comida": { name: "Pollo al horno con patatas", time: "50 min", diff: "Normal", kcal: 610, tags: ["proteína"], img: "🍗" },
  "Mar-Cena": { name: "Crema de calabacín", time: "25 min", diff: "Fácil", kcal: 290, tags: ["verdura"], img: "🥣" },
  "Mié-Comida": { name: "Pasta boloñesa", time: "35 min", diff: "Fácil", kcal: 580, tags: ["carbos"], img: "🍝" },
  "Mié-Cena": { name: "Salmón a la plancha + brócoli", time: "20 min", diff: "Fácil", kcal: 420, tags: ["pescado"], img: "🐟" },
  "Jue-Comida": { name: "Garbanzos con espinacas", time: "40 min", diff: "Fácil", kcal: 490, tags: ["legumbres"], img: "🥘" },
  "Jue-Cena": { name: "Revuelto de setas + pan", time: "15 min", diff: "Fácil", kcal: 350, tags: ["huevos"], img: "🍳" },
  "Vie-Comida": { name: "Merluza en salsa verde", time: "30 min", diff: "Normal", kcal: 410, tags: ["pescado"], img: "🐠" },
  "Vie-Cena": { name: "Pizza casera", time: "40 min", diff: "Normal", kcal: 620, tags: ["carbos"], img: "🍕" },
  "Sáb-Comida": { name: "Paella mixta", time: "55 min", diff: "Me gusta", kcal: 650, tags: ["arroz"], img: "🥘" },
  "Sáb-Cena": { name: "Hamburguesas caseras", time: "25 min", diff: "Fácil", kcal: 580, tags: ["proteína"], img: "🍔" },
  "Dom-Comida": { name: "Cochinillo al horno", time: "90 min", diff: "Me gusta", kcal: 720, tags: ["proteína"], img: "🥩" },
  "Dom-Cena": { name: "Ensalada César", time: "15 min", diff: "Fácil", kcal: 340, tags: ["verdura"], img: "🥗" },
};

const SHOPPING_LIST = [
  { cat: "Verduras y frutas", items: [
    { name: "Calabacín", qty: "3 uds", price: 1.89, have: false },
    { name: "Espinacas", qty: "400g", price: 1.65, have: false },
    { name: "Brócoli", qty: "1 ud", price: 1.29, have: false },
    { name: "Patatas", qty: "1 kg", price: 1.10, have: false },
    { name: "Setas variadas", qty: "300g", price: 2.85, have: false },
    { name: "Lechuga romana", qty: "1 ud", price: 0.99, have: false },
    { name: "Tomates", qty: "1 kg", price: 2.15, have: false },
  ]},
  { cat: "Carnes y pescados", items: [
    { name: "Pollo entero", qty: "1.5 kg", price: 5.40, have: false },
    { name: "Carne picada", qty: "500g", price: 4.20, have: false },
    { name: "Salmón", qty: "2 lomos", price: 6.80, have: false },
    { name: "Merluza", qty: "4 rodajas", price: 7.50, have: false },
    { name: "Cochinillo", qty: "1.2 kg", price: 12.90, have: false },
  ]},
  { cat: "Legumbres y pasta", items: [
    { name: "Lentejas", qty: "500g", price: 1.25, have: false },
    { name: "Garbanzos", qty: "500g", price: 1.35, have: false },
    { name: "Espaguetis", qty: "500g", price: 0.95, have: false },
    { name: "Harina de pizza", qty: "1 kg", price: 1.10, have: false },
  ]},
  { cat: "Lácteos y huevos", items: [
    { name: "Huevos", qty: "12 uds", price: 2.40, have: false },
    { name: "Queso parmesano", qty: "200g", price: 3.50, have: false },
    { name: "Nata cocinar", qty: "200ml", price: 0.85, have: false },
    { name: "Mozzarella", qty: "250g", price: 1.60, have: false },
  ]},
];

const ANALYTICS_WEEKS = [
  { week: "Sem 10", total: 68.40, merc: 42.10, carr: 26.30 },
  { week: "Sem 11", total: 72.15, merc: 48.90, carr: 23.25 },
  { week: "Sem 12", total: 61.80, merc: 38.50, carr: 23.30 },
  { week: "Sem 13", total: 75.20, merc: 51.20, carr: 24.00 },
  { week: "Sem 14", total: 64.90, merc: 40.60, carr: 24.30 },
  { week: "Sem 15", total: 69.50, merc: 45.30, carr: 24.20 },
];

const PRICE_COMPARE = [
  { product: "Pollo entero 1.5kg", merc: 5.40, carr: 5.85, lidl: 4.95, best: "lidl" },
  { product: "Salmón 2 lomos", merc: 6.80, carr: 7.20, lidl: 6.50, best: "lidl" },
  { product: "Lentejas 500g", merc: 1.25, carr: 1.45, lidl: 1.15, best: "lidl" },
  { product: "Huevos 12 uds", merc: 2.40, carr: 2.65, lidl: 2.30, best: "lidl" },
  { product: "Espaguetis 500g", merc: 0.95, carr: 0.89, lidl: 0.85, best: "lidl" },
  { product: "Tomates 1kg", merc: 2.15, carr: 1.99, lidl: 2.29, best: "carr" },
  { product: "Carne picada 500g", merc: 4.20, carr: 4.50, lidl: 3.99, best: "lidl" },
];

// ─── COMPONENTS ──────────────────────────────────────────────

function Chip({ label, selected, onClick, removable }) {
  return (
    <span onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "6px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer",
      fontWeight: 500, transition: "all .2s",
      background: selected ? "#2d5a3d" : "rgba(45,90,61,.08)",
      color: selected ? "#fff" : "#2d5a3d",
      border: `1.5px solid ${selected ? "#2d5a3d" : "rgba(45,90,61,.2)"}`,
    }}>
      {label}
      {removable && selected && <span style={{ marginLeft: 4 }}>×</span>}
    </span>
  );
}

function ProgressDots({ current, total, onJump }) {
  return (
    <div style={{ display: "flex", gap: 6, justifyContent: "center", padding: "12px 0" }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} onClick={() => onJump(i)} style={{
          width: i === current ? 24 : 8, height: 8, borderRadius: 4,
          background: i <= current ? "#2d5a3d" : "#ddd", cursor: "pointer",
          transition: "all .3s",
        }} />
      ))}
    </div>
  );
}

function BottomNav({ active, onNav }) {
  const items = [
    { id: "menu", icon: "📋", label: "Menú" },
    { id: "shopping", icon: "🛒", label: "Compra" },
    { id: "analytics", icon: "📊", label: "Análisis" },
    { id: "settings", icon: "⚙️", label: "Ajustes" },
  ];
  return (
    <div style={{
      display: "flex", justifyContent: "space-around", padding: "8px 0 12px",
      borderTop: "1px solid #eee", background: "#fff",
      position: "sticky", bottom: 0, zIndex: 10,
    }}>
      {items.map(it => (
        <div key={it.id} onClick={() => onNav(it.id)} style={{
          display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
          cursor: "pointer", opacity: active === it.id ? 1 : 0.45,
          transition: "opacity .2s",
        }}>
          <span style={{ fontSize: 20 }}>{it.icon}</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: "#2d5a3d", letterSpacing: ".3px" }}>{it.label}</span>
        </div>
      ))}
    </div>
  );
}

function SliderInput({ label, value, min, max, step, suffix, onChange }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: "#555" }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#2d5a3d" }}>{value}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)}
        style={{ width: "100%", accentColor: "#2d5a3d" }} />
    </div>
  );
}

// ─── SCREENS ─────────────────────────────────────────────────

function SplashScreen({ onNext }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100%", padding: 32, textAlign: "center" }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>🍽️</div>
      <h1 style={{ fontSize: 32, fontWeight: 800, color: "#1a3a24", margin: 0, letterSpacing: "-1px", fontFamily: "'Playfair Display', serif" }}>MenuPlan</h1>
      <p style={{ color: "#666", fontSize: 15, lineHeight: 1.5, margin: "16px 0 32px", maxWidth: 280 }}>
        Tu menú semanal personalizado.<br />Lista de la compra automática.<br />Gasta menos, come mejor.
      </p>
      <button onClick={onNext} style={{
        background: "#2d5a3d", color: "#fff", border: "none", borderRadius: 14,
        padding: "16px 48px", fontSize: 16, fontWeight: 700, cursor: "pointer",
        boxShadow: "0 4px 20px rgba(45,90,61,.3)", transition: "transform .15s",
      }}>Empezar</button>
      <p style={{ fontSize: 11, color: "#aaa", marginTop: 24 }}>2 minutos - todo es opcional</p>
    </div>
  );
}

function OnboardingMembers({ data, setData, onNext, onSkip }) {
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const addMember = () => {
    if (!name.trim()) return;
    const a = parseInt(age) || 30;
    setData(d => ({ ...d, members: [...d.members, { name: name.trim(), age: a }] }));
    setName(""); setAge("");
  };
  const removeMember = (i) => setData(d => ({ ...d, members: d.members.filter((_, j) => j !== i) }));
  const baby = parseInt(age) > 0 && parseInt(age) < 1;

  return (
    <div style={{ padding: "20px 24px" }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1a3a24", margin: "0 0 4px" }}>¿Quién come en casa?</h2>
      <p style={{ color: "#888", fontSize: 13, margin: "0 0 20px" }}>Mínimo 1 persona para generar tu menú</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre"
          style={{ flex: 2, padding: "12px 14px", borderRadius: 10, border: "1.5px solid #ddd", fontSize: 14, outline: "none" }}
          onKeyDown={e => e.key === "Enter" && addMember()} />
        <input value={age} onChange={e => setAge(e.target.value.replace(/\D/g, ""))} placeholder="Edad"
          style={{ flex: 1, padding: "12px 14px", borderRadius: 10, border: "1.5px solid #ddd", fontSize: 14, outline: "none", inputMode: "numeric" }}
          onKeyDown={e => e.key === "Enter" && addMember()} />
        <button type="button" onClick={addMember} style={{
          background: "#2d5a3d", color: "#fff", border: "none", borderRadius: 10,
          width: 48, minWidth: 48, fontSize: 24, cursor: "pointer", fontWeight: 700,
        }}>+</button>
      </div>
      {baby && <p style={{ fontSize: 12, color: "#c67030", margin: "0 0 8px" }}>⚠️ Bebés menores de 1 año no se incluyen en el menú (próximamente)</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
        {data.members.map((m, i) => (
          <div key={i} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            background: "#f6f9f7", borderRadius: 12, padding: "12px 16px",
          }}>
            <div>
              <span style={{ fontWeight: 700, color: "#1a3a24" }}>{m.name}</span>
              <span style={{ color: "#888", fontSize: 13, marginLeft: 8 }}>{m.age} años</span>
              {m.age <= 12 && <span style={{ background: "#e8f0ea", color: "#2d5a3d", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 8, marginLeft: 8 }}>NIÑO</span>}
            </div>
            <span onClick={() => removeMember(i)} style={{ cursor: "pointer", color: "#ccc", fontSize: 18 }}>×</span>
          </div>
        ))}
      </div>

      {data.members.length > 0 && (
        <div style={{ marginTop: 24, padding: "14px 16px", background: "rgba(45,90,61,.06)", borderRadius: 12, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>💡</span>
          <span style={{ fontSize: 12, color: "#555", lineHeight: 1.4 }}>Con esto ya puedo generar tu primer menú. Sigue configurando para afinar, o salta directo.</span>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
        <button onClick={onSkip} disabled={data.members.length === 0} style={{
          flex: 1, padding: "14px", borderRadius: 12, border: "1.5px solid #2d5a3d",
          background: "transparent", color: "#2d5a3d", fontSize: 14, fontWeight: 700,
          cursor: data.members.length > 0 ? "pointer" : "default",
          opacity: data.members.length > 0 ? 1 : 0.3,
        }}>Ver menú →</button>
        <button onClick={onNext} disabled={data.members.length === 0} style={{
          flex: 1, padding: "14px", borderRadius: 12, border: "none",
          background: data.members.length > 0 ? "#2d5a3d" : "#ccc",
          color: "#fff", fontSize: 14, fontWeight: 700,
          cursor: data.members.length > 0 ? "pointer" : "default",
        }}>Seguir afinando</button>
      </div>
    </div>
  );
}

function OnboardingRestrictions({ data, setData, onNext, onBack }) {
  const allergies = ["Gluten", "Lactosa", "Frutos secos", "Marisco", "Huevo", "Soja"];
  const dislikes = ["Hígado", "Coliflor", "Cebolla", "Pimiento", "Aceitunas", "Berenjena", "Champiñones"];
  const toggle = (field, val) => {
    setData(d => ({
      ...d, [field]: d[field].includes(val) ? d[field].filter(v => v !== val) : [...d[field], val]
    }));
  };
  return (
    <div style={{ padding: "20px 24px" }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1a3a24", margin: "0 0 20px" }}>Restricciones</h2>
      <p style={{ fontSize: 13, fontWeight: 700, color: "#555", marginBottom: 10 }}>Alergias</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
        {allergies.map(a => <Chip key={a} label={a} selected={data.allergies.includes(a)} onClick={() => toggle("allergies", a)} removable />)}
      </div>
      <p style={{ fontSize: 13, fontWeight: 700, color: "#555", marginBottom: 10 }}>No come nadie</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
        {dislikes.map(d => <Chip key={d} label={d} selected={data.dislikes.includes(d)} onClick={() => toggle("dislikes", d)} removable />)}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onBack} style={{ flex: 1, padding: "14px", borderRadius: 12, border: "1.5px solid #ddd", background: "#fff", color: "#555", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>← Atrás</button>
        <button onClick={onNext} style={{ flex: 1, padding: "14px", borderRadius: 12, border: "none", background: "#2d5a3d", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Siguiente</button>
      </div>
    </div>
  );
}

function OnboardingFixedDishes({ data, setData, onNext, onBack }) {
  const [dish, setDish] = useState("");
  const add = () => { if (dish.trim()) { setData(d => ({ ...d, fixedDishes: [...d.fixedDishes, { name: dish.trim(), freq: "semanal" }] })); setDish(""); } };
  const remove = (i) => setData(d => ({ ...d, fixedDishes: d.fixedDishes.filter((_, j) => j !== i) }));
  const setFreq = (i, f) => setData(d => ({ ...d, fixedDishes: d.fixedDishes.map((dd, j) => j === i ? { ...dd, freq: f } : dd) }));
  const freqs = ["semanal", "quincenal", "de vez en cuando"];
  return (
    <div style={{ padding: "20px 24px" }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1a3a24", margin: "0 0 4px" }}>Platos fijos</h2>
      <p style={{ color: "#888", fontSize: 13, margin: "0 0 20px" }}>Platos que no pueden faltar en tu menú</p>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input value={dish} onChange={e => setDish(e.target.value)} placeholder="Ej: Tortilla de patatas"
          style={{ flex: 1, padding: "12px 14px", borderRadius: 10, border: "1.5px solid #ddd", fontSize: 14, outline: "none" }}
          onKeyDown={e => e.key === "Enter" && add()} />
        <button onClick={add} style={{ background: "#2d5a3d", color: "#fff", border: "none", borderRadius: 10, width: 44, fontSize: 22, cursor: "pointer" }}>+</button>
      </div>
      {data.fixedDishes.map((d, i) => (
        <div key={i} style={{ background: "#f6f9f7", borderRadius: 12, padding: "12px 16px", marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontWeight: 700, color: "#1a3a24" }}>{d.name}</span>
            <span onClick={() => remove(i)} style={{ cursor: "pointer", color: "#ccc" }}>×</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {freqs.map(f => <Chip key={f} label={f} selected={d.freq === f} onClick={() => setFreq(i, f)} />)}
          </div>
        </div>
      ))}
      <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
        <button onClick={onBack} style={{ flex: 1, padding: "14px", borderRadius: 12, border: "1.5px solid #ddd", background: "#fff", color: "#555", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>←</button>
        <button onClick={onNext} style={{ flex: 1, padding: "14px", borderRadius: 12, border: "none", background: "#2d5a3d", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Siguiente</button>
      </div>
    </div>
  );
}

function OnboardingMenuModel({ data, setData, onNext, onBack }) {
  const models = [
    { id: "same", icon: "👨‍👩‍👧‍👦", label: "Todos comemos lo mismo" },
    { id: "variation", icon: "🍽️", label: "Base común + variaciones niños" },
    { id: "separate", icon: "🔀", label: "Menús separados adultos / niños" },
  ];
  return (
    <div style={{ padding: "20px 24px" }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1a3a24", margin: "0 0 4px" }}>Modelo de menú</h2>
      <p style={{ color: "#888", fontSize: 13, margin: "0 0 20px" }}>¿Cómo coméis en casa?</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {models.map(m => (
          <div key={m.id} onClick={() => setData(d => ({ ...d, menuModel: m.id }))} style={{
            display: "flex", alignItems: "center", gap: 14, padding: "16px 18px",
            borderRadius: 14, cursor: "pointer", transition: "all .2s",
            background: data.menuModel === m.id ? "rgba(45,90,61,.08)" : "#f8f8f8",
            border: `2px solid ${data.menuModel === m.id ? "#2d5a3d" : "transparent"}`,
          }}>
            <span style={{ fontSize: 28 }}>{m.icon}</span>
            <span style={{ fontWeight: 600, color: "#1a3a24", fontSize: 15 }}>{m.label}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
        <button onClick={onBack} style={{ flex: 1, padding: "14px", borderRadius: 12, border: "1.5px solid #ddd", background: "#fff", color: "#555", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>←</button>
        <button onClick={onNext} style={{ flex: 1, padding: "14px", borderRadius: 12, border: "none", background: "#2d5a3d", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Siguiente</button>
      </div>
    </div>
  );
}

function OnboardingSchedule({ data, setData, onNext, onBack }) {
  const toggle = (person, day, meal) => {
    const key = `${person}-${day}-${meal}`;
    setData(d => ({
      ...d, schedule: d.schedule.includes(key) ? d.schedule.filter(k => k !== key) : [...d.schedule, key]
    }));
  };
  const allOn = data.schedule.length > 20;
  const toggleAll = () => {
    if (allOn) { setData(d => ({ ...d, schedule: [] })); }
    else {
      const all = [];
      data.members.forEach(m => DAYS.forEach(d => MEALS.forEach(ml => all.push(`${m.name}-${d}-${ml}`))));
      setData(d => ({ ...d, schedule: all }));
    }
  };
  const person = data.members[0]?.name || "Todos";

  return (
    <div style={{ padding: "20px 24px" }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1a3a24", margin: "0 0 4px" }}>¿Cuándo coméis en casa?</h2>
      <p style={{ color: "#888", fontSize: 13, margin: "0 0 16px" }}>Tap para activar/desactivar comidas</p>
      <div onClick={toggleAll} style={{
        padding: "10px 16px", borderRadius: 10, background: allOn ? "#2d5a3d" : "#f0f0f0",
        color: allOn ? "#fff" : "#555", fontSize: 13, fontWeight: 600, textAlign: "center",
        cursor: "pointer", marginBottom: 16,
      }}>{allOn ? "✓ Todos siempre" : "Marcar todos"}</div>
      <div style={{ display: "grid", gridTemplateColumns: "auto repeat(7, 1fr)", gap: 4, fontSize: 11 }}>
        <div />
        {DAYS.map(d => <div key={d} style={{ textAlign: "center", fontWeight: 700, color: "#888", padding: 4 }}>{d}</div>)}
        {MEALS.map(meal => (
          <Fragment key={meal}>
            <div style={{ display: "flex", alignItems: "center", fontWeight: 600, color: "#555", fontSize: 11, paddingRight: 6 }}>{meal}</div>
            {DAYS.map(day => {
              const on = data.schedule.includes(`${person}-${day}-${meal}`);
              return (
                <div key={`${day}-${meal}`} onClick={() => toggle(person, day, meal)} style={{
                  width: "100%", aspectRatio: "1", borderRadius: 8, cursor: "pointer",
                  background: on ? "#2d5a3d" : "#f0f0f0", transition: "all .15s",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: on ? "#fff" : "#ccc", fontSize: 14,
                }}>{on ? "✓" : ""}</div>
              );
            })}
          </Fragment>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        <p style={{ fontSize: 11, color: "#999" }}>Excepciones rápidas: cole, trabajo, fuera, variable</p>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button onClick={onBack} style={{ flex: 1, padding: "14px", borderRadius: 12, border: "1.5px solid #ddd", background: "#fff", color: "#555", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>←</button>
        <button onClick={onNext} style={{ flex: 1, padding: "14px", borderRadius: 12, border: "none", background: "#2d5a3d", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Siguiente</button>
      </div>
    </div>
  );
}

function OnboardingGoals({ data, setData, onNext, onBack }) {
  const goals = ["Sano", "Económico", "Rápido", "Deportivo", "Variado", "Sin repetir proteína"];
  const toggle = (g) => setData(d => ({ ...d, goals: d.goals.includes(g) ? d.goals.filter(v => v !== g) : [...d.goals, g] }));
  return (
    <div style={{ padding: "20px 24px" }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1a3a24", margin: "0 0 4px" }}>¿Qué queréis comer?</h2>
      <p style={{ color: "#888", fontSize: 13, margin: "0 0 20px" }}>Selecciona tus prioridades</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
        {goals.map(g => <Chip key={g} label={g} selected={data.goals.includes(g)} onClick={() => toggle(g)} />)}
      </div>
      <SliderInput label="Objetivo calórico" value={data.kcal} min={1200} max={3000} step={100} suffix=" kcal" onChange={v => setData(d => ({ ...d, kcal: v }))} />
      <p style={{ fontSize: 13, fontWeight: 700, color: "#555", marginBottom: 10 }}>Frecuencia mínima semanal</p>
      {[["Legumbres", "legumbres"], ["Verdura", "verdura"], ["Pescado", "pescado"]].map(([label, key]) => (
        <SliderInput key={key} label={label} value={data.freqs[key] || 2} min={0} max={7} step={1} suffix="x" onChange={v => setData(d => ({ ...d, freqs: { ...d.freqs, [key]: v } }))} />
      ))}
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button onClick={onBack} style={{ flex: 1, padding: "14px", borderRadius: 12, border: "1.5px solid #ddd", background: "#fff", color: "#555", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>←</button>
        <button onClick={onNext} style={{ flex: 1, padding: "14px", borderRadius: 12, border: "none", background: "#2d5a3d", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Siguiente</button>
      </div>
    </div>
  );
}

function OnboardingCooking({ data, setData, onNext, onBack }) {
  const levels = [
    { id: "basic", icon: "🔰", label: "Básico", desc: "Lo justo para sobrevivir" },
    { id: "normal", icon: "👨‍🍳", label: "Normal", desc: "Me defiendo bien" },
    { id: "pro", icon: "⭐", label: "Me gusta cocinar", desc: "Disfruto experimentando" },
  ];
  const skills = ["Pasta", "Arroces", "Horno", "Salsas", "Wok", "Repostería", "Guisos", "Plancha"];
  const toggle = (s) => setData(d => ({ ...d, cookSkills: d.cookSkills.includes(s) ? d.cookSkills.filter(v => v !== s) : [...d.cookSkills, s] }));
  return (
    <div style={{ padding: "20px 24px" }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1a3a24", margin: "0 0 4px" }}>¿Quién cocina y cómo?</h2>
      <p style={{ color: "#888", fontSize: 13, margin: "0 0 20px" }}>Para ajustar las recetas a tu nivel</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        {levels.map(l => (
          <div key={l.id} onClick={() => setData(d => ({ ...d, cookLevel: l.id }))} style={{
            display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
            borderRadius: 12, cursor: "pointer",
            background: data.cookLevel === l.id ? "rgba(45,90,61,.08)" : "#f8f8f8",
            border: `2px solid ${data.cookLevel === l.id ? "#2d5a3d" : "transparent"}`,
          }}>
            <span style={{ fontSize: 24 }}>{l.icon}</span>
            <div>
              <div style={{ fontWeight: 700, color: "#1a3a24", fontSize: 14 }}>{l.label}</div>
              <div style={{ fontSize: 12, color: "#888" }}>{l.desc}</div>
            </div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 13, fontWeight: 700, color: "#555", marginBottom: 10 }}>¿Qué se te da bien?</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        {skills.map(s => <Chip key={s} label={s} selected={data.cookSkills.includes(s)} onClick={() => toggle(s)} />)}
      </div>
      <SliderInput label="Tiempo entre semana" value={data.timeWeekday} min={10} max={90} step={5} suffix=" min" onChange={v => setData(d => ({ ...d, timeWeekday: v }))} />
      <SliderInput label="Tiempo finde" value={data.timeWeekend} min={10} max={120} step={5} suffix=" min" onChange={v => setData(d => ({ ...d, timeWeekend: v }))} />
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button onClick={onBack} style={{ flex: 1, padding: "14px", borderRadius: 12, border: "1.5px solid #ddd", background: "#fff", color: "#555", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>←</button>
        <button onClick={onNext} style={{ flex: 1, padding: "14px", borderRadius: 12, border: "none", background: "#2d5a3d", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Siguiente</button>
      </div>
    </div>
  );
}

function OnboardingBudget({ data, setData, onFinish, onBack }) {
  const supers = ["Mercadona", "Carrefour", "Lidl", "Dia", "Alcampo", "Otro"];
  const toggle = (s) => setData(d => ({ ...d, supermarkets: d.supermarkets.includes(s) ? d.supermarkets.filter(v => v !== s) : [...d.supermarkets, s] }));
  return (
    <div style={{ padding: "20px 24px" }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1a3a24", margin: "0 0 4px" }}>Presupuesto y supermercado</h2>
      <p style={{ color: "#888", fontSize: 13, margin: "0 0 20px" }}>Último paso - optimizamos tu menú</p>
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <div onClick={() => setData(d => ({ ...d, hasBudget: false }))} style={{
          flex: 1, padding: "14px", borderRadius: 12, textAlign: "center", cursor: "pointer",
          background: !data.hasBudget ? "rgba(45,90,61,.08)" : "#f8f8f8",
          border: `2px solid ${!data.hasBudget ? "#2d5a3d" : "transparent"}`,
          fontWeight: 600, color: "#1a3a24", fontSize: 14,
        }}>Sin límite</div>
        <div onClick={() => setData(d => ({ ...d, hasBudget: true }))} style={{
          flex: 1, padding: "14px", borderRadius: 12, textAlign: "center", cursor: "pointer",
          background: data.hasBudget ? "rgba(45,90,61,.08)" : "#f8f8f8",
          border: `2px solid ${data.hasBudget ? "#2d5a3d" : "transparent"}`,
          fontWeight: 600, color: "#1a3a24", fontSize: 14,
        }}>Con presupuesto</div>
      </div>
      {data.hasBudget && (
        <SliderInput label="Presupuesto semanal" value={data.budget} min={30} max={200} step={5} suffix=" €" onChange={v => setData(d => ({ ...d, budget: v }))} />
      )}
      <p style={{ fontSize: 13, fontWeight: 700, color: "#555", marginBottom: 10 }}>¿Dónde compras?</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
        {supers.map(s => <Chip key={s} label={s} selected={data.supermarkets.includes(s)} onClick={() => toggle(s)} />)}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onBack} style={{ flex: 1, padding: "14px", borderRadius: 12, border: "1.5px solid #ddd", background: "#fff", color: "#555", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>←</button>
        <button onClick={onFinish} style={{
          flex: 2, padding: "14px", borderRadius: 12, border: "none",
          background: "#2d5a3d", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer",
          boxShadow: "0 4px 20px rgba(45,90,61,.25)",
        }}>🍽️ Generar mi menú</button>
      </div>
    </div>
  );
}

function MenuScreen({ onDishTap, onNav }) {
  const [mode, setMode] = useState("semanal");
  const totalKcal = Object.values(SAMPLE_DISHES).reduce((s, d) => s + d.kcal, 0);
  const totalCost = 68.40;
  const groups = { legumbres: 2, verdura: 3, proteína: 3, pescado: 2, carbos: 2, huevos: 2, arroz: 1 };

  return (
    <div style={{ paddingBottom: 0 }}>
      <div style={{ padding: "16px 24px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1a3a24", margin: 0 }}>Tu menú</h2>
          <div style={{ display: "flex", gap: 4, background: "#f0f0f0", borderRadius: 8, padding: 3 }}>
            {["semanal", "mensual"].map(m => (
              <span key={m} onClick={() => setMode(m)} style={{
                padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                cursor: "pointer", background: mode === m ? "#fff" : "transparent",
                color: mode === m ? "#2d5a3d" : "#999",
                boxShadow: mode === m ? "0 1px 4px rgba(0,0,0,.1)" : "none",
              }}>{m.charAt(0).toUpperCase() + m.slice(1)}</span>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1, background: "#f6f9f7", borderRadius: 12, padding: "10px 14px", textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>Coste estimado</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#2d5a3d" }}>{totalCost.toFixed(2)}€</div>
          </div>
          <div style={{ flex: 1, background: "#f6f9f7", borderRadius: 12, padding: "10px 14px", textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>Media diaria</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#2d5a3d" }}>{Math.round(totalKcal / 7)} kcal</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
          {Object.entries(groups).map(([g, n]) => (
            <span key={g} style={{
              fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
              background: n >= 2 ? "#e8f5e9" : "#fff3e0",
              color: n >= 2 ? "#2e7d32" : "#e65100",
            }}>{g} {n}x</span>
          ))}
        </div>
      </div>

      <div style={{ padding: "0 16px" }}>
        {DAYS.map(day => (
          <div key={day} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#888", textTransform: "uppercase", letterSpacing: 1, padding: "0 8px", marginBottom: 6 }}>{day}</div>
            {MEALS.map(meal => {
              const dish = SAMPLE_DISHES[`${day}-${meal}`];
              if (!dish) return null;
              return (
                <div key={meal} onClick={() => onDishTap(dish, `${day}-${meal}`)} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                  background: "#fff", borderRadius: 14, marginBottom: 6, cursor: "pointer",
                  border: "1px solid #f0f0f0", transition: "box-shadow .2s",
                }}>
                  <span style={{ fontSize: 32 }}>{dish.img}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1a3a24", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{dish.name}</div>
                    <div style={{ fontSize: 11, color: "#999" }}>{meal} - {dish.time} - {dish.diff}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#2d5a3d" }}>{dish.kcal}</div>
                    <div style={{ fontSize: 10, color: "#aaa" }}>kcal</div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div style={{ padding: "12px 24px 16px", display: "flex", gap: 10 }}>
        <button onClick={() => onNav("shopping")} style={{
          flex: 1, padding: "14px", borderRadius: 14, border: "none",
          background: "#2d5a3d", color: "#fff", fontSize: 14, fontWeight: 700,
          cursor: "pointer", boxShadow: "0 4px 20px rgba(45,90,61,.25)",
        }}>Confirmar → Lista de la compra</button>
      </div>
      <BottomNav active="menu" onNav={onNav} />
    </div>
  );
}

function DishDetail({ dish, slotKey, onClose, onReject }) {
  const rejectReasons = ["No me gusta", "Esta semana no", "Tarda demasiado", "Lo comí hace poco"];
  const [rejected, setRejected] = useState(null);
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 100,
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#fff", borderRadius: "24px 24px 0 0", width: "100%", maxWidth: 400,
        maxHeight: "85vh", overflow: "auto", padding: "24px",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
          <div>
            <span style={{ fontSize: 48 }}>{dish.img}</span>
            <h3 style={{ fontSize: 20, fontWeight: 800, color: "#1a3a24", margin: "8px 0 4px" }}>{dish.name}</h3>
          </div>
          <span onClick={onClose} style={{ fontSize: 24, cursor: "pointer", color: "#ccc", padding: 8 }}>×</span>
        </div>

        <div style={{ display: "flex", gap: 16, margin: "12px 0 20px" }}>
          {[["⏱️", dish.time], ["📊", dish.diff], ["🔥", `${dish.kcal} kcal`]].map(([icon, val]) => (
            <div key={icon} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "#666" }}>
              <span>{icon}</span><span>{val}</span>
            </div>
          ))}
        </div>

        <div style={{ background: "#f6f9f7", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1a3a24", marginBottom: 8 }}>Ingredientes</div>
          <div style={{ fontSize: 13, color: "#555", lineHeight: 1.8 }}>
            Ingredientes adaptados a {dish.tags.join(", ")}. Cantidades ajustadas al número de comensales configurado.
          </div>
        </div>

        {dish.tags.includes("proteína") && (
          <div style={{ background: "#fff8f0", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#c67030", marginBottom: 4 }}>👶 Variación niños</div>
            <div style={{ fontSize: 13, color: "#555" }}>Sin especias fuertes, cortado en trozos pequeños</div>
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1a3a24", marginBottom: 10 }}>¿No te convence?</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {rejectReasons.map(r => (
              <Chip key={r} label={r} selected={rejected === r} onClick={() => setRejected(rejected === r ? null : r)} />
            ))}
          </div>
        </div>

        {rejected && (
          <button onClick={() => { onReject(slotKey, rejected); onClose(); }} style={{
            width: "100%", padding: "14px", borderRadius: 12, border: "none",
            background: "#c67030", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer",
          }}>Sustituir plato</button>
        )}
      </div>
    </div>
  );
}

function ShoppingScreen({ onNav }) {
  const [list, setList] = useState(SHOPPING_LIST);
  const [showTicket, setShowTicket] = useState(false);
  const toggleItem = (catIdx, itemIdx) => {
    setList(l => l.map((c, ci) => ci === catIdx ? {
      ...c, items: c.items.map((it, ii) => ii === itemIdx ? { ...it, have: !it.have } : it)
    } : c));
  };
  const total = list.reduce((s, c) => s + c.items.filter(it => !it.have).reduce((ss, it) => ss + it.price, 0), 0);
  const totalItems = list.reduce((s, c) => s + c.items.filter(it => !it.have).length, 0);

  return (
    <div style={{ paddingBottom: 0 }}>
      <div style={{ padding: "16px 24px 0" }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1a3a24", margin: "0 0 4px" }}>Lista de la compra</h2>
        <p style={{ fontSize: 13, color: "#888", margin: "0 0 16px" }}>{totalItems} productos - {total.toFixed(2)}€ estimado</p>
      </div>

      <div style={{ padding: "0 16px" }}>
        {list.map((cat, ci) => (
          <div key={cat.cat} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#888", textTransform: "uppercase", letterSpacing: 1, padding: "0 8px", marginBottom: 8 }}>{cat.cat}</div>
            {cat.items.map((item, ii) => (
              <div key={item.name} onClick={() => toggleItem(ci, ii)} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                background: item.have ? "#f8f8f8" : "#fff", borderRadius: 12, marginBottom: 4,
                cursor: "pointer", border: "1px solid #f0f0f0", opacity: item.have ? 0.5 : 1,
                transition: "all .2s",
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 6, border: `2px solid ${item.have ? "#2d5a3d" : "#ddd"}`,
                  background: item.have ? "#2d5a3d" : "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontSize: 14, flexShrink: 0,
                }}>{item.have ? "✓" : ""}</div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#1a3a24", textDecoration: item.have ? "line-through" : "none" }}>{item.name}</span>
                  <span style={{ fontSize: 12, color: "#999", marginLeft: 8 }}>{item.qty}</span>
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#2d5a3d" }}>{item.price.toFixed(2)}€</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div style={{ padding: "0 24px 8px" }}>
        <button onClick={() => setShowTicket(true)} style={{
          width: "100%", padding: "14px", borderRadius: 14, border: "2px dashed #ccc",
          background: "#fafafa", color: "#888", fontSize: 14, fontWeight: 600, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>📸 Subir ticket de compra</button>
      </div>

      {showTicket && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 100,
          display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={() => setShowTicket(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "#fff", borderRadius: 20, padding: 24, width: "85%", maxWidth: 350,
          }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: "#1a3a24", margin: "0 0 12px" }}>📸 Subir ticket</h3>
            <p style={{ fontSize: 13, color: "#666", lineHeight: 1.5, marginBottom: 16 }}>
              Haz una foto del ticket de compra. Extraemos productos, cantidades y precios automáticamente.
            </p>
            <div style={{
              border: "2px dashed #ccc", borderRadius: 14, padding: "40px 20px", textAlign: "center",
              marginBottom: 16, background: "#fafafa",
            }}>
              <span style={{ fontSize: 40 }}>📷</span>
              <p style={{ fontSize: 13, color: "#999", margin: "8px 0 0" }}>Tap para abrir la cámara</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {["Mercadona", "Carrefour", "Lidl"].map(s => (
                <span key={s} style={{
                  flex: 1, padding: "8px", borderRadius: 8, textAlign: "center",
                  fontSize: 11, fontWeight: 600, background: "#f0f0f0", color: "#555",
                }}>
                  {s}
                </span>
              ))}
            </div>
            <p style={{ fontSize: 11, color: "#aaa", marginTop: 12, textAlign: "center" }}>
              También compatible con ticket digital
            </p>
          </div>
        </div>
      )}
      <BottomNav active="shopping" onNav={onNav} />
    </div>
  );
}

function AnalyticsScreen({ onNav }) {
  const maxTotal = Math.max(...ANALYTICS_WEEKS.map(w => w.total));
  const avgWeekly = ANALYTICS_WEEKS.reduce((s, w) => s + w.total, 0) / ANALYTICS_WEEKS.length;
  const [tab, setTab] = useState("gasto");

  return (
    <div style={{ paddingBottom: 0 }}>
      <div style={{ padding: "16px 24px 0" }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1a3a24", margin: "0 0 16px" }}>Análisis</h2>
        <div style={{ display: "flex", gap: 4, background: "#f0f0f0", borderRadius: 8, padding: 3, marginBottom: 20 }}>
          {["gasto", "comparar", "nutrición"].map(t => (
            <span key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: "8px", borderRadius: 6, fontSize: 12, fontWeight: 600,
              cursor: "pointer", textAlign: "center",
              background: tab === t ? "#fff" : "transparent",
              color: tab === t ? "#2d5a3d" : "#999",
              boxShadow: tab === t ? "0 1px 4px rgba(0,0,0,.1)" : "none",
            }}>{t.charAt(0).toUpperCase() + t.slice(1)}</span>
          ))}
        </div>
      </div>

      {tab === "gasto" && (
        <div style={{ padding: "0 24px" }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
            <div style={{ flex: 1, background: "#f6f9f7", borderRadius: 12, padding: "14px", textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#888" }}>Media semanal</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#2d5a3d" }}>{avgWeekly.toFixed(0)}€</div>
            </div>
            <div style={{ flex: 1, background: "#f6f9f7", borderRadius: 12, padding: "14px", textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#888" }}>Este mes</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#2d5a3d" }}>{(avgWeekly * 4.3).toFixed(0)}€</div>
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            {ANALYTICS_WEEKS.map(w => (
              <div key={w.week} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: "#888", width: 48, flexShrink: 0 }}>{w.week}</span>
                <div style={{ flex: 1, height: 28, background: "#f0f0f0", borderRadius: 8, overflow: "hidden", display: "flex" }}>
                  <div style={{ width: `${(w.merc / maxTotal) * 100}%`, background: "#2d5a3d", borderRadius: "8px 0 0 8px", display: "flex", alignItems: "center", paddingLeft: 8 }}>
                    <span style={{ fontSize: 10, color: "#fff", fontWeight: 600 }}>{w.merc.toFixed(0)}€</span>
                  </div>
                  <div style={{ width: `${(w.carr / maxTotal) * 100}%`, background: "#5a9e6f", display: "flex", alignItems: "center", paddingLeft: 6 }}>
                    <span style={{ fontSize: 10, color: "#fff", fontWeight: 600 }}>{w.carr.toFixed(0)}€</span>
                  </div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#1a3a24", width: 42, textAlign: "right" }}>{w.total.toFixed(0)}€</span>
              </div>
            ))}
            <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#888" }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: "#2d5a3d" }} /> Mercadona
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#888" }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: "#5a9e6f" }} /> Carrefour
              </div>
            </div>
          </div>

          <div style={{ background: "#fff8f0", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#c67030" }}>⚠️ Esta cesta te salió 6,80€ más cara que el mes pasado</span>
          </div>
        </div>
      )}

      {tab === "comparar" && (
        <div style={{ padding: "0 16px" }}>
          <p style={{ fontSize: 13, color: "#666", padding: "0 8px", marginBottom: 12 }}>
            Precios reales de tu comunidad de usuarios - basados en tickets subidos
          </p>
          <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid #eee" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 60px 60px", background: "#f6f9f7", padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "#888" }}>
              <span>Producto</span><span style={{ textAlign: "center" }}>Merc.</span><span style={{ textAlign: "center" }}>Carr.</span><span style={{ textAlign: "center" }}>Lidl</span>
            </div>
            {PRICE_COMPARE.map(p => (
              <div key={p.product} style={{ display: "grid", gridTemplateColumns: "1fr 60px 60px 60px", padding: "10px 14px", borderTop: "1px solid #f0f0f0", fontSize: 13 }}>
                <span style={{ fontWeight: 600, color: "#1a3a24", fontSize: 12 }}>{p.product}</span>
                {["merc", "carr", "lidl"].map(store => (
                  <span key={store} style={{
                    textAlign: "center", fontWeight: p.best === store ? 800 : 400,
                    color: p.best === store ? "#2d5a3d" : "#666",
                    background: p.best === store ? "#e8f5e9" : "transparent",
                    borderRadius: 6, padding: "2px 0",
                  }}>{p[store].toFixed(2)}€</span>
                ))}
              </div>
            ))}
          </div>
          <div style={{ background: "#e8f5e9", borderRadius: 12, padding: "14px 16px", marginTop: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#2d5a3d" }}>💡 Comprando todo en Lidl ahorrarías ~4,20€ esta semana</span>
          </div>
        </div>
      )}

      {tab === "nutrición" && (
        <div style={{ padding: "0 24px" }}>
          <div style={{ marginBottom: 20 }}>
            {[
              { group: "Legumbres", current: 2, target: 2, color: "#4caf50" },
              { group: "Verdura", current: 3, target: 3, color: "#4caf50" },
              { group: "Pescado", current: 2, target: 2, color: "#4caf50" },
              { group: "Fruta", current: 1, target: 3, color: "#ff9800" },
              { group: "Lácteos", current: 4, target: 3, color: "#4caf50" },
            ].map(g => (
              <div key={g.group} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#1a3a24" }}>{g.group}</span>
                  <span style={{ fontSize: 12, color: g.current >= g.target ? "#4caf50" : "#ff9800", fontWeight: 700 }}>{g.current}/{g.target}x sem</span>
                </div>
                <div style={{ height: 8, background: "#f0f0f0", borderRadius: 4 }}>
                  <div style={{ height: "100%", width: `${Math.min(100, (g.current / g.target) * 100)}%`, background: g.color, borderRadius: 4, transition: "width .5s" }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ background: "#fff8f0", borderRadius: 12, padding: "14px 16px" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#c67030" }}>⚠️ Llevas 3 semanas sin llegar al mínimo de fruta</span>
          </div>
        </div>
      )}
      <div style={{ height: 16 }} />
      <BottomNav active="analytics" onNav={onNav} />
    </div>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState("splash");
  const [onbStep, setOnbStep] = useState(0);
  const [selectedDish, setSelectedDish] = useState(null);
  const [data, setData] = useState({
    members: [], allergies: [], dislikes: [], fixedDishes: [],
    menuModel: "same", schedule: [], goals: [], kcal: 2000,
    freqs: { legumbres: 2, verdura: 3, pescado: 2 },
    cookLevel: "normal", cookSkills: [], timeWeekday: 30, timeWeekend: 60,
    hasBudget: false, budget: 80, supermarkets: [],
  });

  const onbScreens = [
    <OnboardingMembers data={data} setData={setData} onNext={() => setOnbStep(1)} onSkip={() => setScreen("menu")} />,
    <OnboardingRestrictions data={data} setData={setData} onNext={() => setOnbStep(2)} onBack={() => setOnbStep(0)} />,
    <OnboardingFixedDishes data={data} setData={setData} onNext={() => setOnbStep(3)} onBack={() => setOnbStep(1)} />,
    <OnboardingMenuModel data={data} setData={setData} onNext={() => setOnbStep(4)} onBack={() => setOnbStep(2)} />,
    <OnboardingSchedule data={data} setData={setData} onNext={() => setOnbStep(5)} onBack={() => setOnbStep(3)} />,
    <OnboardingGoals data={data} setData={setData} onNext={() => setOnbStep(6)} onBack={() => setOnbStep(4)} />,
    <OnboardingCooking data={data} setData={setData} onNext={() => setOnbStep(7)} onBack={() => setOnbStep(5)} />,
    <OnboardingBudget data={data} setData={setData} onFinish={() => setScreen("menu")} onBack={() => setOnbStep(6)} />,
  ];

  const handleNav = (id) => {
    if (id === "settings") { setScreen("onboarding"); setOnbStep(0); }
    else setScreen(id);
  };

  const containerRef = useRef(null);
  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0;
  }, [screen, onbStep]);

  return (
    <div style={{
      maxWidth: 400, margin: "0 auto", minHeight: "100vh",
      background: "#fff", fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
      position: "relative", overflow: "hidden",
    }}>
      <div ref={containerRef} style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        {screen === "splash" && <SplashScreen onNext={() => setScreen("onboarding")} />}

        {screen === "onboarding" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <ProgressDots current={onbStep} total={8} onJump={setOnbStep} />
            <div style={{ flex: 1 }}>{onbScreens[onbStep]}</div>
            {onbStep > 0 && data.members.length > 0 && (
              <div style={{ padding: "0 24px 16px", textAlign: "center" }}>
                <span onClick={() => setScreen("menu")} style={{
                  fontSize: 13, color: "#2d5a3d", fontWeight: 600, cursor: "pointer",
                  textDecoration: "underline", textDecorationStyle: "dotted",
                }}>Saltar al menú →</span>
              </div>
            )}
          </div>
        )}

        {screen === "menu" && (
          <MenuScreen onDishTap={(dish, key) => setSelectedDish({ dish, key })} onNav={handleNav} />
        )}

        {screen === "shopping" && <ShoppingScreen onNav={handleNav} />}
        {screen === "analytics" && <AnalyticsScreen onNav={handleNav} />}
      </div>

      {selectedDish && (
        <DishDetail
          dish={selectedDish.dish} slotKey={selectedDish.key}
          onClose={() => setSelectedDish(null)}
          onReject={(key, reason) => { setSelectedDish(null); }}
        />
      )}
    </div>
  );
}
