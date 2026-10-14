/**
 * Comparador de diseño, tanda 1 (#825): los valores base de HoMenu, solo en
 * desarrollo, con `?comparador=1` (lo monta `src/main.jsx` con un import que
 * desaparece del build de producción).
 *
 * Enseña, por tipo de valor, las FAMILIAS de valores casi iguales que hay hoy en
 * el código, de más a menos usos, con su muestra, sus versiones, sus ficheros y
 * el token de `src/design/tokens.js` al que pasaría. El dato no se escribe a
 * mano: sale de `lint-tokens-base.json` agrupado por
 * `scripts/lib/comparadorFundamentos.mjs`, que tiene su test.
 *
 * La página usa solo tokens (variables CSS). Los valores que pinta en las
 * muestras son el dato que enseña, no estilo de la página.
 *
 * Por qué no `SegmentedControl` de ui.jsx para elegir el tipo: son ocho
 * opciones, que a 375 px no caben en una fila, y su versión compacta queda por
 * debajo de los 40 px de objetivo táctil. Aquí van botones que se parten en
 * dos filas.
 */

import { useMemo, useState } from "react";
import base from "../../lint-tokens-base.json";
import { valoresPlanos } from "../design/tokens.js";
import { TIPOS, UMBRALES, leerBase, agruparBase } from "../../scripts/lib/comparadorFundamentos.mjs";

const NOMBRE = {
  color: "Colores",
  espaciado: "Espacios",
  "tamano-letra": "Tamaños de letra",
  peso: "Pesos",
  radio: "Radios",
  sombra: "Sombras",
  capa: "Capas",
  movimiento: "Movimiento",
};

const FRASE = "Lentejas con chorizo";

const S = {
  pagina: {
    minHeight: "100vh",
    background: "var(--color-fondo-pantalla)",
    color: "var(--color-tinta)",
    padding: "var(--esp-16)",
    boxSizing: "border-box",
    fontFamily: "var(--tipo-familia)",
  },
  titulo: { margin: 0, fontSize: "var(--tipo-paso-26)", fontWeight: "var(--tipo-peso-900)" },
  nota: { margin: "var(--esp-4) 0 var(--esp-16)", fontSize: "var(--tipo-paso-13)", color: "var(--color-tinta-suave)" },
  tablaCaja: { overflowX: "auto", marginBottom: "var(--esp-16)" },
  tabla: { borderCollapse: "collapse", fontSize: "var(--tipo-paso-13)", background: "var(--color-superficie)", borderRadius: "var(--radio-chico)" },
  celda: { padding: "var(--esp-6) var(--esp-12)", borderBottom: "1px solid var(--color-linea-suave)", textAlign: "right", whiteSpace: "nowrap" },
  celdaIzq: { padding: "var(--esp-6) var(--esp-12)", borderBottom: "1px solid var(--color-linea-suave)", textAlign: "left", whiteSpace: "nowrap" },
  tipos: { display: "flex", flexWrap: "wrap", gap: "var(--esp-8)", marginBottom: "var(--esp-16)" },
  botonTipo: (sel) => ({
    minHeight: "var(--tam-tactil)",
    padding: "0 var(--esp-16)",
    borderRadius: "var(--radio-pildora)",
    border: `1px solid ${sel ? "var(--color-marca)" : "var(--color-linea-fuerte)"}`,
    background: sel ? "var(--color-marca)" : "var(--color-superficie)",
    color: sel ? "var(--color-superficie)" : "var(--color-tinta)",
    fontSize: "var(--tipo-paso-14)",
    fontWeight: "var(--tipo-peso-800)",
    fontFamily: "inherit",
    cursor: "pointer",
  }),
  subtitulo: { margin: "0 0 var(--esp-4)", fontSize: "var(--tipo-paso-20)", fontWeight: "var(--tipo-peso-800)" },
  tokensFila: { display: "flex", flexWrap: "wrap", gap: "var(--esp-12)", marginBottom: "var(--esp-20)" },
  tokenCaja: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "var(--esp-4)", fontSize: "var(--tipo-paso-12)" },
  rejilla: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "var(--esp-12)" },
  tarjeta: {
    background: "var(--color-superficie)",
    border: "1px solid var(--color-linea)",
    borderRadius: "var(--radio-tarjeta)",
    padding: "var(--esp-12)",
    display: "flex",
    flexDirection: "column",
    gap: "var(--esp-8)",
    minWidth: 0,
  },
  valor: { fontFamily: "ui-monospace, monospace", fontSize: "var(--tipo-paso-13)", fontWeight: "var(--tipo-peso-700)", wordBreak: "break-all" },
  cifra: { fontSize: "var(--tipo-paso-12)", color: "var(--color-tinta-suave)" },
  pasaA: (hay) => ({
    alignSelf: "flex-start",
    fontSize: "var(--tipo-paso-12)",
    fontWeight: "var(--tipo-peso-800)",
    padding: "var(--esp-2) var(--esp-8)",
    borderRadius: "var(--radio-pildora)",
    background: hay ? "var(--color-marca-fondo)" : "var(--color-aviso-fondo)",
    color: hay ? "var(--color-marca)" : "var(--color-aviso)",
  }),
  versiones: { display: "flex", flexWrap: "wrap", gap: "var(--esp-6)" },
  version: { display: "inline-flex", alignItems: "center", gap: "var(--esp-4)", fontSize: "var(--tipo-paso-11)", color: "var(--color-tinta-media)" },
  detalles: { fontSize: "var(--tipo-paso-12)", color: "var(--color-tinta-media)" },
  resumen: { cursor: "pointer", minHeight: "var(--tam-tactil)", display: "flex", alignItems: "center", fontWeight: "var(--tipo-peso-700)" },
  lista: { margin: 0, paddingLeft: "var(--esp-16)" },
};

/** Fondo partido (claro y oscuro) para que se vea la transparencia de un color. */
const FONDO_PARTIDO = "linear-gradient(90deg, var(--color-superficie) 50%, var(--color-tinta) 50%)";

function MuestraColor({ valor, grande }) {
  const lado = grande ? { width: "100%", height: 56 } : { width: 18, height: 18 };
  return (
    <span style={{ ...lado, display: "block", flexShrink: 0, background: FONDO_PARTIDO, borderRadius: "var(--radio-mini)", border: "1px solid var(--color-linea)", overflow: "hidden" }}>
      <span style={{ display: "block", width: "100%", height: "100%", background: valor }} />
    </span>
  );
}

function CurvaSvg({ valor, lado }) {
  const p = (valor.match(/cubic-bezier\(([^)]*)\)/)?.[1] ?? "").split(",").map(Number);
  if (p.length !== 4 || p.some(Number.isNaN)) return null;
  // Margen para las curvas que se pasan de 0–1 (rebote).
  const y = (v) => lado * 0.8 - v * lado * 0.6;
  const x = (v) => v * lado;
  return (
    <svg width={lado} height={lado} viewBox={`0 0 ${lado} ${lado}`} role="img" aria-label={`curva ${valor}`}>
      <rect x="0" y="0" width={lado} height={lado} fill="var(--color-fondo-suave)" />
      <path d={`M0 ${y(0)} C${x(p[0])} ${y(p[1])} ${x(p[2])} ${y(p[3])} ${x(1)} ${y(1)}`} fill="none" stroke="var(--color-marca)" strokeWidth="2" />
    </svg>
  );
}

/** La muestra visual de un valor: es el dato, por eso lleva el valor tal cual. */
function Muestra({ tipo, valor, grande = false }) {
  if (tipo === "color") return <MuestraColor valor={valor} grande={grande} />;
  if (tipo === "tamano-letra") {
    return <span style={{ fontSize: `${valor}px`, lineHeight: 1.2 }}>{grande ? FRASE : "Aa"}</span>;
  }
  if (tipo === "peso") {
    return <span style={{ fontWeight: valor, fontSize: grande ? "var(--tipo-paso-20)" : "var(--tipo-paso-13)" }}>{grande ? FRASE : "Aa"}</span>;
  }
  if (tipo === "radio") {
    const lado = grande ? { width: 96, height: 56 } : { width: 22, height: 16 };
    return <span style={{ ...lado, display: "block", background: "var(--color-marca-fondo)", border: "2px solid var(--color-marca)", borderRadius: `${valor}px` }} />;
  }
  if (tipo === "sombra") {
    const lado = grande ? { width: 96, height: 56 } : { width: 22, height: 16 };
    return (
      <span style={{ display: "block", padding: grande ? "var(--esp-16)" : "var(--esp-4)", background: "var(--color-fondo-pantalla)", borderRadius: "var(--radio-chico)" }}>
        <span style={{ ...lado, display: "block", background: "var(--color-superficie)", borderRadius: "var(--radio-chico)", boxShadow: valor }} />
      </span>
    );
  }
  if (tipo === "espaciado") {
    const n = Math.abs(Number(valor));
    return (
      <span style={{ display: "flex", alignItems: "center", gap: "var(--esp-4)" }}>
        <span style={{ display: "block", width: Math.min(n, 200), maxWidth: "100%", height: grande ? 16 : 8, background: Number(valor) < 0 ? "var(--color-aviso)" : "var(--color-marca)" }} />
      </span>
    );
  }
  if (tipo === "movimiento") {
    if (valor.startsWith("cubic-bezier")) return <CurvaSvg valor={valor} lado={grande ? 64 : 22} />;
    const s = parseFloat(valor);
    return <span style={{ display: "block", width: Math.min(s * 100, 200), maxWidth: "100%", height: grande ? 16 : 8, background: "var(--color-info)" }} />;
  }
  // capa: no tiene muestra visual; el número es la muestra.
  return <span style={{ fontSize: grande ? "var(--tipo-paso-26)" : "var(--tipo-paso-12)", fontWeight: "var(--tipo-peso-900)" }}>{valor}</span>;
}

/** Los ficheros de una familia, sumando sus versiones, de más a menos usos. */
function ficherosDeFamilia(familia) {
  const suma = new Map();
  for (const v of familia.valores) for (const f of v.ficheros) suma.set(f.fichero, (suma.get(f.fichero) ?? 0) + f.usos);
  return [...suma].sort((a, b) => b[1] - a[1]);
}

function TarjetaFamilia({ tipo, familia }) {
  const ficheros = ficherosDeFamilia(familia);
  const n = familia.valores.length;
  return (
    <article style={S.tarjeta}>
      <Muestra tipo={tipo} valor={familia.representante} grande />
      <div style={S.valor}>{familia.representante}</div>
      <div style={S.cifra}>
        {familia.usos} usos · {n === 1 ? "1 versión" : `${n} versiones`} · {ficheros.length === 1 ? "1 fichero" : `${ficheros.length} ficheros`}
      </div>
      <span style={S.pasaA(Boolean(familia.token))}>
        {familia.token ? `Pasa a ${familia.token.nombre} (${familia.token.valor})` : "Sin token cercano"}
      </span>
      {n > 1 && (
        <div style={S.versiones} aria-label="Versiones de la familia">
          {familia.valores.map((v) => (
            <span key={v.valor} style={S.version} title={v.token ? `pasa a ${v.token.nombre}` : "sin token cercano"}>
              <Muestra tipo={tipo} valor={v.valor} />
              {v.valor} ×{v.usos}
            </span>
          ))}
        </div>
      )}
      <details style={S.detalles}>
        <summary style={S.resumen}>Dónde se usa</summary>
        <ul style={S.lista}>
          {ficheros.map(([f, u]) => (
            <li key={f}>
              {f} ×{u}
            </li>
          ))}
        </ul>
      </details>
    </article>
  );
}

export default function ComparadorDiseno() {
  const datos = useMemo(() => agruparBase(leerBase(base), valoresPlanos()), []);
  const [tipo, setTipo] = useState("color");
  const { familias } = datos.porTipo[tipo];
  const tokens = datos.tokens[tipo];
  const c = datos.cifras[tipo];

  return (
    <main style={S.pagina}>
      <h1 style={S.titulo}>Valores base de HoMenu</h1>
      <p style={S.nota}>
        Lo que hay hoy en el código (lint-tokens-base.json), agrupado en familias de valores casi iguales y frente a los tokens de tokens.js.
      </p>

      <div style={S.tablaCaja}>
        <table style={S.tabla}>
          <thead>
            <tr>
              <th style={S.celdaIzq}>Tipo</th>
              <th style={S.celda}>Valores distintos</th>
              <th style={S.celda}>Familias</th>
              <th style={S.celda}>Sin token cercano</th>
              <th style={S.celda}>Usos</th>
              <th style={S.celda}>Tokens hoy</th>
            </tr>
          </thead>
          <tbody>
            {TIPOS.map((t) => {
              const x = datos.cifras[t];
              return (
                <tr key={t}>
                  <th style={S.celdaIzq} scope="row">{NOMBRE[t]}</th>
                  <td style={S.celda}>{x.distintos}</td>
                  <td style={S.celda}>{x.familias}</td>
                  <td style={S.celda}>{x.sinToken}</td>
                  <td style={S.celda}>{x.usos}</td>
                  <td style={S.celda}>{x.tokens}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <nav style={S.tipos} aria-label="Tipo de valor">
        {TIPOS.map((t) => (
          <button key={t} type="button" aria-pressed={t === tipo} onClick={() => setTipo(t)} style={S.botonTipo(t === tipo)}>
            {NOMBRE[t]}
          </button>
        ))}
      </nav>

      <h2 style={S.subtitulo}>{NOMBRE[tipo]}</h2>
      <p style={S.nota}>
        {c.distintos} valores en {c.familias} familias; {c.sinToken} sin token cercano. Se juntan por {UMBRALES[tipo].medida}
        {UMBRALES[tipo].umbral !== 1 ? ` (umbral ${UMBRALES[tipo].umbral})` : ""}: {UMBRALES[tipo].porque}.
      </p>

      <section aria-label={`Tokens de ${NOMBRE[tipo]} hoy`}>
        <h3 style={{ ...S.subtitulo, fontSize: "var(--tipo-paso-14)" }}>Tokens de hoy ({tokens.length})</h3>
        <div style={S.tokensFila}>
          {tokens.map((t) => (
            <div key={t.nombre} style={S.tokenCaja}>
              <Muestra tipo={tipo} valor={t.valorBase} />
              <span style={{ fontWeight: "var(--tipo-peso-800)" }}>{t.nombre}</span>
              <span style={S.cifra}>{t.valorBase}</span>
            </div>
          ))}
        </div>
      </section>

      <section aria-label={`Familias de ${NOMBRE[tipo]}`} style={S.rejilla}>
        {familias.map((f) => (
          <TarjetaFamilia key={f.representante} tipo={tipo} familia={f} />
        ))}
      </section>
    </main>
  );
}
