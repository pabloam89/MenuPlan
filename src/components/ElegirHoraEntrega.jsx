import { Check, Clock } from "./icons.jsx";
import { TEXTO } from "./mercadonaEstilos.js";
import { HORA_ENTREGA } from "../lib/mercadonaApp.js";
import { hastaCuandoSeCambia, partesDeHoraEntrega } from "../lib/mercadonaHoraEntrega.js";
import { ESTADO_ENCARGO_MERCADONA } from "../lib/vocabularios.js";

/** Entre una hora y la siguiente al entrar: se leen como cuatro cosas, no como una fila que ya estaba. */
const CASCADA_MS = 60;

const titulo = {
  margin: 0,
  color: "var(--color-tinta)",
  fontSize: "var(--tipo-paso-16)",
  fontWeight: "var(--tipo-peso-800)",
};

const tarjeta = (marcada, apagada) => ({
  display: "flex",
  alignItems: "center",
  gap: "var(--esp-12)",
  width: "100%",
  minHeight: 56,
  padding: "var(--esp-12) var(--esp-16)",
  borderRadius: "var(--radio-tarjeta)",
  border: `${marcada ? 2 : 1}px solid ${marcada ? "var(--color-seleccionado)" : "var(--color-linea)"}`,
  background: marcada ? "var(--color-seleccionado-fondo)" : "var(--color-superficie)",
  boxShadow: marcada ? "none" : "var(--sombra-0)",
  opacity: apagada ? 0.4 : 1,
  fontFamily: "inherit",
  textAlign: "left",
  cursor: apagada ? "default" : "pointer",
  transition: "border-color var(--mov-media) var(--mov-curva), background var(--mov-media) var(--mov-curva), opacity var(--mov-media) var(--mov-curva), transform var(--mov-rapida) var(--mov-curva)",
});

const dia = { display: "block", color: "var(--color-tinta)", fontSize: "var(--tipo-paso-14)", fontWeight: "var(--tipo-peso-800)" };
const horas = { display: "block", color: "var(--color-tinta-suave)", fontSize: "var(--tipo-paso-13)", fontVariantNumeric: "tabular-nums" };
const precio = (gratis) => ({
  flexShrink: 0,
  padding: "var(--esp-2) var(--esp-8)",
  borderRadius: "var(--radio-pildora)",
  background: gratis ? "var(--color-marca-fondo)" : "var(--color-fondo-suave)",
  color: gratis ? "var(--color-marca)" : "var(--color-tinta-media)",
  fontSize: "var(--tipo-paso-12)",
  fontWeight: "var(--tipo-peso-800)",
  fontVariantNumeric: "tabular-nums",
});

/** El giro de «reservando», como el de los botones de ui.jsx. */
function Girando() {
  return (
    <svg width={18} height={18} viewBox="0 0 18 18" className="rotating" style={{ flexShrink: 0 }} aria-hidden="true">
      <circle cx="9" cy="9" r="7" fill="none" stroke="var(--color-linea)" strokeWidth="2.5" />
      <path d="M9 2 A7 7 0 0 1 16 9" fill="none" stroke="var(--color-seleccionado)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/** Una hora libre: el día, las horas y lo que cuesta. La elegida se marca; las demás se apagan mientras se reserva. */
function Hora({ hora, posicion, marcada, apagada, girando, onElegir }) {
  const p = partesDeHoraEntrega(hora);
  if (!p) return null;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={marcada}
      disabled={apagada || girando}
      onClick={onElegir}
      className="mp-press mp-hora-entra"
      style={{ ...tarjeta(marcada, apagada), animationDelay: `${posicion * CASCADA_MS}ms` }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={dia}>{p.dia}</span>
        <span style={horas}>{p.horas}</span>
      </span>
      {p.precio && <span style={precio(p.precio === "gratis")}>{p.precio}</span>}
      {marcada && (girando ? <Girando /> : <Check size={18} color="var(--color-seleccionado)" />)}
    </button>
  );
}


/** La hora ya reservada: entra con un pequeño rebote, que es la buena noticia. */
function Reservada({ encargo }) {
  const p = partesDeHoraEntrega(encargo.hora_entrega);
  const hasta = hastaCuandoSeCambia(encargo.cambiable_hasta);
  return (
    <div className="mp-hora-reservada" style={{ ...tarjeta(true, false), cursor: "default" }} role="status">
      <span
        style={{
          display: "grid",
          placeItems: "center",
          width: 36,
          height: 36,
          flexShrink: 0,
          borderRadius: "var(--radio-pildora)",
          background: "var(--color-seleccionado)",
        }}
      >
        <Check size={20} color="var(--color-superficie)" />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ ...horas, fontWeight: "var(--tipo-peso-700)" }}>{HORA_ENTREGA.RESERVADA}</span>
        <span style={dia}>{p ? `${p.dia}, ${p.horas}` : ""}</span>
        {hasta && <span style={horas}>{`${HORA_ENTREGA.CAMBIAR} ${hasta}.`}</span>}
      </span>
    </div>
  );
}

/**
 * Elegir la hora de entrega en la hoja de Comprar (trozo 20 de #1407): las horas libres que trajo el trabajador, una
 * por tarjeta y en cascada; al tocar una, se marca, las demás se apagan y se reserva; al acabar, la reservada.
 * `m` es useRellenarMercadona.
 */
export function ElegirHoraEntrega({ m }) {
  const { encargo, eligiendo, elegir } = m;
  if (!encargo) return null;
  if (encargo.status === ESTADO_ENCARGO_MERCADONA.HECHO && encargo.hora_entrega) {
    return (
      <div style={{ display: "grid", gap: "var(--esp-8)" }}>
        <Reservada encargo={encargo} />
        <p style={TEXTO}>{HORA_ENTREGA.PAGAR}</p>
      </div>
    );
  }
  const reservando = encargo.status === ESTADO_ENCARGO_MERCADONA.RESERVANDO;
  const lista = reservando ? [encargo.hora_entrega].filter(Boolean) : encargo.horas_entrega ?? [];
  const marcada = reservando ? String(encargo.hora_entrega?.id) : eligiendo;
  return (
    <section aria-label="Hora de entrega" style={{ display: "grid", gap: "var(--esp-8)" }}>
      <p style={{ ...titulo, display: "flex", alignItems: "center", gap: "var(--esp-8)" }}>
        <Clock size={18} color="var(--color-marca)" />
        {reservando || eligiendo ? HORA_ENTREGA.RESERVANDO : HORA_ENTREGA.PREGUNTA}
      </p>
      <div role="radiogroup" aria-label={HORA_ENTREGA.PREGUNTA} style={{ display: "grid", gap: "var(--esp-8)" }}>
        {lista.map((h, i) => (
          <Hora
            key={h.id}
            hora={h}
            posicion={i}
            marcada={marcada === String(h.id)}
            apagada={Boolean(marcada) && marcada !== String(h.id)}
            girando={Boolean(marcada)}
            onElegir={() => elegir(h.id)}
          />
        ))}
      </div>
    </section>
  );
}
