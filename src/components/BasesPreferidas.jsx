import { Check } from "./icons.jsx";
import { MAIN_BASES } from "../data/recipeSchema.js";
import { normalizar as normalizarLibreta, poner, proyectar, valorDe } from "../lib/notepad.js";

/**
 * Qué bases te gusta tener hechas — el detalle del modo "cocino en tanda".
 *
 * ── Dónde se guarda, y por qué no en un campo nuevo ────────────────────────
 * En la LIBRETA, en el eje `base`, que es el que ya existe para "más pasta" /
 * "menos patatas" y que `lib/sesgos.js` ya lee (`sesgoScoreBoost` casa por
 * `mainBase`). Un `data.basesPreferidas` habría sido otro campo sin lector, y
 * además una segunda verdad sobre lo mismo: si aquí dices "arroz" y en el panel
 * dices "menos arroz", ¿cuál gana?
 *
 * Marcar una base es exactamente un sesgo `+1`: una PREFERENCIA, no un
 * compromiso. Empuja el menú hacia platos que comparten esa olla, y nunca
 * promete una tanda que la semana no pueda dar — que es lo que pasaría si esto
 * fuera una lista de "el domingo cocino esto sí o sí".
 *
 * ── La proyección ─────────────────────────────────────────────────────────
 * `data.sesgos` es la proyección de la libreta, no un sitio donde escribir. Se
 * recalcula aquí en el mismo gesto (igual que hace useWizardMenu al guardar)
 * para que el cambio surta efecto sin esperar a que el usuario pase por la fila
 * de mandos. La libreta sigue siendo la única fuente.
 */

// Las ilustraciones de INGREDIENTE, no las del juego de bases.
//
// Las de `categories/cut/base/` son cuencos genéricos y a ese tamaño no se
// distinguen: "legumbre" salía como un cuenco beige que podía ser cualquier
// cosa, y de `boniato` no había. Un garbanzo concreto se reconoce al instante
// aunque el eje se llame `legumbre` — el usuario no elige una palabra del
// enum, elige una olla que conoce.
const ARTE = {
  arroz: "/ingredients/arroz.png",
  pasta: "/ingredients/pasta-corta.png",
  patatas: "/ingredients/patata.png",
  boniato: "/ingredients/boniato.png",
  legumbre: "/ingredients/garbanzos.png",
  quinoa: "/ingredients/quinoa.png",
  cuscus: "/ingredients/cuscus.png",
};

const ETIQUETA = {
  arroz: "Arroz",
  pasta: "Pasta",
  patatas: "Patatas",
  boniato: "Boniato",
  // El eje se llama `legumbre`, pero lo que se ve y se entiende es el
  // garbanzo. La etiqueta acompaña al dibujo, no al nombre interno.
  legumbre: "Legumbre",
  quinoa: "Quinoa",
  cuscus: "Cuscús",
};
const SELECTED_TEAL = "#0f766e";

export function BasesPreferidas({ data, setData }) {
  const libreta = normalizarLibreta(data?.notepad);
  const elegida = (id) => (valorDe(libreta, `base.${id}`) ?? 0) > 0;

  const alternar = (id) => {
    setData((d) => {
      const actual = normalizarLibreta(d?.notepad);
      const puesta = (valorDe(actual, `base.${id}`) ?? 0) > 0;
      const siguiente = poner(actual, `base.${id}`, puesta ? 0 : 1, { origen: "pregunta" });
      return { ...d, notepad: siguiente, sesgos: proyectar(siguiente).sesgos ?? {} };
    });
  };

  return (
    <div>
      <p style={{ fontSize: 12.5, color: "#6b7d70", margin: "0 0 12px", lineHeight: 1.45 }}>
        Marca las que te gusta tener hechas. Buscaremos platos que las compartan,
        para que una olla te sirva para varios días.
      </p>

      {/* Cuatro columnas y fichas pequeñas, como las de Añadir ingredientes:
          son siete opciones de una lista cerrada, no siete decisiones. A
          tamaño de card ocupaban media pantalla y pesaban más que la pregunta. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {MAIN_BASES.map((id) => {
          const sel = elegida(id);
          const img = ARTE[id];
          return (
            <button
              key={id}
              type="button"
              onClick={() => alternar(id)}
              aria-pressed={sel}
              style={{
                position: "relative",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                padding: "8px 4px 7px",
                borderRadius: 12,
                border: sel ? `2px solid ${SELECTED_TEAL}` : "1.5px solid #e2eae5",
                background: "#fff",
                boxShadow: sel ? "0 6px 18px rgba(15,118,110,.22)" : "0 1px 3px rgba(20,47,29,.05)",
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all .16s cubic-bezier(.4,0,.2,1)",
              }}
            >
              {sel && (
                <span
                  style={{
                    position: "absolute", top: 3, right: 3,
                    width: 15, height: 15, borderRadius: 999,
                    background: SELECTED_TEAL, border: "1.5px solid #fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Check size={9} color="#fff" strokeWidth={3} />
                </span>
              )}
              <span
                style={{
                  width: "100%",
                  aspectRatio: "1 / 1",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {img ? (
                  <img
                    src={img}
                    alt=""
                    loading="lazy"
                    style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                  />
                ) : (
                  // Sin arte todavía. Una inicial grande es honesta y no finge
                  // ser una ilustración: se ve que falta y se puede pulsar igual.
                  <span style={{ fontSize: 20, fontWeight: 900, color: "#cfe0d5" }}>
                    {ETIQUETA[id]?.[0] ?? "?"}
                  </span>
                )}
              </span>
              <span style={{ fontSize: 10, fontWeight: 800, color: sel ? SELECTED_TEAL : "#2f4a3a" }}>
                {ETIQUETA[id] ?? id}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
