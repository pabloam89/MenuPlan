/**
 * Ejemplos del enrutador, etiquetados por Pablo (1 oct 2026): cómo escribe de
 * verdad una familia y qué modo toca. Van dentro de las REGLAS de router.js, y
 * sirven para dos cosas:
 *   · que Haiku distinga lo que más confunde: «qué hay» (consulta) frente a
 *     «qué le hago» (recomendar) frente a «pon otra cosa» (cambiar);
 *   · que las REGLAS pasen de 4.096 tokens, el mínimo para que Haiku 4.5 las
 *     cachee (antes eran 3.646 y no se cacheaban nunca).
 *
 * FRONTERA son los casos dudosos que decidió Pablo, con su porqué: esos son
 * los que más enseñan. Si se añade alguno, que lo decida una persona.
 */

export const EJEMPLOS = {
  consulta: [
    "¿qué cenamos hoy?", "qué toca mañana para comer", "¿qué hay el jueves?", "enséñame el menú de la semana",
    "qué comen los niños hoy", "¿qué hay hoy de cena para los niños?", "qué tenía puesto para el viernes por la noche",
    "menú de hoy porfa", "q hay de comer", "¿qué le toca al peque esta noche?", "¿qué comemos el finde?",
    "pásame lo de mañana", "¿qué hay de primero el martes?", "recuérdame qué cenábamos el miércoles",
    "¿cuál es la cena de pasado mañana?", "oye mira q me dices q toca pa la cena",
  ],
  recomendar: [
    "dame ideas para cenar", "¿qué me haces hoy que sea rapidito?", "algo ligero para esta noche",
    "no sé qué hacer de comer, ayúdame", "¿qué le preparo al bebé?", "una cena fácil para dos",
    "ideas para un táper para mañana", "algo con lo que tengo en la nevera", "sugiéreme un postre",
    "¿qué hago con el pollo que me sobró?", "algo de cuchara que hace frío", "¿alguna idea para la merienda de los niños?",
    "cena rápida que llego tarde", "algo sin horno para hoy", "dame opciones para la comida porfa q me quedo en blanco",
  ],
  cambiar: [
    "cambia la cena de hoy por algo de pescado", "el martes pon lentejas", "cámbiame lo de mañana a mediodía",
    "esta noche mejor una tortilla", "el viernes pizza casera", "pon otra cosa en la cena del miércoles",
    "lo del lunes no me cuadra, cámbialo", "sustituye el salmón por merluza", "cambia el primero del jueves por una crema",
    "mañana no me da tiempo de lo que hay, algo más rápido", "el sábado algo especial, que es mi cumple",
    "en vez de pasta pon arroz el martes", "la cena de los peques de hoy, otra cosa", "que la cena sea pescado hoy porfa",
  ],
  compra_anadir: [
    "apunta leche", "añade huevos y pan a la lista", "falta aceite", "pon yogures en la compra",
    "apúntame dos kilos de naranjas", "necesito papel de cocina", "se acabó el café", "compra tomates",
    "mete en la lista detergente y suavizante", "que no se me olvide el pan de molde", "añade fruta para los niños",
    "pon cebollas, ajos y pimientos", "nos hemos quedado sin leche", "pimientos cebollas y ajo porfa q lo necesito para esta noche",
  ],
  compra_marcar: [
    "ya compré los huevos", "tacha la leche", "he comprado todo lo de la carnicería", "el pan ya lo tengo",
    "marca como comprado el aceite", "ya fui al súper", "los yogures ya están", "quita de la lista lo que ya cogí: fruta y agua",
    "compra hecha", "lo del mercado ya está", "ya tengo los tomates", "he comprado todo menos el pescado", "listo q ya tengo la leche",
  ],
  generar: [
    "hazme el menú de la semana que viene", "genera un menú nuevo", "prepárame la semana", "menú para la próxima semana porfa",
    "¿me haces el menú de esta semana?", "rehaz la semana entera", "quiero un menú nuevo desde el lunes",
    "planifica la semana, que no tengo", "haz el menú de dos semanas", "otra semana distinta, esta no me gusta",
    "empieza un menú desde mañana", "menú semanal",
  ],
  deshacer: [
    "deshaz", "uy no, déjalo como estaba", "vuelve atrás", "me he equivocado, quita lo último", "no, no, el de antes",
    "anula eso", "lo que había antes estaba mejor", "ctrl z jaja",
  ],
  receta: [
    "¿cómo se hace la tortilla del miércoles?", "pásame la receta de la cena de hoy", "receta de las lentejas porfa",
    "cómo hago lo de mañana", "q lleva la crema de calabaza y cómo se hace",
  ],
  calorias: ["¿cuántas calorías tiene la cena de hoy?", "cuántas kcal tiene la lasaña", "¿engorda mucho lo de esta noche?"],
  falta: ["¿qué me falta para las lentejas?", "¿tengo todo para la cena de mañana?", "q necesito comprar para hacer la paella del sábado"],
  despensa: ["¿qué tengo en la despensa?", "qué queda en el congelador", "dime lo que hay en la nevera"],
  ausencia: ["hoy cenamos fuera", "el jueves no como en casa", "mañana no comemos en casa, estamos en el pueblo"],
  lola: [
    "¿lo de esta noche lleva horno?", "el sábado vienen mis suegros, ¿qué les pongo?", "cambia la cena de hoy y apunta lo que haga falta",
    "mi hija es celíaca", "los jueves comemos fuera", "pon el arroz el domingo en vez del sábado",
    "añade a la compra lo de la receta del jueves", "¿puede comer marisco mi hijo con dermatitis?", "no quiero cocinar este finde",
    "¿por qué me pones tanto pescado?", "gracias Lola!! 😊",
  ],
};

/** Los dudosos, decididos por Pablo, con el porqué. */
export const FRONTERA = [
  ["podemos hacer pizza casera el viernes?", "cambiar", "con el día basta; si falta comida o cena, se pregunta después"],
  ["q el jueves comida no xq no tengo tiempo, cámbialo", "ausencia", "ese día no come en casa, no es cambiar el plato"],
  ["q en lugar de lo q pusiste pues una tortilla esta noche xk?", "lola", "«xk?» es «¿por qué?»: pregunta por qué le pusieron tortilla"],
  ["quita porfa la lechuga del viernes q no les va", "cambiar", "no se cambia solo la guarnición: se cambia el plato entero"],
  ["quita las espinacas del jueves, que no les gustan", "cambiar", "igual: se cambia el plato entero"],
  ["q sea la carne el viernes en lugar del martes", "cambiar", "piden un TIPO de plato (carne) para el viernes; si no dicen comida o cena, falta el hueco"],
  ["tiras lista compra", "lola", "quiere vaciar la lista de la compra"],
  ["rapido porfa! q tengo poco tiempo", "lola", "falta qué comida; probablemente algo más rápido"],
  ["este finde me niego a pisar la cocina", "lola", "o no come en casa o quiere algo facilísimo: que lo pregunte Lola"],
  ["q la pasta a diario no puede ser", "lola", "queja de varios días + gusto (menos pasta)"],
  ["ala gracias eh", "lola", "sorna tras un fallo: Lola pide perdón y pregunta qué ha ido mal"],
];

/** El bloque de texto para las REGLAS. */
export function textoDeEjemplos(ejemplos = EJEMPLOS, frontera = FRONTERA) {
  const lineas = Object.entries(ejemplos).map(([modo, frases]) => `- ${modo}: ${frases.map((f) => `«${f}»`).join(" · ")}`);
  const dudas = frontera.map(([f, modo, porque]) => `- «${f}» → ${modo} (${porque})`);
  return `EJEMPLOS reales de cómo escriben las familias, con su modo:\n${lineas.join("\n")}\n\nCasos dudosos, ya decididos:\n${dudas.join("\n")}`;
}
