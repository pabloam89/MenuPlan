import { useState } from "react";
import { ToggleSwitch } from "./ui.jsx";
import { Conectar } from "./ConectarMercadona.jsx";
import { BOTON, TEXTO } from "./mercadonaEstilos.js";
import { AJUSTE_MERCADONA, SIN_MIRAR, TELEFONO, TEXTO_FALTA } from "../lib/mercadonaApp.js";
import { FALTA_MERCADONA, LLEGA_HASTA, faltaPara, llegaA } from "../lib/mercadonaLlegaHasta.js";
import { color as tono, tipografia, espaciado, radio, tamano } from "../design/tokens.js";

const caja = {
  background: tono.superficie,
  border: `1px solid ${tono["linea-suave"]}`,
  borderRadius: radio["radio-tarjeta"],
  overflow: "hidden",
};

// Una insignia como «Plan Free» del perfil: texto `marca` sobre `marca-fondo`, en píldora.
const pildora = {
  display: "inline-block",
  marginLeft: espaciado["esp-8"],
  padding: `${espaciado["esp-2"]}px ${espaciado["esp-8"]}px`,
  borderRadius: radio["radio-pildora"],
  background: tono["marca-fondo"],
  color: tono.marca,
  fontSize: tipografia["paso-11"],
  fontWeight: tipografia["peso-800"],
  verticalAlign: "middle",
};

// La casilla del teléfono: la forma de los botones de la hoja (radio-control, alto táctil), borde suave.
const casilla = {
  width: "100%",
  boxSizing: "border-box",
  minHeight: tamano["tam-tactil"],
  padding: `0 ${espaciado["esp-12"]}px`,
  borderRadius: "var(--radio-control)",
  border: `1px solid ${tono["linea-suave"]}`,
  background: tono.superficie,
  color: tono.tinta,
  fontFamily: "inherit",
  fontSize: tipografia["paso-14"],
};

/** Pide el teléfono una vez; al guardarlo, sigue con el paso que se encendió. */
function PedirTelefono({ guardar }) {
  const [texto, setTexto] = useState("");
  const [mal, setMal] = useState(false);
  const enviar = async (e) => {
    e.preventDefault();
    setMal((await guardar(texto)) === false);
  };
  return (
    <form onSubmit={enviar} style={{ display: "grid", gap: espaciado["esp-8"] }}>
      <label style={{ display: "grid", gap: espaciado["esp-8"] }}>
        <input type="tel" inputMode="tel" autoComplete="tel" aria-label={TELEFONO.ETIQUETA} placeholder={TELEFONO.ETIQUETA} value={texto} onChange={(e) => setTexto(e.target.value)} style={casilla} />
        <button type="submit" style={BOTON}>{TELEFONO.GUARDAR}</button>
      </label>
      {mal && <p style={TEXTO}>{TELEFONO.MAL}</p>}
    </form>
  );
}

function Fila({ nombre, primera, children, nota }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: espaciado["esp-12"],
        minHeight: tamano["tam-tactil"],
        padding: `${espaciado["esp-12"]}px ${espaciado["esp-16"]}px`,
        borderTop: primera ? "none" : `1px solid ${tono["linea-suave"]}`,
      }}
    >
      <span style={{ flex: 1, fontSize: tipografia["paso-14"], fontWeight: tipografia["peso-800"], color: tono.tinta }}>
        {nombre}
        {nota && <span style={pildora}>{nota}</span>}
      </span>
      {children}
    </div>
  );
}

/**
 * Los pasos, en orden (trozo 17 de #1407). «Rellenar la lista» es estar dentro de la cuenta de Mercadona: encenderlo
 * lleva a entrar y apagarlo es salir. «Reservar la hora» (de entrega) es `llega_hasta`: encenderlo pide lo que falte
 * (`faltaPara`): el teléfono en una casilla; la dirección, en una línea, porque se añade en la app de Mercadona. «Pagar la
 * compra» se ve, apagado y con «Pronto», hasta que el bot sepa pagar (trozo 21).
 * En la hoja de la primera vez (`encendido`), «Rellenar la lista» empieza encendido: es lo que se pidió al pulsar Comprar.
 * @param {{ m: ReturnType<typeof import("./useRellenarMercadona.js").useRellenarMercadona>, encendido?: boolean }} props
 */
export function AjustesMercadona({ m, encendido = false }) {
  const [entrando, setEntrando] = useState(encendido);
  // Lo que falta para el paso que se quiso encender: se pinta debajo, y el teléfono se pide.
  const [falta, setFalta] = useState([]);
  const cambiarLista = (encender) => {
    setEntrando(encender);
    setFalta([]);
    if (!encender && m.conectada) m.desconectar();
  };
  const reservando = m.conectada && llegaA(m.llega_hasta, LLEGA_HASTA.RESERVAR);
  const cambiarReservar = async (encender) => {
    const hasta = encender ? LLEGA_HASTA.RESERVAR : LLEGA_HASTA.LISTA;
    const antes = faltaPara(m, hasta);
    setFalta(antes);
    if (!antes.length) setFalta(await m.cambiarLlegaHasta(hasta));
  };
  const conTelefono = async (texto) => {
    const guardado = await m.guardarTelefono(texto);
    if (guardado !== true) return guardado;
    const resto = falta.filter((f) => f !== FALTA_MERCADONA.TELEFONO);
    setFalta(resto.length ? resto : await m.cambiarLlegaHasta(LLEGA_HASTA.RESERVAR));
    return true;
  };
  const sinMirar = falta.length > 0 && m.tiene_direccion === null;
  const lineas = sinMirar ? [SIN_MIRAR] : falta.map((f) => TEXTO_FALTA[f]).filter(Boolean);
  return (
    <div style={{ display: "grid", gap: espaciado["esp-12"] }}>
      <div style={caja}>
        <Fila nombre={AJUSTE_MERCADONA.LISTA} primera>
          <ToggleSwitch checked={m.conectada || entrando} ariaLabel={AJUSTE_MERCADONA.LISTA} onChange={cambiarLista} />
        </Fila>
        <Fila nombre={AJUSTE_MERCADONA.RESERVAR}>
          <ToggleSwitch checked={reservando} disabled={!m.conectada} ariaLabel={AJUSTE_MERCADONA.RESERVAR} onChange={cambiarReservar} />
        </Fila>
        <Fila nombre={AJUSTE_MERCADONA.PAGAR} nota={AJUSTE_MERCADONA.PRONTO}>
          <ToggleSwitch checked={false} disabled ariaLabel={AJUSTE_MERCADONA.PAGAR} onChange={() => {}} />
        </Fila>
      </div>
      {entrando && !m.conectada && <Conectar caducada={m.caducada} />}
      {lineas.map((l) => <p key={l} style={TEXTO}>{l}</p>)}
      {!sinMirar && falta.includes(FALTA_MERCADONA.TELEFONO) && <PedirTelefono guardar={conTelefono} />}
      {m.aviso && <p style={TEXTO}>{m.aviso}</p>}
    </div>
  );
}
