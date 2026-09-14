import { createPortal } from "react-dom";
import { Chip } from "../ui.jsx";
import { Check, X } from "../icons.jsx";
import { SliderReparto } from "./SliderReparto.jsx";
import { SliderCocinas } from "./SliderCocinas.jsx";
import { Pista } from "./Pista.jsx";
import { estilosDePista } from "./pistaMotion.js";
import { CAMPOS_POR_ID } from "../../lib/notepadFields.js";

/**
 * La hoja que abre un botón de la fila de controles.
 *
 * Una sola hoja para los siete controles: qué se pinta dentro lo decide el
 * campo `control` de la fila del registro, no un `if` por pantalla. Añadir un
 * mando nuevo al menú es poner `enControles: true` en una fila; solo hace
 * falta tocar este fichero si el mando necesita un control que aún no existe.
 *
 * Es una bottom sheet del sistema de diseño (§8): fondo tintado, radio 20 20 0
 * 0, grabber, y respeta el safe area de iOS porque vive pegada abajo.
 */

// El teal de "esto está marcado". Es CARD_ACCENT_TEAL, el mismo que ya usan
// las tarjetas del wizard clásico (Onboarding.jsx), así que marcar algo se ve
// igual aquí que allí.
const TEAL = "#0f766e";

const ETIQUETA_ESFUERZO = { facil: "Fácil", rapido: "Rápido", elaborado: "Elaborado" };
const ETIQUETA_TECNICA = {
  horno: "Al horno", plancha: "A la plancha", sarten: "A la sartén",
  olla: "De cuchara", crudo: "En crudo",
};

/**
 * Una opción con su ilustración: cuadrada, redondeada, el dibujo dentro y el
 * nombre debajo. Misma forma que las baldosas de la fila de mandos, para que
 * abrir una no cambie de idioma visual.
 */
function Opcion({ arte, lleno, apaisado, etiqueta, detalle, activa, color = "#2d5a3d", onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: "relative",
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: lleno ? 0 : 6,
        // A sangre no hay padding arriba: la ilustración llega al borde y el
        // aire se lo queda solo el texto.
        padding: lleno ? (apaisado ? 0 : "0 0 8px") : "10px 6px",
        borderRadius: 16, overflow: "hidden",
        // El borde de lo elegido es TEAL y no el color del control: con siete
        // controles de siete colores, "elegido" acababa significando un color
        // distinto en cada hoja. Un solo color para "esto está marcado" se
        // aprende una vez.
        border: `2px solid ${activa ? TEAL : "#e8efe9"}`,
        background: activa ? "#fff" : "#fbfdfc",
        boxShadow: activa ? `0 6px 16px -8px ${color}80` : "none",
        cursor: "pointer", fontFamily: "inherit",
        transition: "border-color .2s, box-shadow .2s",
      }}
    >
      {/* El check no sustituye al borde: lo confirma. El borde se ve de lejos
          y dice cuál; el check dice QUÉ significa ese borde, que con una sola
          opción marcada no es obvio. Pequeño a propósito — la ilustración es
          lo que se ha venido a mirar. */}
      {activa && (
        <span
          style={{
            position: "absolute", top: 6, right: 6, zIndex: 1,
            width: 18, height: 18, borderRadius: "50%",
            background: TEAL, border: "1.5px solid #fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 1px 4px rgba(20,47,29,.25)",
          }}
        >
          <Check size={11} color="#fff" strokeWidth={3} />
        </span>
      )}
      {arte ? (
        <img
          src={arte}
          alt=""
          // Las cards de /avatares/cards traen su propio fondo: encogidas a
          // 44px dentro de un cuadrado blanco se veían como una foto pequeña y
          // suelta. Los recortes de /categories/cut sí flotan, que para eso
          // tienen transparencia.
          style={
            lleno
              ? {
                  width: "100%", objectFit: "cover", display: "block",
                  marginBottom: apaisado ? 0 : 6,
                  aspectRatio: apaisado ? "16 / 9" : "1 / 1",
                  // El 45% y no el 50%: cuando toca recortar, el centro se
                  // lleva por delante los platos, que en estas están abajo.
                  // Mismo ajuste que en el wizard clásico.
                  objectPosition: apaisado ? "center 45%" : "center",
                }
              : { width: 44, height: 44, objectFit: "contain" }
          }
        />
      ) : (
        <span style={{ width: 44, height: 44, borderRadius: 12, background: "#eef4f0" }} />
      )}
      {/* Apaisado: el texto va DENTRO, en una pastilla sobre la esquina. La
          ilustración es la que se ha venido a mirar, y dos filas de texto
          debajo de cada card la partían en dos objetos —foto y ficha— en vez
          de una tarjeta. Nombre y explicación en la MISMA línea, separados por
          un punto: son la misma frase ("Básico, lo justo y sin liarme"), y
          apilados parecían un título con su subtítulo, que pide leerse dos
          veces. Es la pastilla del wizard clásico (OnboardingCooking). */}
      {apaisado ? (
        <span
          style={{
            position: "absolute", left: 8, bottom: 8, maxWidth: "calc(100% - 16px)",
            display: "inline-flex", alignItems: "baseline", gap: 5,
            padding: "5px 10px", borderRadius: 999,
            background: activa ? TEAL : "rgba(255,255,255,.92)",
            boxShadow: "0 2px 8px -2px rgba(20,47,29,.35)",
            backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
            // Una línea y punto: si no cabe, se recorta antes que envolverse.
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 800, color: activa ? "#fff" : "#142f1d" }}>
            {etiqueta}
          </span>
          {detalle && (
            <span style={{ fontSize: 11, fontWeight: 600, color: activa ? "rgba(255,255,255,.82)" : "#7a9485" }}>
              · {detalle}
            </span>
          )}
        </span>
      ) : (
        <>
          <span
            style={{
              fontSize: 11.5, fontWeight: 800, textAlign: "center", lineHeight: 1.15,
              color: activa ? "#142f1d" : "#5a7066",
            }}
          >
            {etiqueta}
          </span>
          {detalle && (
            <span style={{ fontSize: 10.5, fontWeight: 600, color: "#7a9485", textAlign: "center", lineHeight: 1.15 }}>
              {detalle}
            </span>
          )}
        </>
      )}
    </button>
  );
}

/**
 * Rejilla de opciones ilustradas.
 *
 * Dos por fila hasta cuatro opciones, tres a partir de ahí. Con dos o cuatro
 * cards, tres columnas dejan un hueco suelto al final que se lee como que
 * falta algo; y a dos columnas la ilustración se ve al doble de tamaño, que es
 * justo lo que se ha venido a mirar.
 */
function Rejilla({ children, columnas }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))`, gap: 8 }}>
      {children}
    </div>
  );
}

const columnasPara = (n) => (n <= 4 ? 2 : 3);

/** Un eje de la libreta: marcado = "más de esto". */
function ChipsDeLibreta({ campo, etiquetas, sesgos, arteOpciones, arteLleno, color, onChange }) {
  const dominio = CAMPOS_POR_ID[campo]?.dominio ?? [];
  const alternar = (valor) =>
    onChange({ ...sesgos, [valor]: (sesgos?.[valor] ?? 0) > 0 ? 0 : 1 });

  // Con ilustraciones va la rejilla; sin ellas, los chips de siempre. No se
  // inventa un hueco gris por opción: media rejilla vacía se lee como rota.
  if (!arteOpciones) {
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {dominio.map((valor) => (
          <Chip
            key={valor}
            label={etiquetas?.[valor] ?? valor}
            selected={(sesgos?.[valor] ?? 0) > 0}
            onClick={() => alternar(valor)}
          />
        ))}
      </div>
    );
  }

  return (
    <Rejilla columnas={columnasPara(dominio.length)}>
      {dominio.map((valor) => (
        <Opcion
          key={valor}
          arte={arteOpciones[valor]}
          lleno={arteLleno}
          etiqueta={etiquetas?.[valor] ?? valor}
          activa={(sesgos?.[valor] ?? 0) > 0}
          color={color}
          onClick={() => alternar(valor)}
        />
      ))}
    </Rejilla>
  );
}

/** Selección múltiple sobre una lista de `data` (electrodomésticos). */
function ChipsDeData({ opciones, valor, arteOpciones, arteLleno, color, onChange }) {
  const puestos = valor ?? [];
  const alternar = (o) =>
    onChange(puestos.includes(o) ? puestos.filter((x) => x !== o) : [...puestos, o]);

  if (!arteOpciones) {
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {opciones.map((o) => (
          <Chip key={o} label={o} selected={puestos.includes(o)} onClick={() => alternar(o)} />
        ))}
      </div>
    );
  }

  return (
    <Rejilla columnas={columnasPara(opciones.length)}>
      {opciones.map((o) => (
        <Opcion
          key={o}
          arte={arteOpciones[o]}
          lleno={arteLleno}
          etiqueta={o}
          activa={puestos.includes(o)}
          color={color}
          onClick={() => alternar(o)}
        />
      ))}
    </Rejilla>
  );
}

/** Dos o tres caminos claros. Con ilustración, rejilla; sin ella, filas. */
function CardsAB({ opciones, valor, arteOpciones, arteLleno, arteApaisado, color, onChange }) {
  if (arteOpciones) {
    return (
      // El arte apaisado va en UNA columna: dos cards de 16:9 en 340px son dos
      // tiras de 80px de alto donde no se distingue qué pasa dentro.
      <Rejilla columnas={arteApaisado ? 1 : columnasPara(opciones.length)}>
        {opciones.map((o) => (
          <Opcion
            key={o.valor}
            arte={arteOpciones[o.valor]}
            lleno={arteLleno}
            apaisado={arteApaisado}
            etiqueta={o.etiqueta}
            detalle={o.detalle}
            activa={valor === o.valor}
            color={color}
            onClick={() => onChange(o.valor)}
          />
        ))}
      </Rejilla>
    );
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {opciones.map((o) => {
        const activa = valor === o.valor;
        return (
          <button
            key={o.valor}
            type="button"
            onClick={() => onChange(o.valor)}
            style={{
              textAlign: "left", padding: "12px 14px", borderRadius: 14,
              border: `1.5px solid ${activa ? "#2d5a3d" : "#e3ebe6"}`,
              background: activa ? "#eaf6ee" : "#fff",
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 800, color: activa ? "#2d5a3d" : "#1a3a24" }}>
              {o.etiqueta}
            </div>
            {o.detalle && (
              <div style={{ fontSize: 12, fontWeight: 600, color: "#7a9485", marginTop: 2 }}>
                {o.detalle}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Varias preguntas pequeñas en una hoja, cada una con su título.
 *
 * Los niños son tres decisiones que no se entienden por separado —comida entre
 * semana, cena, finde—: partirlas en tres baldosas habría llenado la fila de
 * "Niños 1/2/3", y contestar una sin ver las otras dos lleva a combinaciones
 * que nadie quería.
 */
function Grupo({ subejes, valor, onChange }) {
  const actual = valor ?? {};
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {subejes.map((eje) => (
        <div key={eje.campo}>
          <div
            style={{
              fontSize: 11, fontWeight: 800, letterSpacing: .5,
              textTransform: "uppercase", color: "#5a7066", margin: "0 2px 8px",
            }}
          >
            {eje.label}
          </div>
          {/* Las opciones con ilustración van en rejilla, como el resto de las
              hojas: los dibujos de niños que ya usa el wizard clásico dicen la
              diferencia entre "cenan lo mismo" y "cena aparte" mucho antes de
              que se lea la etiqueta. */}
          <Rejilla columnas={columnasPara(eje.opciones.length)}>
            {eje.opciones.map((o) => (
              <Opcion
                key={o.valor}
                arte={o.arte}
                lleno
                etiqueta={o.etiqueta}
                activa={actual[eje.campo] === o.valor}
                onClick={() => onChange({ ...actual, [eje.campo]: o.valor })}
              />
            ))}
          </Rejilla>
        </div>
      ))}
    </div>
  );
}

function Cuerpo({ pregunta, reparto, sesgos, valorData, movidas, porQue, onReparto, onSesgos, onData }) {
  switch (pregunta.control) {
    case "grupo":
      return <Grupo subejes={pregunta.subejes} valor={valorData} onChange={onData} />;
    case "reparto":
      return (
        <SliderReparto
          reparto={reparto}
          onChange={onReparto}
          movidasPorIA={movidas?.reparto ?? []}
          porQue={porQue}
        />
      );
    case "cocina":
      return (
        <SliderCocinas
          sesgos={sesgos?.cocina ?? {}}
          onChange={(v) => onSesgos("cocina", v)}
          movidasPorIA={movidas?.cocina ?? []}
          porQue={porQue}
        />
      );
    case "cards-ab":
      return (
        <CardsAB
          opciones={pregunta.opciones}
          valor={valorData}
          arteOpciones={pregunta.arteOpciones}
          arteLleno={pregunta.arteOpcionesLlenas}
          arteApaisado={pregunta.arteApaisado}
          color={pregunta.color}
          onChange={onData}
        />
      );
    case "multi":
      return (
        <ChipsDeData
          opciones={pregunta.opciones}
          valor={valorData}
          arteOpciones={pregunta.arteOpciones}
          arteLleno={pregunta.arteOpcionesLlenas}
          color={pregunta.color}
          onChange={onData}
        />
      );
    case "chips":
      return (
        <ChipsDeLibreta
          campo={pregunta.campo}
          etiquetas={pregunta.campo === "esfuerzo" ? ETIQUETA_ESFUERZO : ETIQUETA_TECNICA}
          sesgos={sesgos?.[pregunta.campo] ?? {}}
          arteOpciones={pregunta.arteOpciones}
          arteLleno={pregunta.arteOpcionesLlenas}
          color={pregunta.color}
          onChange={(v) => onSesgos(pregunta.campo, v)}
        />
      );
    case "slider": {
      const [min, max] = pregunta.rango ?? [0, 100];
      const actual = valorData ?? Math.round((min + max) / 2);
      return (
        <div style={{ background: "#fff", border: "1px solid #eef2ef", borderRadius: 16, padding: "14px 16px 10px" }}>
          <style>{estilosDePista()}</style>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#1a3a24" }}>{pregunta.corto}</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: "#2d5a3d", fontVariantNumeric: "tabular-nums" }}>
              {actual} {pregunta.unidad}
            </span>
          </div>
          <Pista
            valor={actual}
            min={min}
            max={max}
            step={pregunta.paso ?? 1}
            etiqueta={pregunta.corto}
            onChange={onData}
          />
        </div>
      );
    }
    default:
      // Una fila con un control que aún no existe se dice, no se traga: en
      // silencio, la hoja abriría vacía y parecería rota.
      return (
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#7a9485" }}>
          Este control todavía no está montado ({pregunta.control}).
        </p>
      );
  }
}

export function ControlSheet({ pregunta, onClose, ...resto }) {
  if (!pregunta) return null;

  return createPortal(
    <>
      <div
        className="mp-overlay-in"
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 300 }}
      />
      {/* Centrada, no pegada abajo: los sliders son el contenido y con la hoja
          abajo quedaban bajo el pulgar, tapados por la mano justo mientras se
          arrastran. Centrada se ven enteros y el dedo llega igual.

          El centrado lo hace un contenedor flex y NO un `translate(-50%,-50%)`
          sobre la tarjeta: `mp-sheet-up` anima `transform`, así que pisaba el
          translate y la hoja acababa 265px más abajo, saliéndose por el borde
          inferior. Con flex, ninguna animación del hijo puede descolocarla. */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 301,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 16, pointerEvents: "none",
        }}
      >
      <div
        className="mp-sheet-up"
        role="dialog"
        aria-label={pregunta.label}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 400, pointerEvents: "auto",
          background: "#f3f8f4", borderRadius: 26,
          border: "1px solid #e2ede5",
          boxShadow: "0 24px 60px rgba(0,0,0,.25)",
          padding: "18px 16px 16px",
          maxHeight: "80dvh", overflowY: "auto",
        }}
      >

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <h2 style={{ margin: 0, flex: 1, fontSize: 17, fontWeight: 900, color: "#142f1d" }}>
            {pregunta.label}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              width: 32, height: 32, borderRadius: "50%", border: "none",
              background: "#f0f4f1", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <X size={16} color="#5a7066" strokeWidth={2.4} />
          </button>
        </div>

        <Cuerpo pregunta={pregunta} {...resto} />

        {/* Aquí NO hay botón de rehacer. El ajuste se guarda al tocarlo y la
            regeneración se lanza UNA vez desde la barra de la fila, cuando el
            usuario ha terminado de tocar. Con un botón por hoja, cambiar tres
            cosas eran tres generaciones —tres esperas y tres menús que ver
            pasar— para llegar al mismo sitio. */}
      </div>
      </div>
    </>,
    document.body,
  );
}
