import { useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, Calendar, ChevronDown, ClipboardList, CookingPot, Home, Refrigerator, ShoppingCart, UserCircle, X } from "lucide-react";
import { initialsOf } from "../lib/stages.js";
import { formatWeekRangeLabel, getWeekDates } from "../lib/weekCalendar.js";
import { adhocReasonLabel } from "../lib/groups.js";

const GROUP_ABBREV = { Adultos: "A", Niños: "N", Bebé: "B", Familia: "F" };

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

export const APP_SHELL_MAX_WIDTH = 420;
export const BOTTOM_NAV_HEIGHT = 80;

export function SegmentedControl({ options, value, onChange, style, activeDark }) {
  return (
    <div
      style={{
        display: "flex",
        background: "#f0f4f1",
        borderRadius: 12,
        padding: 3,
        ...style,
      }}
    >
      {options.map(({ id, label, Icon }) => {
        const sel = value === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            style={{
              flex: 1,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "7px 0",
              borderRadius: 9,
              border: "none",
              background: sel ? (activeDark ? "#2d5a3d" : "#fff") : "transparent",
              color: sel ? (activeDark ? "#fff" : "#142f1d") : "#7a8a7f",
              fontSize: 13,
              fontWeight: 800,
              cursor: "pointer",
              fontFamily: "inherit",
              boxShadow: sel && !activeDark ? "0 1px 4px rgba(0,0,0,.1)" : "none",
              transition: "all .15s",
            }}
          >
            {Icon && <Icon size={15} strokeWidth={2.4} />}
            {label}
          </button>
        );
      })}
    </div>
  );
}

// size="sm" is an opt-in compact variant (e.g. inline next to a segmented
// control where there's no room for the full-size 48×28 switch) — default
// stays exactly as before for every existing caller.
export function ToggleSwitch({ checked, onChange, label, size = "md" }) {
  const sm = size === "sm";
  const trackW = sm ? 34 : 48;
  const trackH = sm ? 20 : 28;
  const thumb = sm ? 16 : 24;
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: sm ? 6 : 12,
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      {label ? (
        <span style={{ fontSize: sm ? 12 : 14, fontWeight: 700, color: "#142f1d" }}>{label}</span>
      ) : null}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          width: trackW,
          height: trackH,
          borderRadius: 999,
          border: "none",
          padding: 2,
          background: checked ? "#2d5a3d" : "#d4e0d8",
          cursor: "pointer",
          flexShrink: 0,
          transition: "background .2s",
        }}
      >
        <span
          style={{
            display: "block",
            width: thumb,
            height: thumb,
            borderRadius: 999,
            background: "#fff",
            transform: checked ? `translateX(${trackW - thumb - 4}px)` : "translateX(0)",
            transition: "transform .2s",
            boxShadow: "0 1px 4px rgba(0,0,0,.12)",
          }}
        />
      </button>
    </label>
  );
}

export function bottomNavSpacer() {
  return `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom, 0px))`;
}

// One single bar everywhere in the app — it used to swap its 4-5 items
// depending on a "home"/"menu" context prop, which meant the tabs under your
// thumb silently changed screen to screen (a real source of "me pierdo" —
// see product discussion 2026-07-23). Now it's always these 5, in this order,
// full stop. Screens that lost their tab (Menús, Análisis, Perfil) are still
// reachable — just as a header icon from the tab they conceptually belong to
// (Menús + Análisis-cocina from "Menú"; Análisis-gasto + tickets from
// "En casa"; Perfil from "Inicio") instead of competing for one of 5 slots.
const NAV_ITEMS = [
  { id: "dashboard", icon: Home,          label: "Inicio" },
  { id: "pantry",    icon: Refrigerator,  label: "En casa" },
  { id: "menu",      icon: ClipboardList, label: "Menú", highlight: true },
  { id: "recipes",   icon: BookOpen,      label: "Recetas" },
  { id: "shopping",  icon: ShoppingCart,  label: "Compra" },
];

export function BottomNav({ active, onNav }) {
  const items = NAV_ITEMS;
  const nav = (
    <nav
      aria-label="Navegación principal"
      style={{
        position: "fixed",
        left: "50%",
        bottom: 0,
        transform: "translateX(-50%)",
        width: "100%",
        maxWidth: APP_SHELL_MAX_WIDTH,
        zIndex: 100,
        display: "flex",
        justifyContent: "center",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        background: "linear-gradient(to top, #fff 88%, rgba(255,255,255,0))",
        pointerEvents: "none",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          pointerEvents: "auto",
          width: "100%",
          display: "flex",
          alignItems: "stretch",
          gap: 4,
          padding: "8px 6px 10px",
          marginBottom: 4,
          borderRadius: "18px 18px 0 0",
          borderTop: "1px solid #e0eae3",
          background: "#fff",
          boxShadow: "0 -6px 24px rgba(20,47,29,.08)",
        }}
      >
        {items.map((it) => {
          const sel = active === it.id;
          return (
            <button
              key={it.id}
              type="button"
              data-coach={`nav-${it.id}`}
              onClick={() => onNav(it.id)}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                padding: "4px 0",
                border: "none",
                borderRadius: 12,
                background: sel ? "#f0f7f2" : "transparent",
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "background .15s ease, box-shadow .15s ease",
                boxShadow: sel ? "inset 0 0 0 1px #d4e6da" : "none",
              }}
            >
              {it.highlight ? (
                // The core "Menú" tab is elevated in a solid green circle so it
                // stands out as the primary destination in the nav.
                <span
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: "50%",
                    background: "#2d5a3d",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 3px 10px rgba(45,90,61,.35)",
                    marginTop: -2,
                  }}
                >
                  <it.icon size={19} color="#fff" strokeWidth={2.4} />
                </span>
              ) : (
                <it.icon
                  size={20}
                  color={sel ? "#2d5a3d" : "#9ab0a1"}
                  strokeWidth={sel ? 2.4 : 2}
                />
              )}
              <span
                style={{
                  fontSize: 10,
                  fontWeight: sel || it.highlight ? 800 : 600,
                  color: sel || it.highlight ? "#1a3a24" : "#9ab0a1",
                  letterSpacing: ".2px",
                  lineHeight: 1,
                }}
              >
                {it.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );

  return createPortal(nav, document.body);
}

export function SliderInput({ label, value, min, max, step, suffix, valueLabel, onChange, icon: Icon }) {
  const pct = ((value - min) / (max - min)) * 100;
  const display = valueLabel ?? `${value}${suffix ?? ""}`;
  return (
    <div style={{ background: "#fff", border: "1px solid #eef2ef", borderRadius: 16, padding: "14px 16px 10px", marginBottom: 12 }}>
      <style>{`
        .sl-ios { -webkit-appearance: none; appearance: none; width: 100%; height: 28px; background: transparent; outline: none; cursor: pointer; position: relative; z-index: 1; margin: 0; }
        .sl-ios::-webkit-slider-runnable-track { background: transparent; height: 4px; }
        .sl-ios::-moz-range-track { background: transparent; height: 4px; border: none; }
        .sl-ios::-webkit-slider-thumb { -webkit-appearance: none; width: 28px; height: 28px; border-radius: 50%; background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,.18), 0 0 0 1.5px rgba(0,0,0,.07); cursor: pointer; transition: box-shadow .1s; margin-top: -12px; }
        .sl-ios:active::-webkit-slider-thumb { box-shadow: 0 3px 14px rgba(0,0,0,.24), 0 0 0 1.5px rgba(0,0,0,.09); }
        .sl-ios::-moz-range-thumb { width: 28px; height: 28px; border: none; border-radius: 50%; background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,.18); cursor: pointer; }
      `}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#444" }}>
          {Icon && <Icon size={15} color="#2d5a3d" />}
          {label}
        </span>
        <span style={{ fontSize: 15, fontWeight: 800, color: "#2d5a3d" }}>{display}</span>
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

function GoogleGlyph({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export function GoogleButton({ onClick, label = "Continuar con Google", variant = "light" }) {
  const dark = variant === "dark";
  const [pressed, setPressed] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await onClick?.();
    } catch {
      setLoading(false);
    }
    // On success the page redirects — no need to reset loading
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      onMouseDown={() => { if (!loading) setPressed(true); }}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      onTouchStart={() => { if (!loading) setPressed(true); }}
      onTouchEnd={() => setPressed(false)}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: "15px 20px",
        borderRadius: 999,
        border: dark ? "1.5px solid rgba(255,255,255,.25)" : "1.5px solid #dbe5de",
        background: "#fff",
        color: "#1a3a24",
        fontSize: 15,
        fontWeight: 800,
        cursor: loading ? "default" : "pointer",
        fontFamily: "inherit",
        boxShadow: dark ? "0 10px 28px rgba(0,0,0,.35)" : "0 2px 10px rgba(20,47,29,.08)",
        transform: pressed ? "scale(.97)" : "scale(1)",
        transition: "transform .15s ease",
        opacity: loading ? 0.75 : 1,
      }}
    >
      {loading ? (
        <svg
          width={18}
          height={18}
          viewBox="0 0 18 18"
          className="rotating"
          style={{ flexShrink: 0 }}
          aria-hidden="true"
        >
          <circle cx="9" cy="9" r="7" fill="none" stroke="#dbe5de" strokeWidth="2.5" />
          <path d="M9 2 A7 7 0 0 1 16 9" fill="none" stroke="#2d5a3d" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      ) : (
        <GoogleGlyph size={18} />
      )}
      {loading ? "Redirigiendo…" : label}
    </button>
  );
}

export function GhostPillButton({ onClick, children, tone = "light" }) {
  const [pressed, setPressed] = useState(false);
  const light = tone === "light";
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "13px 20px",
        borderRadius: 999,
        border: light ? "1.5px solid rgba(255,255,255,.4)" : "1.5px solid #dbe5de",
        background: pressed
          ? light
            ? "rgba(255,255,255,.22)"
            : "#eef4f0"
          : light
            ? "rgba(255,255,255,.08)"
            : "transparent",
        color: light ? "#fff" : "#1a3a24",
        fontSize: 14.5,
        fontWeight: 700,
        cursor: "pointer",
        fontFamily: "inherit",
        transform: pressed ? "scale(.97)" : "scale(1)",
        transition: "transform .15s ease, background .15s ease",
      }}
    >
      {children}
    </button>
  );
}

export function Avatar({ name, size = 28, color = "#2d5a3d", title, photo }) {
  if (photo) {
    return (
      <span
        title={title ?? name}
        style={{
          display: "inline-flex",
          width: size,
          height: size,
          borderRadius: "50%",
          overflow: "hidden",
          flexShrink: 0,
          background: color,
        }}
      >
        <img
          src={photo}
          alt={name ?? ""}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      </span>
    );
  }
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

export function WeekRangeBadge({ label, hideLabel = false, topLabel = "Semana" }) {
  const weekLabel = label ?? formatWeekRangeLabel(getWeekDates());

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: hideLabel ? 7 : 8,
        padding: hideLabel ? "6px 10px" : "7px 11px",
        borderRadius: hideLabel ? 10 : 12,
        background: "#f4f8f5",
        border: "1px solid #e0eae3",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          width: hideLabel ? 22 : 28,
          height: hideLabel ? 22 : 28,
          borderRadius: hideLabel ? 7 : 8,
          background: "#2d5a3d",
          color: "#fff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Calendar size={hideLabel ? 13 : 14} />
      </span>
      {hideLabel ? (
        <span
          style={{
            fontSize: 13,
            fontWeight: 900,
            color: "#142f1d",
            letterSpacing: "-.2px",
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          {weekLabel}
        </span>
      ) : (
        <div>
          <div
            style={{
              fontSize: 9,
              fontWeight: 800,
              color: "#8d978f",
              textTransform: "uppercase",
              letterSpacing: 0.9,
              lineHeight: 1,
              marginBottom: 3,
            }}
          >
            {topLabel}
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 900,
              color: "#142f1d",
              letterSpacing: "-.2px",
              lineHeight: 1,
              whiteSpace: "nowrap",
            }}
          >
            {weekLabel}
          </div>
        </div>
      )}
    </div>
  );
}

export function ScopeCircle({ label, abbrev, Icon, color, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 5,
        padding: 0,
        border: "none",
        background: "transparent",
        cursor: "pointer",
        fontFamily: "inherit",
        minWidth: 48,
      }}
    >
      <span
        style={{
          width: 46,
          height: 46,
          borderRadius: 999,
          background: active ? color : "#fff",
          border: `2.5px solid ${color}`,
          color: active ? "#fff" : color,
          fontSize: 15,
          fontWeight: 900,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: active ? `0 4px 14px ${color}55` : "none",
          transition: "all .18s ease",
        }}
      >
        {Icon ? <Icon size={19} /> : abbrev}
      </span>
      <span
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: active ? color : "#8d978f",
          letterSpacing: "-.1px",
        }}
      >
        {label}
      </span>
    </button>
  );
}

export function GroupScopePicker({ groups, scope, onChange, style }) {
  const todosActive = scope === "all";

  return (
    <div style={{ marginBottom: 14, ...style }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 14 }}>
        <ScopeCircle
          label="Todos"
          abbrev="T"
          color="#2d5a3d"
          active={todosActive}
          onClick={() => onChange("all")}
        />
        {groups.length > 0 && (
          <>
            <div style={{ width: 1, height: 40, background: "#dde8e1", flexShrink: 0 }} />
            <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
              {groups.map((g) => (
                <ScopeCircle
                  key={g.id}
                  // Ad-hoc individual menus (dieta blanda) get the cooking-pot
                  // icon instead of an initial, and are labeled by *what* the
                  // menu is for ("Dieta blanda") rather than *who* it's for —
                  // derived from `reason` (not the stored `label`) so groups
                  // created before this label existed still read correctly.
                  label={g.adHoc ? adhocReasonLabel(g.reason) : g.label}
                  abbrev={GROUP_ABBREV[g.label] ?? g.label.charAt(0)}
                  Icon={g.adHoc ? CookingPot : undefined}
                  color={g.color}
                  active={scope === g.id}
                  onClick={() => onChange(g.id)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Compact "liquid glass" scope/person picker — mirrors the menu's DeckFilter.
// Instead of laying every circle out inline, it shows a single chip with the
// active circle + label; tapping it opens a centered frosted-glass modal where
// you pick from all the circles. Declutters steps with several menús/personas.
export function ScopeGlassPicker({ options, value, onChange, title = "Elige", style }) {
  const [open, setOpen] = useState(false);
  const active = options.find((o) => o.id === value) ?? options[0];
  if (!active) return null;
  const ActiveIcon = active.Icon;

  return (
    <div style={{ marginBottom: 14, display: "flex", justifyContent: "center", ...style }}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`${title} · ${active.label}`}
        title={`${title} · ${active.label}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 12,
          padding: "6px 20px 6px 6px",
          borderRadius: 999,
          border: "1.5px solid #d4e6da",
          background: "#fff",
          cursor: "pointer",
          fontFamily: "inherit",
          boxShadow: "0 6px 20px rgba(20,47,29,.12)",
          minWidth: 168,
        }}
      >
        <span
          style={{
            width: 44,
            height: 44,
            borderRadius: 999,
            background: active.color,
            border: `2.5px solid ${active.color}`,
            color: "#fff",
            fontSize: 16,
            fontWeight: 900,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 4px 14px ${active.color}55`,
            flexShrink: 0,
          }}
        >
          {ActiveIcon ? <ActiveIcon size={20} /> : active.abbrev}
        </span>
        <span style={{ flex: 1, fontSize: 15.5, fontWeight: 800, color: "#142f1d", whiteSpace: "nowrap", textAlign: "left" }}>
          {active.label}
        </span>
        <ChevronDown size={17} strokeWidth={2.6} color="#9db3a6" />
      </button>

      {open &&
        createPortal(
          <div
            onClick={() => setOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1000,
              background: "rgba(15,30,20,.34)",
              backdropFilter: "blur(2px)",
              WebkitBackdropFilter: "blur(2px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
              animation: "scopeGlassFade .18s ease both",
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 340,
                maxWidth: "calc(100vw - 40px)",
                background: "rgba(247,251,248,.82)",
                backdropFilter: "blur(26px) saturate(180%)",
                WebkitBackdropFilter: "blur(26px) saturate(180%)",
                borderRadius: 24,
                border: "1px solid rgba(255,255,255,.7)",
                boxShadow: "0 30px 70px rgba(20,47,29,.30), inset 0 1px 0 rgba(255,255,255,.6)",
                padding: 20,
                animation: "scopeGlassIn .22s cubic-bezier(.4,0,.2,1) both",
              }}
            >
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".6px", textTransform: "uppercase", color: "#5f7568", marginBottom: 14 }}>
                {title}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "center" }}>
                {options.map((o) => (
                  <ScopeCircle
                    key={o.id}
                    label={o.label}
                    abbrev={o.abbrev}
                    Icon={o.Icon}
                    color={o.color}
                    active={o.id === value}
                    onClick={() => {
                      onChange(o.id);
                      setOpen(false);
                    }}
                  />
                ))}
              </div>
            </div>
            <style>{`
              @keyframes scopeGlassFade { from { opacity: 0; } to { opacity: 1; } }
              @keyframes scopeGlassIn {
                from { opacity: 0; transform: translateY(10px) scale(.98); }
                to   { opacity: 1; transform: none; }
              }
            `}</style>
          </div>,
          document.body,
        )}
    </div>
  );
}

// Menú (group) flavour of the glass picker — same option-building as
// GroupScopePicker ("Todos" + each menú), so callers just swap the component.
export function GroupScopeGlassPicker({ groups, scope, onChange, title = "Menú", style }) {
  const options = [
    { id: "all", label: "Todos", abbrev: "T", color: "#2d5a3d" },
    ...groups.map((g) => ({
      id: g.id,
      label: g.adHoc ? adhocReasonLabel(g.reason) : g.label,
      abbrev: GROUP_ABBREV[g.label] ?? g.label.charAt(0),
      Icon: g.adHoc ? CookingPot : undefined,
      color: g.color,
    })),
  ];
  return <ScopeGlassPicker options={options} value={scope} onChange={onChange} title={title} style={style} />;
}

// Centered popup with the same visual language as onboarding's big decision
// moments ("¿Para quién es el menú?", "¿Cómo coméis en casa?"): rounded 26px
// card, icon bubble + title/subtitle header, heavier shadow — for moments
// where the user is choosing between a few clear paths, not filling a form.
export function WizardSheet({ icon: Icon, iconColor = "#2d5a3d", title, subtitle, onClose, children, maxWidth = 380 }) {
  return (
    <div
      className="mp-overlay-in"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 300,
        background: "rgba(0,0,0,.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 20px",
      }}
    >
      <div
        className="mp-sheet-up"
        onClick={(e) => e.stopPropagation()}
        style={{
          // Tinted green, not plain white — so the white option cards/inputs
          // inside actually stand out instead of blending into the sheet.
          background: "#f3f8f4",
          borderRadius: 26,
          padding: "22px 20px 20px",
          width: "100%",
          maxWidth,
          maxHeight: "88dvh",
          overflowY: "auto",
          boxSizing: "border-box",
          boxShadow: "0 24px 60px rgba(0,0,0,.25)",
          border: "1px solid #e2ede5",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            {Icon && (
              <span
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 13,
                  background: iconColor,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  boxShadow: `0 4px 12px ${iconColor}55`,
                }}
              >
                <Icon size={21} color="#fff" strokeWidth={2.2} />
              </span>
            )}
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "#142f1d" }}>{title}</h3>
              {subtitle && (
                <p style={{ margin: "2px 0 0", fontSize: 12.5, fontWeight: 600, color: "#4f6a5a", lineHeight: 1.3 }}>{subtitle}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              width: 32,
              height: 32,
              borderRadius: 999,
              border: "1px solid #cfe0d6",
              background: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              flexShrink: 0,
              color: "#2d5a3d",
            }}
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Big tappable option row for WizardSheet — icon bubble + title (+ optional
// subtitle), same shape as onboarding's RepeatChoiceCard so a "choose one of
// these paths" moment always reads the same everywhere in the app.
export function WizardOptionCard({ icon: Icon, iconColor, iconBg, title, subtitle, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        width: "100%",
        padding: "14px 14px",
        borderRadius: 18,
        cursor: "pointer",
        // White-on-tint, not white-on-white: the card needs to visibly lift
        // off the WizardSheet's green background.
        border: "1.5px solid #d7e6dc",
        background: "#fff",
        fontFamily: "inherit",
        textAlign: "left",
        boxShadow: "0 6px 16px -10px rgba(20,47,29,.35)",
      }}
    >
      <span
        style={{
          flex: "0 0 auto",
          width: 46,
          height: 46,
          borderRadius: 14,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: iconBg,
        }}
      >
        <Icon size={21} color={iconColor} strokeWidth={2.2} />
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 15, fontWeight: 800, color: "#142f1d" }}>{title}</span>
        {subtitle && (
          <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#7a8a7f", marginTop: 1 }}>{subtitle}</span>
        )}
      </span>
    </button>
  );
}
