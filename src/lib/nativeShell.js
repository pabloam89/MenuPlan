// Ajustes de "carcasa" que solo aplican dentro de la app nativa (iOS).
//
// El problema que resuelve: la webview de Capacitor ocupa la pantalla entera,
// incluida la franja del reloj/notch arriba y la del indicador de inicio abajo.
// La app dibuja ahí encima, y por eso los botones de la esquina superior
// derecha quedaban debajo de la barra de estado, imposibles de pulsar.
//
// Se arregla por los dos extremos, y a propósito de formas distintas:
//
//   · Arriba, por el lado nativo: se le dice al sistema que la barra de estado
//     NO se superponga, así la webview empieza justo debajo. Es preferible a
//     meter padding por CSS porque funciona en las ~50 pantallas de golpe, sin
//     tocar ni una.
//   · Abajo, por CSS: la app ya está llena de `env(safe-area-inset-bottom)`
//     (barra de navegación, hojas, botones flotantes...), pero esos valores
//     valen 0 mientras el viewport no sea `viewport-fit=cover`. Basta con
//     activarlo para que todo ese trabajo que ya existe empiece a contar.
//
// `viewport-fit=cover` se pone aquí en tiempo de ejecución, y no en el
// index.html, para no cambiarlo en la web: ahí el navegador ya aparta el
// contenido de las zonas peligrosas por su cuenta, y activarlo haría que el
// contenido se metiera bajo la barra de estado en la PWA de iPhone — justo el
// fallo que estamos arreglando, pero al revés.

const VIEWPORT_NATIVO =
  "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover";

export function aplicarViewportNativo() {
  document.querySelector('meta[name="viewport"]')?.setAttribute("content", VIEWPORT_NATIVO);
}

export async function ajustarBarraDeEstado() {
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setOverlaysWebView({ overlay: false });
    // La app es clara, así que la hora y la batería tienen que ir en oscuro.
    await StatusBar.setStyle({ style: Style.Light });
  } catch (err) {
    // Si el plugin no está disponible, la app sigue funcionando: solo se ve
    // peor arriba. No es motivo para no arrancar.
    console.warn("[nativo] no se pudo ajustar la barra de estado", err);
  }
}
