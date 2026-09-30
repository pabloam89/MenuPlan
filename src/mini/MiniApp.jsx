import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { dishImageUrl } from "../assets/dishes/dishImages.js";
import { deckImg } from "../lib/dishPhotoOptimize.js";
import { CLARO, temaDe } from "./tema.js";

// La Mini App de Telegram (`/?mini=semana` o `/?mini=compra`): lo que en el
// chat es un muro de texto —la semana, la lista de la compra— aquí se ve de un
// vistazo y la compra se tacha con el dedo. Solo mira y tacha: cambiar cosas
// sigue siendo hablar con Lola. Sin sesión de la app: la llave es el
// `initData` firmado por Telegram (ver api/_bot/miniapp.js).

const EMOJI = { Desayuno: "☕", Comida: "🍽️", Merienda: "🍎", Cena: "🌙", Postre: "🍮" };
const HOY = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][new Date().getDay()];
const PESTANAS = [["semana", "📅", "La semana"], ["compra", "🛒", "La compra"]];
const BOT = "https://t.me/homenuers_bot";
// Con la compra a la vista se vuelve a preguntar cada tanto: otro de casa
// puede estar tachando en el súper a la vez.
const SONDEO_MS = 15000;
const FUERA = "fuera";

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
  let res;
  try {
    res = await fetch("/api/bot/miniapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData, ...cuerpo }),
    });
  } catch {
    throw Object.assign(new Error("No hay conexión. Prueba otra vez en un momento."), { status: 0 });
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    // 401: el initData ha caducado (dura un día) o no vale; reintentar no lo arregla.
    const texto = res.status === 401
      ? "Esta lista lleva demasiado tiempo abierta. Vuelve a abrir la lista desde el chat."
      : json.error || "No se ha podido cargar. Prueba otra vez en un momento.";
    throw Object.assign(new Error(texto), { status: res.status });
  }
  return json;
}

// Lo que la versión de Telegram del usuario no tiene avisa o lanza, según la
// versión: todo lo opcional va envuelto.
function intentar(fn) {
  try { fn(); } catch { /* versión de Telegram sin esto */ }
}

export default function MiniApp({ pestanaInicial = "semana" }) {
  const [tg, setTg] = useState(null);
  const [tema, setTema] = useState(CLARO);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [pestana, setPestana] = useState(pestanaInicial === "compra" ? "compra" : "semana");

  const datosRef = useRef(null);
  datosRef.current = datos;
  // Tachones en serie: uno detrás de otro, y mientras quede alguno en vuelo
  // ninguna recarga pisa lo que se ve en pantalla.
  const cola = useRef(Promise.resolve());
  const enVuelo = useRef(0);
  const tachones = useRef(0);
  const cargando = useRef(false);
  const otraVez = useRef(false);

  const cargar = useCallback(async (webApp, { mostrarError = false } = {}) => {
    if (!webApp || enVuelo.current) return;
    if (cargando.current) { otraVez.current = true; return; }
    cargando.current = true;
    const antes = tachones.current;
    try {
      const nuevos = await llamar(webApp.initData);
      // Si se ha tachado algo mientras tanto, estos datos ya son viejos.
      if (enVuelo.current || tachones.current !== antes) return;
      setDatos(nuevos);
      setError(null);
    } catch (e) {
      // Un refresco que falla no borra la lista; la llave caducada sí se dice.
      if (mostrarError || e.status === 401 || !datosRef.current) setError({ texto: e.message, reintentar: e.status !== 401 });
    } finally {
      cargando.current = false;
      if (otraVez.current) { otraVez.current = false; cargar(webApp); }
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const webApp = await cargarScriptTelegram();
      if (!vivo) return;
      if (!webApp?.initData) {
        setError({ texto: "Esto se abre desde el chat con Lola, en Telegram.", tipo: FUERA });
        return;
      }
      webApp.ready();
      webApp.expand();
      // Que deslizar la lista hacia abajo no cierre la Mini App.
      intentar(() => webApp.disableVerticalSwipes?.());
      setTema(temaDe(webApp.themeParams));
      setTg(webApp);
      cargar(webApp, { mostrarError: true });
    })();
    return () => { vivo = false; };
  }, [cargar]);

  // El tema de Telegram: al abrir y cada vez que el usuario lo cambia.
  useEffect(() => {
    if (!tg) return;
    const alCambiar = () => setTema(temaDe(tg.themeParams));
    tg.onEvent?.("themeChanged", alCambiar);
    return () => tg.offEvent?.("themeChanged", alCambiar);
  }, [tg]);
  useEffect(() => {
    document.body.style.background = tema.fondo;
    if (!tg) return;
    intentar(() => tg.setHeaderColor(tema.fondo));
    intentar(() => tg.setBackgroundColor(tema.fondo));
    intentar(() => tg.setBottomBarColor?.(tema.fondo));
    // Sin esto, el botón de abajo sale en el azul de Telegram.
    intentar(() => tg.MainButton?.setParams({ color: tema.relleno, text_color: tema.sobreAcento }));
  }, [tg, tema]);

  // Para cambiar algo se habla con Lola: el botón de abajo cierra y vuelve al chat.
  useEffect(() => {
    const boton = tg?.MainButton;
    if (!boton) return;
    const alPulsar = () => tg.close();
    intentar(() => { boton.setText("Pedirle algo a Lola"); boton.onClick(alPulsar); boton.show(); });
    return () => intentar(() => { boton.offClick(alPulsar); boton.hide(); });
  }, [tg]);

  // Refresco: al volver a la Mini App, al volver a estar visible y, con la
  // compra a la vista, cada SONDEO_MS.
  useEffect(() => {
    if (!tg) return;
    const recargar = () => cargar(tg);
    const alVerse = () => { if (document.visibilityState === "visible") recargar(); };
    tg.onEvent?.("activated", recargar);
    document.addEventListener("visibilitychange", alVerse);
    return () => {
      tg.offEvent?.("activated", recargar);
      document.removeEventListener("visibilitychange", alVerse);
    };
  }, [tg, cargar]);
  useEffect(() => {
    if (!tg || pestana !== "compra" || error) return;
    const id = setInterval(() => { if (document.visibilityState === "visible") cargar(tg); }, SONDEO_MS);
    return () => clearInterval(id);
  }, [tg, pestana, error, cargar]);

  const ponerComprado = useCallback((id, comprado) =>
    setDatos((d) => (d ? { ...d, compra: d.compra.map((x) => (x.id === id ? { ...x, comprado } : x)) } : d)), []);

  // Un 409 (alguien lo ha cambiado o quitado a la vez) pide releer, pero no
  // hasta que se vacíe la cola: releer antes pisaría los tachones en vuelo.
  const releer = useRef(false);
  const marcar = useCallback((item) => {
    if (!tg) return;
    const comprado = !item.comprado;
    tg.HapticFeedback?.selectionChanged?.();
    // Al momento en pantalla; el servidor va detrás, en orden.
    ponerComprado(item.id, comprado);
    tachones.current += 1;
    const completa = comprado && (datosRef.current?.compra ?? []).every((x) => x.id === item.id || x.comprado);
    enVuelo.current += 1;
    cola.current = cola.current.then(async () => {
      try {
        await llamar(tg.initData, { marcar: { id: item.id, comprado } });
        if (completa) tg.HapticFeedback?.notificationOccurred?.("success");
      } catch (e) {
        tg.HapticFeedback?.notificationOccurred?.("error");
        if (e.status === 401) {
          setError({ texto: e.message, reintentar: false });
        } else if (e.status === 409) {
          releer.current = true;
        } else {
          ponerComprado(item.id, !comprado);
          intentar(() => tg.showAlert(`No se ha podido guardar «${item.nombre}». ${e.message}`));
        }
      } finally {
        enVuelo.current -= 1;
      }
      if (releer.current && !enVuelo.current) {
        releer.current = false;
        await cargar(tg);
      }
    });
  }, [tg, cargar, ponerComprado]);

  // Cada pestaña recuerda por dónde iba: las dos están montadas y comparten el
  // scroll de la página, así que se guarda al salir y se repone al volver.
  const scrolls = useRef({});
  const cambiarPestana = (id) => {
    if (id === pestana) return;
    scrolls.current[pestana] = window.scrollY;
    setPestana(id);
  };
  useLayoutEffect(() => {
    const y = scrolls.current[pestana];
    if (y != null) window.scrollTo(0, y);
  }, [pestana]);

  const alTeclear = (e) => {
    const salto = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!salto) return;
    const i = PESTANAS.findIndex(([id]) => id === pestana);
    const [id] = PESTANAS[(i + salto + PESTANAS.length) % PESTANAS.length];
    cambiarPestana(id);
    document.getElementById(`tab-${id}`)?.focus();
  };

  const fuera = error?.tipo === FUERA;
  const c = tema;

  return (
    <div style={{ minHeight: "100dvh", background: c.fondo, color: c.tinta, fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif", maxWidth: 560, margin: "0 auto" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 2, background: c.fondo, padding: "14px 16px 10px", borderBottom: `1px solid ${c.linea}` }}>
        <div role="tablist" aria-label="Qué ver" onKeyDown={alTeclear} style={{ display: "flex", background: c.pista, borderRadius: 12, padding: 3 }}>
          {PESTANAS.map(([id, emoji, texto]) => {
            const activa = pestana === id && !fuera;
            return (
              <button
                key={id}
                id={`tab-${id}`}
                role="tab"
                aria-selected={activa}
                aria-controls={`panel-${id}`}
                tabIndex={activa ? 0 : -1}
                disabled={fuera}
                onClick={() => cambiarPestana(id)}
                style={{
                  flex: 1, minHeight: 44, padding: "10px 8px", borderRadius: 10, border: "none", cursor: fuera ? "default" : "pointer",
                  fontFamily: "inherit", fontSize: 15, fontWeight: 800, opacity: fuera ? 0.55 : 1,
                  background: activa ? c.tarjeta : "transparent",
                  color: activa ? c.acento : c.suave,
                  boxShadow: activa ? "0 1px 4px rgba(20,48,29,.12)" : "none",
                }}
              >
                <span aria-hidden="true">{emoji}</span> {texto}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: "12px 16px calc(32px + env(safe-area-inset-bottom) + var(--tg-content-safe-area-inset-bottom, 0px))" }}>
        {error ? (
          <Fallo error={error} c={c} onReintentar={() => { setError(null); cargar(tg, { mostrarError: true }); }} />
        ) : !datos ? (
          <Aviso texto="Cargando…" c={c} />
        ) : (
          PESTANAS.map(([id]) => (
            <div key={id} id={`panel-${id}`} role="tabpanel" aria-labelledby={`tab-${id}`} hidden={pestana !== id}>
              {id === "semana"
                ? <Semana semana={datos.semana} visible={pestana === id} c={c} />
                : <Compra items={datos.compra} onMarcar={marcar} c={c} />}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Aviso({ texto, c }) {
  return <p style={{ textAlign: "center", color: c.suave, fontSize: 16, fontWeight: 600, lineHeight: 1.45, margin: "48px 12px" }}>{texto}</p>;
}

function Fallo({ error, c, onReintentar }) {
  const boton = {
    display: "inline-block", minHeight: 44, boxSizing: "border-box", padding: "12px 22px", borderRadius: 12, border: "none", cursor: "pointer",
    background: c.relleno, color: c.sobreAcento, fontFamily: "inherit", fontSize: 16, fontWeight: 800, textDecoration: "none",
  };
  return (
    <div role="alert" style={{ textAlign: "center" }}>
      <Aviso texto={error.texto} c={c} />
      {error.tipo === FUERA ? (
        <a href={BOT} style={boton}>Abrir Lola</a>
      ) : error.reintentar ? (
        <button onClick={onReintentar} style={boton}>Reintentar</button>
      ) : null}
    </div>
  );
}

function Semana({ semana, visible, c }) {
  const hoyRef = useRef(null);
  const colocada = useRef(false);
  // Al hoy, una vez y al verse por primera vez: un refresco no mueve la lista.
  useEffect(() => {
    if (!visible || colocada.current || !hoyRef.current) return;
    colocada.current = true;
    hoyRef.current.scrollIntoView({ block: "start" });
  }, [semana, visible]);
  if (!semana?.dias?.length) return <Aviso texto="Todavía no hay menú esta semana. Pídeselo a Lola en el chat: «hazme el menú»." c={c} />;
  return semana.dias.map((d) => {
    const esHoy = d.clave === HOY;
    return (
      <section
        key={d.clave}
        ref={esHoy ? hoyRef : null}
        style={{
          background: c.tarjeta, borderRadius: 16, padding: "14px 14px 6px", marginBottom: 12,
          border: `${esHoy ? 2 : 1}px solid ${esHoy ? c.acento : c.linea}`, scrollMarginTop: 80,
        }}
      >
        <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 900, letterSpacing: "-.3px" }}>
          {d.nombre}{esHoy && <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 800, color: c.sobreAcento, background: c.relleno, borderRadius: 999, padding: "2px 8px", verticalAlign: 3 }}>HOY</span>}
        </h2>
        {d.comidas.map((m, i) => (
          <div key={`${m.franja}-${i}`} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: c.suave, margin: "4px 0 6px" }}>
              <span aria-hidden="true">{EMOJI[m.franja] ?? "🍽️"}</span> {m.franja}{m.grupos.length ? <i style={{ fontWeight: 600 }}>, {m.grupos.join(" y ")}</i> : null}
            </div>
            {m.platos.map((p) => <Plato key={p.id} plato={p} c={c} />)}
          </div>
        ))}
      </section>
    );
  });
}

function Plato({ plato, c }) {
  const foto = deckImg(dishImageUrl(plato.id), 200);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0" }}>
      <div style={{ width: 56, height: 56, borderRadius: 12, overflow: "hidden", background: c.pista, flexShrink: 0 }}>
        {foto && <img src={foto} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.25 }}>{plato.nombre}</div>
        {plato.minutos ? <div style={{ fontSize: 13, color: c.suave, fontWeight: 600, marginTop: 2 }}><span aria-hidden="true">⏱️</span> {plato.minutos} min</div> : null}
      </div>
    </div>
  );
}

function Compra({ items, onMarcar, c }) {
  // Pasillos en el orden que manda el servidor (el de la app); dentro de cada
  // uno, lo comprado baja al final para que lo pendiente quede junto.
  const secciones = useMemo(() => {
    const m = new Map();
    for (const it of items ?? []) {
      if (!m.has(it.seccion)) m.set(it.seccion, []);
      m.get(it.seccion).push(it);
    }
    return [...m].map(([seccion, lista]) => [seccion, [...lista.filter((it) => !it.comprado), ...lista.filter((it) => it.comprado)]]);
  }, [items]);
  if (!items?.length) return <Aviso texto="La lista está vacía. Cuando Lola te haga el menú, aquí sale la compra." c={c} />;
  const quedan = items.filter((it) => !it.comprado).length;
  return (
    <>
      <p aria-live="polite" style={{ margin: "2px 2px 12px", fontSize: 15, fontWeight: 700, color: c.suave }}>
        {quedan ? `Quedan ${quedan} de ${items.length}. Toca para tachar.` : <><span aria-hidden="true">✅</span> ¡Todo comprado!</>}
      </p>
      {secciones.map(([seccion, lista]) => (
        <section key={seccion} style={{ background: c.tarjeta, borderRadius: 16, border: `1px solid ${c.linea}`, marginBottom: 12, overflow: "hidden" }}>
          <h2 style={{ margin: 0, padding: "12px 14px 6px", fontSize: 15, fontWeight: 900 }}>{seccion}</h2>
          {lista.map((it) => (
            <button
              key={it.id}
              onClick={() => onMarcar(it)}
              aria-pressed={it.comprado}
              style={{
                display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: 52,
                padding: "8px 14px", border: "none", borderTop: `1px solid ${c.linea}`, background: "transparent",
                cursor: "pointer", fontFamily: "inherit", textAlign: "left",
              }}
            >
              <span aria-hidden="true" style={{
                width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                border: `2px solid ${it.comprado ? c.acento : c.borde}`, background: it.comprado ? c.relleno : c.tarjeta,
                color: c.sobreAcento, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 900,
              }}>{it.comprado ? "✓" : ""}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 700, color: it.comprado ? c.suave : c.tinta, textDecoration: it.comprado ? "line-through" : "none" }}>
                {it.nombre}
              </span>
              {it.cantidad && <span style={{ fontSize: 14, fontWeight: 700, color: c.suave, flexShrink: 0 }}>{it.cantidad}</span>}
            </button>
          ))}
        </section>
      ))}
    </>
  );
}
