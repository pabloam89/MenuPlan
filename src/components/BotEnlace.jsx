import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabase.js";
import { clearState } from "../lib/storage.js";
import { cuentaDeLaCopia, olvidarCopia } from "../lib/useAuth.js";
import { sacarLlaveDeLola } from "../lib/llaveLola.js";

// Entrar desde un botón de Lola, ya dentro, sin email ni Google
// (specs/plan-bot-mensajeria.md). La llave (lib/llaveLola.js) es:
//   · `?entrar=<código>`: de un solo uso y 30 minutos (/app, el alta);
//   · la firma de un botón de login de Telegram (`?id=…&hash=…`): sirve cada
//     vez que se pulsa, también en mensajes de hace días.
// api/bot/entrar.js la cambia por una sesión.
//
// «Ya tengo cuenta» no pasa por aquí: se resuelve entero en el chat con un
// código de 6 cifras por email (0059).
//
// `onFallo(mensaje)`: la llave no sirvió y este navegador no está dentro con
// esa cuenta. App lo dice en el splash en vez de pedir entrar con Google.

export default function BotEnlace({ showToast, onFallo }) {
  const leido = useRef(false);

  useEffect(() => {
    if (leido.current || !supabase) return;
    leido.current = true;

    const llave = sacarLlaveDeLola();
    if (!llave) return;
    (async () => {
      const conSesion = (await supabase.auth.getSession())?.data?.session?.user?.id ?? null;
      try {
        const res = await fetch("/api/bot/entrar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(llave),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          // Un botón viejo (llave gastada) en un navegador que ya está dentro
          // con esa misma cuenta: no hay nada que arreglar, se sigue al destino.
          if (body.user_id && body.user_id === conSesion) return;
          throw new Error(body.error || "No se pudo entrar.");
        }
        const { token_hash, user_id } = body;
        // Ya dentro con esa cuenta: nada que abrir.
        if (conSesion && conSesion === user_id) return;

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
        const mensaje = err.message || "No se pudo entrar.";
        if (onFallo) onFallo(mensaje);
        else showToast(mensaje);
      }
    })();
  }, [showToast, onFallo]);

  return null;
}
