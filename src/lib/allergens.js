import {
  Bean,
  CircleDot,
  Egg,
  Fish,
  FlaskConical,
  Leaf,
  Milk,
  Nut,
  Shell,
  Shrimp,
  Sprout,
  Wheat,
  Wine,
} from "../components/icons.jsx";
import { EU_ALLERGENS as DATOS, resolveRecipeAllergens as resolverCon } from "./allergensCore.js";

const ICONOS = {
  gluten: Wheat,
  crustaceos: Shrimp,
  huevos: Egg,
  pescado: Fish,
  cacahuetes: Nut,
  soja: Bean,
  leche: Milk,
  frutos_cascara: Nut,
  apio: Leaf,
  mostaza: FlaskConical,
  sesamo: CircleDot,
  sulfitos: Wine,
  altramuces: Sprout,
  moluscos: Shell,
};

export const EU_ALLERGENS = Object.fromEntries(
  Object.entries(DATOS).map(([id, dato]) => [id, { ...dato, Icon: ICONOS[id] }]),
);

// Lo que lee EU_ALLERGENS tiene que leer ESTA tabla, la de los iconos. Un
// `export *` reexporta las funciones de allergensCore.js atadas a la suya, sin
// iconos: por eso se redefinen aquí (un export propio tapa al del `export *`).
/** @param {string[] | undefined} allergens */
export const resolveRecipeAllergens = (allergens) => resolverCon(allergens, EU_ALLERGENS);

export * from "./allergensCore.js";
