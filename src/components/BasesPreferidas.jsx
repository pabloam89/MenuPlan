import { useState } from "react";

import { UtensilsCrossed } from "./icons.jsx";
import { MAX_POR_SEMANA, POR_DEFECTO_POR_SEMANA } from "../lib/bases.js";
import { MAIN_BASES } from "../data/recipeSchema.js";
import { BASES_UI } from "../lib/basesUI.js";
import { ingredientThumbSrc } from "../lib/ingredientImages.js";
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

const GREEN = "#2d5a3d";

/**
 * El orden NO es el del enum: manda cuánto TRABAJO te quita cada una, medido
 * sobre el catálogo (ver `loQueGana` en lib/bases.js).
 *
 * Delante van las cinco que ahorran MANOS, que es lo único que de verdad se
 * ahorra: un sofrito son 30 minutos y son los 30 tuyos, y una bandeja de
 * verdura asada quita 51 minutos de reloj y 7 de manos por plato, más que
 * ninguna fécula. Detrás van las siete féculas, que ahorran ESPERA: hervir es
 * pasivo, así que tener el arroz hecho no te quita cansancio, te quita los 18
 * minutos que a las nueve de la noche deciden si cocinas eso o pides algo.
 *
 * Boniato, cuscús y quinoa se quedan aunque el catálogo solo tenga cinco, seis
 * y siete platos de cada una —o sea que casi nunca juntarán dos en la misma
 * semana— porque la decisión es de quien cocina, no nuestra: que cada uno
 * marque lo que quiera.
 *
 * Las que no son fécula no están en MAIN_BASES: viven en `basesAparte`, y
 * `sesgos.js` casa por los dos sitios.
 */
const GRUPOS = [
  { titulo: "Sofritos y salsas", claves: ["sofrito", "salsa_tomate", "bechamel", "pesto"] },
  // La bandeja del horno es un bloque propio y no "verduras": la patata asada
  // en dados especiados es fécula, no verdura, y ocupa otro sitio en la cena.
  // Lo que las junta es el gesto — una bandeja, una vez, y de ahí toda la
  // semana—, que es lo que el usuario reconoce al elegir.
  { titulo: "Del horno", claves: ["verdura_asada", "patatas_asadas"] },
  { titulo: "Ollas y cazuelas", claves: ["caldo", ...MAIN_BASES] },
];


function FichaDeBase({ id, veces, onToggle }) {
  const ui = BASES_UI[id] ?? { etiqueta: id, foto: id };
  const img = ingredientThumbSrc(ui.foto);
  const [failed, setFailed] = useState(false);
  const showImg = Boolean(img) && !failed;

  return (
    <button
      type="button"
      onClick={() => onToggle(id)}
      aria-pressed={veces > 0}
      style={{
        display: "flex", flexDirection: "column", alignItems: "stretch",
        gap: 0, padding: 0, border: "none", borderRadius: 10, cursor: "pointer",
        fontFamily: "inherit", overflow: "hidden",
        background: veces > 0 ? "#e8f5ec" : "#fff",
        outline: veces > 0 ? `2px solid ${GREEN}` : "1.5px solid #e8efe9",
        outlineOffset: -1.5,
        transition: "background .14s ease, outline .14s ease",
        position: "relative",
      }}
    >
      <span style={{ width: "100%", aspectRatio: "1 / 1", display: "block" }}>
        {showImg ? (
          <img
            src={img}
            alt=""
            onError={() => setFailed(true)}
            style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
          />
        ) : (
          <span style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <UtensilsCrossed size={14} color="#bcc9c4" strokeWidth={1.5} />
          </span>
        )}
      </span>
      <span
        style={{
          display: "block", padding: "3px 4px 6px",
          fontSize: 9.5, fontWeight: 800, textAlign: "center",
          lineHeight: 1.15, letterSpacing: "-.1px",
          color: veces > 0 ? GREEN : "#2f4a3a",
        }}
      >
        {ui.etiqueta}
      </span>
      {/* El NÚMERO, no un tick: lo que se elige no es "sí o no" sino CUÁNTOS
          platos de esa base quieres en la semana. Con un tick la pregunta se
          quedaba a medias — marcar sofrito no decía si lo quieres dos veces o
          cuatro, y el generador no tenía nada concreto que cumplir. */}
      {veces > 0 && (
        <span
          style={{
            position: "absolute", top: 3, right: 3,
            minWidth: 15, height: 15, padding: "0 3px", borderRadius: 999,
            background: GREEN, display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 9.5, fontWeight: 900, lineHeight: 1,
            boxShadow: "0 1px 3px rgba(0,0,0,.2)",
          }}
        >
          {veces}
        </span>
      )}
    </button>
  );
}
export function BasesPreferidas({ data, setData }) {
  const libreta = normalizarLibreta(data?.notepad);
  const vecesDe = (id) => Math.min(MAX_POR_SEMANA, Math.round(valorDe(libreta, `base.${id}`) ?? 0));

  /**
   * Un toque sube; pasado el tope, vuelve a cero.
   *
   * Empieza en DOS y no en uno porque dos es el mínimo que hace tanda: con un
   * solo plato cocinas ese día y no hay nada que partir. Quien quiera uno
   * —el caldo de un domingo, por ejemplo— llega dando la vuelta.
   */
  const subir = (id) => {
    setData((d) => {
      const actual = normalizarLibreta(d?.notepad);
      const ahora = Math.round(valorDe(actual, `base.${id}`) ?? 0);
      const siguienteN = ahora <= 0
        ? POR_DEFECTO_POR_SEMANA
        : (ahora >= MAX_POR_SEMANA ? 0 : ahora + 1);
      const siguiente = poner(actual, `base.${id}`, siguienteN, { origen: "pregunta" });
      return { ...d, notepad: siguiente, sesgos: proyectar(siguiente).sesgos ?? {} };
    });
  };

  return (
    <div>
      <p style={{ fontSize: 12, color: "#6b7d70", margin: "0 0 10px", lineHeight: 1.4 }}>
        Toca para pedir cuántos platos quieres de cada base. Vuelve a tocar para
        subir, y de {MAX_POR_SEMANA} pasa a ninguno.
      </p>

      {GRUPOS.map((grupo) => (
        <div key={grupo.titulo} style={{ marginBottom: 14 }}>
          {/* Cabecera de bloque, el mismo patrón con el que la ficha separa
              salsa y guarnición: trece fichas seguidas son una reja sin
              gramática, y además dejaban una huérfana al final. */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 8px" }}>
            <span style={{ fontSize: 11, fontWeight: 900, color: "#7a9485", whiteSpace: "nowrap", letterSpacing: ".2px" }}>
              {grupo.titulo}
            </span>
            <div style={{ flex: 1, borderTop: "1.5px dashed #dfeae2" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 9 }}>
            {grupo.claves.map((id) => (
              <FichaDeBase key={id} id={id} veces={vecesDe(id)} onToggle={subir} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
