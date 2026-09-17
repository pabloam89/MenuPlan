import { useState } from "react";
import {
  ChefHat, Clock, Flame, Globe, Microwave, MoreHorizontal, Scale, SlidersHorizontal,
  UtensilsCrossed, X, Zap,
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

/**
 * La forma de una baldosa: cuadrado de 56 con su nombre debajo.
 *
 * Se exporta porque las ACCIONES del menú —activar, favorito, publicar— se
 * despliegan en esta misma fila y tienen que ser la misma baldosa: si al
 * desplegarlas aparecieran pastillas, la fila cambiaría de idioma a mitad de
 * gesto. Lo único que cambia es el icono, que aquí va en vez de ilustración.
 *
 * ── Tres estados, y el de en medio es el normal ───────────────────────────
 * `marcado` es "esto está pendiente y te conviene tocarlo" —el aro y el color
 * propio, como el rayo de un menú sin activar—. `apagado` es lo contrario:
 * esa acción ya no está pendiente, porque ya está hecha (ya es favorito, ya
 * está publicado, ya se activó) o porque aquí no se puede hacer. En gris, y
 * sin aro.
 *
 * Apagada NO significa muerta: lo que se puede deshacer —quitar de favoritos,
 * volver a la hoja de publicar— sigue pulsando. Solo se bloquea lo que de
 * verdad no tiene nada que hacer, y entonces se pasa `onClick` a null.
 */
export function BaldosaAccion({
  Icono, etiqueta, color = VERDE, tinte = "#fff",
  marcado = false, apagado = false, onClick, title, ariaPressed,
}) {
  const tinta = apagado ? "#9ab0a1" : color;
  return (
    <button
      type="button"
      onClick={onClick ?? undefined}
      disabled={!onClick}
      title={title}
      aria-label={title ?? etiqueta}
      aria-pressed={ariaPressed}
      style={{
        flexShrink: 0, width: 76,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
        background: "none", border: "none", padding: 0,
        cursor: onClick ? "pointer" : "default", fontFamily: "inherit",
      }}
    >
      <span
        style={{
          width: 56, height: 56, borderRadius: 18,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: apagado ? "#eef2ef" : tinte,
          // Lo no marcado NO lleva borde, pero sí reserva su grosor en
          // transparente: sin eso la baldosa encoge 4px al marcarse y la fila
          // entera da un salto.
          border: marcado ? `2px solid ${tinta}` : "2px solid transparent",
          boxShadow: marcado
            ? `0 6px 16px -8px ${tinta}99`
            : apagado ? "none" : "0 2px 8px -4px rgba(20,47,29,.18)",
          transition: "box-shadow .2s, border-color .2s, background .2s",
        }}
      >
        <Icono size={24} color={tinta} strokeWidth={marcado ? 2.4 : 2} />
      </span>
      <span
        style={{
          fontSize: 11.5, fontWeight: 800, textAlign: "center", lineHeight: 1.15,
          color: apagado ? "#9aa89e" : marcado ? "#142f1d" : "#5a7066",
        }}
      >
        {etiqueta}
      </span>
    </button>
  );
}

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
  acciones = null, accionesAbiertas = false, onAccionesAbiertas, accionesAviso = false,
}) {
  const [abierta, setAbierta] = useState(null);
  const controles = controlesVisibles(notepad, data);
  if (controles.length === 0 && !acciones) return null;

  const pregunta = controles.find((p) => p.id === abierta) ?? null;
  const hayQueRehacer = tocados.size > 0 && Boolean(onAplicar);
  const conAcordeon = Boolean(acciones);

  return (
    <>
      {/* La franja lleva su propio fondo, un punto más oscuro que el blanco de
          la cabecera: sin él, las baldosas flotaban sobre el mismo blanco que
          el resto y no se leían como una barra de mandos. */}
      <div
        style={{
          // `stretch` y no `center`: la pestaña tiene que medir lo mismo que
          // la fila de baldosas, o se lee como un botón suelto flotando al
          // lado en vez de como la otra mitad de la misma franja.
          display: "flex", alignItems: "stretch",
          // Sangra hasta el borde: el contenedor de la cabecera ya mete 16px
          // de lado, y una franja de fondo cortada a 16px del borde parece un
          // recuadro suelto en vez de una barra.
          margin: "0 -16px",
          background: "#f4f8f5",
          borderTop: "1px solid #eef3f0",
          // Cuando la barra sale, la línea de abajo es la SUYA: si la llevaran
          // las dos, quedaba un filete gris cruzando el medio de la franja.
          borderBottom: hayQueRehacer ? "none" : "1px solid #eef3f0",
        }}
      >
        {/* ── El acordeón horizontal, como el de Gente ─────────────────
            Las otras acciones del menú —activar, favorito, el resto— viven
            plegadas asomando por el borde izquierdo, y comparten fila con las
            baldosas. Al desplegarse, las baldosas se pliegan en el mismo
            gesto y se cierra con la X del final.

            Son dos cosas que nunca se necesitan a la vez: o estás ajustando
            el menú o estás haciendo algo CON el menú. Así la cabecera no
            tiene que crecer para tener las dos, que es lo que pasaba en
            cuanto la semana traía su propio paso de semanas.

            Los dos paneles están siempre montados y lo que se anima es su
            reparto (`flex-grow`): desmontar uno daría el salto a mitad de
            animación. Y por defecto se ven las BALDOSAS — lo otro asoma. */}
        {/* ── El acordeón horizontal, como el de Gente ─────────────────
            Las acciones del menú viven plegadas asomando por el borde
            izquierdo y comparten fila con las baldosas: al desplegarse, las
            baldosas se pliegan en el mismo gesto. Son dos cosas que nunca se
            necesitan a la vez —o ajustas el menú o haces algo CON el menú— así
            que la cabecera no tiene que crecer para tener las dos.

            Los dos paneles están siempre montados y lo que se anima es su
            reparto (`flex-grow`): desmontar uno daría el salto a mitad de
            animación. Y por defecto se ven las BALDOSAS — lo otro asoma.

            ── Por qué la X no va al final ───────────────────────────────────
            Porque las acciones son más de las que caben y la tira scrollea. Un
            botón de cerrar al final del flex se va con el scroll —te quedas
            dentro sin poder salir, y sin poder salir no se llega a los
            mandos— y pinarlo a la derecha corta la tira antes del borde de la
            pantalla, que se ve como un recorte y no como una tira.

            Así que la cabecera de la pestaña ES el interruptor: fija a la
            izquierda, fuera del scroll, abre y cierra desde el mismo sitio. Y
            la tira usa todo lo que queda hasta el borde. */}
        {conAcordeon && (
          <div
            className="mp-hpanel"
            style={{
              // La base se queda fija y lo que se anima es cuánto crece:
              // interpolar de px a % no lo sabe hacer el navegador.
              flexBasis: 52, flexGrow: accionesAbiertas ? 1 : 0, flexShrink: 0,
              display: "flex", alignItems: "center", gap: 4,
              // Otro color: la franja es verde pálido y las baldosas blancas,
              // así que la pestaña en teja se lee como OTRA cosa sin tener que
              // explicarse. Es el mismo tono con el que Publicar asoma en Gente.
              background: accionesAviso && !accionesAbiertas ? "#fdf3df" : "#f6efe6",
              borderRadius: "0 18px 18px 0",
              paddingLeft: 14,
            }}
          >
            {/* Plegada asoma su icono; desplegada, la X. Mismo botón y mismo
                sitio: lo que abre esto es lo que lo cierra.

                Y lo que asoma es el RAYO si el menú está sin activar —ese
                aviso no puede quedarse detrás de un pliegue, que es justo para
                lo que está—. */}
            <button
              type="button"
              onClick={() => onAccionesAbiertas?.(!accionesAbiertas)}
              aria-expanded={accionesAbiertas}
              aria-label={accionesAbiertas ? "Cerrar" : "Otras acciones del menú"}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, width: 32, height: 32, borderRadius: 999,
                border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit",
                background: accionesAviso && !accionesAbiertas ? "#f8e3b0" : "rgba(178,98,47,.12)",
                transition: "background .2s ease",
              }}
            >
              {accionesAbiertas
                ? <X size={16} strokeWidth={2.8} color="#b2622f" />
                : accionesAviso
                  ? <Zap size={17} strokeWidth={2.5} color="#c9922a" fill="#f5d78a" />
                  : <MoreHorizontal size={18} strokeWidth={2.6} color="#b2622f" />}
            </button>

            {/* La tira. No se desmonta al plegar: se queda detrás del recorte y
                reaparece deslizándose. Montarla y desmontarla la haría aparecer
                de golpe a mitad de la animación. */}
            <div
              style={{
                display: "flex", alignItems: "center", gap: 4, flex: 1, minWidth: 0,
                overflowX: "auto", padding: "12px 4px 12px 2px",
                opacity: accionesAbiertas ? 1 : 0,
                pointerEvents: accionesAbiertas ? "auto" : "none",
                transition: "opacity .2s ease",
                scrollbarWidth: "none", msOverflowStyle: "none",
              }}
              aria-hidden={!accionesAbiertas}
              data-tira-acciones=""
            >
              {acciones}
            </div>
          </div>
        )}

        <div
          className="mp-hpanel"
          data-coach="wizard-controles"
          style={{
            display: "flex", gap: 4, overflowX: "auto",
            // Base 0 y todo el reparto por flex-grow, para que el gesto sea el
            // mismo número animándose en los dos paneles a la vez.
            flexBasis: 0,
            flexGrow: conAcordeon && accionesAbiertas ? 0 : 1,
            opacity: conAcordeon && accionesAbiertas ? 0 : 1,
            padding: "12px 16px",
            paddingLeft: conAcordeon ? 10 : 16,
            paddingBottom: hayQueRehacer ? 10 : 12,
            scrollbarWidth: "none", msOverflowStyle: "none",
          }}
          aria-hidden={conAcordeon && accionesAbiertas}
        >
          <style>{`[data-coach="wizard-controles"]::-webkit-scrollbar,
                   [data-tira-acciones]::-webkit-scrollbar { display: none; }`}</style>

          {controles.map((p) => (
            <Baldosa
              key={p.id}
              pregunta={p}
              tocado={tocados.has(p.id)}
              onClick={() => setAbierta(p.id)}
            />
          ))}
        </div>
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
