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

export function ProgressDots({ current, total, onJump, compact = false }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: compact ? 4 : 6,
        justifyContent: "center",
        padding: compact ? 0 : "12px 0",
        width: "100%",
      }}
    >
      {Array.from({ length: total }, (_, i) => {
        const isActive = i === current;
        const isDone   = i < current;
        return (
          <div
            key={i}
            onClick={() => onJump(i)}
            style={{
              flex:         1,
              height:       isActive ? 5 : 4,
              borderRadius: 99,
              background:   isDone ? "#2d5a3d" : isActive ? "#4cba6e" : "#d6e6db",
              cursor:       "pointer",
              transition:   "all .35s cubic-bezier(.4,0,.2,1)",
              boxShadow:    isActive ? "0 0 6px rgba(76,186,110,.6)" : "none",
            }}
          />
        );
      })}
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

export function SliderInput({ label, value, min, max, step, suffix, onChange, icon: Icon }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ background: "#fff", border: "1px solid #eef2ef", borderRadius: 16, padding: "14px 16px 10px", marginBottom: 12 }}>
      <style>{`
        .sl-ios { -webkit-appearance: none; appearance: none; width: 100%; height: 4px; background: transparent; outline: none; cursor: pointer; position: relative; z-index: 1; margin: 0; }
        .sl-ios::-webkit-slider-thumb { -webkit-appearance: none; width: 28px; height: 28px; border-radius: 50%; background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,.18), 0 0 0 1.5px rgba(0,0,0,.07); cursor: pointer; transition: box-shadow .1s; }
        .sl-ios:active::-webkit-slider-thumb { box-shadow: 0 3px 14px rgba(0,0,0,.24), 0 0 0 1.5px rgba(0,0,0,.09); }
        .sl-ios::-moz-range-thumb { width: 28px; height: 28px; border: none; border-radius: 50%; background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,.18); cursor: pointer; }
      `}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#444" }}>
          {Icon && <Icon size={15} color="#2d5a3d" />}
          {label}
        </span>
        <span style={{ fontSize: 15, fontWeight: 800, color: "#2d5a3d" }}>{value}{suffix}</span>
      </div>
      <div style={{ position: "relative", height: 28, display: "flex", alignItems: "center" }}>
        <div style={{ position: "absolute", left: 0, right: 0, height: 4, borderRadius: 2, background: "#e5ede7", pointerEvents: "none" }} />
        <div style={{ position: "absolute", left: 0, height: 4, borderRadius: 2, background: "#2d5a3d", width: `${pct}%`, pointerEvents: "none" }} />
        <input
          className="sl-ios"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(+e.target.value)}
        />
      </div>
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
