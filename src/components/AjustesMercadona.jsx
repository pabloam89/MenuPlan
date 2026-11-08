import { useState } from "react";
import { ToggleSwitch } from "./ui.jsx";
import { Conectar } from "./ConectarMercadona.jsx";
import { TEXTO } from "./mercadonaEstilos.js";
import { AJUSTE_MERCADONA } from "../lib/mercadonaApp.js";
import { color as tono, tipografia, espaciado, radio, tamano } from "../design/tokens.js";

const caja = {
  background: tono.superficie,
  border: `1px solid ${tono["linea-suave"]}`,
  borderRadius: radio["radio-tarjeta"],
  overflow: "hidden",
};

// Una insignia como «Plan Free» del perfil: texto  sobre , en píldora.
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
 * Dos interruptores. «Rellenar la lista» es estar dentro de la cuenta de Mercadona: encenderlo lleva a entrar y apagarlo
 * es salir; no se guarda nada aparte. «Pagar la compra» se ve, apagado y sin poder encenderse: HoMenu no paga (skill
 * `mercadona`), y no hay dato que guardar hasta que un plan propio lo pruebe.
 * En la hoja de la primera vez (`encendido`), «Rellenar la lista» empieza encendido: es lo que se pidió al pulsar Comprar.
 * @param {{ m: ReturnType<typeof import("./useRellenarMercadona.js").useRellenarMercadona>, encendido?: boolean }} props
 */
export function AjustesMercadona({ m, encendido = false }) {
  const [entrando, setEntrando] = useState(encendido);
  const cambiarLista = (encender) => {
    setEntrando(encender);
    if (!encender && m.conectada) m.desconectar();
  };
  return (
    <div style={{ display: "grid", gap: espaciado["esp-12"] }}>
      <div style={caja}>
        <Fila nombre={AJUSTE_MERCADONA.LISTA} primera>
          <ToggleSwitch checked={m.conectada || entrando} ariaLabel={AJUSTE_MERCADONA.LISTA} onChange={cambiarLista} />
        </Fila>
        <Fila nombre={AJUSTE_MERCADONA.PAGAR} nota={AJUSTE_MERCADONA.PRONTO}>
          <ToggleSwitch checked={false} disabled ariaLabel={AJUSTE_MERCADONA.PAGAR} onChange={() => {}} />
        </Fila>
      </div>
      {entrando && !m.conectada && <Conectar caducada={m.caducada} />}
      {m.aviso && <p style={TEXTO}>{m.aviso}</p>}
    </div>
  );
}
