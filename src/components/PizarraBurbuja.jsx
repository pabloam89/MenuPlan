import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Send, Sparkles, Undo2, X } from "./icons.jsx";

/**
 * La burbuja de la pizarra: pides un cambio con una frase y se hace ya.
 *
 * ── Una capa encima, no un camino ─────────────────────────────────────────
 * La pizarra es para rellenar a mano y rápido. Esto no pregunta ni propone:
 * ejecuta, marca en el tablero lo que ha tocado y deja un "Deshacer" a mano.
 * Cerrada es un círculo en la esquina; quien no la toca no la ve crecer.
 *
 * Los cambios los hace App (`onOrden`), con el mismo camino que el `+`: aquí
 * solo hay la frase, la espera y la respuesta.
 */

const SUGERENCIAS = [
  "Algo rápido el miércoles",
  "Pescado el jueves para cenar",
  "Rellena lo que falta",
  "Vacía el finde",
];

const VERDE = "#2d5a3d";
const INK = "#142f1d";

/**
 * El reconocimiento de voz del navegador, si lo hay y se puede usar. Chrome y
 * Safari lo traen, pero `vercel.json` manda `Permissions-Policy: microphone=()`:
 * donde el navegador sabe decirlo (Chrome), el micro no se ofrece si está
 * bloqueado, en vez de enseñar un botón que no hace nada.
 */
function reconocedor() {
  if (typeof window === "undefined") return null;
  try {
    if (document.featurePolicy?.allowsFeature?.("microphone") === false) return null;
  } catch {
    // Sin featurePolicy no se sabe; se ofrece y, si falla, `onerror` lo recoge.
  }
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

/** Un destello sobre las tarjetas tocadas, para ver qué ha cambiado sin buscarlo. */
function destellar(claves) {
  if (!claves?.length || typeof document === "undefined") return;
  // Dos frames: el plan nuevo tiene que haberse pintado antes de buscar sus nodos.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    for (const k of claves) {
      for (const el of document.querySelectorAll(`[data-slot="${CSS.escape(k)}"]`)) {
        el.classList.remove("mp-burbuja-toque");
        void el.offsetWidth;
        el.classList.add("mp-burbuja-toque");
        setTimeout(() => el.classList.remove("mp-burbuja-toque"), 1100);
      }
    }
  }));
}

export function PizarraBurbuja({ onOrden, onDeshacer }) {
  const [abierta, setAbierta] = useState(false);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [respuesta, setRespuesta] = useState(null); // { reply, hechos, noHechos, error }
  const [escuchando, setEscuchando] = useState(false);
  const inputRef = useRef(null);
  const ocultar = useRef(null);
  const voz = useRef(null);
  const Reconocedor = reconocedor();

  useEffect(() => {
    if (abierta) inputRef.current?.focus();
  }, [abierta]);

  useEffect(() => () => {
    clearTimeout(ocultar.current);
    voz.current?.abort?.();
  }, []);

  const mostrar = (r) => {
    clearTimeout(ocultar.current);
    setRespuesta(r);
    ocultar.current = setTimeout(() => setRespuesta(null), r.hechos > 0 ? 7000 : 5000);
  };

  const enviar = async (frase = texto) => {
    const f = frase.trim();
    if (!f || pensando) return;
    setPensando(true);
    setRespuesta(null);
    try {
      const r = await onOrden(f);
      setTexto("");
      if (r.hechos > 0) {
        // Hecho: la barra se recoge y el tablero queda a la vista.
        setAbierta(false);
        destellar(r.tocados);
      }
      mostrar(r);
    } catch {
      mostrar({ reply: "No he podido hablar con el servidor. Inténtalo otra vez.", hechos: 0, error: true });
    } finally {
      setPensando(false);
    }
  };

  const dictar = () => {
    if (!Reconocedor || escuchando) return;
    const rec = new Reconocedor();
    rec.lang = "es-ES";
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let final = "";
    rec.onresult = (e) => {
      const t = Array.from(e.results).map((r) => r[0].transcript).join("");
      setTexto(t);
      if (e.results[e.results.length - 1].isFinal) final = t;
    };
    rec.onend = () => {
      setEscuchando(false);
      if (final.trim()) enviar(final);
    };
    rec.onerror = () => setEscuchando(false);
    voz.current = rec;
    setEscuchando(true);
    rec.start();
  };

  const deshacer = () => {
    onDeshacer?.();
    clearTimeout(ocultar.current);
    setRespuesta({ reply: "Deshecho.", hechos: 0 });
    ocultar.current = setTimeout(() => setRespuesta(null), 1800);
  };

  // Anclada a la columna de la app (420 de ancho máximo), por encima de la barra de abajo.
  const borde = "max(16px, calc(50% - 210px + 16px))";
  const abajo = "calc(92px + env(safe-area-inset-bottom, 0px))";

  return (
    <>
      <style>{`
        @keyframes mpBurbujaIn { from { opacity: 0; transform: translateY(10px) scale(.97); } to { opacity: 1; transform: none; } }
        @keyframes mpBurbujaBarra { from { opacity: 0; transform: scaleX(.2); } to { opacity: 1; transform: none; } }
        @keyframes mpBurbujaGira { to { transform: rotate(360deg); } }
        @keyframes mpBurbujaLatido { 0%, 100% { box-shadow: 0 10px 24px -8px rgba(45,90,61,.6), 0 0 0 0 rgba(63,150,86,.35); } 50% { box-shadow: 0 10px 24px -8px rgba(45,90,61,.6), 0 0 0 8px rgba(63,150,86,0); } }
        @keyframes mpBurbujaToque { 0% { box-shadow: 0 0 0 0 rgba(201,138,30,.0); } 30% { box-shadow: 0 0 0 4px rgba(201,138,30,.85); } 100% { box-shadow: 0 0 0 0 rgba(201,138,30,0); } }
        .mp-burbuja-in { animation: mpBurbujaIn .26s cubic-bezier(.22,1,.36,1) both; }
        .mp-burbuja-barra { transform-origin: right center; animation: mpBurbujaBarra .28s cubic-bezier(.22,1,.36,1) both; }
        .mp-burbuja-gira { animation: mpBurbujaGira .8s linear infinite; }
        .mp-burbuja-latido { animation: mpBurbujaLatido 2.4s ease-in-out infinite; }
        .mp-burbuja-toque { animation: mpBurbujaToque 1s ease-out both; }
        .mp-burbuja-input::placeholder { color: #9aa8a0; font-weight: 600; }
        @media (prefers-reduced-motion: reduce) {
          .mp-burbuja-in, .mp-burbuja-barra, .mp-burbuja-gira, .mp-burbuja-latido, .mp-burbuja-toque { animation: none; }
        }
      `}</style>

      {respuesta && (
        <div
          className="mp-burbuja-in"
          role="status"
          style={{
            position: "fixed", zIndex: 150, right: borde, left: borde,
            bottom: `calc(${abajo} + ${abierta ? 118 : 68}px)`,
            display: "flex", justifyContent: "flex-end", pointerEvents: "none",
          }}
        >
          <div
            style={{
              pointerEvents: "auto", maxWidth: 320,
              background: INK, color: "#fff", borderRadius: 18, borderBottomRightRadius: 6,
              padding: "11px 12px 11px 14px", boxShadow: "0 12px 28px -12px rgba(20,47,29,.7)",
              display: "flex", alignItems: "center", gap: 10,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.35 }}>
              {respuesta.reply}
              {respuesta.noHechos?.length > 0 && (
                <span style={{ display: "block", marginTop: 3, fontSize: 11.5, fontWeight: 600, color: "rgba(255,255,255,.7)" }}>
                  {respuesta.noHechos[0]}
                </span>
              )}
            </span>
            {respuesta.hechos > 0 && onDeshacer && (
              <button
                type="button"
                onClick={deshacer}
                className="mp-press"
                style={{
                  flexShrink: 0, height: 30, padding: "0 10px", borderRadius: 999,
                  background: "rgba(255,255,255,.14)", border: "none", color: "#fff", cursor: "pointer",
                  fontSize: 12, fontWeight: 800, fontFamily: "inherit",
                  display: "inline-flex", alignItems: "center", gap: 5,
                }}
              >
                <Undo2 size={13} strokeWidth={2.6} />
                Deshacer
              </button>
            )}
          </div>
        </div>
      )}

      {abierta ? (
        <div style={{ position: "fixed", zIndex: 151, left: borde, right: borde, bottom: abajo }}>
          {!pensando && !texto && (
            <div className="mp-burbuja-in" style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, scrollbarWidth: "none" }}>
              {SUGERENCIAS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="mp-press"
                  onClick={() => enviar(s)}
                  style={{
                    flexShrink: 0, height: 32, padding: "0 12px", borderRadius: 999,
                    background: "#fff", border: "1px solid #dce7e0", color: VERDE, cursor: "pointer",
                    fontSize: 12.5, fontWeight: 800, fontFamily: "inherit", whiteSpace: "nowrap",
                    boxShadow: "0 4px 12px -8px rgba(20,47,29,.4)",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <form
            className="mp-burbuja-barra"
            onSubmit={(e) => { e.preventDefault(); enviar(); }}
            style={{
              display: "flex", alignItems: "center", gap: 6, height: 56, padding: "0 6px 0 16px",
              background: "#fff", borderRadius: 999, border: "1.5px solid #cfe0d6",
              boxShadow: "0 14px 32px -14px rgba(20,47,29,.55)",
            }}
          >
            {pensando
              ? <Loader2 size={18} color="#c98a1e" className="mp-burbuja-gira" />
              : <Sparkles size={18} color="#c98a1e" strokeWidth={2.4} />}
            <input
              ref={inputRef}
              className="mp-burbuja-input"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") setAbierta(false); }}
              disabled={pensando}
              placeholder={escuchando ? "Te escucho…" : "¿Qué cambio?"}
              aria-label="Pide un cambio en la pizarra"
              enterKeyHint="send"
              style={{
                flex: 1, minWidth: 0, height: 40, border: "none", outline: "none", background: "transparent",
                fontSize: 16, fontWeight: 700, color: INK, fontFamily: "inherit",
              }}
            />
            {texto.trim() || !Reconocedor ? (
              <button
                type="submit"
                disabled={pensando || !texto.trim()}
                aria-label="Enviar"
                className="mp-press"
                style={{
                  width: 44, height: 44, borderRadius: 999, border: "none", cursor: "pointer", flexShrink: 0,
                  background: texto.trim() ? "linear-gradient(135deg, #2d5a3d, #3f9656)" : "#e7efe9",
                  color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "background .15s ease",
                }}
              >
                <Send size={17} strokeWidth={2.4} />
              </button>
            ) : (
              <button
                type="button"
                onClick={dictar}
                aria-label="Dictar"
                className="mp-press"
                style={{
                  width: 44, height: 44, borderRadius: 999, border: "none", cursor: "pointer", flexShrink: 0,
                  background: escuchando ? "#c0392b" : "#eaf3ed", color: escuchando ? "#fff" : VERDE,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <Mic size={18} strokeWidth={2.4} />
              </button>
            )}
            <button
              type="button"
              onClick={() => { setAbierta(false); setTexto(""); voz.current?.abort?.(); }}
              aria-label="Cerrar"
              className="mp-press"
              style={{
                width: 34, height: 34, borderRadius: 999, border: "none", cursor: "pointer", flexShrink: 0,
                background: "transparent", color: "#9ab0a1",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <X size={16} strokeWidth={2.6} />
            </button>
          </form>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAbierta(true)}
          aria-label="Pedir un cambio"
          className="mp-press mp-burbuja-latido mp-burbuja-in"
          style={{
            position: "fixed", zIndex: 151, right: borde, bottom: abajo,
            width: 56, height: 56, borderRadius: 999, border: "none", cursor: "pointer",
            background: "linear-gradient(135deg, #2d5a3d, #3f9656)", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {pensando
            ? <Loader2 size={22} className="mp-burbuja-gira" />
            : <Sparkles size={22} strokeWidth={2.3} />}
        </button>
      )}
    </>
  );
}
