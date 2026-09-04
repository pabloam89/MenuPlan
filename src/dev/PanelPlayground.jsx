/**
 * Banco de pruebas del panel — solo en dev, con `?panel=1`.
 *
 * Detrás hay un menú de pega, sin lógica: solo sirve para que el spotlight
 * tenga algo que apagar y se vea cómo queda encima de una pantalla real.
 *
 * El selector de guion está arriba y es feo a propósito: es andamio, no
 * producto, y conviene que se note la diferencia de un vistazo.
 */

import { useState } from "react";
import { PanelCoach } from "../components/PanelCoach.jsx";
import { sugerenciasDelMenu } from "../lib/panelSuggestions.js";
import { libretaVacia, poner } from "../lib/notepad.js";
import { aplicarOpcion, validarRespuesta, respuestaDeGuarda } from "../lib/panelParser.js";

const RECUENTO = {
  familias: { carne: 4, pescado: 4, verdura: 3, legumbres: 2, pasta_arroz: 1 },
  tecnicas: { horno: 6, plancha: 3, sarten: 3, olla: 2 },
  cocinas: {},
  huecos: 14,
};

const LIBRETA = [
  ["freqs.carne", 3], ["freqs.pescado", 2], ["freqs.verdura", 4],
  ["freqs.legumbres", 2], ["freqs.pasta_arroz", 2], ["freqs.huevos", 2],
].reduce((n, [k, v]) => poner(n, k, v, { origen: "pregunta" }), libretaVacia());

const GUIONES = {
  cambia: {
    etiqueta: "Cambia y ya",
    respuesta: {
      reply: "Ahora hay pescado cuatro veces, dos más de las que pediste.",
      kind: "propuestas",
      pendiente: [],
      opciones: [{ etiqueta: "Dejarlo en dos", ajustes: [{ campo: "freqs", valor: "pescado", op: "menos", n: 2 }] }],
    },
  },
  pregunta: {
    etiqueta: "Te pregunta",
    respuesta: {
      reply: "Ahora hay pasta o arroz una vez por semana. ¿Cuánta te apetece?",
      kind: "propuestas",
      pendiente: [],
      opciones: [
        { etiqueta: "Tres veces", ajustes: [{ campo: "freqs", valor: "pasta_arroz", op: "mas", n: 3 }] },
        { etiqueta: "Cuatro veces", ajustes: [{ campo: "freqs", valor: "pasta_arroz", op: "mas", n: 4 }] },
        { etiqueta: "Solo pasta", ajustes: [{ campo: "base", valor: "pasta", op: "mas" }] },
      ],
    },
  },
  varias: {
    etiqueta: "Marca varias",
    respuesta: {
      reply: "He pillado tres cosas. Marca las que quieras.",
      kind: "propuestas",
      modo: "varias",
      pendiente: ["Lo de los jueves todavía no sé hacerlo."],
      opciones: [
        { etiqueta: "Menos pescado", ajustes: [{ campo: "freqs", valor: "pescado", op: "menos", n: 2 }] },
        { etiqueta: "Algo de mexicana", ajustes: [{ campo: "cocina", valor: "mexicana", op: "mas" }] },
        { etiqueta: "Sin cilantro", ajustes: [{ campo: "excluidos", valor: "cilantro", op: "nunca" }] },
      ],
    },
  },
  limite: {
    etiqueta: "No sé hacerlo",
    respuesta: {
      reply: "Las dietas de una persona concreta todavía no las llevo. Sí puedo cambiar cuánto hay de cada cosa.",
      kind: "limites", pendiente: [], opciones: [],
    },
  },
  perdido: {
    etiqueta: "No te entiendo",
    respuesta: { reply: "x", kind: "propuestas", pendiente: [], opciones: [] },
  },
};

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
const PLATOS = [
  ["Crema de calabaza", "Merluza al horno"],
  ["Ensalada de garbanzos", "Pollo al ajillo"],
  ["Lentejas estofadas", "Tortilla francesa"],
  ["Sopa de verduras", "Salmón a la plancha"],
  ["Arroz con tomate", "Filetes empanados"],
];

export function PanelPlayground() {
  const [guion, setGuion] = useState("cambia");
  const [notepad, setNotepad] = useState(LIBRETA);

  const consultar = async (frase) => {
    const guarda = respuestaDeGuarda(frase);
    if (guarda) return guarda;
    await new Promise((r) => setTimeout(r, 600));
    return validarRespuesta(GUIONES[guion].respuesta);
  };

  const aplicar = (opcion, frase) => {
    setNotepad(aplicarOpcion(notepad, opcion, { frase, fecha: new Date().toISOString().slice(0, 10) }));
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f6f9f6" }}>
      {/* Andamio. Feo a propósito. */}
      <div style={{ background: "#241f14", padding: "8px 12px", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#c9b98a", letterSpacing: ".08em" }}>GUION</span>
        {Object.entries(GUIONES).map(([k, g]) => (
          <button key={k} type="button" onClick={() => setGuion(k)} style={{
            fontSize: 11, fontWeight: 700, padding: "4px 9px", borderRadius: 6, cursor: "pointer",
            background: guion === k ? "#c9b98a" : "transparent",
            color: guion === k ? "#241f14" : "#c9b98a",
            border: "1px solid #6b5f42",
          }}>{g.etiqueta}</button>
        ))}
      </div>

      {/* Menú de pega, para que el spotlight tenga qué apagar. */}
      <div style={{ maxWidth: 420, margin: "0 auto", padding: "16px 16px 120px" }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", color: "#8a9c91" }}>SEMANA DEL 8</div>
        <div style={{ fontSize: 24, fontWeight: 900, color: "#142f1d", margin: "3px 0 16px" }}>Tu menú</div>
        {DIAS.map((d, i) => (
          <div key={d} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#5c7066", marginBottom: 6 }}>{d}</div>
            <div style={{ background: "#fff", border: "1px solid #e0eae3", borderRadius: 14, overflow: "hidden" }}>
              {PLATOS[i].map((p, k) => (
                <div key={p} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "11px 12px",
                  borderTop: k ? "1px solid #f2f6f3" : "none",
                }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: "#eef4ef", flexShrink: 0 }} />
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "#142f1d" }}>{p}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <PanelCoach
        sugerencias={sugerenciasDelMenu(RECUENTO, notepad)}
        notepad={notepad}
        onConsultar={consultar}
        onAplicar={aplicar}
        primeraVez
      />
    </div>
  );
}
