import { Heart, Check } from "lucide-react";

/**
 * Centered "wizard style" popup to choose which menu group a favorite applies
 * to (or "Todos"). Shared by DishDetail's favorite button and the catalog
 * card's heart badge, so favoriting always looks the same everywhere — same
 * pattern as the baby-menu / "¿Para quién es el menú?" popups (icon bubble +
 * label cards, centered, no subcopy).
 *
 * @param {string} recipeName
 * @param {boolean} isFavorite
 * @param {'all'|string[]} scope
 * @param {string[]} groups  selectable group labels (e.g. ["Adultos","Niños"])
 * @param {(key: string) => void} onPick  key is "all" | a group label | "__remove"
 * @param {() => void} onClose
 */
export function FavoriteScopeModal({ recipeName, isFavorite, scope, groups, onPick, onClose }) {
  const isFav = Boolean(isFavorite);
  const isAll = !Array.isArray(scope);
  const selected = new Set(Array.isArray(scope) ? scope : []);
  const options = [{ key: "all", label: "Todos" }, ...groups.map((g) => ({ key: g, label: g }))];

  return (
    <div
      onClick={onClose}
      className="mp-overlay-in"
      style={{
        position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,.5)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "0 24px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="mp-sheet-up"
        style={{
          background: "#fff", borderRadius: 22, padding: "20px 18px 16px",
          width: "100%", maxWidth: 340, boxSizing: "border-box",
          boxShadow: "0 24px 60px rgba(0,0,0,.25)",
        }}
      >
        <h3 style={{ margin: "0 0 3px", fontSize: 16.5, fontWeight: 900, color: "#142f1d", textAlign: "center", letterSpacing: "-.01em" }}>
          ¿Para quién es favorita?
        </h3>
        <p
          style={{
            margin: "0 auto 14px", fontSize: 12.5, color: "#7a9485", textAlign: "center",
            maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
        >
          {recipeName}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {options.map((opt) => {
            const active = isFav && (opt.key === "all" ? isAll : !isAll && selected.has(opt.key));
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => onPick(opt.key)}
                style={{
                  display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left",
                  padding: "9px 12px", borderRadius: 14, cursor: "pointer",
                  fontFamily: "inherit",
                  background: active ? "#fdeef1" : "#f7f9f8",
                  border: `1.5px solid ${active ? "#f0aebb" : "#e8ede9"}`,
                  transition: "all .15s ease",
                }}
              >
                <span
                  style={{
                    width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                    background: active ? "#e0405a" : "#edf2ee",
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Heart size={16} color={active ? "#fff" : "#2d5a3d"} fill={active ? "#fff" : "none"} strokeWidth={2.2} />
                </span>
                <span style={{ flex: 1, fontWeight: 800, color: "#1a3a24", fontSize: 14 }}>{opt.label}</span>
                {active && <Check size={16} color="#e0405a" strokeWidth={3} />}
              </button>
            );
          })}
        </div>

        {isFav && (
          <button
            type="button"
            onClick={() => onPick("__remove")}
            style={{
              display: "block", margin: "12px auto 0", padding: "4px 10px",
              border: "none", background: "none", cursor: "pointer",
              fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, color: "#9aa8a0",
            }}
          >
            Quitar de favoritas
          </button>
        )}
      </div>
    </div>
  );
}
