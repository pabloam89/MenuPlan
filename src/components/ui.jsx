import { initialsOf } from "../lib/stages.js";
import { BarChart3, ClipboardList, Settings, ShoppingCart } from "lucide-react";

export function Chip({ label, selected, onClick, removable }) {
  return (
    <span
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "6px 14px",
        borderRadius: 20,
        fontSize: 13,
        cursor: "pointer",
        fontWeight: 500,
        transition: "all .2s",
        background: selected ? "#2d5a3d" : "rgba(45,90,61,.08)",
        color: selected ? "#fff" : "#2d5a3d",
        border: `1.5px solid ${selected ? "#2d5a3d" : "rgba(45,90,61,.2)"}`,
      }}
    >
      {label}
      {removable && selected && <span style={{ marginLeft: 4 }}>×</span>}
    </span>
  );
}

export function ProgressDots({ current, total, onJump }) {
  return (
    <div style={{ display: "flex", gap: 6, justifyContent: "center", padding: "12px 0" }}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          onClick={() => onJump(i)}
          style={{
            width: i === current ? 24 : 8,
            height: 8,
            borderRadius: 4,
            background: i <= current ? "#2d5a3d" : "#ddd",
            cursor: "pointer",
            transition: "all .3s",
          }}
        />
      ))}
    </div>
  );
}

export function BottomNav({ active, onNav }) {
  const items = [
    { id: "menu", icon: ClipboardList, label: "Menú" },
    { id: "shopping", icon: ShoppingCart, label: "Compra" },
    { id: "analytics", icon: BarChart3, label: "Análisis" },
    { id: "settings", icon: Settings, label: "Ajustes" },
  ];
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-around",
        padding: "8px 0 12px",
        borderTop: "1px solid #eee",
        background: "#fff",
        position: "sticky",
        bottom: 0,
        zIndex: 10,
      }}
    >
      {items.map((it) => (
        <div
          key={it.id}
          onClick={() => onNav(it.id)}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
            cursor: "pointer",
            opacity: active === it.id ? 1 : 0.45,
            transition: "opacity .2s",
          }}
        >
          <it.icon size={18} color="#2d5a3d" />
          <span style={{ fontSize: 10, fontWeight: 600, color: "#2d5a3d", letterSpacing: ".3px" }}>
            {it.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function SliderInput({ label, value, min, max, step, suffix, onChange }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: "#555" }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#2d5a3d" }}>
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        style={{ width: "100%", accentColor: "#2d5a3d" }}
      />
    </div>
  );
}

export function Avatar({ name, size = 28, color = "#2d5a3d", title }) {
  return (
    <span
      title={title ?? name}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        color: "#fff",
        fontSize: Math.round(size * 0.42),
        fontWeight: 700,
        letterSpacing: ".3px",
        flexShrink: 0,
      }}
    >
      {initialsOf(name)}
    </span>
  );
}

export function AvatarStack({ names, size = 24, max = 4, color = "#2d5a3d" }) {
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      {shown.map((n, i) => (
        <span
          key={i}
          style={{
            marginLeft: i === 0 ? 0 : -8,
            border: "2px solid #fff",
            borderRadius: "50%",
            display: "inline-flex",
          }}
        >
          <Avatar name={n} size={size} color={color} />
        </span>
      ))}
      {extra > 0 && (
        <span
          title={names.slice(max).join(", ")}
          style={{
            marginLeft: -8,
            border: "2px solid #fff",
            background: "#999",
            color: "#fff",
            width: size,
            height: size,
            borderRadius: "50%",
            fontSize: Math.round(size * 0.42),
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          +{extra}
        </span>
      )}
    </span>
  );
}
