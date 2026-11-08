// El color de la HORA del iPhone, pantalla a pantalla.
//
// La app se dibuja de borde a borde y la barra de estado va en modo overlay
// (capacitor.config.json), asi que el reloj se pinta ENCIMA de lo que haya
// arriba del todo. No hay franja de color detras que lo separe: si el fondo de
// esa franja es oscuro y la hora tambien, la hora desaparece.
//
// Casi toda la app tiene cabeceras claras (#e9f4ed, #fff, #f7f9f7), y para esas
// vale el valor por defecto de la config: hora oscura. Las excepciones son las
// pantallas a sangre con fondo oscuro — la de bienvenida y la de "generando" —,
// y son las que usan este hook.
//
// Nota sobre los nombres: el plugin llama "Dark" al estilo de TEXTO CLARO (el
// que se usa sobre fondos oscuros) y "Light" al de texto oscuro, que se lee al
// reves de lo que uno espera. Aqui se nombra por el FONDO, que es lo que quien
// escribe una pantalla tiene delante.

import { useEffect } from "react";
import { isNativeApp } from "./apiUrl.js";

const POR_DEFECTO = "claro";

async function fijarEstilo(fondo) {
  if (!isNativeApp) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: fondo === "oscuro" ? Style.Dark : Style.Light });
  } catch {
    // Si el plugin no responde, la hora se queda como estaba. Es un detalle
    // estetico: no merece tumbar la pantalla que lo pide.
  }
}

/**
 * Ajusta la hora del iPhone al fondo de esta pantalla mientras esta montada, y
 * la devuelve al valor normal al salir.
 *
 * @param {"claro" | "oscuro"} fondo Como es la franja de ARRIBA de la pantalla.
 */
export function useStatusBarSobreFondo(fondo) {
  useEffect(() => {
    fijarEstilo(fondo);
    return () => { fijarEstilo(POR_DEFECTO); };
  }, [fondo]);
}
