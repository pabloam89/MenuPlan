import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, ChevronUp } from "./icons.jsx";

/**
 * Un desplegable con la cara de la app, no con la del sistema.
 *
 * ── Por qué no un `<select>` ──────────────────────────────────────────────
 * El nativo se pinta con los estilos del sistema operativo: en Windows sale
 * gris con una flechita cuadrada, en Android con su propio modal y en iOS con
 * una rueda. Tres caras distintas, ninguna la nuestra, y ninguna se puede
 * tocar — el interior de un `<option>` no acepta CSS.
 *
 * ── Va por PORTAL ─────────────────────────────────────────────────────────
 * El menú se cuelga del `body`, no del botón, porque estos mandos viven dentro
 * de paneles que hacen scroll y recortan: dentro del flujo, la lista se cortaba
 * por el borde del panel o abría una barra de scroll horizontal. Y por eso se
 * reposiciona al hacer scroll o cambiar de tamaño, en vez de quedarse flotando
 * donde estaba.
 *
 * Abre hacia ARRIBA cuando no cabe abajo, y se cuelga del borde derecho del
 * botón cuando el menú es más ancho que él: alineado por la izquierda parecía
 * salir de otro sitio.
 *
 * ── Sin rayas entre opciones ──────────────────────────────────────────────
 * Cinco líneas separadas por cinco rayas se leen como una tabla, y lo que hay
 * que ver aquí es cuál está marcada. Eso ya lo dicen el fondo, el peso y el
 * check — tres señales, ninguna dependiente del color.
 */

const VERDE = "#2d5a3d";
const INK = "#142f1d";

export function Picker({
  value,
  options,
  onChange,
  ariaLabel,
  width,
  flex,
  minWidth,
  height = 32,
  align = "left",
  disabled = false,
}) {
  const [abierto, setAbierto] = useState(false);
  const botonRef = useRef(null);
  const opciones = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  const actual = opciones.find((o) => o.value === value);

  return (
    <>
      <button
        ref={botonRef}
        type="button"
        disabled={disabled}
        onClick={() => setAbierto((v) => !v)}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        style={{
          boxSizing: "border-box",
          width,
          height,
          flex,
          // Con ancho fijo no se encoge; sin él, el mínimo evita que una fila
          // apretada deje el envase en "cabe…", que es justo el dato a leer.
          flexShrink: width ? 0 : undefined,
          minWidth: minWidth ?? 0,
          padding: align === "center" ? "0 6px" : "0 5px 0 9px",
          borderRadius: 10,
          border: `1.5px solid ${abierto ? VERDE : "#cfe0d6"}`,
          background: "#fff",
          color: disabled ? "#9ab0a1" : INK,
          cursor: disabled ? "default" : "pointer",
          fontFamily: "inherit",
          fontSize: 13,
          fontWeight: 800,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: align === "center" ? "center" : "space-between",
          gap: 3,
          transition: "border-color .15s ease",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {actual?.label ?? value}
        </span>
        {/* La flecha se da la vuelta al abrir: es la única parte del botón que
            cambia, y sin ella no se sabe si el menú sigue desplegado. */}
        {abierto
          ? <ChevronUp size={13} color="#9ab0a1" style={{ flexShrink: 0 }} />
          : <ChevronDown size={13} color="#9ab0a1" style={{ flexShrink: 0 }} />}
      </button>

      {abierto && (
        <Menu
          value={value}
          opciones={opciones}
          anclaRef={botonRef}
          onElegir={(v) => { onChange(v); setAbierto(false); }}
          onCerrar={() => setAbierto(false)}
        />
      )}
    </>
  );
}

function Menu({ value, opciones, anclaRef, onElegir, onCerrar }) {
  const menuRef = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    const recolocar = () => {
      const el = anclaRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const ancho = Math.max(r.width, 132);
      const debajo = vh - r.bottom;
      const haciaArriba = debajo < 200 && r.top > debajo;
      const ideal = r.width < ancho ? r.right - ancho : r.left;
      setPos({
        left: Math.max(8, Math.min(ideal, window.innerWidth - ancho - 8)),
        width: ancho,
        top: haciaArriba ? null : r.bottom + 6,
        bottom: haciaArriba ? vh - r.top + 6 : null,
        maxHeight: Math.max(150, (haciaArriba ? r.top : debajo) - 18),
      });
    };
    recolocar();
    window.addEventListener("resize", recolocar);
    window.addEventListener("scroll", recolocar, true);
    return () => {
      window.removeEventListener("resize", recolocar);
      window.removeEventListener("scroll", recolocar, true);
    };
  }, [anclaRef]);

  useEffect(() => {
    // `pointerdown` y no `click`: con click, tocar fuera cerraba el menú Y
    // activaba lo de debajo, así que cerrar te cambiaba otra cosa de paso.
    const fuera = (e) => {
      if (menuRef.current?.contains(e.target) || anclaRef.current?.contains(e.target)) return;
      onCerrar();
    };
    const tecla = (e) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("pointerdown", fuera, true);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fuera, true);
      document.removeEventListener("keydown", tecla);
    };
  }, [anclaRef, onCerrar]);

  if (!pos) return null;

  return createPortal(
    <div
      ref={menuRef}
      role="listbox"
      className="mp-picker-menu"
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
        border: "1.5px solid #e3ede7",
        boxShadow: "0 16px 40px -12px rgba(20,47,29,.28)",
        zIndex: 600,
        padding: 5,
        transformOrigin: pos.bottom != null ? "bottom center" : "top center",
      }}
    >
      {opciones.map((o) => {
        const marcada = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="option"
            aria-selected={marcada}
            onClick={() => onElegir(o.value)}
            style={{
              width: "100%",
              minHeight: 38,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              padding: "8px 11px",
              border: "none",
              borderRadius: 10,
              background: marcada ? "#eaf3ec" : "transparent",
              color: marcada ? VERDE : INK,
              fontWeight: marcada ? 800 : 600,
              fontSize: 13.5,
              textAlign: "left",
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "background .15s ease",
            }}
          >
            <span>{o.label}</span>
            {marcada && <Check size={15} strokeWidth={2.8} color={VERDE} style={{ flexShrink: 0 }} />}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
