import { CLARO } from "./tema.js";

// Lo que se ve mientras baja el código de la Mini App (src/main.jsx): una
// pantalla en blanco dentro de Telegram parece rota. Va aparte de MiniApp.jsx
// para no arrastrarla al paquete principal.
export default function MiniCargando() {
  return (
    <div style={{
      minHeight: "100dvh", background: CLARO.fondo, color: CLARO.suave, display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif", fontSize: 16, fontWeight: 600,
    }}>
      Cargando…
    </div>
  );
}
