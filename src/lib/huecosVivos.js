import { createContext } from "react";

/**
 * Los huecos vacíos que el tablero ESTÁ PINTANDO ahora mismo, como lista de
 * { groupId, day, meal, course }. Es lo que cuenta la chapa de «Rellenar» y
 * lo que Rellenar rellena.
 *
 * Antes la chapa contaba por su cuenta sobre el plan entero —siete días,
 * todos los grupos, huecos que el tablero ni pinta— y salía 28 con seis
 * baldosas vacías a la vista (25 sep 2026). Y Rellenar sin lista llenaba
 * también lunes a jueves, que no estaban en pantalla. Contar y rellenar lo
 * mismo que se ve, y sacarlo de la misma función que decide qué baldosa sale
 * (`getDeckDayTiles`, en Menu.jsx), es lo único que mantiene las tres cosas
 * de acuerdo.
 *
 * Va por contexto y no por props porque los mandos de la pizarra llegan a
 * MenuScreen como un nodo ya montado desde App.jsx. Y en su propio fichero
 * porque Fast Refresh solo recarga en caliente los ficheros que exportan
 * componentes y nada más.
 */
export const HuecosVivosContext = createContext([]);
