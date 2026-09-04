/**
 * El panel del menú: una burbuja que se despliega en tarjeta.
 *
 * Mismo lenguaje visual que los coach marks (HomeCoachTour): spotlight que
 * apaga la pantalla, la burbuja se queda encendida, y una tarjeta pequeña sale
 * encima con su flecha apuntándola.
 *
 * La tarjeta es PEQUEÑA y no crece: dos o tres filas y fuera. Esto no es un
 * formulario ni un chat — es un globo que te pregunta qué necesitas, te da
 * ideas, y al pulsar o cambia el menú o te hace UNA pregunta con opciones.
 *
 * Deliberadamente tonto: no llama a nadie ni guarda nada. Recibe `onConsultar`
 * y `onAplicar` de fuera, así que se puede recorrer entero sin gastar API.
 */

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { Sparkles, X, ArrowUp } from "lucide-react";
import { resumirAjuste } from "../lib/panelParser.js";

const ANCHO_MAX = 320;
const HUECO = 14;

export function PanelCoach({
  sugerencias = [],
  notepad,
  onConsultar,
  onAplicar,
  primeraVez = false,
}) {
  const [abierto, setAbierto] = useState(false);
  const [paso, setPaso] = useState(primeraVez ? "intro" : "ideas");
  const [texto, setTexto] = useState("");
  const [respuesta, setRespuesta] = useState(null);
  const [rect, setRect] = useState(null);
  const fabRef = useRef(null);
  const inputRef = useRef(null);

  const medir = useCallback(() => {
    const r = fabRef.current?.getBoundingClientRect();
    if (r) setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, []);

  useLayoutEffect(() => { if (abierto) medir(); }, [abierto, paso, medir]);
  useEffect(() => {
    if (!abierto) return;
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [abierto, medir]);

  const cerrar = () => {
    setAbierto(false);
    setTexto("");
    setRespuesta(null);
    setPaso(primeraVez ? "intro" : "ideas");
  };

  const preguntar = async (frase) => {
    const q = (frase ?? texto).trim();
    if (!q) return;
    setTexto(q);
    setPaso("pensando");
    const r = await onConsultar?.(q);
    setRespuesta(r ?? null);
    setPaso("respuesta");
  };

  const aplicar = (opcion) => {
    onAplicar?.(opcion, texto);
    setPaso("hecho");
    setTimeout(cerrar, 1400);
  };

  const vw = typeof window !== "undefined" ? window.innerWidth : 375;
  const ancho = Math.min(ANCHO_MAX, vw - 24);
  const left = rect ? Math.max(12, Math.min(rect.left + rect.width / 2 - ancho / 2, vw - ancho - 12)) : 12;
  const flechaX = rect ? Math.max(18, Math.min(rect.left + rect.width / 2 - left, ancho - 18)) : ancho / 2;
  const bottom = rect ? window.innerHeight - rect.top + HUECO : 100;

  return (
    <>
      <button
        ref={fabRef}
        type="button"
        onClick={() => (abierto ? cerrar() : setAbierto(true))}
        style={{ ...S.fab, zIndex: abierto ? 310 : 150 }}
        aria-label="Ajustar el menú"
      >
        <Sparkles size={21} color="#fff" />
      </button>

      {abierto && (
        <div style={S.capa}>
          <style>{ANIM}</style>

          {/* El spotlight: una caja transparente cuya sombra gigante apaga todo
              lo de alrededor y deja la burbuja encendida. */}
          {rect && (
            <div style={{
              position: "fixed", top: rect.top - 6, left: rect.left - 6,
              width: rect.width + 12, height: rect.height + 12, borderRadius: 20,
              boxShadow: "0 0 0 9999px rgba(11,28,18,.66)",
              border: "2px solid rgba(255,255,255,.85)", pointerEvents: "none",
            }} />
          )}
          <div style={{ position: "fixed", inset: 0 }} onClick={cerrar} />

          <div
            onClick={(e) => e.stopPropagation()}
            style={{ ...S.tarjeta, left, width: ancho, bottom }}
          >
            <div style={{ ...S.flecha, left: flechaX - 9 }} />

            <button type="button" onClick={cerrar} style={S.cerrar} aria-label="Cerrar">
              <X size={14} color="#5a7a66" />
            </button>

            {paso === "intro" && (
              <Cuerpo
                titulo="Puedo ajustarte el menú"
                texto="Dime lo que echas de menos. Cambio cuánto hay de cada cosa, cocinas, estilos y lo que no queréis ver. Lo de días concretos o personas con nombre, todavía no."
                cta="Vale"
                onCta={() => setPaso("ideas")}
              />
            )}

            {paso === "ideas" && (
              <>
                <div style={S.titulo}>¿Qué necesitas?</div>
                <div style={S.ideas}>
                  {sugerencias.slice(0, 3).map((s) => (
                    <button key={s.id} type="button" className="mp-press" style={S.idea}
                      onClick={() => preguntar(s.frase)}>
                      <span style={S.ideaTexto}>{s.texto}</span>
                      <span style={S.ideaPorque}>{s.porque}</span>
                    </button>
                  ))}
                </div>
                <Entrada
                  inputRef={inputRef} texto={texto} setTexto={setTexto} onEnviar={() => preguntar()}
                />
              </>
            )}

            {paso === "pensando" && (
              <div style={S.pensando}>
                <span style={S.pulso} />
                Mirando tu menú…
              </div>
            )}

            {paso === "respuesta" && respuesta && (
              <div className="mp-pop">
                <div style={S.reply}>{respuesta.reply}</div>

                {respuesta.opciones.length > 0 && (
                  <div style={S.opciones}>
                    {respuesta.opciones.map((o, i) => (
                      <button key={i} type="button" className="mp-press" style={S.opcion}
                        onClick={() => aplicar(o)}>
                        <span style={S.opcionTitulo}>{o.etiqueta}</span>
                        <span style={S.opcionCambio}>
                          {o.ajustes.map((a) => resumirAjuste(notepad, a)).filter(Boolean).join(" · ")}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {respuesta.pendiente?.length > 0 && (
                  <div style={S.pendiente}>{respuesta.pendiente.join(" ")}</div>
                )}

                {respuesta.kind !== "propuestas" && (
                  <Entrada
                    inputRef={inputRef} texto={texto} setTexto={setTexto} onEnviar={() => preguntar()}
                  />
                )}
              </div>
            )}

            {paso === "hecho" && (
              <div style={S.hecho}>Hecho ✓</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Cuerpo({ titulo, texto, cta, onCta }) {
  return (
    <>
      <div style={S.titulo}>{titulo}</div>
      <p style={S.parrafo}>{texto}</p>
      <button type="button" onClick={onCta} className="mp-press" style={S.cta}>{cta}</button>
    </>
  );
}

function Entrada({ inputRef, texto, setTexto, onEnviar }) {
  return (
    <div style={S.entrada}>
      <input
        ref={inputRef}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onEnviar(); }}
        placeholder="o dímelo tú…"
        style={S.input}
      />
      <button type="button" onClick={onEnviar} disabled={!texto.trim()}
        style={{ ...S.enviar, ...(texto.trim() ? null : S.enviarOff) }} aria-label="Enviar">
        <ArrowUp size={15} color="#fff" />
      </button>
    </div>
  );
}

const ANIM = `
@keyframes panelPop {
  0%   { opacity: 0; transform: translateY(10px) scale(.96); }
  60%  { transform: translateY(-2px) scale(1.01); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes panelPulso { 0%,100% { opacity:.35 } 50% { opacity:1 } }
`;

const S = {
  fab: {
    position: "fixed", right: 18, bottom: "calc(96px + env(safe-area-inset-bottom, 0px))",
    width: 48, height: 48, borderRadius: 16, border: "none", background: "#2d5a3d",
    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
    boxShadow: "0 4px 16px rgba(20,47,29,.3)",
  },
  capa: { position: "fixed", inset: 0, zIndex: 300 },
  tarjeta: {
    position: "fixed", background: "#fff", borderRadius: 20, padding: "16px 15px 14px",
    boxShadow: "0 18px 50px rgba(20,47,29,.34)",
    animation: "panelPop .34s cubic-bezier(.34,1.56,.5,1) both",
  },
  flecha: {
    position: "absolute", bottom: -9, width: 18, height: 18, background: "#fff",
    transform: "rotate(45deg)", borderRadius: 3, boxShadow: "2px 2px 4px rgba(20,47,29,.06)",
  },
  cerrar: {
    position: "absolute", top: 12, right: 12, width: 24, height: 24, borderRadius: 999,
    border: "none", background: "#f0f4f1", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  titulo: { fontSize: 16, fontWeight: 900, color: "#142f1d", letterSpacing: "-.3px", marginBottom: 10, paddingRight: 26 },
  parrafo: { margin: "0 0 12px", fontSize: 12.5, color: "#5a7a66", lineHeight: 1.45 },
  cta: {
    background: "#2d5a3d", color: "#fff", border: "none", borderRadius: 11,
    padding: "9px 18px", fontSize: 13.5, fontWeight: 800, cursor: "pointer",
  },
  ideas: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 },
  idea: {
    display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1,
    background: "#f4f8f5", border: "1px solid #e3ede7", borderRadius: 12,
    padding: "9px 11px", cursor: "pointer", width: "100%", textAlign: "left",
  },
  ideaTexto: { fontSize: 13.5, fontWeight: 800, color: "#142f1d" },
  ideaPorque: { fontSize: 11.5, fontWeight: 500, color: "#8a9c91" },
  entrada: { display: "flex", gap: 7, alignItems: "center" },
  input: {
    flex: 1, minWidth: 0, background: "#f7faf8", border: "1.5px solid #e8efe9",
    borderRadius: 11, padding: "9px 11px", fontSize: 16, color: "#1a3a24", outline: "none",
  },
  enviar: {
    width: 34, height: 34, borderRadius: 11, border: "none", background: "#2d5a3d",
    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
  },
  enviarOff: { background: "#c8d9ce", cursor: "default" },
  pensando: {
    display: "flex", alignItems: "center", gap: 8, fontSize: 13,
    fontWeight: 600, color: "#8a9c91", padding: "6px 0 4px",
  },
  pulso: {
    width: 8, height: 8, borderRadius: 999, background: "#4cba6e",
    animation: "panelPulso 1s ease-in-out infinite",
  },
  reply: { fontSize: 13.5, fontWeight: 600, color: "#142f1d", lineHeight: 1.45, marginBottom: 11, paddingRight: 26 },
  opciones: { display: "flex", flexDirection: "column", gap: 6 },
  opcion: {
    display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1,
    background: "#fff", border: "1.5px solid #dae7de", borderRadius: 12,
    padding: "9px 11px", cursor: "pointer", width: "100%", textAlign: "left",
  },
  opcionTitulo: { fontSize: 13.5, fontWeight: 800, color: "#142f1d" },
  opcionCambio: { fontSize: 11.5, fontWeight: 600, color: "#2d5a3d" },
  pendiente: { fontSize: 11.5, color: "#8a9c91", lineHeight: 1.4, marginTop: 10 },
  hecho: { fontSize: 14.5, fontWeight: 800, color: "#2f7d4a", padding: "6px 0 4px" },
};
