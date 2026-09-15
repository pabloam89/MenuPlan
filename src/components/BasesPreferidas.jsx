import { useState } from "react";

import { Check, UtensilsCrossed } from "./icons.jsx";
import { MAIN_BASES } from "../data/recipeSchema.js";
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
 * Qué se enseña por cada base. El eje se llama `legumbre`, pero lo que se
 * reconoce de un vistazo es un garbanzo: el usuario no elige una palabra del
 * enum, elige una olla que conoce. Por eso el nombre del dibujo y la etiqueta
 * van por separado del id.
 *
 * Las ilustraciones salen de `ingredientThumbSrc`, o sea el MISMO resolvedor
 * que usa Añadir ingredientes. Antes se usaban las de `categories/cut/base/`, y
 * a este tamaño no se distinguían — "legumbre" era un cuenco beige que podía
 * ser cualquier cosa, y de `boniato` no había ninguna.
 */
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
const ORDEN = [
  "sofrito", "verdura_asada", "salsa_tomate", "bechamel", "pesto", "caldo",
  ...MAIN_BASES,
];

const BASES_UI = {
  // Provisional: no hay ilustración propia de sofrito ni de verdura asada
  // todavía, y las dos caen en el dibujo genérico de verduras. Son justo las
  // dos que más ahorran, así que son las primeras que merecen una de verdad.
  sofrito: { etiqueta: "Sofrito", foto: "sofrito" },
  verdura_asada: { etiqueta: "Verdura asada", foto: "verduras asadas" },
  salsa_tomate: { etiqueta: "Tomate", foto: "tomate frito" },
  bechamel: { etiqueta: "Bechamel", foto: "bechamel" },
  pesto: { etiqueta: "Pesto", foto: "pesto" },
  caldo: { etiqueta: "Caldo", foto: "caldo de pollo" },
  arroz: { etiqueta: "Arroz", foto: "arroz" },
  pasta: { etiqueta: "Pasta", foto: "pasta corta" },
  patatas: { etiqueta: "Patatas", foto: "patata" },
  boniato: { etiqueta: "Boniato", foto: "boniato" },
  legumbre: { etiqueta: "Garbanzos", foto: "garbanzos" },
  quinoa: { etiqueta: "Quinoa", foto: "quinoa" },
  cuscus: { etiqueta: "Cuscús", foto: "cuscus" },
};

/**
 * Ficha de base: el dibujo arriba y el nombre DEBAJO, sobre blanco.
 *
 * Nació copiando tal cual la de Añadir ingredientes, que lleva el nombre
 * encima de la foto sobre un degradado oscuro. Allí funciona porque hay
 * decenas de ingredientes y la foto manda; aquí son siete y el degradado
 * ensuciaba unas ilustraciones que ya vienen sobre blanco — ponía una sombra
 * grisácea sobre el cuenco. Con el nombre fuera, el dibujo se ve limpio y la
 * etiqueta se lee sin pelearse con él.
 */
function FichaDeBase({ id, elegida, onToggle }) {
  const ui = BASES_UI[id] ?? { etiqueta: id, foto: id };
  const img = ingredientThumbSrc(ui.foto);
  const [failed, setFailed] = useState(false);
  const showImg = Boolean(img) && !failed;

  return (
    <button
      type="button"
      onClick={() => onToggle(id)}
      aria-pressed={elegida}
      style={{
        display: "flex", flexDirection: "column", alignItems: "stretch",
        gap: 0, padding: 0, border: "none", borderRadius: 10, cursor: "pointer",
        fontFamily: "inherit", overflow: "hidden",
        background: elegida ? "#e8f5ec" : "#fff",
        outline: elegida ? `2px solid ${GREEN}` : "1.5px solid #e8efe9",
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
          color: elegida ? GREEN : "#2f4a3a",
        }}
      >
        {ui.etiqueta}
      </span>
      {elegida && (
        <span
          style={{
            position: "absolute", top: 3, right: 3,
            width: 13, height: 13, borderRadius: 999,
            background: GREEN, display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 1px 3px rgba(0,0,0,.2)",
          }}
        >
          <Check size={8} strokeWidth={3.5} color="#fff" />
        </span>
      )}
    </button>
  );
}
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
      <p style={{ fontSize: 12, color: "#6b7d70", margin: "0 0 10px", lineHeight: 1.4 }}>
        Marca las que te gusta tener hechas: buscaremos platos que compartan olla.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 9 }}>
        {ORDEN.map((id) => (
          <FichaDeBase key={id} id={id} elegida={elegida(id)} onToggle={alternar} />
        ))}
      </div>
    </div>
  );
}
