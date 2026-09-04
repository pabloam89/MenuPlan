/**
 * Banco de pruebas del panel — solo en dev, con `?panel=1`.
 *
 * Monta el sheet SUELTO, sin pasar por Menu.jsx (7.287 líneas) y sin llamar al
 * modelo. Las respuestas salen de un guion escrito a mano, así que se puede
 * recorrer la UI entera —incluidos los casos raros— sin gastar una llamada y
 * sin depender de que el modelo tenga el día bueno.
 *
 * El interruptor de arriba cambia de guion para poder ver de un vistazo los
 * cuatro desenlaces que hay que dejar bien: propuesta simple, aclaración con
 * varias opciones, límite, y no-te-he-entendido.
 */

import { useState } from "react";
import { PanelSheet, PanelFAB } from "../components/PanelSheet.jsx";
import { sugerenciasDelMenu } from "../lib/panelSuggestions.js";
import { libretaVacia, poner, proyectar, porQue } from "../lib/notepad.js";
import { aplicarOpcion, validarRespuesta, respuestaDeGuarda } from "../lib/panelParser.js";

// Un menú de una familia real: se pasa de pescado, abusa del horno y no tiene
// nada de cocina de fuera. Los tres disparadores de sugerencia a la vez.
const RECUENTO = {
  familias: { carne: 4, pescado: 4, verdura: 3, legumbres: 2, pasta_arroz: 1 },
  tecnicas: { horno: 6, plancha: 3, sarten: 3, olla: 2 },
  cocinas: {},
  huecos: 14,
};

const LIBRETA_INICIAL = [
  ["freqs.carne", 3], ["freqs.pescado", 2], ["freqs.verdura", 4],
  ["freqs.legumbres", 2], ["freqs.pasta_arroz", 2], ["freqs.huevos", 2],
].reduce((n, [k, v]) => poner(n, k, v, { origen: "pregunta" }), libretaVacia());

// Los guiones. Cada uno es lo que devolvería el modelo, tal cual, para que el
// validador de verdad haga su trabajo también aquí.
const GUIONES = {
  simple: {
    etiqueta: "Propuesta clara",
    respuesta: {
      reply: "Ahora hay pescado cuatro veces por semana, dos más de las que pediste.",
      kind: "propuestas",
      pendiente: [],
      opciones: [{
        etiqueta: "Dejarlo en dos",
        detalle: "Como lo tenías pedido",
        ajustes: [{ campo: "freqs", valor: "pescado", op: "menos", n: 2 }],
      }],
    },
  },
  aclaracion: {
    etiqueta: "Hay que aclarar",
    respuesta: {
      reply: "Ahora hay pasta o arroz una vez por semana. ¿Cuánta te apetece?",
      kind: "propuestas",
      pendiente: [],
      opciones: [
        { etiqueta: "Tres veces", detalle: "Dos más de lo que hay ahora",
          ajustes: [{ campo: "freqs", valor: "pasta_arroz", op: "mas", n: 3 }] },
        { etiqueta: "Cuatro veces", detalle: "Casi día sí, día no",
          ajustes: [{ campo: "freqs", valor: "pasta_arroz", op: "mas", n: 4 }] },
        { etiqueta: "Solo pasta, no arroz", detalle: "Y el arroz lo dejo como está",
          ajustes: [{ campo: "base", valor: "pasta", op: "mas" }] },
      ],
    },
  },
  compuesta: {
    etiqueta: "Varias cosas + pendiente",
    respuesta: {
      reply: "Vale: bajo el pescado y meto cocina mexicana.",
      kind: "propuestas",
      pendiente: ["Lo de que sea solo para los jueves todavía no sé hacerlo."],
      opciones: [{
        etiqueta: "Las dos cosas",
        ajustes: [
          { campo: "freqs", valor: "pescado", op: "menos", n: 2 },
          { campo: "cocina", valor: "mexicana", op: "mas" },
          { campo: "excluidos", valor: "cilantro", op: "nunca" },
        ],
      }],
    },
  },
  limite: {
    etiqueta: "Fuera de lo que sé",
    respuesta: {
      reply: "Las dietas de una persona concreta todavía no las llevo. Sí puedo cambiar cuánto hay de cada cosa para toda la casa, o para niños, adultos o bebés.",
      kind: "limites",
      pendiente: ["Dietas por persona (keto, veggie) — en camino."],
      opciones: [],
    },
  },
  perdido: {
    etiqueta: "No te he entendido",
    respuesta: { reply: "x", kind: "propuestas", pendiente: [], opciones: [] },
  },
};

export function PanelPlayground() {
  const [abierto, setAbierto] = useState(true);
  const [guion, setGuion] = useState("simple");
  const [notepad, setNotepad] = useState(LIBRETA_INICIAL);
  const [aplicado, setAplicado] = useState(null);

  const sugerencias = sugerenciasDelMenu(RECUENTO, notepad);

  // Mismo camino que en producción: guarda determinista primero, y lo que
  // devuelve el "modelo" pasa por el validador de verdad.
  const consultar = async (frase) => {
    const guarda = respuestaDeGuarda(frase);
    if (guarda) return guarda;
    await new Promise((r) => setTimeout(r, 550));
    return validarRespuesta(GUIONES[guion].respuesta);
  };

  const aplicar = (opcion, frase) => {
    const n = aplicarOpcion(notepad, opcion, { frase, fecha: new Date().toISOString().slice(0, 10) });
    setNotepad(n);
    setAplicado({ opcion, frase });
    setAbierto(false);
  };

  const vista = proyectar(notepad);

  return (
    <div style={{ minHeight: "100vh", background: "#f6f9f6", padding: "18px 16px 120px", maxWidth: 420, margin: "0 auto" }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: "#8a9c91" }}>
        Banco de pruebas
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, color: "#142f1d", margin: "4px 0 16px" }}>
        Panel del menú
      </div>

      <div style={{ fontSize: 12, fontWeight: 800, color: "#5c7066", marginBottom: 7 }}>
        Qué contesta el modelo
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
        {Object.entries(GUIONES).map(([k, g]) => (
          <button key={k} type="button" onClick={() => setGuion(k)} style={{
            fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 20, cursor: "pointer",
            background: guion === k ? "#2d5a3d" : "rgba(45,90,61,.08)",
            color: guion === k ? "#fff" : "#4a6355",
            border: `1.5px solid ${guion === k ? "#2d5a3d" : "rgba(45,90,61,.2)"}`,
          }}>{g.etiqueta}</button>
        ))}
      </div>

      <Bloque titulo="Cómo está el menú">
        {Object.entries(RECUENTO.familias).map(([f, n]) => (
          <Fila key={f} k={f.replace("_", " o ")} v={`${n} esta semana · pediste ${vista.freqs[f] ?? "—"}`} />
        ))}
      </Bloque>

      <Bloque titulo="Lo que dice la libreta">
        {Object.entries(vista.freqs).map(([f, n]) => (
          <Fila key={f} k={f.replace("_", " o ")} v={String(n)} nota={porQue(notepad, `freqs.${f}`)} />
        ))}
        {Object.entries(vista.sesgos).flatMap(([campo, vals]) =>
          Object.entries(vals).map(([v, n]) => (
            <Fila key={`${campo}.${v}`} k={`${campo} · ${v}`} v={n > 0 ? "más" : n < 0 ? "menos" : "nunca"}
              nota={porQue(notepad, `${campo}.${v}`)} />
          )))}
        {vista.excluidos.map((e) => <Fila key={e} k="fuera" v={e} nota={porQue(notepad, `excluidos.${e}`)} />)}
      </Bloque>

      {aplicado && (
        <div style={{ background: "#e7f4ec", border: "1px solid #cfe6d8", borderRadius: 14, padding: "11px 13px", marginTop: 14 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: "#2f7d4a" }}>
            Aplicado: {aplicado.opcion.etiqueta}
          </div>
          <div style={{ fontSize: 12, color: "#5c7066", marginTop: 2 }}>
            desde «{aplicado.frase}»
          </div>
        </div>
      )}

      <button type="button" onClick={() => { setNotepad(LIBRETA_INICIAL); setAplicado(null); }}
        style={{ marginTop: 18, background: "none", border: "none", padding: 0, fontSize: 13, fontWeight: 700, color: "#2d5a3d", cursor: "pointer" }}>
        Volver a empezar
      </button>

      <PanelFAB onClick={() => setAbierto(true)} oculta={abierto} />
      <PanelSheet
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        sugerencias={sugerencias}
        notepad={notepad}
        onConsultar={consultar}
        onAplicar={aplicar}
        primeraVez
      />
    </div>
  );
}

function Bloque({ titulo, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".09em", textTransform: "uppercase", color: "#8a9c91", marginBottom: 7 }}>
        {titulo}
      </div>
      <div style={{ background: "#fff", border: "1px solid #e0eae3", borderRadius: 14, padding: "4px 12px" }}>
        {children}
      </div>
    </div>
  );
}

function Fila({ k, v, nota }) {
  return (
    <div style={{ padding: "9px 0", borderBottom: "1px solid #f2f6f3" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#3a4a42" }}>{k}</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: "#142f1d" }}>{v}</span>
      </div>
      {nota && <div style={{ fontSize: 11.5, color: "#8a9c91", marginTop: 3 }}>{nota}</div>}
    </div>
  );
}
