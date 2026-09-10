import { useCallback, useMemo, useState } from "react";
import { ControlRow } from "./ControlRow.jsx";
import { PanelCoach } from "../PanelCoach.jsx";
import { normalizar as normalizarLibreta, poner, porQue, proyectar, valorDe } from "../../lib/notepad.js";
import { freqsEfectivos, repartoConFreq, repartoVisible, rutaDeReparto } from "../../lib/reparto.js";
import { recuentoDelMenu } from "../../lib/menuRecuento.js";
import { contextoParaElModelo } from "../../lib/panelSuggestions.js";
import { aplicarOpcion, respuestaDeGuarda, validarRespuesta } from "../../lib/panelParser.js";
import { recipeCatalogById } from "../../data/recipeCatalog.js";

/**
 * Todo el wizard generativo, enganchado al menú de siempre.
 *
 * ── Por qué un hook y no una pantalla ─────────────────────────────────────
 * El menú no cambia: es el mismo `MenuScreen`, el mismo deck y el mismo
 * `GeneratingScreen`. Lo que se le añade son dos nodos —la fila de mandos y la
 * burbuja del bot— que comparten un estado y viven en sitios distintos del
 * árbol. Un hook que devuelve los dos deja el diff de App.jsx en unas pocas
 * líneas y se quita de en medio de un tirón.
 *
 * Hubo un tercero, un modal de voz o texto que abría "Generar menú". Se quitó:
 * ese botón entra al asistente de pantallas, que es donde están las preguntas
 * que el motor necesita. Ver lib/wizardServices.js.
 *
 * ── La libreta vive en `data` ─────────────────────────────────────────────
 * En `data.notepad`, para que la persistan `saveState` y el espejo de Supabase
 * como todo lo demás, sin código nuevo. Lo que ve el planner sigue siendo
 * `data.freqs`: la libreta se PROYECTA a freqs al generar (ver `proyectar` y
 * `freqsEfectivos`), así que el motor no se entera de que esto existe.
 *
 * ── Quién regenera y quién no ─────────────────────────────────────────────
 * El bot SÍ: pedirle "menos pescado" y que no cambie nada sería no cumplir lo
 * único que promete. Un slider a mano NO, en cada arrastre: serían decenas de
 * llamadas mientras el dedo se mueve. El ajuste se guarda al momento y la hoja
 * lleva un botón para rehacer el menú cuando el usuario termine.
 */
export function useWizardMenu({ data, setData, menuPlan, onRegenerar, habilitado = true }) {
  // Qué acaba de mover el bot, para que el control se anime en vez de saltar.
  const [movidas, setMovidas] = useState({ reparto: [], cocina: [] });
  const [explicacion, setExplicacion] = useState(null);
  // Los ejes tocados desde la última generación. Es un Set y no un contador
  // porque mover el mismo slider cinco veces es UN cambio, no cinco.
  const [pendientes, setPendientes] = useState(() => new Set());

  const marcarPendiente = useCallback((id) => {
    setPendientes((p) => (p.has(id) ? p : new Set(p).add(id)));
  }, []);

  const notepad = useMemo(() => normalizarLibreta(data?.notepad), [data?.notepad]);
  const proyeccion = useMemo(() => proyectar(notepad), [notepad]);

  const reparto = useMemo(
    () => repartoVisible({
      freqs: { ...data?.freqs, ...proyeccion.freqs },
      reparto: proyeccion.reparto,
    }),
    [data?.freqs, proyeccion.freqs, proyeccion.reparto],
  );

  const recuento = useMemo(() => recuentoDelMenu(menuPlan, recipeCatalogById), [menuPlan]);

  /** Guarda una libreta nueva en `data`, con sus freqs ya proyectados. */
  const guardar = useCallback((libreta, extra = {}) => {
    const vista = proyectar(libreta);
    const siguiente = {
      ...data,
      ...extra,
      notepad: libreta,
      // El motor sigue leyendo `data.freqs`: la libreta es la fuente, esto es
      // la vista que ella misma calcula.
      freqs: freqsEfectivos({ freqs: { ...data?.freqs, ...vista.freqs }, reparto: vista.reparto }),
    };
    setData(siguiente);
    return siguiente;
  }, [data, setData]);

  // ── Los tres caminos que escriben en la libreta ──────────────────────────

  const onReparto = useCallback((nuevo) => {
    let libreta = notepad;
    for (const [familia, valor] of Object.entries(nuevo)) {
      libreta = poner(libreta, rutaDeReparto(familia), valor, { origen: "pregunta", confirmado: true });
    }
    guardar(libreta);
    marcarPendiente("reparto");
  }, [notepad, guardar, marcarPendiente]);

  const onSesgos = useCallback((campo, nuevo) => {
    let libreta = notepad;
    for (const [valor, peso] of Object.entries(nuevo)) {
      libreta = poner(libreta, `${campo}.${valor}`, peso, { origen: "pregunta", confirmado: true });
    }
    guardar(libreta);
    marcarPendiente(campo);
  }, [notepad, guardar, marcarPendiente]);

  const onData = useCallback((pregunta, valor) => {
    if (!pregunta?.escribe) return;
    setData((d) => pregunta.escribe(d, valor));
    marcarPendiente(pregunta.id);
  }, [setData, marcarPendiente]);

  // ── El bot, sobre la misma libreta ───────────────────────────────────────

  const consultarPanel = useCallback(async (frase) => {
    const guarda = respuestaDeGuarda(frase);
    if (guarda) return guarda;
    try {
      const { serviciosReales } = await import("../../lib/wizardServices.js");
      // El menú actual viaja CON la frase. El prompt del panel pide "di
      // siempre de dónde partes, con el dato del menú actual que te doy", así
      // que sin esto el modelo no puede contestar "ahora hay pescado dos veces
      // por semana" — se lo inventaría o se callaría el número, que es justo
      // lo que hace útil la respuesta.
      const contexto = contextoParaElModelo(recuento, notepad);
      return validarRespuesta(await serviciosReales().consultarPanel(`${contexto}\n\n${frase}`));
    } catch {
      // Una respuesta ilegible es "no te he entendido", no un error en
      // pantalla: el usuario escribió bien, el que falló fue el modelo.
      return validarRespuesta(null);
    }
  }, [recuento, notepad]);

  const aplicarPanel = useCallback((opcion, frase) => {
    const fecha = new Date().toISOString().slice(0, 10);
    let libreta = aplicarOpcion(notepad, opcion, { frase, fecha });
    const tocadas = { reparto: [], cocina: [] };
    let repartoNuevo = reparto;

    for (const ajuste of opcion?.ajustes ?? []) {
      if (ajuste.campo === "freqs") {
        // El bot habla en veces por semana —como habla la gente— y el slider
        // en porcentajes de suma fija. Sin traducirlo aquí, pedirlo por voz
        // cambiaría el número por dentro y en pantalla no se movería nada.
        tocadas.reparto.push(ajuste.valor);
        const veces = valorDe(libreta, `freqs.${ajuste.valor}`, null);
        if (veces != null) repartoNuevo = repartoConFreq(repartoNuevo, ajuste.valor, veces);
      }
      if (ajuste.campo === "reparto") tocadas.reparto.push(ajuste.valor);
      if (ajuste.campo === "cocina") tocadas.cocina.push(ajuste.valor);
    }

    if (tocadas.reparto.length > 0) {
      for (const [familia, valor] of Object.entries(repartoNuevo)) {
        libreta = poner(libreta, rutaDeReparto(familia), valor, { origen: "texto", frase, fecha });
      }
    }

    setMovidas(tocadas);
    const primera = tocadas.reparto[0] ?? tocadas.cocina[0];
    const ruta = tocadas.reparto[0]
      ? rutaDeReparto(tocadas.reparto[0])
      : primera ? `cocina.${primera}` : null;
    // El microtexto sale de la procedencia que la libreta ya guarda, así que
    // no hay que pedirle al modelo que lo redacte.
    setExplicacion(ruta ? porQue(libreta, ruta) : null);

    const siguiente = guardar(libreta);
    setPendientes(new Set());
    onRegenerar?.(siguiente);
  }, [notepad, reparto, guardar, onRegenerar]);

  if (!habilitado) {
    return { controls: null, bubble: null };
  }

  return {
    controls: (
      <ControlRow
        data={data}
        notepad={notepad}
        reparto={reparto}
        sesgos={proyeccion.sesgos}
        movidas={movidas}
        porQue={explicacion}
        onReparto={onReparto}
        onSesgos={onSesgos}
        onData={onData}
        tocados={pendientes}
        onAplicar={() => { setPendientes(new Set()); onRegenerar?.(); }}
      />
    ),

    bubble: (
      <div data-coach="wizard-bot">
        <PanelCoach
          // Sin sugerencias a propósito: el reparto, la cocina y el tiempo
          // están a un toque en la fila de arriba, así que cuatro tarjetas
          // proponiendo lo mismo competirían con ellos. Aquí queda lo único que
          // un control no sabe hacer — entender una frase.
          sugerencias={[]}
          titulo="¿Afinamos algo?"
          notepad={notepad}
          onConsultar={consultarPanel}
          onAplicar={aplicarPanel}
        />
      </div>
    ),
  };
}
