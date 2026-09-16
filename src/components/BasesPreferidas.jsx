import { Fragment, useState } from "react";

import { UtensilsCrossed } from "./icons.jsx";
import { MAX_POR_SEMANA, MIN_POR_SEMANA, POR_DEFECTO_POR_SEMANA } from "../lib/bases.js";
import { MAIN_BASES } from "../data/recipeSchema.js";
import { BASES_UI } from "../lib/basesUI.js";
import { ingredientThumbSrc } from "../lib/ingredientImages.js";
import { normalizar as normalizarLibreta, poner, proyectar, valorDe } from "../lib/notepad.js";

/**
 * Qué bases te gusta tener hechas — el detalle del modo "cocino en tanda".
 *
 * ── Dónde se guarda, y por qué no en un campo nuevo ────────────────────────
 * En la LIBRETA, en el eje `base`, que es el que ya existe para "más pasta" /
 * "menos patatas" y que `lib/sesgos.js` ya lee. Un `data.basesPreferidas`
 * habría sido otro campo sin lector, y además una segunda verdad sobre lo
 * mismo: si aquí dices "arroz" y en el panel dices "menos arroz", ¿cuál gana?
 *
 * ── De preferencia a petición ─────────────────────────────────────────────
 * El valor ya no es un sí/no sino CUÁNTOS platos de esa base quieres en la
 * semana. Un sí/no dejaba la pregunta a medias: no decía si quieres sofrito
 * dos veces o cinco, así que el generador no tenía nada concreto que cumplir y
 * solo podía empujar. Con el número, la regla 11b de validateMenu lo coloca —
 * o avisa de que esta semana no cabe.
 *
 * `sesgos.js` sigue funcionando igual porque lee el SIGNO, no el número.
 *
 * ── La proyección ─────────────────────────────────────────────────────────
 * `data.sesgos` es la proyección de la libreta, no un sitio donde escribir. Se
 * recalcula aquí en el mismo gesto (igual que hace useWizardMenu al guardar)
 * para que el cambio surta efecto sin esperar a que el usuario pase por la fila
 * de mandos. La libreta sigue siendo la única fuente.
 */

const GREEN = "#2d5a3d";

/** Las paradas del deslizador, del mínimo que hace tanda al tope. */
const PARADAS = Array.from(
  { length: MAX_POR_SEMANA - MIN_POR_SEMANA + 1 },
  (_, i) => MIN_POR_SEMANA + i,
);

/**
 * Los bloques, y por qué estos tres.
 *
 * Catorce fichas seguidas son una reja sin gramática, y además dejaban una
 * huérfana al final de la última fila. Se agrupan por el GESTO de cocinarlas,
 * que es lo que el usuario reconoce: una sartén, una bandeja o una olla.
 *
 * "Del horno" no es "verduras": la patata asada en dados especiados es fécula,
 * no verdura, y ocupa otro sitio en la cena y en el reparto de hidratos. Lo
 * que la junta con la bandeja de verdura es que las dos son una bandeja, una
 * vez, y de ahí toda la semana.
 *
 * Boniato, cuscús y quinoa se quedan aunque el catálogo solo tenga cinco, seis
 * y siete platos de cada una —o sea que casi nunca juntarán dos en la misma
 * semana— porque la decisión es de quien cocina, no nuestra.
 *
 * Las que no son fécula no están en MAIN_BASES: viven en `basesAparte`, y
 * `sesgos.js` casa por los dos sitios.
 */
const GRUPOS = [
  { titulo: "Sofritos y salsas", claves: ["sofrito", "salsa_tomate", "bechamel", "pesto"] },
  { titulo: "Del horno", claves: ["verdura_asada", "patatas_asadas"] },
  { titulo: "Ollas y cazuelas", claves: ["caldo", ...MAIN_BASES] },
];

/**
 * Ficha de base: el dibujo arriba, el nombre debajo y, si está encendida, el
 * deslizador de cuántos platos quieres esta semana.
 *
 * Dos gestos distintos y separados a propósito: tocar el DIBUJO enciende o
 * apaga, y tocar una parada elige la cantidad. Antes era un solo gesto que
 * ciclaba 0-2-3-4-0, y para apagar había que dar tres toques adivinando cuándo
 * daba la vuelta.
 */
function FichaDeBase({ id, veces, onEncender, onCantidad }) {
  const ui = BASES_UI[id] ?? { etiqueta: id, foto: id };
  const img = ingredientThumbSrc(ui.foto);
  const [failed, setFailed] = useState(false);
  const showImg = Boolean(img) && !failed;
  const encendida = veces > 0;

  return (
    <div
      style={{
        display: "flex", flexDirection: "column", alignItems: "stretch",
        borderRadius: 10, overflow: "hidden",
        background: encendida ? "#e8f5ec" : "#fff",
        outline: encendida ? `2px solid ${GREEN}` : "1.5px solid #e8efe9",
        outlineOffset: -1.5,
        transition: "background .14s ease, outline .14s ease",
      }}
    >
      <button
        type="button"
        onClick={() => onEncender(id)}
        aria-pressed={encendida}
        aria-label={encendida ? `${ui.etiqueta}: ${veces} por semana` : ui.etiqueta}
        style={{
          display: "block", width: "100%", padding: 0, border: "none",
          background: "transparent", cursor: "pointer", fontFamily: "inherit",
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
            display: "block", padding: "3px 4px 5px",
            fontSize: 9.5, fontWeight: 800, textAlign: "center",
            lineHeight: 1.15, letterSpacing: "-.1px",
            color: encendida ? GREEN : "#2f4a3a",
          }}
        >
          {ui.etiqueta}
        </span>
      </button>

      {/* El deslizador solo existe cuando la base está encendida: apagada no hay
          cantidad que elegir, y cuatro paradas grises en cada ficha llenarían la
          rejilla de mandos que no hacen nada. */}
      {encendida && (
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 7px 8px",
          }}
        >
          {PARADAS.map((n, i) => (
            <Fragment key={n}>
              {i > 0 && (
                <span style={{ flex: 1, height: 2, background: n <= veces ? GREEN : "#cfe0d5" }} />
              )}
              <button
                type="button"
                onClick={() => onCantidad(id, n)}
                aria-label={`${n} por semana`}
                aria-current={n === veces}
                style={{
                  width: n === veces ? 15 : 9, height: n === veces ? 15 : 9,
                  borderRadius: 999, border: "none", padding: 0, flexShrink: 0,
                  background: n <= veces ? GREEN : "#cfe0d5",
                  color: "#fff", fontSize: 9, fontWeight: 900, lineHeight: 1,
                  cursor: "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "width .12s ease, height .12s ease, background .12s ease",
                }}
              >
                {n === veces ? n : ""}
              </button>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

export function BasesPreferidas({ data, setData }) {
  const libreta = normalizarLibreta(data?.notepad);
  const vecesDe = (id) => {
    const n = Math.round(valorDe(libreta, `base.${id}`) ?? 0);
    // Un 1 guardado por la versión anterior del selector se lee como el mínimo
    // que de verdad sirve, en vez de pintar una parada que no existe.
    return n > 0 ? Math.min(Math.max(n, MIN_POR_SEMANA), MAX_POR_SEMANA) : 0;
  };

  const escribir = (id, n) => {
    setData((d) => {
      const actual = normalizarLibreta(d?.notepad);
      const siguiente = poner(actual, `base.${id}`, n, { origen: "pregunta" });
      return { ...d, notepad: siguiente, sesgos: proyectar(siguiente).sesgos ?? {} };
    });
  };

  /** El dibujo enciende y apaga. Encendida arranca en el mínimo que hace tanda. */
  const encender = (id) => escribir(id, vecesDe(id) > 0 ? 0 : POR_DEFECTO_POR_SEMANA);

  return (
    <div>
      <p style={{ fontSize: 12, color: "#6b7d70", margin: "0 0 10px", lineHeight: 1.4 }}>
        Toca una base para tenerla hecha. Empieza en {MIN_POR_SEMANA} platos por
        semana, que es lo mínimo para que merezca la pena cocinarla aparte.
      </p>

      {GRUPOS.map((grupo) => (
        <div key={grupo.titulo} style={{ marginBottom: 14 }}>
          {/* Cabecera de bloque, el mismo patrón con el que la ficha del plato
              separa salsa y guarnición. */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 8px" }}>
            <span style={{ fontSize: 11, fontWeight: 900, color: "#7a9485", whiteSpace: "nowrap", letterSpacing: ".2px" }}>
              {grupo.titulo}
            </span>
            <div style={{ flex: 1, borderTop: "1.5px dashed #dfeae2" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 9, alignItems: "start" }}>
            {grupo.claves.map((id) => (
              <FichaDeBase
                key={id}
                id={id}
                veces={vecesDe(id)}
                onEncender={encender}
                onCantidad={escribir}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
