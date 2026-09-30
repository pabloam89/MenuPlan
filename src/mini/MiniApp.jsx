import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dishImageUrl } from "../assets/dishes/dishImages.js";
import { deckImg } from "../lib/dishPhotoOptimize.js";

// La Mini App de Telegram (`/?mini=semana` o `/?mini=compra`): lo que en el
// chat es un muro de texto —la semana, la lista de la compra— aquí se ve de un
// vistazo y la compra se tacha con el dedo. Solo mira y tacha: cambiar cosas
// sigue siendo hablar con Lola. Sin sesión de la app: la llave es el
// `initData` firmado por Telegram (ver api/_bot/miniapp.js).

const VERDE = "#2d5a3d";
const TINTA = "#14301d";
const SUAVE = "#5f7468";
const FONDO = "#f5f9f6";
const LINEA = "#e0eae3";

const EMOJI = { Desayuno: "☕", Comida: "🍽️", Merienda: "🍎", Cena: "🌙", Postre: "🍮" };
const HOY = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][new Date().getDay()];

// Una sola carga aunque el efecto corra dos veces (StrictMode en desarrollo).
let scriptTelegram = null;
function cargarScriptTelegram() {
  scriptTelegram ??= new Promise((resolve) => {
    if (window.Telegram?.WebApp) return resolve(window.Telegram.WebApp);
    const s = document.createElement("script");
    s.src = "https://telegram.org/js/telegram-web-app.js";
    s.onload = () => resolve(window.Telegram?.WebApp ?? null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return scriptTelegram;
}

async function llamar(initData, cuerpo = {}) {
  const res = await fetch("/api/bot/miniapp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData, ...cuerpo }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "No se ha podido cargar. Prueba otra vez en un momento.");
  return json;
}

export default function MiniApp({ pestanaInicial = "semana" }) {
  const [tg, setTg] = useState(null);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [pestana, setPestana] = useState(pestanaInicial === "compra" ? "compra" : "semana");

  useEffect(() => {
    let vivo = true;
    (async () => {
      const webApp = await cargarScriptTelegram();
      if (!vivo) return;
      if (!webApp?.initData) {
        setError("Esto se abre desde el chat con Lola, en Telegram.");
        return;
      }
      webApp.ready();
      webApp.expand();
      try { webApp.setHeaderColor(FONDO); webApp.setBackgroundColor(FONDO); } catch { /* versiones viejas */ }
      setTg(webApp);
      try {
        setDatos(await llamar(webApp.initData));
      } catch (e) {
        setError(e.message);
      }
    })();
    return () => { vivo = false; };
  }, []);

  const marcar = useCallback(async (item) => {
    const comprado = !item.comprado;
    tg?.HapticFeedback?.impactOccurred?.("light");
    // Al momento en pantalla; si el servidor dice que no, se deshace.
    setDatos((d) => ({ ...d, compra: d.compra.map((x) => (x.id === item.id ? { ...x, comprado } : x)) }));
    try {
      await llamar(tg.initData, { marcar: { id: item.id, comprado } });
    } catch {
      setDatos((d) => ({ ...d, compra: d.compra.map((x) => (x.id === item.id ? { ...x, comprado: !comprado } : x)) }));
      tg?.showAlert?.("No se ha podido guardar. Prueba otra vez.");
    }
  }, [tg]);

  return (
    <div style={{ minHeight: "100dvh", background: FONDO, color: TINTA, fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif", maxWidth: 560, margin: "0 auto" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 2, background: FONDO, padding: "14px 16px 10px", borderBottom: `1px solid ${LINEA}` }}>
        <div role="tablist" style={{ display: "flex", background: "#e8f0eb", borderRadius: 12, padding: 3 }}>
          {[["semana", "📅 La semana"], ["compra", "🛒 La compra"]].map(([id, texto]) => (
            <button
              key={id}
              role="tab"
              aria-selected={pestana === id}
              onClick={() => setPestana(id)}
              style={{
                flex: 1, padding: "10px 8px", borderRadius: 10, border: "none", cursor: "pointer",
                fontFamily: "inherit", fontSize: 15, fontWeight: 800,
                background: pestana === id ? "#fff" : "transparent",
                color: pestana === id ? VERDE : SUAVE,
                boxShadow: pestana === id ? "0 1px 4px rgba(20,48,29,.12)" : "none",
              }}
            >
              {texto}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: "12px 16px 32px" }}>
        {error ? (
          <Aviso texto={error} />
        ) : !datos ? (
          <Aviso texto="Cargando…" />
        ) : pestana === "semana" ? (
          <Semana semana={datos.semana} />
        ) : (
          <Compra items={datos.compra} onMarcar={marcar} />
        )}
      </div>
    </div>
  );
}

function Aviso({ texto }) {
  return <p style={{ textAlign: "center", color: SUAVE, fontSize: 16, fontWeight: 600, lineHeight: 1.45, margin: "48px 12px" }}>{texto}</p>;
}

function Semana({ semana }) {
  const hoyRef = useRef(null);
  useEffect(() => { hoyRef.current?.scrollIntoView({ block: "start" }); }, [semana]);
  if (!semana?.dias?.length) return <Aviso texto="Todavía no hay menú esta semana. Pídeselo a Lola en el chat: «hazme el menú»." />;
  return semana.dias.map((d) => {
    const esHoy = d.clave === HOY;
    return (
      <section
        key={d.clave}
        ref={esHoy ? hoyRef : null}
        style={{
          background: "#fff", borderRadius: 16, padding: "14px 14px 6px", marginBottom: 12,
          border: `${esHoy ? 2 : 1}px solid ${esHoy ? VERDE : LINEA}`, scrollMarginTop: 72,
        }}
      >
        <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 900, letterSpacing: "-.3px" }}>
          {d.nombre}{esHoy && <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 800, color: "#fff", background: VERDE, borderRadius: 999, padding: "2px 8px", verticalAlign: 3 }}>HOY</span>}
        </h2>
        {d.comidas.map((c, i) => (
          <div key={`${c.franja}-${i}`} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: SUAVE, margin: "4px 0 6px" }}>
              {EMOJI[c.franja] ?? "🍽️"} {c.franja}{c.grupos.length ? <i style={{ fontWeight: 600 }}>, {c.grupos.join(" y ")}</i> : null}
            </div>
            {c.platos.map((p) => <Plato key={p.id} plato={p} />)}
          </div>
        ))}
      </section>
    );
  });
}

function Plato({ plato }) {
  const foto = deckImg(dishImageUrl(plato.id), 200);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0" }}>
      <div style={{ width: 56, height: 56, borderRadius: 12, overflow: "hidden", background: "#eef4f0", flexShrink: 0 }}>
        {foto && <img src={foto} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.25 }}>{plato.nombre}</div>
        {plato.minutos ? <div style={{ fontSize: 13, color: SUAVE, fontWeight: 600, marginTop: 2 }}>⏱️ {plato.minutos} min</div> : null}
      </div>
    </div>
  );
}

function Compra({ items, onMarcar }) {
  const secciones = useMemo(() => {
    const m = new Map();
    for (const it of items ?? []) {
      if (!m.has(it.seccion)) m.set(it.seccion, []);
      m.get(it.seccion).push(it);
    }
    return [...m];
  }, [items]);
  if (!items?.length) return <Aviso texto="La lista está vacía. Cuando Lola te haga el menú, aquí sale la compra." />;
  const quedan = items.filter((it) => !it.comprado).length;
  return (
    <>
      <p style={{ margin: "2px 2px 12px", fontSize: 15, fontWeight: 700, color: SUAVE }}>
        {quedan ? `Quedan ${quedan} de ${items.length}. Toca para tachar.` : "✅ ¡Todo comprado!"}
      </p>
      {secciones.map(([seccion, lista]) => (
        <section key={seccion} style={{ background: "#fff", borderRadius: 16, border: `1px solid ${LINEA}`, marginBottom: 12, overflow: "hidden" }}>
          <h2 style={{ margin: 0, padding: "12px 14px 6px", fontSize: 15, fontWeight: 900 }}>{seccion}</h2>
          {lista.map((it) => (
            <button
              key={it.id}
              onClick={() => onMarcar(it)}
              aria-pressed={it.comprado}
              style={{
                display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: 52,
                padding: "8px 14px", border: "none", borderTop: `1px solid ${LINEA}`, background: "transparent",
                cursor: "pointer", fontFamily: "inherit", textAlign: "left",
              }}
            >
              <span style={{
                width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                border: `2px solid ${it.comprado ? VERDE : "#b8c9bd"}`, background: it.comprado ? VERDE : "#fff",
                color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 900,
              }}>{it.comprado ? "✓" : ""}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 700, color: it.comprado ? "#9ab0a1" : TINTA, textDecoration: it.comprado ? "line-through" : "none" }}>
                {it.nombre}
              </span>
              {it.cantidad && <span style={{ fontSize: 14, fontWeight: 700, color: SUAVE, flexShrink: 0 }}>{it.cantidad}</span>}
            </button>
          ))}
        </section>
      ))}
    </>
  );
}
