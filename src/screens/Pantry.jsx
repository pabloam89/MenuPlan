import { useEffect, useState } from "react";
import { ChevronLeft, Plus, Trash2, X } from "lucide-react";
import { PantryInput } from "../components/PantryInput.jsx";
import { GoogleButton } from "../components/ui.jsx";
import { loadPantry, removePantryItem, clearPantry } from "../lib/pantry.js";

const PAGE_BG = "#f7f9f7";
const GREEN = "#2d5a3d";
const INK = "#142f1d";

/** "Mi despensa" — permanent access to the pantry, reached from Tu cuenta. */
export function PantryScreen({ user, onBack, onSignIn }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(() => Boolean(user));
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    loadPantry(user.id).then((rows) => {
      if (active) {
        setItems(rows);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [user]);

  const handleRemove = async (id) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await removePantryItem(user.id, id);
  };

  const handleClear = async () => {
    if (items.length === 0) return;
    if (!window.confirm("¿Vaciar toda tu despensa?")) return;
    setItems([]);
    await clearPantry(user.id);
  };

  const handleSaved = async () => {
    setAdding(false);
    const rows = await loadPantry(user.id);
    setItems(rows);
  };

  return (
    <div style={{ background: PAGE_BG, minHeight: "100dvh" }}>
      <div style={{ padding: "20px 16px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
          <button
            type="button"
            onClick={onBack}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "8px 12px",
              borderRadius: 10,
              border: "1.5px solid #2d5a3d",
              background: "#fff",
              color: GREEN,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <ChevronLeft size={16} /> Atrás
          </button>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: INK, margin: 0 }}>Mi despensa</h2>
        </div>

        {!user ? (
          <div
            style={{
              padding: 18,
              borderRadius: 18,
              border: "2px solid #2d5a3d",
              background: "#fff",
            }}
          >
            <p style={{ margin: "0 0 14px", fontSize: 14, color: "#7a8a7f", lineHeight: 1.5 }}>
              Inicia sesión para ver y gestionar tu despensa.
            </p>
            <GoogleButton onClick={onSignIn} />
          </div>
        ) : (
          <>
            <div
              style={{
                background: "#fff",
                border: "1.5px solid #e5ebe7",
                borderRadius: 16,
                padding: 14,
                marginBottom: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: GREEN }}>
                  {items.length} {items.length === 1 ? "ingrediente" : "ingredientes"}
                </span>
                {items.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClear}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      border: "none",
                      background: "transparent",
                      color: "#c0392b",
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      padding: 0,
                    }}
                  >
                    <Trash2 size={13} /> Vaciar todo
                  </button>
                )}
              </div>

              {loading ? (
                <p style={{ margin: 0, fontSize: 13, color: "#9ab0a1" }}>Cargando…</p>
              ) : items.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: "#9ab0a1" }}>
                  Aún no has añadido nada. Toca "Añadir más" para empezar.
                </p>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {items.map((item) => (
                    <span
                      key={item.id}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        padding: "5px 6px 5px 11px",
                        borderRadius: 20,
                        background: "#eaf3ec",
                        border: "1.5px solid #bcdcc7",
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: GREEN,
                      }}
                    >
                      {item.ingredientName}
                      <button
                        type="button"
                        onClick={() => handleRemove(item.id)}
                        aria-label={`Quitar ${item.ingredientName}`}
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "inherit",
                          cursor: "pointer",
                          padding: 2,
                          display: "flex",
                          opacity: 0.7,
                        }}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {adding ? (
              <div
                style={{
                  background: "#fff",
                  border: "1.5px solid #e5ebe7",
                  borderRadius: 16,
                  padding: 14,
                }}
              >
                <PantryInput onSaved={handleSaved} />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  width: "100%",
                  padding: "13px",
                  borderRadius: 14,
                  border: "1.5px solid #c8ddd0",
                  background: "#fff",
                  color: GREEN,
                  fontSize: 14,
                  fontWeight: 800,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <Plus size={16} /> Añadir más
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
