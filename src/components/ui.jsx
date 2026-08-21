import { useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, Calendar, ChevronDown, ClipboardList, CookingPot, Home, Refrigerator, ShoppingCart, UserCircle, X } from "lucide-react";
import { initialsOf, memberAvatarColor, memberAvatarThumbSrc } from "../lib/stages.js";
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

export function SegmentedControl({ options, value, onChange, style, activeDark, compact = false }) {
  const fontSize = compact ? 11 : 13;
  const btnPad = compact ? "5px 10px" : "7px 0";
  return (
    <div
      style={{
        display: compact ? "inline-flex" : "flex",
        width: compact ? undefined : "100%",
        boxSizing: "border-box",
        background: "#f0f4f1",
        borderRadius: compact ? 10 : 12,
        padding: compact ? 2 : 3,
        flexShrink: 0,
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
              flex: compact ? "0 0 auto" : 1,
              minWidth: compact ? undefined : 0,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: compact ? 4 : 6,
              padding: btnPad,
              borderRadius: compact ? 8 : 9,
              border: "none",
              background: sel ? (activeDark ? "#2d5a3d" : "#fff") : "transparent",
              color: sel ? (activeDark ? "#fff" : "#142f1d") : "#7a8a7f",
              fontSize,
              fontWeight: 800,
              cursor: "pointer",
              fontFamily: "inherit",
              boxShadow: sel && !activeDark ? "0 1px 4px rgba(0,0,0,.1)" : "none",
              transition: "all .15s",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {Icon && <Icon size={compact ? 13 : 15} strokeWidth={2.4} />}
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** Tab bar for Recetas / Elegir a mano — stacked icon + label when `Icon` is passed. */
export function SegmentedTabBar({ children, style }) {
  return (
    <div
      style={{
        display: "flex",
        background: "#e8efe9",
        borderRadius: 12,
        padding: 4,
        gap: 2,
        alignItems: "stretch",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function SegmentedTabButton({
  selected,
  onClick,
  label,
  count = 0,
  accent = "#2d5a3d",
  fontSize = 11,
  Icon,
  ...rest
}) {
  const hasBadge = count > 0;
  const ariaLabel = hasBadge ? `${label}, ${count}` : label;
  const iconColor = selected ? accent : "#9ab0a1";

  if (Icon) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        style={{
          flex: 1,
          minWidth: 0,
          padding: "5px 2px 6px",
          borderRadius: 9,
          border: "none",
          background: selected ? "#fff" : "transparent",
          color: selected ? "#142f1d" : "#7a9485",
          cursor: "pointer",
          fontFamily: "inherit",
          boxShadow: selected ? "0 1px 4px rgba(0,0,0,.1)" : "none",
          transition: "all .15s",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 3,
          minHeight: 54,
        }}
        {...rest}
      >
        <span
          aria-hidden
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: hasBadge ? 3 : 0,
            minHeight: 20,
          }}
        >
          <Icon size={18} strokeWidth={2.35} color={iconColor} />
          {hasBadge && (
            <span
              style={{
                minWidth: 14,
                height: 14,
                padding: "0 3px",
                borderRadius: 999,
                fontSize: 8.5,
                fontWeight: 900,
                lineHeight: "14px",
                textAlign: "center",
                color: selected ? accent : "#7a9485",
                background: selected ? "#e4f3e9" : "#dce8de",
              }}
            >
              {count}
            </span>
          )}
        </span>
        <span
          style={{
            display: "block",
            textAlign: "center",
            lineHeight: 1.15,
            fontSize,
            fontWeight: selected ? 800 : 700,
            letterSpacing: "-0.1px",
          }}
        >
          {label}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        position: "relative",
        flex: 1,
        minWidth: 0,
        padding: hasBadge ? "11px 4px 8px" : "9px 4px",
        borderRadius: 9,
        border: "none",
        background: selected ? "#fff" : "transparent",
        color: selected ? "#142f1d" : "#7a9485",
        fontSize,
        fontWeight: selected ? 800 : 700,
        cursor: "pointer",
        fontFamily: "inherit",
        boxShadow: selected ? "0 1px 4px rgba(0,0,0,.1)" : "none",
        transition: "all .15s",
      }}
      {...rest}
    >
      {hasBadge && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: 3,
            left: 4,
            minWidth: 15,
            height: 15,
            padding: "0 3px",
            borderRadius: 999,
            fontSize: 9,
            fontWeight: 900,
            lineHeight: "15px",
            textAlign: "center",
            color: selected ? accent : "#7a9485",
            background: selected ? "#e4f3e9" : "#dce8de",
            boxShadow: "0 0 0 1.5px #fff",
          }}
        >
          {count}
        </span>
      )}
      <span style={{ display: "block", textAlign: "center", lineHeight: 1.2 }}>{label}</span>
    </button>
  );
}

/** Banner for household viewer mode (solo lectura en hogar ajeno). */
export function HouseholdReadOnlyBanner({ label, style }) {
  if (!label) return null;
  return (
    <div
      style={{
        background: "#fff7e6",
        borderBottom: "1px solid #f5e6b8",
        padding: "10px 18px",
        ...style,
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 12.5,
          fontWeight: 600,
          color: "#7a5d00",
          lineHeight: 1.4,
          textAlign: "center",
        }}
      >
        Solo lectura — {label}
      </p>
    </div>
  );
}

// Empty-state illustration card: a large square illustration on top and the
// message inside a footer band, both wrapped in one rounded teal-bordered
// container — mirrors the illustrated onboarding cards when selected. `title`
// renders as the black headline; `subtitle` and any `children` (e.g. a CTA)
// sit under it.
export function EmptyIllustration({
  img,
  title,
  subtitle,
  children,
  maxWidth = 320,
  // When set, every card of this size renders as the same fixed box regardless
  // of how long its copy is or whether it has a CTA — the illustration stays
  // pinned to the top and the footer band grows to fill the rest, so the band
  // starts at the SAME height in every card (used by the three Recetas empty
  // states so all read identical).
  minHeight,
  accent = "#0f766e",
  // Solid teal footer band with white copy (instead of a plain white footer) —
  // the band fills down to the bottom border, matching the teal frame.
  solidBand = false,
  imgAspect = "16 / 10",
  imgPosition = "center 40%",
  // Footer band padding — smaller callers (e.g. the compact profile action
  // cards) can shrink the band so it doesn't dwarf the illustration.
  bandPadding = "16px 18px 18px",
  onClick,
}) {
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      style={{
        width: "100%",
        maxWidth,
        minHeight,
        margin: "0 auto",
        borderRadius: 24,
        border: `3px solid ${accent}`,
        overflow: "hidden",
        background: "#fff",
        boxShadow: "0 12px 32px -20px rgba(20,47,29,.4)",
        display: "flex",
        flexDirection: "column",
        cursor: onClick ? "pointer" : undefined,
      }}
    >
      <img
        src={img}
        alt=""
        style={{ width: "100%", aspectRatio: imgAspect, objectFit: "cover", objectPosition: imgPosition, display: "block", flexShrink: 0 }}
      />
      <div
        style={{
          flex: 1,
          padding: bandPadding,
          textAlign: "center",
          background: solidBand ? accent : "transparent",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {title && (
          <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: solidBand ? "#fff" : "#142f1d", lineHeight: 1.4, width: "100%" }}>
            {title}
          </p>
        )}
        {subtitle && (
          <p style={{ margin: title ? "6px 0 0" : 0, fontSize: 13, color: solidBand ? "rgba(255,255,255,.88)" : "#5c6b60", lineHeight: 1.5, width: "100%" }}>
            {subtitle}
          </p>
        )}
        {children}
      </div>
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
  { id: "dashboard", icon: Home,          label: "Inicio",  color: "#e8854a" },
  { id: "pantry",    icon: Refrigerator,  label: "En casa", color: "#3a9e7a" },
  { id: "menu",      icon: ClipboardList, label: "Menú",    highlight: true },
  { id: "recipes",   icon: BookOpen,      label: "Recetas", color: "#d45c7a" },
  { id: "shopping",  icon: ShoppingCart,  label: "Compra",  color: "#5a82d4" },
];

export function BottomNav({ active, onNav, dissolved = false }) {
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
        background: dissolved
          ? "#fff"
          : "linear-gradient(to top, #fff 88%, rgba(255,255,255,0))",
        pointerEvents: "none",
        boxSizing: "border-box",
        transition: "background 0.55s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      <div
        style={{
          pointerEvents: dissolved ? "none" : "auto",
          width: "100%",
          position: "relative",
          borderRadius: "18px 18px 0 0",
        }}
      >
        <div
          style={{
            width: "100%",
            display: "flex",
            alignItems: "stretch",
            gap: 4,
            padding: "8px 6px 10px",
            marginBottom: 4,
            borderRadius: "18px 18px 0 0",
            borderTop: dissolved ? "1px solid #f0f0f0" : "1px solid #e0eae3",
            background: "#fff",
            boxShadow: dissolved ? "none" : "0 -6px 24px rgba(20,47,29,.08)",
            opacity: dissolved ? 0.12 : 1,
            transform: dissolved ? "scale(0.985) translateY(2px)" : "scale(1) translateY(0)",
            filter: dissolved ? "blur(1.2px)" : "none",
            transition:
              "opacity 0.55s cubic-bezier(0.4, 0, 0.2, 1), transform 0.55s cubic-bezier(0.4, 0, 0.2, 1), filter 0.55s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.55s ease, border-color 0.55s ease",
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
                <span
                  style={{
                    width: 34, height: 34, borderRadius: "50%",
                    background: "#2d5a3d", display: "inline-flex",
                    alignItems: "center", justifyContent: "center",
                    boxShadow: "0 3px 10px rgba(45,90,61,.35)", marginTop: -2,
                  }}
                >
                  <it.icon size={19} color="#fff" strokeWidth={2.4} />
                </span>
              ) : (
                <it.icon
                  size={22}
                  color={sel ? it.color : "#c2d4cb"}
                  strokeWidth={sel ? 2.4 : 1.8}
                />
              )}
              <span
                style={{
                  fontSize: 10,
                  fontWeight: sel || it.highlight ? 800 : 600,
                  color: it.highlight ? "#1a3a24" : sel ? it.color : "#9ab0a1",
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
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "inherit",
            background: "linear-gradient(to top, #fff 82%, rgba(255,255,255,.94))",
            opacity: dissolved ? 1 : 0,
            transition: "opacity 0.55s cubic-bezier(0.4, 0, 0.2, 1)",
            pointerEvents: "none",
          }}
        />
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
  const [error, setError] = useState(null);

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    let failure = null;
    try {
      // signInWithGoogle reports failures by *returning* { error } rather than
      // throwing, so catching a rejection only covers half the cases. Missing
      // Supabase env vars in a deploy hit the returned-error path, which used
      // to leave the button spinning "Redirigiendo…" forever with no clue why.
      const result = await onClick?.();
      failure = result?.error ?? null;
    } catch (err) {
      failure = err;
    }
    if (failure) {
      setLoading(false);
      setError(failure.message || "No se pudo conectar con Google.");
    }
    // On success the page redirects — no need to reset loading
  };

  return (
    <>
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
    {error && (
      <p
        role="alert"
        style={{
          margin: "8px 0 0",
          fontSize: 12.5,
          lineHeight: 1.45,
          textAlign: "center",
          color: dark ? "#ffd9d2" : "#c0392b",
          // The dark variant sits over the splash video, where plain text on a
          // bright frame is unreadable.
          ...(dark
            ? {
                background: "rgba(20,20,20,.55)",
                borderRadius: 10,
                padding: "7px 12px",
                backdropFilter: "blur(4px)",
              }
            : null),
        }}
      >
        {error}
      </p>
    )}
    </>
  );
}

export function GhostPillButton({ onClick, children, tone = "light" }) {
  const [pressed, setPressed] = useState(false);
  const light = tone === "light";
  // "solid" es el CTA principal: relleno verde, alto contraste, se ve igual
  // sobre el vídeo del splash que sobre un fondo claro (cuando el vídeo no
  // carga). Los otros tonos son secundarios (ghost translúcido / borde claro).
  const solid = tone === "solid";

  const styles = solid
    ? {
        border: "none",
        background: pressed
          ? "linear-gradient(135deg, #24492f 0%, #3a9e5b 100%)"
          : "linear-gradient(135deg, #2d5a3d 0%, #4cba6e 100%)",
        color: "#fff",
        boxShadow: "0 10px 28px rgba(45,90,61,.4)",
      }
    : {
        border: light ? "2px solid rgba(255,255,255,.85)" : "1.5px solid #dbe5de",
        background: pressed
          ? light
            ? "rgba(255,255,255,.3)"
            : "#eef4f0"
          : light
            ? "rgba(255,255,255,.16)"
            : "transparent",
        color: light ? "#fff" : "#1a3a24",
        boxShadow: "none",
      };

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
        padding: solid ? "15px 20px" : "13px 20px",
        borderRadius: 999,
        fontSize: solid ? 15 : 14.5,
        fontWeight: solid ? 800 : 700,
        cursor: "pointer",
        fontFamily: "inherit",
        transform: pressed ? "scale(.97)" : "scale(1)",
        transition: "transform .15s ease, background .15s ease",
        ...styles,
      }}
    >
      {children}
    </button>
  );
}

export function Avatar({ name, size = 28, color = "#2d5a3d", title, photo }) {
  // Remote photos (Google account pictures stamped on old recipes, for
  // instance) can 403 long after they were saved; fall back to the initials
  // instead of leaving the browser's broken-image glyph on screen.
  const [failedSrc, setFailedSrc] = useState(null);
  if (photo && failedSrc !== photo) {
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
          key={photo}
          src={photo}
          alt={name ?? ""}
          onError={() => setFailedSrc(photo)}
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

/**
 * The faces of a group, each paired with its own member colour — the avatars
 * are cut-outs on transparency, so that colour is what fills the disc behind
 * them. `allMembers` is the full roster: member colours fall back to a palette
 * slot by index, so passing only the group's members would recolour anyone who
 * hasn't picked a colour. Empty when nobody has an avatar, so the caller falls
 * back to its icon/initial.
 */
export function groupAvatarFaces(groupMembers, allMembers) {
  const roster = allMembers ?? groupMembers ?? [];
  return (groupMembers ?? [])
    .map((m) => ({ src: memberAvatarThumbSrc(m), color: memberAvatarColor(m.id, roster) }))
    .filter((f) => f.src);
}

/**
 * A group drawn as its members' faces at the *same* diameter as a single
 * avatar, overlapping each other and growing to the right — rather than as one
 * circle with shrunken faces crammed inside, which made everyone unreadable.
 * Widening the group is the point: it pushes whatever follows to the right.
 *
 * Selection fills the discs with each member's colour and is never drawn as an
 * outline around the whole row: a ring hugging several circles reads as a pill
 * and breaks the circular language of every other control. Unselected discs
 * stay hollow — the colour moves to the ring — so a picked group reads at a
 * glance without dimming anyone into looking disabled.
 *
 * Everyone is shown by default: hiding members behind a "+N" made a seven-person
 * household read as six, which is exactly the sort of quiet lie this control
 * exists to avoid. Past six the row folds into two staggered rows instead of
 * growing wider. Pass `max` where the width is genuinely constrained — the menu
 * badges do — and the stack falls back to one row plus the counter.
 */
export function GroupAvatarStack({ faces, size = 46, active = true, max = null }) {
  const border = Math.max(2, Math.round(size * 0.055));
  const shown = max ? faces.slice(0, max) : faces;
  const overflow = faces.length - shown.length;
  // Faces sit centred in the thumb, so hiding ~38% of the circle underneath
  // still leaves each one recognisable.
  const bite = Math.round(size * 0.38);

  const disc = (face, i, key) => (
    <span
      key={key}
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        overflow: "hidden",
        flexShrink: 0,
        boxSizing: "border-box",
        // Seleccionado = disco lleno con el aro del propio color, no blanco: el
        // aro blanco se fundía con el fondo claro de la tarjeta y encogía la
        // mancha de color, restando contraste justo a lo que está elegido. Con
        // el aro del color, el círculo se lee como una mancha sólida y salta
        // más. En pila, colores distintos siguen separando los discos.
        background: active ? face.color : "#fff",
        border: `${border}px solid ${face.color}`,
        marginLeft: i === 0 ? 0 : -bite,
        position: "relative",
        zIndex: i,
        boxShadow: active ? `0 2px 8px ${face.color}66` : "none",
        transition: "background .18s ease, border-color .18s ease, box-shadow .18s ease",
      }}
    >
      <img src={face.src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
    </span>
  );

  if (!max && shown.length > 6) {
    // Longer row on top and the shorter one nudged half a step right, so the
    // two interlock the way the Olympic rings do instead of stacking in a grid.
    const topCount = Math.ceil(shown.length / 2);
    return (
      <span
        style={{
          display: "inline-flex",
          flexDirection: "column",
          alignItems: "flex-start",
          flexShrink: 0,
        }}
      >
        <span style={{ display: "inline-flex" }}>
          {shown.slice(0, topCount).map((face, i) => disc(face, i, `t${i}`))}
        </span>
        <span
          style={{
            display: "inline-flex",
            marginLeft: Math.round((size - bite) / 2),
            marginTop: -Math.round(size * 0.34),
            position: "relative",
            zIndex: 1,
          }}
        >
          {shown.slice(topCount).map((face, i) => disc(face, i, `b${i}`))}
        </span>
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
      {shown.map((face, i) => disc(face, i, i))}
      {overflow > 0 && (
        <span
          style={{
            width: size,
            height: size,
            borderRadius: 999,
            flexShrink: 0,
            boxSizing: "border-box",
            background: active ? "#2d5a3d" : "#fff",
            border: `${border}px solid ${active ? "#2d5a3d" : "#9ab0a1"}`,
            color: active ? "#fff" : "#5a7066",
            marginLeft: -bite,
            position: "relative",
            zIndex: shown.length,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: Math.max(9, Math.round(size * 0.3)),
            fontWeight: 900,
            letterSpacing: "-.3px",
            boxShadow: active ? "0 2px 8px rgba(45,90,61,.4)" : "none",
          }}
        >
          +{overflow}
        </span>
      )}
    </span>
  );
}

export function ScopeCircle({ label, abbrev, Icon, color, active, onClick, members, allMembers }) {
  const faces = groupAvatarFaces(members, allMembers);
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
        minWidth: 44,
      }}
    >
      {faces.length > 0 ? (
        // Onboarding lines these up beside every individual member, so the
        // group anchor has to stay narrow: three faces and a counter, never the
        // full two-row fold, or the people beside it get pushed onto their own
        // rows three at a time.
        <GroupAvatarStack faces={faces} size={46} active={active} max={3} />
      ) : (
        <span
          style={{
            width: 46,
            height: 46,
            borderRadius: 999,
            overflow: "hidden",
            background: active ? color : "#fff",
            border: `2.5px solid ${color}`,
            color: active ? "#fff" : color,
            fontSize: 15,
            fontWeight: 900,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: active ? `0 4px 14px ${color}55` : "none",
            opacity: active ? 1 : 0.72,
            transition: "all .18s ease",
          }}
        >
          {Icon ? <Icon size={19} /> : abbrev}
        </span>
      )}
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

export function GroupScopePicker({ groups, scope, onChange, style, members }) {
  const todosActive = scope === "all";
  // Resolve each group's memberIds into member objects so the circles can show
  // the family's own illustrated avatars instead of an initial.
  const membersOf = (g) =>
    members ? members.filter((m) => g.memberIds?.includes(m.id)) : undefined;

  return (
    <div style={{ marginBottom: 14, ...style }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 14 }}>
        <ScopeCircle
          label="Todos"
          abbrev="T"
          color="#2d5a3d"
          active={todosActive}
          onClick={() => onChange("all")}
          members={members}
          allMembers={members}
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
                  members={g.adHoc ? undefined : membersOf(g)}
                  allMembers={members}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Inline circle scope/person picker — the flat, non-modal counterpart to
// ScopeGlassPicker. Renders every option as a ScopeCircle in a wrapping row;
// the first option is treated as the "everyone/all" anchor and gets a thin
// divider after it (matching GroupScopePicker's "Todos │ …" layout). Used when
// we'd rather fill the row with circles than hide them behind a glass chip.
export function ScopeCirclePicker({ options, value, onChange, dividerAfterFirst = true, style, allMembers }) {
  if (!options || options.length === 0) return null;
  const [first, ...rest] = options;
  return (
    <div style={{ marginBottom: 14, ...style }}>
      {/* The rest wrap inside their own box rather than in one shared row, so a
          second row of people starts under the first person — not under the
          "everyone" circle, which reads as if those people belonged to it. */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span style={{ display: "inline-flex", flexShrink: 0 }}>
          <ScopeCircle
            label={first.label}
            abbrev={first.abbrev}
            Icon={first.Icon}
            color={first.color}
            members={first.members}
            allMembers={allMembers}
            active={value === first.id}
            onClick={() => onChange(first.id)}
          />
        </span>
        {dividerAfterFirst && rest.length > 0 && (
          <div style={{ width: 1, height: 46, background: "#dde8e1", flexShrink: 0 }} />
        )}
        {/* Tighter than the gap outside it: at 12px only three people fit
            beside the group circle, which made a normal household wrap onto
            three lines. */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 8, flex: 1, minWidth: 0 }}>
          {rest.map((o) => (
            <ScopeCircle
              key={o.id}
              label={o.label}
              abbrev={o.abbrev}
              Icon={o.Icon}
              color={o.color}
              members={o.members}
              allMembers={allMembers}
              active={value === o.id}
              onClick={() => onChange(o.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// Compact "liquid glass" scope/person picker — mirrors the menu's DeckFilter.
// Instead of laying every circle out inline, it shows a single chip with the
// active circle + label; tapping it opens a centered frosted-glass modal where
// you pick from all the circles. Declutters steps with several menús/personas.
export function ScopeGlassPicker({ options, value, onChange, title = "Elige", style, allMembers }) {
  const [open, setOpen] = useState(false);
  const active = options.find((o) => o.id === value) ?? options[0];
  if (!active) return null;
  const ActiveIcon = active.Icon;
  const activeFaces = groupAvatarFaces(active.members, allMembers);

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
        {activeFaces.length > 0 ? (
          <GroupAvatarStack faces={activeFaces} size={44} />
        ) : (
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
              overflow: "hidden",
              boxShadow: `0 4px 14px ${active.color}55`,
              flexShrink: 0,
            }}
          >
            {ActiveIcon ? <ActiveIcon size={20} /> : active.abbrev}
          </span>
        )}
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
                    members={o.members}
                    allMembers={allMembers}
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
export function GroupScopeGlassPicker({ groups, scope, onChange, title = "Menú", style, members }) {
  const options = [
    { id: "all", label: "Todos", abbrev: "T", color: "#2d5a3d", members },
    ...groups.map((g) => ({
      id: g.id,
      label: g.adHoc ? adhocReasonLabel(g.reason) : g.label,
      abbrev: GROUP_ABBREV[g.label] ?? g.label.charAt(0),
      Icon: g.adHoc ? CookingPot : undefined,
      color: g.color,
      // Ad-hoc menus keep their cooking-pot icon; they describe a diet, not a
      // set of people, so faces would be misleading.
      members: g.adHoc || !members ? undefined : members.filter((m) => g.memberIds?.includes(m.id)),
    })),
  ];
  return <ScopeGlassPicker options={options} value={scope} onChange={onChange} title={title} style={style} allMembers={members} />;
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
export function WizardOptionCard({ icon: Icon, iconColor, iconBg, img, title, subtitle, onClick }) {
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
          width: 72,
          height: 72,
          borderRadius: 16,
          overflow: "hidden",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: iconBg,
          ...(img ? { border: "2.5px solid #0f766e", boxShadow: "0 0 0 1px rgba(15,118,110,.12)" } : {}),
        }}
      >
        {img
          ? <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <Icon size={21} color={iconColor} strokeWidth={2.2} />
        }
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
