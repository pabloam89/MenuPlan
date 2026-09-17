import { useCallback, useMemo, useState } from "react";
import { ControlRow } from "./ControlRow.jsx";
// PanelCoach ya no se monta aquí: la burbuja está apagada (ver el `bubble: null`
// de abajo). El componente sigue existiendo y se puede volver a montar con los
// dos cabos que devuelve este hook en `panel`.
import { normalizar as normalizarLibreta, poner, porQue, proyectar, valorDe } from "../../lib/notepad.js";
import { freqsEfectivos, repartoConFreq, repartoVisible, rutaDeReparto } from "../../lib/reparto.js";
import { weeklySlotBudget } from "../../lib/planner.js";
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

  /** Guarda una libreta nueva en `data`, con su vista ya proyectada. */
  const guardar = useCallback((libreta, extra = {}) => {
    const vista = proyectar(libreta);
    const siguiente = {
      ...data,
      ...extra,
      notepad: libreta,
      // El motor sigue leyendo `data.freqs`: la libreta es la fuente, esto es
      // la vista que ella misma calcula.
      //
      // Solo entran los pedidos A MANO (`vista.freqs`, las claves `freqs.*` de
      // la libreta). Antes entraba también `data.freqs` en bloque, y como un
      // estilo de comida escribe ahí las seis familias, el reparto se quedaba
      // sin efecto: movías el deslizador y salía el estilo otra vez. Ver
      // `freqsEfectivos`.
      freqs: freqsEfectivos(
        { freqs: vista.freqs, reparto: vista.reparto },
        { presupuesto: weeklySlotBudget(data).total },
      ),
      // Los dos ejes SIN fundir, para que el motor pueda rehacer la proyección
      // con los huecos reales de cada grupo y cada semana (`ctx.slots.length`).
      // `data.freqs` de aquí arriba es solo la vista para pintar: usa una
      // estimación de la casa entera, que no distingue el menú de los niños del
      // de los adultos ni una semana partida de una completa.
      reparto: vista.reparto ?? {},
      freqsPedidos: vista.freqs ?? {},
      // Y `data.cocinas`, por el mismo camino: cuántos platos de cada cocina
      // extranjera quiere la casa. Lo lee `filterRecipes` como puerta de
      // entrada (las que están a cero no entran) y el prompt del planner como
      // cuota. Se proyecta aquí y no se lee de la libreta en el motor, para que
      // aiPlanner siga sin saber que la libreta existe.
      cocinas: vista.sesgos?.cocina ?? {},
      // Y el resto de la proyección, por el mismo camino y por el mismo
      // motivo. Hasta el 11 sep 2026 `sesgos` (tecnica, salsa, base),
      // `favoritos` y `excluidos` se calculaban aquí y morían en la UI: el
      // usuario pedía "más horno" o "nada de coliflor" y el menú salía igual.
      // Ahora los lee aiPlanner —excluidos se suma a los dislikes; sesgos y
      // favoritos ordenan candidatos vía lib/sesgos.js— sin saber que la
      // libreta existe.
      sesgos: vista.sesgos ?? {},
      // Las tandas pedidas, aparte de los sesgos: es una CUENTA que el validador
      // exige como minimo (regla 11b), no una preferencia que ordena candidatos.
      tanda: vista.tanda ?? {},
      favoritos: vista.favoritos ?? [],
      excluidos: vista.excluidos ?? [],
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
    return { controls: null, bubble: null, panel: null };
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

    // ── La burbuja, apagada (17 sep 2026) ────────────────────────────────
    //
    // Decisión de producto de Pablo: metía demasiado ruido sobre el menú. No se
    // borra nada —`PanelCoach`, `panelParser`, `panelSuggestions` y el prompt
    // del panel siguen enteros— porque queda pendiente decidir si vuelve como
    // un control más de la fila en vez de como una burbuja suelta.
    //
    // Lo que se lleva por delante mientras esté apagada, para que no sorprenda:
    //
    //   · `excluidos` y `favoritos` se quedan SIN NINGÚN ESCRITOR. Son los dos
    //     únicos ejes de la libreta que no tienen deslizador propio (los demás
    //     —cocina, tecnica, salsa, base— se tocan desde ControlSheet). O sea que
    //     hasta que exista una pantalla de "qué no queréis ver", nadie puede
    //     decir "nada de coliflor" salvo una regla temporal.
    //   · Con ella se va también el principal escritor de un `1` en el eje
    //     `base`, que era lo que convertía "más pasta" en una tanda obligatoria
    //     de dos platos (ver `basesPedidas` en lib/bases.js). El campo sigue
    //     teniendo dos significados y hay que separarlo igual, porque
    //     `reglas.js` puede escribirlo por su cuenta — solo baja la urgencia.
    bubble: null,

    // Los dos cabos de la burbuja, servidos sin pintar nada: consultar al
    // modelo y aplicar la opción elegida. Se devuelven en vez de dejarlos
    // muertos dentro del hook para que volver a encenderla sea montar un
    // `<PanelCoach onConsultar={panel.consultar} onAplicar={panel.aplicar} />`
    // donde se decida, y para que el camino siga siendo visible desde fuera.
    panel: { consultar: consultarPanel, aplicar: aplicarPanel },
  };
}
