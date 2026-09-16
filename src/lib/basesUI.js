/**
 * Cómo se enseña cada base: su etiqueta y qué dibujo la representa.
 *
 * Vive en su propio fichero porque lo usan DOS sitios —el selector del
 * onboarding y la ficha del plato cuando marcas "ya la tengo hecha"— y
 * duplicarlo era garantizar que algún día enseñaran cosas distintas para la
 * misma base.
 *
 * El id del eje y lo que el usuario reconoce no son lo mismo: el eje se llama
 * `legumbre` y lo que se reconoce de un vistazo es un garbanzo. Por eso la
 * etiqueta y el nombre del dibujo van por separado de la clave.
 *
 * Las ilustraciones salen de `ingredientThumbSrc`, o sea el MISMO resolvedor
 * que usa Añadir ingredientes.
 */
export const BASES_UI = {
  sofrito: { etiqueta: "Sofrito", foto: "sofrito" },
  verdura_asada: { etiqueta: "Verdura asada", foto: "verduras asadas" },
  patatas_asadas: { etiqueta: "Patata asada", foto: "patatas asadas" },
  salsa_tomate: { etiqueta: "Tomate", foto: "tomate frito" },
  bechamel: { etiqueta: "Bechamel", foto: "bechamel" },
  pesto: { etiqueta: "Pesto", foto: "pesto" },
  caldo: { etiqueta: "Caldo", foto: "caldo de pollo" },
  arroz: { etiqueta: "Arroz", foto: "arroz" },
  pasta: { etiqueta: "Pasta", foto: "pasta corta" },
  patatas: { etiqueta: "Patatas", foto: "patata" },
  boniato: { etiqueta: "Boniato", foto: "boniato" },
  legumbre: { etiqueta: "Garbanzos", foto: "garbanzos" },
  quinoa: { etiqueta: "Quinoa", foto: "quinoa" },
  cuscus: { etiqueta: "Cuscús", foto: "cuscus" },
};
