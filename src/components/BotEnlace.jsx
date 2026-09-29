import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { clearState } from "../lib/storage.js";

// Los dos enlaces que manda el bot de Telegram (specs/plan-bot-mensajeria.md):
//
//   · `/?entrar=<código>`   empezaste en el bot sin cuenta (o le pediste /app):
//                           se cambia por una sesión y entras ya dentro.
//   · `/?vincular=<código>` le diste tu email al bot y Supabase te mandó un
//                           enlace de acceso: ya con sesión, se pregunta si se
//                           conecta ESE chat con tu casa. Se pregunta siempre
//                           porque el correo te llegaría igual aunque el email
//                           lo hubiera escrito otro en su Telegram.
//
// El código se saca de la URL al montar (sin tocar el `#` de la sesión que
// deja Supabase) y el de `vincular` espera en sessionStorage a que haya sesión.

const CLAVE_VINCULAR = "hm.bot.vincular";
const VIDA_MS = 60 * 60 * 1000; // lo que dura el enlace de acceso de Supabase

function sacarParametro(nombre) {
  const url = new URL(window.location.href);
  const valor = url.searchParams.get(nombre);
  if (valor == null) return null;
  url.searchParams.delete(nombre);
  window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  return valor;
}

async function llamar(ruta, body, token) {
  const res = await fetch(ruta, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Algo ha fallado.");
  return json;
}

const token = async () => (await supabase?.auth.getSession())?.data?.session?.access_token;

export default function BotEnlace({ user, showToast }) {
  const [pregunta, setPregunta] = useState(null); // { codigo, nombre, casa }
  const [ocupado, setOcupado] = useState(false);
  const leido = useRef(false);
  const usuarioPrevio = useRef(null);

  // Al montar: recoger los códigos de la URL.
  useEffect(() => {
    if (leido.current || !supabase) return;
    leido.current = true;

    const vincular = sacarParametro("vincular");
    if (vincular) {
      try {
        sessionStorage.setItem(CLAVE_VINCULAR, JSON.stringify({ codigo: vincular, hasta: Date.now() + VIDA_MS }));
      } catch { /* sin almacenamiento: se pierde */ }
    }

    const entrar = sacarParametro("entrar");
    if (entrar) {
      (async () => {
        try {
          const { token_hash, user_id } = await llamar("/api/bot/entrar", { codigo: entrar });
          const antes = (await supabase.auth.getSession())?.data?.session?.user?.id ?? null;
          // Otra cuenta en este navegador: su familia sigue en la copia local y
          // la app la subiría a la cuenta nueva en cuanto entre. Se cierra y se
          // borra ANTES de abrir la nueva, y luego se recarga limpio.
          const cambia = antes && antes !== user_id;
          if (cambia) {
            await supabase.auth.signOut();
            clearState();
          }
          const { error } = await supabase.auth.verifyOtp({ token_hash, type: "magiclink" });
          if (error) throw error;
          if (cambia) {
            clearState();
            window.location.replace(window.location.pathname);
          }
        } catch (err) {
          showToast(err.message || "No se pudo entrar.");
        }
      })();
    }
  }, [showToast]);

  // Con sesión: si hay un chat esperando, preguntar. Sin sesión (se cerró), el
  // código pendiente se tira: no se le ofrece a quien entre después.
  useEffect(() => {
    const habia = usuarioPrevio.current;
    usuarioPrevio.current = user?.id ?? null;
    if (!user?.id) {
      // Solo al CERRAR sesión: al abrir la app aún no la hay, y el código que
      // acaba de llegar en el enlace tiene que esperar a que Supabase la abra.
      if (habia) try { sessionStorage.removeItem(CLAVE_VINCULAR); } catch { /* nada */ }
      return;
    }
    let codigo = null;
    try {
      const guardado = JSON.parse(sessionStorage.getItem(CLAVE_VINCULAR) ?? "null");
      if (guardado?.hasta > Date.now()) codigo = guardado.codigo;
      else sessionStorage.removeItem(CLAVE_VINCULAR);
    } catch { /* nada */ }
    if (!codigo) return;
    (async () => {
      try {
        const { nombre, casa } = await llamar("/api/bot/vincular", { codigo, paso: "ver" }, await token());
        setPregunta({ codigo, nombre, casa });
      } catch (err) {
        try { sessionStorage.removeItem(CLAVE_VINCULAR); } catch { /* nada */ }
        showToast(err.message);
      }
    })();
  }, [user?.id, showToast]);

  if (!pregunta) return null;

  const cerrar = () => {
    try { sessionStorage.removeItem(CLAVE_VINCULAR); } catch { /* nada */ }
    setPregunta(null);
  };
  const conectar = async () => {
    setOcupado(true);
    try {
      await llamar("/api/bot/vincular", { codigo: pregunta.codigo, paso: "confirmar" }, await token());
      showToast("¡Conectado! Ya puedes volver a Telegram");
      cerrar();
    } catch (err) {
      showToast(err.message);
      cerrar();
    } finally {
      setOcupado(false);
    }
  };

  const quien = pregunta.nombre ? `de ${pregunta.nombre}` : "";
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(20,47,29,.35)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="mp-toast-in"
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#f3f8f4",
          border: "1.5px solid #e2ede5",
          borderRadius: 22,
          padding: 20,
          boxShadow: "0 12px 40px rgba(20,47,29,.25)",
          boxSizing: "border-box",
        }}
      >
        <p style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 900, color: "#142f1d" }}>
          ¿Conectar Telegram con tu casa?
        </p>
        <p style={{ margin: "0 0 16px", fontSize: 13.5, color: "#5f7266", lineHeight: 1.5 }}>
          El chat de Telegram {quien} podrá ver y cambiar el menú de «{pregunta.casa}». Conéctalo solo si
          acabas de pedirlo tú desde Telegram.
        </p>
        <button
          type="button"
          onClick={conectar}
          disabled={ocupado}
          style={{
            width: "100%",
            padding: "12px 20px",
            borderRadius: 12,
            border: "none",
            background: ocupado ? "#c8d9ce" : "#2d5a3d",
            color: "#fff",
            fontSize: 14,
            fontWeight: 800,
            fontFamily: "inherit",
            cursor: ocupado ? "default" : "pointer",
          }}
        >
          Conectar
        </button>
        <button
          type="button"
          onClick={cerrar}
          disabled={ocupado}
          style={{
            width: "100%",
            marginTop: 8,
            padding: "10px 0",
            border: "none",
            background: "transparent",
            color: "#2d5a3d",
            fontSize: 13,
            fontWeight: 700,
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          Ahora no
        </button>
      </div>
    </div>
  );
}
