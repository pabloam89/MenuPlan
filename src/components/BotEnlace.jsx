import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabase.js";
import { clearState } from "../lib/storage.js";
import { cuentaDeLaCopia, olvidarCopia } from "../lib/useAuth.js";

// `/?entrar=<código>`: el enlace que manda el bot de Telegram a quien empezó
// allí sin cuenta (o le pidió /app). Se cambia en api/bot/entrar.js por una
// sesión y entras ya dentro, sin email ni Google (specs/plan-bot-mensajeria.md).
//
// «Ya tengo cuenta» no pasa por aquí: se resuelve entero en el chat con un
// código de 6 cifras por email (0059).

function sacarParametro(nombre) {
  const url = new URL(window.location.href);
  const valor = url.searchParams.get(nombre);
  if (valor == null) return null;
  url.searchParams.delete(nombre);
  window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  return valor;
}

export default function BotEnlace({ showToast }) {
  const leido = useRef(false);

  useEffect(() => {
    if (leido.current || !supabase) return;
    leido.current = true;

    const entrar = sacarParametro("entrar");
    if (!entrar) return;
    (async () => {
      try {
        const res = await fetch("/api/bot/entrar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ codigo: entrar }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "No se pudo entrar.");
        const { token_hash, user_id } = body;

        const conSesion = (await supabase.auth.getSession())?.data?.session?.user?.id ?? null;
        // Otra cuenta en este navegador: su familia sigue en la copia local y
        // la app la subiría a la cuenta nueva en cuanto entre. Se cierra y se
        // borra ANTES de abrir la nueva, y luego se recarga limpio. También si
        // esa cuenta ya perdió la sesión (borrada con /borrarme): su copia sigue.
        const antes = conSesion ?? cuentaDeLaCopia();
        const cambia = antes && antes !== user_id;
        if (cambia) {
          if (conSesion) await supabase.auth.signOut();
          olvidarCopia();
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
  }, [showToast]);

  return null;
}
