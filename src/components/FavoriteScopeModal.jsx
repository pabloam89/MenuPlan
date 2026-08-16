import { Check } from "lucide-react";

/**
 * Centered popup to choose which menu group a favorite applies to (or
 * "Todos"). Shared by DishDetail's heart and the catalog card badge.
 *
 * Three illustrated cards — mixed family / adults / kids — instead of a
 * text list, matching the onboarding "cómo coméis" language.
 *
 * @param {string} recipeName
 * @param {boolean} isFavorite
 * @param {'all'|string[]} scope
 * @param {string[]} groups  selectable group labels (e.g. ["Adultos","Niños"])
 * @param {(key: string) => void} onPick  key is "all" | a group label | "__remove"
 * @param {() => void} onClose
 */
function scopeIllustration(key, label) {
  if (key === "all") return "/avatares/cards/comemos_por_separado.png";
  const n = String(label || key).toLowerCase();
  if (/niñ|nino|infantil|hijo/.test(n)) return "/avatares/cards/mismo_menu_ninos.png";
  if (/adult/.test(n)) return "/avatares/cards/familia/familia_0.jpg";
  return "/avatares/cards/otro_grupo_familiar.png";
}

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
        display: "flex", alignItems: "center", justifyContent: "center", padding: "0 20px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="mp-sheet-up"
        style={{
          background: "#fff", borderRadius: 22, padding: "20px 16px 16px",
          width: "100%", maxWidth: 360, boxSizing: "border-box",
          boxShadow: "0 24px 60px rgba(0,0,0,.25)",
        }}
      >
        <h3 style={{ margin: "0 0 14px", fontSize: 16.5, fontWeight: 900, color: "#142f1d", textAlign: "center", letterSpacing: "-.01em" }}>
          ¿Para quién es favorita?
        </h3>

        <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
          {options.map((opt) => {
            const active = isFav && (opt.key === "all" ? isAll : !isAll && selected.has(opt.key));
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => onPick(opt.key)}
                aria-pressed={active}
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "stretch",
                  padding: 0,
                  overflow: "hidden",
                  borderRadius: 15,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  background: "#fff",
                  border: `2px solid ${active ? "#e0405a" : "#e0eae3"}`,
                  boxShadow: active ? "0 4px 14px rgba(224,64,90,.22)" : "0 1px 2px rgba(0,0,0,.04)",
                  transition: "border-color .15s ease, box-shadow .15s ease",
                }}
              >
                <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", background: "#f4f7f5" }}>
                  <img
                    src={scopeIllustration(opt.key, opt.label)}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", display: "block" }}
                  />
                  {active && (
                    <span
                      style={{
                        position: "absolute", top: 6, right: 6,
                        width: 20, height: 20, borderRadius: "50%",
                        background: "#e0405a",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: "0 1px 4px rgba(0,0,0,.2)",
                      }}
                    >
                      <Check size={12} color="#fff" strokeWidth={3} />
                    </span>
                  )}
                </div>
                <div
                  style={{
                    padding: "8px 4px 10px", textAlign: "center",
                    fontSize: 12.5, fontWeight: 800, color: active ? "#e0405a" : "#142f1d",
                    lineHeight: 1.2,
                  }}
                >
                  {opt.label}
                </div>
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
