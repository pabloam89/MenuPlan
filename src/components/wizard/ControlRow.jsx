import { useState } from "react";
import {
  ChefHat, Clock, Flame, Globe, Microwave, Scale, SlidersHorizontal, UtensilsCrossed,
} from "../icons.jsx";
import { controlesVisibles, valorDePregunta } from "../../lib/wizardRegistry.js";
import { BarraRehacer } from "./BarraRehacer.jsx";
import { ControlSheet } from "./ControlSheet.jsx";

/**
 * La fila de mandos que vive sobre el menú.
 *
 * ── Sale del registro, no de aquí ─────────────────────────────────────────
 * Los botones son las filas de `wizardRegistry.js` con `enControles: true`,
 * filtradas por sus dependencias igual que el resto del wizard. Así, un mando
 * cuyo requisito no está resuelto no se pinta —en vez de abrir una hoja que no
 * puede hacer nada— y añadir un mando nuevo es una fila, no un componente.
 *
 * ── Baldosa cuadrada, nombre debajo, y nada más ───────────────────────────
 * No se dice qué hay marcado. Con siete pastillas contando su valor, la fila
 * se leía como una tabla de ajustes y competía con el menú, que es lo que se
 * ha venido a mirar. Lo que hay puesto se lee dentro, al abrirla.
 *
 * ── El aro teal es "esto entra en el próximo menú" ────────────────────────
 * Y nada más. Antes marcaba "este eje tiene valor", que sonaba parecido y no
 * lo era: Platos, Tiempo y Esfuerzo SIEMPRE tienen valor —traen el de por
 * defecto de la app— así que nacían con el aro puesto sin que nadie los
 * hubiera tocado, y al lado Reparto o Cocina aparecían sin él. Con tres
 * baldosas marcadas de fábrica, el aro no significaba nada.
 *
 * Ahora el aro es exactamente lo que cuenta la barra de abajo: lo que has
 * cambiado y aún no se ha aplicado. Se enciende al tocar, se apaga al rehacer,
 * y de un vistazo se ve de dónde salen los "3 cambios".
 *
 * ── Por qué scroll horizontal y no un desplegable ─────────────────────────
 * Son siete y la columna son 420px. Un "Ajustes" los escondería todos detrás
 * de un toque, y el objetivo es justo lo contrario: que se vea que el menú se
 * puede tocar. Se ven cuatro y pico, suficiente para leerlo como fila.
 */

// El icono va como NOMBRE en el registro (que es lógica y no arrastra JSX) y
// se resuelve aquí. Solo se usa donde no hay una ilustración del eje.
const ICONOS = {
  Scale,
  Globe,
  UtensilsCrossed,
  Flame,
  Clock,
  ChefHat,
  Microwave,
  SlidersHorizontal,
};

const VERDE = "#2d5a3d";

// El mismo teal que marca lo elegido dentro de las hojas (ControlSheet) y que
// ya usan las tarjetas del wizard clásico. "Marcado" tiene que verse igual en
// los tres sitios o deja de leerse como un estado y pasa a ser decoración.
const TEAL = "#0f766e";

function Baldosa({ pregunta, tocado, onClick }) {
  const Icono = ICONOS[pregunta.icono] ?? SlidersHorizontal;
  const color = pregunta.color ?? VERDE;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flexShrink: 0, width: 76,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
        background: "none", border: "none", padding: 0,
        cursor: "pointer", fontFamily: "inherit",
      }}
    >
      <span
        style={{
          width: 56, height: 56, borderRadius: 18,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "#fff",
          // Solo lo que has cambiado desde el último menú lleva aro, y el aro
          // es TEAL — el mismo que marca lo elegido dentro de las hojas. Un
          // solo color para "esto está tocado" se aprende una vez; con el
          // color propio de cada control, "tocado" significaba siete colores
          // distintos.
          //
          // Lo no tocado NO lleva borde, pero sí reserva su grosor en
          // transparente: con `border: none` la baldosa encoge 4px al marcarse
          // y la fila entera da un salto.
          border: tocado ? `2px solid ${TEAL}` : "2px solid transparent",
          boxShadow: tocado
            ? `0 6px 16px -8px ${TEAL}99`
            : "0 2px 8px -4px rgba(20,47,29,.18)",
          transition: "box-shadow .2s, border-color .2s",
        }}
      >
        {pregunta.arte ? (
          // Siempre recorte flotando con aire alrededor, nunca una card a
          // sangre: la fila es de un solo tipo de imagen. Ver el registro.
          <img src={pregunta.arte} alt="" style={{ width: 34, height: 34, objectFit: "contain" }} />
        ) : (
          <Icono size={24} color={color} strokeWidth={tocado ? 2.4 : 2} />
        )}
      </span>

      <span
        style={{
          fontSize: 11.5, fontWeight: 800, textAlign: "center", lineHeight: 1.15,
          color: tocado ? "#142f1d" : "#5a7066",
        }}
      >
        {pregunta.corto}
      </span>
    </button>
  );
}

export function ControlRow({
  data, notepad, reparto, sesgos, movidas, porQue,
  onReparto, onSesgos, onData, onAplicar, tocados = new Set(),
}) {
  const [abierta, setAbierta] = useState(null);
  const controles = controlesVisibles(notepad, data);
  if (controles.length === 0) return null;

  const pregunta = controles.find((p) => p.id === abierta) ?? null;
  const hayQueRehacer = tocados.size > 0 && Boolean(onAplicar);

  return (
    <>
      {/* La franja lleva su propio fondo, un punto más oscuro que el blanco de
          la cabecera: sin él, las baldosas flotaban sobre el mismo blanco que
          el resto y no se leían como una barra de mandos. */}
      <div
        data-coach="wizard-controles"
        style={{
          display: "flex", gap: 4, overflowX: "auto",
          // Sangra hasta el borde: el contenedor de la cabecera ya mete 16px
          // de lado, y una franja de fondo cortada a 16px del borde parece un
          // recuadro suelto en vez de una barra.
          margin: "0 -16px", padding: "12px 16px",
          background: "#f4f8f5",
          borderTop: "1px solid #eef3f0",
          // Cuando la barra sale, la línea de abajo es la SUYA: si la llevaran
          // las dos, quedaba un filete gris cruzando el medio de la franja.
          borderBottom: hayQueRehacer ? "none" : "1px solid #eef3f0",
          paddingBottom: hayQueRehacer ? 10 : 12,
          scrollbarWidth: "none", msOverflowStyle: "none",
        }}
      >
        <style>{`[data-coach="wizard-controles"]::-webkit-scrollbar { display: none; }`}</style>

        {controles.map((p) => (
          <Baldosa
            key={p.id}
            pregunta={p}
            tocado={tocados.has(p.id)}
            onClick={() => setAbierta(p.id)}
          />
        ))}
      </div>

      {/* Una sola barra para toda la fila, y solo cuando hay algo que rehacer.
          Tocar tres mandos son tres cambios y UNA generación: con un botón por
          hoja eran tres esperas y tres menús que ver pasar para llegar al mismo
          sitio. Y mientras no toques nada, la barra no existe: no hay un botón
          permanente invitando a gastar una llamada. */}
      {hayQueRehacer && <BarraRehacer pendientes={tocados.size} onAplicar={onAplicar} />}

      <ControlSheet
        pregunta={pregunta}
        onClose={() => setAbierta(null)}
        reparto={reparto}
        sesgos={sesgos}
        valorData={pregunta ? valorDePregunta(pregunta, notepad, data) : null}
        movidas={movidas}
        porQue={porQue}
        onReparto={onReparto}
        onSesgos={onSesgos}
        onData={(valor) => pregunta && onData(pregunta, valor)}
      />
    </>
  );
}
