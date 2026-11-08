/**
 * Examen APARTE del buscador de recetas. No lo leas si estás diseñando o
 * ajustando el buscador: solo sirve para la nota final.
 */

const sin = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
const lleva = (r, re) => (r.ingredients ?? []).some((i) => re.test(sin(i?.name)));

// APARTE: preguntas que NO se usaron para diseñar el buscador híbrido ni sus
// reglas de rasgos. Solo para la nota final: si se ajusta algo mirándolas,
// dejan de medir y hay que escribir otras.
export const APARTE = [
  ["un caldito calentito que hace un frío que pela", (r) => r.textura === "cuchara" && r.temperatura === "caliente"],
  ["algo que no engorde mucho", (r) => r.caloriasNivel === "ligero"],
  ["un plato de los que te dejan lleno para toda la tarde", (r) => r.caloriasNivel === "contundente" || (r.mealRole ?? []).includes("plato_unico")],
  ["algo para mojar pan", (r) => r.textura === "cuchara" || r.tecnica === "olla"],
  ["tapas para una cena con amigos", (r) => r.textura === "mano" || r.connotacion?.includes("festivo")],
  ["algo frío que no hay quien encienda el fuego con este calor", (r) => r.temperatura === "frio" || r.tecnica === "crudo"],
  ["algo de pescado que no sea complicado", (r) => r.category === "pescados" && r.difficulty === "facil"],
  ["comida para un niño de dos años", (r) => r.kidFriendly || r.category === "bebes"],
  ["algo en menos de un cuarto de hora", (r) => r.time <= 15],
  ["un plato para Navidad", (r) => r.connotacion?.includes("festivo") || r.occasion === "especial"],
  ["algo con atún de lata", (r) => lleva(r, /\batun\b/)],
  ["un primero de verdura", (r) => r.category === "ensaladas_verduras" || r.category === "sopas_cremas"],
  ["algo al horno que me lo hago mientras tiendo", (r) => r.tecnica === "horno"],
  ["unos macarrones o algo así", (r) => r.mainBase === "pasta"],
  ["algo con patata", (r) => lleva(r, /\bpatatas?\b/) || r.mainBase === "patatas"],
  ["algo que pueda dejar hecho el domingo para toda la semana", (r) => r.tupperFriendly || r.freezable],
  ["una cena de tenedor rápida", (r) => r.textura === "tenedor" && r.time <= 25],
  ["algo de carne para el finde", (r) => r.category === "carnes"],
  ["un bizcocho o algo dulce", (r) => r.category === "postres" || r.category === "desayunos" || r.sabor?.includes("dulce")],
  ["lentejas como las de mi madre", (r) => lleva(r, /\blentejas?\b/)],
  ["algo con sabor fuerte", (r) => r.sabor?.includes("intenso") || r.sabor?.includes("especiado")],
  ["comida barata para muchos", (r) => r.costeNivel === "economico"],
  ["algo crudito, tipo ensalada o carpaccio", (r) => r.tecnica === "crudo"],
  ["un plato con huevo para la cena", (r) => r.category === "huevos" || lleva(r, /\bhuevos?\b/)],
];
export const APARTE_NEGACIONES = [
  ["algo que no lleve huevo", (r) => r.category !== "huevos" && !lleva(r, /\bhuevos?\b/)],
  ["nada de legumbres hoy", (r) => r.category !== "legumbres" && r.mainBase !== "legumbre"],
  ["cena sin fritos", (r) => r.tecnica !== "sarten"],
];

