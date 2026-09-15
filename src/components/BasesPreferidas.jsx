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

// Ilustraciones del juego de bases (public/categories/cut/base/), que ya
// existían sin que las usara nadie. Faltan `legumbre` y `boniato`: esas salen
// sin dibujo hasta que haya arte, que es mejor que meterles uno de otra familia
// — la olla de barro de `categories/cut/legumbres.png` es de otro estilo y
// cantaría al lado de los cuencos con carita.
const ARTE = {
  arroz: "/categories/cut/base/arroz.png",
  pasta: "/categories/cut/base/pasta.png",
  patatas: "/categories/cut/base/patatas.png",
  quinoa: "/categories/cut/base/quinoa.png",
  cuscus: "/categories/cut/base/cuscus.png",
};

const ETIQUETA = {
  arroz: "Arroz",
  pasta: "Pasta",
  patatas: "Patatas",
  boniato: "Boniato",
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

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 9 }}>
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
                gap: 6,
                padding: "10px 6px 9px",
                borderRadius: 15,
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
                    position: "absolute", top: 6, right: 6,
                    width: 18, height: 18, borderRadius: 999,
                    background: SELECTED_TEAL, border: "1.5px solid #fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Check size={10} color="#fff" strokeWidth={3} />
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
                  <span style={{ fontSize: 26, fontWeight: 900, color: "#cfe0d5" }}>
                    {ETIQUETA[id]?.[0] ?? "?"}
                  </span>
                )}
              </span>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: sel ? SELECTED_TEAL : "#2f4a3a" }}>
                {ETIQUETA[id] ?? id}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
