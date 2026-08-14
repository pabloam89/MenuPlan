import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import { dishImageForRecipe } from "../assets/dishes/dishImages.js";
import { deckImg, deckSrcSet } from "../lib/dishPhotoOptimize.js";

const GREEN = "#2d5a3d";
const INK = "#142f1d";

const norm = (s) =>
  (s ?? "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/**
 * Minimal thumbnail-only picker used by the menu's "Regenerar → Cena rápida /
 * Plato único" actions. No filters, no category grid, no type toggle — just the
 * relevant dishes as tappable photo cards (with a light search for long lists).
 */
export function SlotTypePickerSheet({
  title,
  Icon = null,
  accent = GREEN,
  recipes = [],
  onPick,
  onClose,
}) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sorted = useMemo(
    () => [...recipes].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "es")),
    [recipes],
  );
  const filtered = useMemo(() => {
    const q = norm(query.trim());
    return q ? sorted.filter((r) => norm(r.name).includes(q)) : sorted;
  }, [sorted, query]);

  const showSearch = sorted.length > 8;

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1300,
        background: "rgba(20,47,29,.45)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        animation: "stpFade .18s ease both",
      }}
    >
      <style>{`
        @keyframes stpFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes stpUp { from { transform: translateY(26px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes stpCard { from { opacity: 0; transform: translateY(6px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 460, maxHeight: "82vh",
          background: "#fff",
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          display: "flex", flexDirection: "column",
          boxShadow: "0 -12px 40px -12px rgba(20,47,29,.5)",
          animation: "stpUp .24s cubic-bezier(.25,.9,.4,1) both",
          overflow: "hidden",
        }}
      >
        {/* Grab handle */}
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 10 }}>
          <div style={{ width: 40, height: 4, borderRadius: 999, background: "#dbe6df" }} />
        </div>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px 10px" }}>
          {Icon && (
            <span
              style={{
                width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: `${accent}18`,
              }}
            >
              <Icon size={18} color={accent} strokeWidth={2.2} />
            </span>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: INK, lineHeight: 1.1 }}>{title}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#7a9485", marginTop: 2 }}>
              {filtered.length} {filtered.length === 1 ? "opción" : "opciones"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              width: 34, height: 34, borderRadius: 10, flexShrink: 0, cursor: "pointer",
              border: "1.5px solid #e8efe9", background: "#f4f7f5",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <X size={17} color="#5a7066" />
          </button>
        </div>

        {showSearch && (
          <div style={{ padding: "0 18px 10px" }}>
            <div
              style={{
                display: "flex", alignItems: "center", gap: 8,
                height: 40, padding: "0 12px", borderRadius: 12,
                background: "#f4f7f5", border: "1.5px solid #e8efe9",
              }}
            >
              <Search size={16} color="#9ab0a1" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar…"
                style={{
                  flex: 1, border: "none", background: "transparent", outline: "none",
                  fontSize: 13.5, color: INK, fontFamily: "inherit", minWidth: 0,
                }}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Limpiar"
                  style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0, display: "flex" }}
                >
                  <X size={15} color="#9ab0a1" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Thumbnail grid */}
        <div style={{ overflowY: "auto", padding: "4px 18px 22px", WebkitOverflowScrolling: "touch" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "44px 20px", textAlign: "center", color: "#7a9485", fontSize: 14, fontWeight: 700 }}>
              No hay platos que coincidan.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {filtered.map((r, i) => {
                const img = dishImageForRecipe(r);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => onPick?.(r.id)}
                    style={{
                      display: "flex", flexDirection: "column", gap: 0,
                      border: "1.5px solid #eef3f0", borderRadius: 16, overflow: "hidden",
                      background: "#fff", cursor: "pointer", fontFamily: "inherit",
                      textAlign: "left", padding: 0,
                      boxShadow: "0 6px 16px -12px rgba(20,47,29,.35)",
                      animation: "stpCard .18s ease-out both",
                      animationDelay: `${i < 12 ? i * 20 : 0}ms`,
                    }}
                  >
                    <div style={{ position: "relative", width: "100%", aspectRatio: "4 / 3", background: "#eef3f0" }}>
                      {img && (
                        <img
                          src={deckImg(img, 320)}
                          srcSet={deckSrcSet(img, 320)}
                          sizes="(max-width: 460px) 45vw, 210px"
                          alt=""
                          loading="lazy"
                          decoding="async"
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        />
                      )}
                      {typeof r.time === "number" && (
                        <span
                          style={{
                            position: "absolute", top: 8, right: 8,
                            padding: "3px 8px", borderRadius: 999,
                            background: "rgba(20,47,29,.72)", color: "#fff",
                            fontSize: 11, fontWeight: 800,
                          }}
                        >
                          {r.time} min
                        </span>
                      )}
                    </div>
                    <div style={{ padding: "9px 11px 11px" }}>
                      <div
                        style={{
                          fontSize: 13, fontWeight: 800, color: INK, lineHeight: 1.25,
                          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                        }}
                      >
                        {r.name}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
