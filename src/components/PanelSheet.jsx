/**
 * El panel de ajustes del menú.
 *
 * Burbuja → sugerencias sacadas del menú real → escribes → tarjetas de acción.
 * Misma forma que FeedbackFAB, que es el patrón que los usuarios ya conocen.
 *
 * NO es un chat: sin burbujas, sin historial, sin scroll de conversación. Una
 * pregunta, una respuesta, aplicar o descartar. Un chat envejece mal en móvil y
 * obliga a mantener un estado que no hace falta. Es un formulario que se
 * rellena escribiendo.
 *
 * Deliberadamente tonto: no llama a nadie ni guarda nada. Recibe `onConsultar`
 * y `onAplicar` de fuera, así que se puede ver entero (y probar) sin gastar una
 * llamada al modelo. Ver `?panel=1`.
 */

import { useState, useRef, useEffect } from "react";
import { Sparkles, X, ArrowUp, Info, Undo2 } from "lucide-react";
import { resumirAjuste } from "../lib/panelParser.js";

export function PanelSheet({
  abierto,
  onCerrar,
  sugerencias = [],
  notepad,
  onConsultar,
  onAplicar,
  primeraVez = false,
  onVistoAviso,
}) {
  const [texto, setTexto] = useState("");
  const [estado, setEstado] = useState("vacio");   // vacio | pensando | respuesta
  const [respuesta, setRespuesta] = useState(null);
  const [elegida, setElegida] = useState(0);
  const [avisoVisible, setAvisoVisible] = useState(primeraVez);
  const inputRef = useRef(null);

  useEffect(() => {
    if (abierto) setTimeout(() => inputRef.current?.focus(), 180);
    else { setTexto(""); setEstado("vacio"); setRespuesta(null); setElegida(0); }
  }, [abierto]);

  if (!abierto) return null;

  const preguntar = async (frase) => {
    const q = (frase ?? texto).trim();
    if (!q) return;
    setTexto(q);
    setEstado("pensando");
    const r = await onConsultar?.(q);
    setRespuesta(r ?? null);
    setElegida(0);
    setEstado("respuesta");
  };

  const opcion = respuesta?.opciones?.[elegida];

  return (
    <div onClick={onCerrar} className="mp-overlay-in" style={S.overlay}>
      <div onClick={(e) => e.stopPropagation()} className="mp-sheet-up" style={S.sheet}>
        <div style={S.grabber} />

        <div style={S.header}>
          <div style={S.burbujaIcono}><Sparkles size={17} color="#2d5a3d" /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={S.titulo}>¿Qué le cambiamos al menú?</div>
            <div style={S.subtitulo}>Dime lo que echas de menos y te lo ajusto</div>
          </div>
          <button type="button" onClick={onCerrar} style={S.cerrar} aria-label="Cerrar">
            <X size={16} color="#5c7066" />
          </button>
        </div>

        <div style={S.cuerpo}>
          {/* Solo la primera vez: qué sabe hacer y qué no. Los límites se
              aprenden cuando chocas con ellos, no en un tour que se salta. */}
          {avisoVisible && (
            <div style={S.aviso}>
              <Info size={15} color="#a85a00" style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ flex: 1 }}>
                <div style={S.avisoTitulo}>Puedo cambiar cuánto hay de cada cosa</div>
                <div style={S.avisoTexto}>
                  Familias, cocinas, estilos y lo que no queréis ver. Lo de días
                  concretos, personas con nombre o alergias, todavía no.
                </div>
                <button
                  type="button"
                  onClick={() => { setAvisoVisible(false); onVistoAviso?.(); }}
                  style={S.avisoBoton}
                >
                  Entendido
                </button>
              </div>
            </div>
          )}

          {estado === "vacio" && (
            <>
              <div style={S.seccion}>Por dónde empezar</div>
              <div style={S.sugerencias}>
                {sugerencias.map((s) => (
                  <button key={s.id} type="button" className="mp-press" style={S.sugerencia}
                    onClick={() => preguntar(s.frase)}>
                    <div style={S.sugerenciaTexto}>{s.texto}</div>
                    <div style={S.sugerenciaPorque}>{s.porque}</div>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Sin spinner: se enseñan las mismas tarjetas en gris. El usuario ve
              que algo pasa y no cambia el alto del sheet, que es lo que hace
              que una espera de un segundo se sienta como un salto. */}
          {estado === "pensando" && (
            <div style={S.pensando}>
              <div style={S.pensandoTexto}>Mirando tu menú…</div>
              {[0, 1].map((i) => <div key={i} style={S.fantasma} />)}
            </div>
          )}

          {estado === "respuesta" && respuesta && (
            <div className="mp-pop">
              <div style={S.reply}>{respuesta.reply}</div>

              {/* Varias opciones = alternativas entre sí. Una sola = el cambio
                  ya está claro y no hay nada que elegir. */}
              {respuesta.opciones.length > 0 && (
                <div style={S.opciones}>
                  {respuesta.opciones.map((o, i) => {
                    const activa = i === elegida;
                    return (
                      <button key={i} type="button" className="mp-press"
                        onClick={() => setElegida(i)}
                        style={{ ...S.opcion, ...(activa ? S.opcionActiva : null) }}>
                        <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                          <div style={{ ...S.opcionTitulo, color: activa ? "#142f1d" : "#3a4a42" }}>
                            {o.etiqueta}
                          </div>
                          {o.detalle && <div style={S.opcionDetalle}>{o.detalle}</div>}
                          {/* El recibo: «Pescado: 2 → 1» en vez de una etiqueta
                              suelta. Es lo que deja pulsar sabiendo qué pasa. */}
                          <div style={S.cambios}>
                            {o.ajustes.map((a, k) => {
                              const r = resumirAjuste(notepad, a);
                              return r ? <span key={k} style={S.cambio}>{r}</span> : null;
                            })}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* El cubo del medio. Gris, no rojo, y NO bloquea el Aplicar:
                  es una nota al pie, no un error. */}
              {respuesta.pendiente?.length > 0 && (
                <div style={S.pendiente}>
                  <Info size={14} color="#8a9c91" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    {respuesta.pendiente.map((p, i) => (
                      <div key={i} style={S.pendienteLinea}>{p}</div>
                    ))}
                  </div>
                </div>
              )}

              {respuesta.kind !== "propuestas" && (
                <button type="button" onClick={() => { setEstado("vacio"); setRespuesta(null); }}
                  style={S.volver}>
                  <Undo2 size={13} /> Probar otra cosa
                </button>
              )}
            </div>
          )}
        </div>

        {/* El input se queda SIEMPRE: tras una respuesta se puede matizar sin
            volver atrás, que es lo que la gente hace de verdad. */}
        <div style={S.pie}>
          <div style={S.inputFila}>
            <input
              ref={inputRef}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") preguntar(); }}
              placeholder="menos pescado, más pasta…"
              style={S.input}
            />
            <button type="button" onClick={() => preguntar()} disabled={!texto.trim()}
              style={{ ...S.enviar, ...(texto.trim() ? null : S.enviarOff) }} aria-label="Enviar">
              <ArrowUp size={17} color="#fff" />
            </button>
          </div>

          {opcion && (
            <div style={S.acciones}>
              <button type="button" onClick={onCerrar} style={S.descartar}>Descartar</button>
              <button type="button" className="mp-press" style={S.aplicar}
                onClick={() => onAplicar?.(opcion, texto)}>
                Aplicar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** La burbuja. Se esconde sola cuando el panel está abierto. */
export function PanelFAB({ onClick, oculta }) {
  if (oculta) return null;
  return (
    <button type="button" onClick={onClick} className="mp-press" style={S.fab} aria-label="Ajustar el menú">
      <Sparkles size={21} color="#fff" />
    </button>
  );
}

const S = {
  fab: {
    position: "fixed", right: 18, bottom: "calc(96px + env(safe-area-inset-bottom, 0px))",
    zIndex: 150, width: 48, height: 48, borderRadius: 16, border: "none",
    background: "#2d5a3d", display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer", boxShadow: "0 4px 16px rgba(20,47,29,.3)",
  },
  overlay: {
    position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,.5)",
    display: "flex", alignItems: "flex-end", justifyContent: "center",
  },
  sheet: {
    background: "#f5f9f6", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 420,
    maxHeight: "88vh", display: "flex", flexDirection: "column",
    boxShadow: "0 -12px 40px rgba(0,0,0,.18)",
  },
  grabber: { width: 38, height: 4, borderRadius: 999, background: "#dde7e0", margin: "8px auto 2px" },
  header: { display: "flex", alignItems: "center", gap: 10, padding: "10px 16px 12px" },
  burbujaIcono: {
    width: 34, height: 34, borderRadius: 11, background: "#e3efe7",
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  titulo: { fontSize: 17, fontWeight: 900, color: "#142f1d", lineHeight: 1.2 },
  subtitulo: { fontSize: 12, fontWeight: 600, color: "#5c7066", marginTop: 1 },
  cerrar: {
    width: 32, height: 32, borderRadius: 999, background: "#f0f4f1", border: "none",
    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
  },
  cuerpo: { flex: 1, overflowY: "auto", padding: "0 16px 8px" },
  aviso: {
    display: "flex", gap: 9, background: "#f9eedd", border: "1px solid #f0dfc4",
    borderRadius: 14, padding: "12px 13px", marginBottom: 14,
  },
  avisoTitulo: { fontSize: 13, fontWeight: 800, color: "#7a4400", marginBottom: 3 },
  avisoTexto: { fontSize: 12.5, fontWeight: 500, color: "#8a5a1a", lineHeight: 1.45 },
  avisoBoton: {
    marginTop: 8, background: "none", border: "none", padding: 0,
    fontSize: 12.5, fontWeight: 800, color: "#a85a00", cursor: "pointer",
  },
  seccion: {
    fontSize: 10.5, fontWeight: 800, letterSpacing: ".09em", textTransform: "uppercase",
    color: "#8a9c91", margin: "2px 0 9px",
  },
  sugerencias: { display: "flex", flexDirection: "column", gap: 8 },
  sugerencia: {
    background: "#fff", border: "1px solid #e0eae3", borderRadius: 14,
    padding: "11px 13px", textAlign: "left", cursor: "pointer", width: "100%",
  },
  sugerenciaTexto: { fontSize: 14, fontWeight: 800, color: "#142f1d" },
  sugerenciaPorque: { fontSize: 12, fontWeight: 500, color: "#8a9c91", marginTop: 2 },
  pensando: { display: "flex", flexDirection: "column", gap: 8, padding: "4px 0" },
  pensandoTexto: { fontSize: 12.5, fontWeight: 600, color: "#8a9c91", marginBottom: 4 },
  fantasma: { height: 62, borderRadius: 16, background: "#e8f0ea", opacity: 0.7 },
  reply: { fontSize: 14.5, fontWeight: 600, color: "#142f1d", lineHeight: 1.5, marginBottom: 14 },
  opciones: { display: "flex", flexDirection: "column", gap: 8 },
  opcion: {
    display: "flex", alignItems: "center", gap: 10, background: "#fff",
    border: "1.5px solid #e0eae3", borderRadius: 16, padding: "12px 13px",
    cursor: "pointer", width: "100%", transition: "border-color .15s, background .15s",
  },
  opcionActiva: { borderColor: "#2d5a3d", background: "#f4faf6" },
  opcionTitulo: { fontSize: 14.5, fontWeight: 800 },
  opcionDetalle: { fontSize: 12, fontWeight: 500, color: "#5c7066", marginTop: 2 },
  cambios: { display: "flex", flexWrap: "wrap", gap: 5, marginTop: 7 },
  cambio: {
    fontSize: 11, fontWeight: 700, color: "#2d5a3d", background: "rgba(45,90,61,.08)",
    border: "1px solid rgba(45,90,61,.16)", borderRadius: 999, padding: "3px 9px",
  },
  pendiente: {
    display: "flex", gap: 8, marginTop: 12, padding: "10px 12px",
    background: "#eef2f0", borderRadius: 12,
  },
  pendienteLinea: { fontSize: 12.5, fontWeight: 500, color: "#5c7066", lineHeight: 1.45 },
  volver: {
    marginTop: 12, background: "none", border: "none", padding: 0, display: "flex",
    alignItems: "center", gap: 5, fontSize: 13, fontWeight: 700, color: "#2d5a3d", cursor: "pointer",
  },
  pie: {
    borderTop: "1px solid #eef3f0", background: "#f5f9f6", padding: "12px 16px",
    paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
    borderRadius: "0 0 20px 20px",
  },
  inputFila: { display: "flex", gap: 8, alignItems: "center" },
  input: {
    flex: 1, minWidth: 0, background: "#fff", border: "1.5px solid #e8efe9", borderRadius: 12,
    padding: "11px 13px", fontSize: 16, color: "#1a3a24", outline: "none",
  },
  enviar: {
    width: 40, height: 40, borderRadius: 12, border: "none", background: "#2d5a3d",
    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
  },
  enviarOff: { background: "#c8d9ce", cursor: "default" },
  acciones: { display: "flex", gap: 10, marginTop: 10, alignItems: "center" },
  descartar: {
    background: "none", border: "none", padding: "12px 4px", fontSize: 13,
    fontWeight: 700, color: "#5c7066", cursor: "pointer",
  },
  aplicar: {
    flex: 1, background: "#2d5a3d", color: "#fff", border: "none", borderRadius: 12,
    padding: "12px 20px", fontSize: 14, fontWeight: 800, cursor: "pointer",
  },
};
