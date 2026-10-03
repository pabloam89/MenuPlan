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
import { EU_ALLERGENS as DATOS } from "./allergensCore.js";

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

export * from "./allergensCore.js";
