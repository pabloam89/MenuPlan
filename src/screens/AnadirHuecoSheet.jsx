import { useState } from "react";
import { Check, Coffee, Apple, Layers2, Moon, Sun, X } from "../components/icons.jsx";
import { dayLabel } from "../lib/planner.js";
import { FRANJAS_DEL_DIA } from "../lib/pizarra.js";

/**
 * "Añadir hueco": qué se abre en este día.
 *
 * ── Cuatro franjas, y no una lista abierta ────────────────────────────────
 * El vocabulario es el de `mealSlots.js` y está cerrado a propósito. Un
 * "Brunch" no es una baldosa más aquí: cada franja arrastra reglas escritas
 * en validateMenu.js (la cena más ligera que la comida, no dos platos de
 * cuchara el mismo día...), así que inventar una sería prometer un hueco que
 * el resto de la app no sabe tratar.
 *
 * Lo que sí es nuevo es el ALCANCE: hasta ahora las franjas eran de la semana
 * entera —o había desayuno todos los días o ninguno—. Aquí se abren día a
 * día, y "toda la semana" es el atajo para no repetir el gesto siete veces.
 *
 * ── El segundo plato es la quinta baldosa ─────────────────────────────────
 * Y no una franja: partir la comida en 1º y 2º no abre una franja nueva, le
 * pone un hueco más a la que ya hay. Por eso solo aparece cuando ese día ya
 * tiene comida, y desaparece en cuanto está partida.
 */

const META = {
  Desayuno: { Icon: Coffee, color: "#9b6a3f" },
  Comida: { Icon: Sun, color: "#c98a1e" },
  Merienda: { Icon: Apple, color: "#c0504d" },
  Cena: { Icon: Moon, color: "#4f68b0" },
};

const SEGUNDO = { id: "__segundo", label: "Segundo plato", Icon: Layers2, color: "#7a5aa8" };

export function AnadirHuecoSheet({ day, yaPuestas, puedePartirComida, onAdd, onClose }) {
  const [todaLaSemana, setTodaLaSemana] = useState(false);

  const baldosas = [
    ...FRANJAS_DEL_DIA.map((meal) => ({
      id: meal,
      label: meal,
      ...META[meal],
      puesta: yaPuestas.has(meal),
    })),
    ...(puedePartirComida ? [{ ...SEGUNDO, puesta: false }] : []),
  ];

  return (
    <div
      onClick={onClose}
      className="mp-overlay-in"
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(0,0,0,.5)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="mp-sheet-up"
        style={{
          background: "#f5f9f6", borderRadius: "20px 20px 0 0",
          width: "100%", maxWidth: 420, boxSizing: "border-box",
          padding: `18px 18px calc(18px + env(safe-area-inset-bottom, 0px))`,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 17, fontWeight: 900, color: "#142f1d" }}>
              Añadir hueco
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 12, fontWeight: 600, color: "#7a9485" }}>
              {dayLabel(day)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              border: "none", background: "#f0f4f1", borderRadius: 999,
              width: 32, height: 32, cursor: "pointer", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Rejilla y no lista: son cuatro o cinco opciones cortas, y en
            columna la hoja se estiraba media pantalla para decir muy poco. */}
        <div
          style={{
            display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
            gap: 10, marginBottom: 14,
          }}
        >
          {baldosas.map(({ id, label, Icon, color, puesta }) => (
            <button
              key={id}
              type="button"
              disabled={puesta}
              onClick={() => onAdd(id, todaLaSemana)}
              className={puesta ? undefined : "mp-press"}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", gap: 7,
                padding: "14px 6px", borderRadius: 16,
                cursor: puesta ? "default" : "pointer",
                background: puesta ? "#eef3f0" : "#fff",
                border: `1px solid ${puesta ? "#e3ebe6" : "#e0eae3"}`,
                fontFamily: "inherit", opacity: puesta ? 0.6 : 1,
              }}
            >
              <span
                style={{
                  width: 40, height: 40, borderRadius: 13,
                  background: puesta ? "#dfe8e2" : `${color}1f`,
                  color: puesta ? "#9ab0a1" : color,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <Icon size={20} strokeWidth={2.2} />
              </span>
              <span
                style={{
                  fontSize: 11.5, fontWeight: 800, textAlign: "center", lineHeight: 1.2,
                  color: puesta ? "#9ab0a1" : "#142f1d",
                }}
              >
                {label}
              </span>
            </button>
          ))}
        </div>

        {/* El alcance se elige ANTES de tocar la baldosa, no después: así el
            toque que añade es el último gesto y no hay nada que confirmar. */}
        <button
          type="button"
          onClick={() => setTodaLaSemana((v) => !v)}
          className="mp-press"
          style={{
            display: "flex", alignItems: "center", gap: 10, width: "100%",
            padding: "11px 14px", borderRadius: 14, cursor: "pointer",
            background: todaLaSemana ? "#eaf6ee" : "#fff",
            border: `1.5px solid ${todaLaSemana ? "#bfe6cb" : "#e0eae3"}`,
            fontFamily: "inherit", textAlign: "left",
          }}
        >
          <span
            style={{
              width: 22, height: 22, borderRadius: 6, flexShrink: 0,
              background: todaLaSemana ? "#2d5a3d" : "#fff",
              border: `1.5px solid ${todaLaSemana ? "#2d5a3d" : "#cdd8d0"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            {todaLaSemana && <Check size={14} color="#fff" strokeWidth={3} />}
          </span>
          <span style={{ fontSize: 13.5, fontWeight: todaLaSemana ? 800 : 700, color: todaLaSemana ? "#142f1d" : "#3a4a42" }}>
            Ponerlo toda la semana
          </span>
        </button>
      </div>
    </div>
  );
}
