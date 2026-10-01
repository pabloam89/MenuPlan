// La libreta (data.notepad) proyectada a lo que lee el motor, y los ajustes
// del panel aplicados sobre ella. Funciones puras, compartidas por la fila de
// mandos de la app (components/wizard/useWizardMenu.jsx) y por el bot de
// Telegram (api/_bot/ajustes.js).
//
// Vivían dentro del hook, atadas a React. Se sacaron aquí el 30 sep 2026 para
// que decirle al bot "menos pescado" escriba EXACTAMENTE lo mismo que moverlo
// en la app. Código movido sin cambios de comportamiento.

import { aplicarOpcion } from "./panelParser.js";
import { poner, proyectar, valorDe, dependeDelDia, normalizar } from "./notepad.js";
import { hayTandasPedidas, abrirFindeParaTanda } from "./cookTime.js";
import { freqsEfectivos, presupuestoDeTopes, repartoConFreq, repartoVisible, rutaDeReparto } from "./reparto.js";
import { weeklySlotBudget } from "./planner.js";

/** El reparto que se ve (y que ajusta el panel), a partir de la libreta. */
export function repartoDeLaCasa(data, libreta) {
  const proyeccion = proyectar(libreta);
  return repartoVisible({
    freqs: { ...data?.freqs, ...proyeccion.freqs },
    reparto: proyeccion.reparto,
  });
}

/** `data` con la libreta nueva y su vista ya proyectada. */
export function dataConLibreta(data, libreta, { hoy } = {}) {
  const vista = proyectar(libreta, { hoy });
  return {
    ...data,
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
      { presupuesto: presupuestoDeTopes(weeklySlotBudget(data).total) },
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
}

/**
 * Aplica ajustes del panel (`AjusteSchema`) a la libreta de `data`.
 * @returns {{ libreta, tocadas: { reparto: string[], cocina: string[] } }}
 */
export function aplicarAjustes(data, libretaActual, ajustes, { frase, fecha, fuente, desde, hasta }) {
  let libreta = aplicarOpcion(libretaActual, { ajustes }, { frase, fecha, fuente, desde, hasta });
  const tocadas = { reparto: [], cocina: [] };
  let repartoNuevo = repartoDeLaCasa(data, libretaActual);

  for (const ajuste of ajustes ?? []) {
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
      libreta = poner(libreta, rutaDeReparto(familia), valor, { origen: "texto", frase, fecha, fuente, desde, hasta });
    }
  }
  return { libreta, tocadas };
}

/**
 * Pedir una tanda: `tanda.<base>` (sofrito, arroz…) o `tandaPlatos.<familia>`
 * (croquetas, cremas…) a `n` por semana; 0 la quita. Es lo que hacía a mano la
 * pantalla de bases (BasesPreferidas.jsx#escribir), sacado aquí el 1 oct 2026
 * para que pedirlo en el chat escriba EXACTAMENTE lo mismo que en la app.
 *
 * Lo pedido es DICHO (origen "pregunta"): una tanda es una petición con
 * consecuencias duras (regla 11b del validador), nunca una suposición.
 */
export function conTandaPedida(data, ruta, n) {
  const actual = normalizar(data?.notepad);
  const siguiente = poner(actual, ruta, n, { origen: "pregunta" });
  const vista = proyectar(siguiente);
  const conLibreta = {
    ...data,
    notepad: siguiente,
    sesgos: vista.sesgos ?? {},
    tanda: vista.tanda ?? {},
    tandaPlatos: vista.tandaPlatos ?? {},
  };
  // El día de la tanda necesita sitio, y pedir la primera es lo que lo pide.
  // Solo se toca el finde cuando CAMBIA el sí/no —de ninguna tanda a alguna, o
  // al revés— para no reescribir a cada arrastre un tiempo ajustado a mano.
  const antes = hayTandasPedidas(data);
  const ahora = hayTandasPedidas(conLibreta);
  return antes === ahora ? conLibreta : abrirFindeParaTanda(conLibreta, ahora);
}

/**
 * `data` con la vista recalculada para el día `hoy`, si la libreta tiene algo
 * que dependa del día (desde/hasta, o algo supuesto que caduca). Sin eso, la
 * vista que se guardó al escribir sigue valiendo y se devuelve `data` tal cual:
 * a las casas de siempre no les cambia nada.
 */
export function dataVigente(data, hoy) {
  if (!hoy || !data?.notepad || !dependeDelDia(data.notepad)) return data;
  return dataConLibreta(data, data.notepad, { hoy });
}
