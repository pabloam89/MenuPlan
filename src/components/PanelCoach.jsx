/**
 * El panel del menú: una burbuja que se despliega en tarjeta.
 *
 * Spotlight que apaga la pantalla y deja la burbuja encendida, como los coach
 * marks (HomeCoachTour). Encima, una tarjeta con:
 *
 *   · cuatro ideas en rejilla 2×2, cada una con su ilustración 3D y su color
 *   · las respuestas como frases apiladas con divisoria y casilla
 *
 * Las casillas permiten marcar VARIAS cuando el modelo ha entendido varias
 * cosas ("menos pescado y más mexicana"), que era el agujero que dejaba la
 * versión de tarjetas-alternativa: obligaba a elegir entre cambios que no se
 * excluyen. Cuando sí son alternativas (2, 3 o 4 veces por semana), marcar una
 * desmarca las demás — lo dice `modo` en la respuesta.
 *
 * Deliberadamente tonto: no llama a nadie ni guarda nada. Recibe `onConsultar`
 * y `onAplicar` de fuera, así que se recorre entero sin gastar API.
 */

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { X, ArrowUp, Check } from "lucide-react";
import { resumirAjuste } from "../lib/panelParser.js";

const ANCHO_MAX = 366;
const HUECO = 14;

export function PanelCoach({ sugerencias = [], notepad, onConsultar, onAplicar, primeraVez = false }) {
  const [abierto, setAbierto] = useState(false);
  const [paso, setPaso] = useState(primeraVez ? "intro" : "ideas");
  const [texto, setTexto] = useState("");
  const [respuesta, setRespuesta] = useState(null);
  const [marcadas, setMarcadas] = useState([]);
  const [rect, setRect] = useState(null);
  const fabRef = useRef(null);

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
    setAbierto(false); setTexto(""); setRespuesta(null); setMarcadas([]);
    setPaso(primeraVez ? "intro" : "ideas");
  };

  const preguntar = async (frase) => {
    const q = (frase ?? texto).trim();
    if (!q) return;
    setTexto(q); setPaso("pensando");
    const r = await onConsultar?.(q);
    setRespuesta(r ?? null);
    // La primera viene marcada: en el caso normal —una sola propuesta— el
    // usuario solo tiene que pulsar Aplicar, sin un paso de selección de más.
    setMarcadas(r?.opciones?.length ? [0] : []);
    setPaso("respuesta");
  };

  const alternar = (i) => {
    const unaSola = respuesta?.modo !== "varias";
    setMarcadas((prev) =>
      unaSola ? [i] : prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]);
  };

  const aplicar = () => {
    const elegidas = marcadas.map((i) => respuesta.opciones[i]).filter(Boolean);
    if (!elegidas.length) return;
    onAplicar?.({ ajustes: elegidas.flatMap((o) => o.ajustes), etiqueta: elegidas.map((o) => o.etiqueta).join(" · ") }, texto);
    setPaso("hecho");
    setTimeout(cerrar, 1500);
  };

  const vw = typeof window !== "undefined" ? window.innerWidth : 375;
  const ancho = Math.min(ANCHO_MAX, vw - 24);
  const left = rect ? Math.max(12, Math.min(rect.left + rect.width / 2 - ancho / 2, vw - ancho - 12)) : 12;
  const flechaX = rect ? Math.max(20, Math.min(rect.left + rect.width / 2 - left, ancho - 20)) : ancho / 2;
  const bottom = rect ? window.innerHeight - rect.top + HUECO : 100;

  return (
    <>
      <style>{ANIM}</style>
      <button ref={fabRef} type="button" onClick={() => (abierto ? cerrar() : setAbierto(true))}
        style={{ ...S.fab, zIndex: abierto ? 310 : 150 }} aria-label="Ajustar el menú">
        <span style={S.fabHalo} />
        {/* Nuestro logo, no un glifo de lucide ni una foto recortada. El SVG
            trae sus propios colores y escala sin ensuciarse los bordes, que es
            lo que estropeaba el recorte del gorro. */}
        <img src="/logo-homenu.svg" alt="" style={S.fabArte} />
      </button>

      {abierto && (
        <div style={S.capa}>
          {rect && (
            <div style={{
              position: "fixed", top: rect.top - 6, left: rect.left - 6,
              // Redondo del todo: el boton pasó a ser circular y un spotlight
              // cuadrado dejaba cuatro esquinas oscuras alrededor.
              width: rect.width + 12, height: rect.height + 12, borderRadius: 999,
              boxShadow: "0 0 0 9999px rgba(11,28,18,.7)",
              border: "2px solid rgba(255,255,255,.85)", pointerEvents: "none",
            }} />
          )}
          <div style={{ position: "fixed", inset: 0 }} onClick={cerrar} />

          <div onClick={(e) => e.stopPropagation()} style={{ ...S.tarjeta, left, width: ancho, bottom }}>
            <div style={{ ...S.flecha, left: flechaX - 9 }} />
            <button type="button" onClick={cerrar} style={S.cerrar} aria-label="Cerrar">
              <X size={14} color="#5a7a66" />
            </button>

            {paso === "intro" && (
              <>
                <div style={S.titulo}>Puedo ajustarte el menú</div>
                <p style={S.parrafo}>
                  Dime lo que echas de menos. Cambio cuánto hay de cada cosa,
                  cocinas, estilos y lo que no queréis ver.
                </p>
                <p style={{ ...S.parrafo, color: "#8a9c91" }}>
                  Días concretos, personas con nombre o alergias, todavía no.
                </p>
                <button type="button" onClick={() => setPaso("ideas")} className="mp-press" style={S.cta}>
                  Vale, vamos
                </button>
              </>
            )}

            {paso === "ideas" && (
              <>
                <div style={S.titulo}>¿Qué necesitas?</div>
                <div style={S.rejilla}>
                  {sugerencias.slice(0, 4).map((s, i) => (
                    <button key={s.id} type="button" className="mp-press"
                      onClick={() => preguntar(s.frase)}
                      style={{
                        ...S.card,
                        animation: `panelCard .38s cubic-bezier(.34,1.4,.5,1) both ${i * 55}ms`,
                      }}>
                      {/* La ilustracion manda: va CENTRADA, entera y con su
                          propio hueco. Antes iba absoluta en una esquina con
                          overflow:hidden y el borde la cortaba por la mitad —
                          parecia rota, no diseñada. Y la tarjeta es BLANCA: el
                          fondo de color competia con los colores del render. */}
                      <span style={{ ...S.cardArteCaja, background: s.tono.suave }}>
                        <img src={s.arte} alt="" style={S.cardArte} loading="lazy" />
                      </span>
                      {/* El texto va SIEMPRE del mismo color. Antes lo pintaba
                          el tono de cada tarjeta y la rejilla parecia cuatro
                          componentes distintos; el color lo lleva el circulo,
                          que ya es suficiente. */}
                      <span style={S.cardTexto}>{s.texto}</span>
                    </button>
                  ))}
                </div>
                <Entrada texto={texto} setTexto={setTexto} onEnviar={() => preguntar()} />
              </>
            )}

            {paso === "pensando" && (
              <div style={S.pensando}>
                <span style={S.pulso} /><span style={{ ...S.pulso, animationDelay: ".15s" }} />
                <span style={{ ...S.pulso, animationDelay: ".3s" }} />
                <span style={S.pensandoTexto}>Mirando tu menú…</span>
              </div>
            )}

            {paso === "respuesta" && respuesta && (
              <div style={{ animation: "panelPop .3s ease both" }}>
                <div style={S.reply}>{respuesta.reply}</div>

                {respuesta.opciones.length > 0 && (
                  <div style={S.lista}>
                    {respuesta.opciones.map((o, i) => {
                      const on = marcadas.includes(i);
                      return (
                        <button key={i} type="button" onClick={() => alternar(i)}
                          style={{ ...S.fila, borderTop: i ? "1px solid #eef3f0" : "none" }}>
                          <span style={{ ...S.casilla, ...(on ? S.casillaOn : null) }}>
                            {on && <Check size={13} color="#fff" strokeWidth={3.2} />}
                          </span>
                          <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                            <span style={{ ...S.filaTitulo, color: on ? "#142f1d" : "#4a6355" }}>{o.etiqueta}</span>
                            <span style={S.filaCambio}>
                              {o.ajustes.map((a) => resumirAjuste(notepad, a)).filter(Boolean).join(" · ")}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {respuesta.pendiente?.length > 0 && (
                  <div style={S.pendiente}>{respuesta.pendiente.join(" ")}</div>
                )}

                {respuesta.opciones.length > 0 ? (
                  <button type="button" onClick={aplicar} disabled={!marcadas.length} className="mp-press"
                    style={{ ...S.cta, ...S.ctaAncho, ...(marcadas.length ? null : S.ctaOff) }}>
                    {marcadas.length > 1 ? `Aplicar los ${marcadas.length} cambios` : "Aplicar"}
                  </button>
                ) : (
                  <Entrada texto={texto} setTexto={setTexto} onEnviar={() => preguntar()} />
                )}
              </div>
            )}

            {paso === "hecho" && (
              <div style={S.hecho}>
                <span style={S.hechoCirculo}><Check size={20} color="#fff" strokeWidth={3.2} /></span>
                <span style={S.hechoTexto}>Menú actualizado</span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Entrada({ texto, setTexto, onEnviar }) {
  return (
    <div style={S.entrada}>
      <input className="mp-panel-input" value={texto} onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onEnviar(); }}
        placeholder="o escríbeme" style={S.input} />
      <button type="button" onClick={onEnviar} disabled={!texto.trim()}
        style={{ ...S.enviar, ...(texto.trim() ? null : S.enviarOff) }} aria-label="Enviar">
        <ArrowUp size={15} color="#fff" />
      </button>
    </div>
  );
}

const ANIM = `
@keyframes panelPop { 0% { opacity:0; transform:translateY(10px) scale(.96) } 60% { transform:translateY(-2px) scale(1.01) } 100% { opacity:1; transform:none } }
@keyframes panelCard { 0% { opacity:0; transform:translateY(14px) scale(.92) } 100% { opacity:1; transform:none } }
@keyframes panelPulso { 0%,100% { opacity:.25; transform:scale(.8) } 50% { opacity:1; transform:scale(1) } }
@keyframes panelHalo { 0%,100% { opacity:.5; transform:scale(1) } 50% { opacity:0; transform:scale(1.5) } }
@keyframes panelHecho { 0% { transform:scale(.4); opacity:0 } 60% { transform:scale(1.12) } 100% { transform:scale(1); opacity:1 } }
@media (prefers-reduced-motion: reduce) { [style*="panelCard"], [style*="panelPop"] { animation: none !important } }
`;

const S = {
  fab: {
    position: "fixed", right: 18, bottom: "calc(96px + env(safe-area-inset-bottom, 0px))",
    width: 58, height: 58, borderRadius: 999, border: "2px solid #fff",
    background: "#fff", padding: 0, overflow: "hidden",
    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
    boxShadow: "0 6px 22px rgba(20,47,29,.28)",
  },
  fabArte: { width: "70%", height: "70%", objectFit: "contain", display: "block" },
  fabHalo: {
    position: "absolute", inset: -3, borderRadius: 999,
    border: "2.5px solid rgba(76,186,110,.75)", animation: "panelHalo 2.6s ease-in-out infinite",
    pointerEvents: "none",
  },
  capa: { position: "fixed", inset: 0, zIndex: 300 },
  tarjeta: {
    position: "fixed", background: "#f2f7f4", borderRadius: 24, padding: "18px 16px 16px",
    boxShadow: "0 20px 56px rgba(20,47,29,.4)",
    animation: "panelPop .36s cubic-bezier(.34,1.56,.5,1) both",
  },
  flecha: {
    position: "absolute", bottom: -9, width: 18, height: 18, background: "#f2f7f4",
    transform: "rotate(45deg)", borderRadius: 3,
  },
  cerrar: {
    position: "absolute", top: 13, right: 13, width: 24, height: 24, borderRadius: 999,
    border: "none", background: "#e2ebe5", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2,
  },
  titulo: { fontSize: 19, fontWeight: 900, color: "#142f1d", letterSpacing: "-.35px", marginBottom: 12, paddingRight: 28 },
  parrafo: { margin: "0 0 9px", fontSize: 12.5, color: "#5a7a66", lineHeight: 1.5 },
  cta: {
    background: "linear-gradient(135deg, #2d5a3d, #4cba6e)", color: "#fff", border: "none",
    borderRadius: 12, padding: "10px 20px", fontSize: 13.5, fontWeight: 800, cursor: "pointer",
    boxShadow: "0 4px 16px rgba(76,186,110,.32)",
  },
  ctaAncho: { width: "100%", marginTop: 12, padding: "12px 20px", fontSize: 14 },
  ctaOff: { background: "#c8d9ce", boxShadow: "none", cursor: "default" },

  rejilla: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 13 },
  card: {
    position: "relative", display: "flex", flexDirection: "column", alignItems: "center",
    gap: 0, background: "#fff", border: "1px solid #e4ece7", borderRadius: 18,
    padding: "14px 8px 14px", cursor: "pointer", textAlign: "center",
    boxShadow: "0 2px 8px rgba(20,47,29,.09)", overflow: "hidden",
  },
  // Sin subcopy, la ilustracion se queda con el sitio que ocupaba: es lo que
  // hace que la tarjeta se lea de un vistazo.
  cardArteCaja: {
    width: 76, height: 76, borderRadius: 999, display: "flex",
    alignItems: "center", justifyContent: "center", marginBottom: 10,
  },
  cardArte: {
    width: 62, height: 62, objectFit: "contain", pointerEvents: "none",
    filter: "drop-shadow(0 3px 8px rgba(20,47,29,.22))",
  },
  // Mismo tamaño en las cuatro, pase lo que pase con el texto: dos alturas
  // distintas en una rejilla de 2x2 se ven como un fallo de maquetacion.
  cardTexto: { fontSize: 14, fontWeight: 800, lineHeight: 1.25, letterSpacing: "-.2px", color: "#142f1d" },

  entrada: { display: "flex", gap: 7, alignItems: "center" },
  // 16px es OBLIGATORIO: por debajo, iOS Safari hace zoom al enfocar el campo
  // (DESIGN_SYSTEM §11). Asi que lo que se reduce es todo lo demas — caja mas
  // baja, texto normal en vez de grueso y placeholder mas apagado.
  input: {
    flex: 1, minWidth: 0, border: "1.5px solid #dde8e1",
    borderRadius: 11, padding: "8px 11px", fontSize: 16, fontWeight: 400,
    color: "#1a3a24", outline: "none", background: "#fff",
  },
  enviar: {
    width: 34, height: 34, borderRadius: 11, border: "none",
    background: "linear-gradient(135deg, #2d5a3d, #4cba6e)",
    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
  },
  enviarOff: { background: "#c8d9ce", cursor: "default" },

  pensando: { display: "flex", alignItems: "center", gap: 5, padding: "10px 0 8px" },
  pulso: { width: 7, height: 7, borderRadius: 999, background: "#4cba6e", animation: "panelPulso 1.1s ease-in-out infinite" },
  pensandoTexto: { fontSize: 12.5, fontWeight: 600, color: "#8a9c91", marginLeft: 5 },

  reply: { fontSize: 13.5, fontWeight: 600, color: "#142f1d", lineHeight: 1.5, marginBottom: 12, paddingRight: 28 },
  lista: { background: "#fff", border: "1px solid #e0eae3", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 8px rgba(20,47,29,.07)" },
  fila: {
    display: "flex", alignItems: "center", gap: 10, width: "100%",
    background: "none", border: "none", padding: "11px 12px", cursor: "pointer",
  },
  casilla: {
    width: 21, height: 21, borderRadius: 7, border: "1.5px solid #cdd8d0", background: "#fff",
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    transition: "background .16s, border-color .16s, transform .16s",
  },
  casillaOn: { background: "#2d5a3d", borderColor: "#2d5a3d", transform: "scale(1.06)" },
  filaTitulo: { display: "block", fontSize: 13.5, fontWeight: 800, lineHeight: 1.25 },
  filaCambio: { display: "block", fontSize: 11.5, fontWeight: 600, color: "#2d5a3d", marginTop: 1 },
  pendiente: { fontSize: 12, color: "#5a7a66", lineHeight: 1.45, marginTop: 11, padding: "9px 11px", background: "#e6eeea", borderRadius: 10 },

  hecho: { display: "flex", flexDirection: "column", alignItems: "center", gap: 9, padding: "14px 0 10px" },
  hechoCirculo: {
    width: 44, height: 44, borderRadius: 999, background: "linear-gradient(135deg, #2d5a3d, #4cba6e)",
    display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: "0 6px 18px rgba(76,186,110,.4)", animation: "panelHecho .42s cubic-bezier(.34,1.56,.5,1) both",
  },
  hechoTexto: { fontSize: 14, fontWeight: 800, color: "#2f7d4a" },
};
