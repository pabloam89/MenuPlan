/**
 * axis-coverage.mjs
 *
 * ¿Puede el catálogo SERVIR cada petición que el agente sabe entender?
 *
 * Un eje no vale por existir: vale si, cuando alguien pide "más asiático", hay
 * recetas suficientes para llenar los huecos de un menú sin repetir plato. Un
 * eje con 8 recetas se entiende igual de bien y produce el mismo hummus dos
 * días seguidos que ya nos costó una regla nueva.
 *
 * Así que esto no mide "cuántas hay", mide "para cuánto dan":
 *
 *  · Solo cuenta el RECETARIO ESTRELLA. El fondo de armario no entra para un
 *    grupo normal (ver isPrimaryCatalog en utils/filterRecipes.js), así que
 *    contar el catálogo entero daría una cobertura que el generador no tiene.
 *  · Y cuenta POR ROL. 20 recetas que son todas primeros no llenan una cena:
 *    los huecos de un menú son primero / segundo / cena, y el pool tiene que
 *    llegar a los tres.
 *
 * El listón: para que una petición se pueda servir de verdad hacen falta unas
 * 3 apariciones por semana durante las 4 semanas que admite un menú, sin
 * repetir. De ahí los 12.
 *
 * Y hacen falta DOS de los tres roles, no los tres: una legumbre no es segundo
 * nunca —es primero o plato único— y exigírselo marcaba como hueco algo que es
 * la definición del plato. Con dos roles ya se pueden repartir los huecos de la
 * semana sin amontonar todo en la misma comida.
 *
 * Uso: node scripts/axis-coverage.mjs
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RECIPES_DIR = join(__dirname, "..", "src", "data", "recipes");
const FILES = [
  "legumbres", "carnes", "pescados", "huevos", "pasta_arroces", "sopas_cremas",
  "ensaladas_verduras", "platos_unicos", "cenas_rapidas",
];

const SIRVE = 12;   // recetas estrella para 3 x semana durante 4 semanas
const POR_ROL = 3;  // mínimo en segundo y en cena

const all = FILES.flatMap((f) => JSON.parse(readFileSync(join(RECIPES_DIR, `${f}.json`), "utf8")));
const estrella = all.filter((r) => r.estrella);

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
const roles = (r) => r.mealRole ?? [];

// Lo que un usuario diría en voz alta, y con qué se responde hoy.
const PETICIONES = [
  ["más carne",           (r) => r.category === "carnes"],
  ["más pescado",         (r) => r.category === "pescados"],
  ["más legumbres",       (r) => r.category === "legumbres"],
  ["más pasta o arroz",   (r) => r.category === "pasta_arroces"],
  ["más huevo",           (r) => r.category === "huevos"],
  ["más verdura",         (r) => (r.mainIngredients ?? []).includes("verdura")],
  ["más setas",           (r) => (r.mainIngredients ?? []).includes("seta")],
  ["más fruta",           (r) => (r.mainIngredients ?? []).includes("fruta")],
  ["sin lácteos",         (r) => !(r.mainIngredients ?? []).includes("lacteo")],
  ["algo a la plancha",   (r) => r.tecnica === "plancha"],
  ["al horno",            (r) => r.tecnica === "horno"],
  ["de cuchara",          (r) => r.tecnica === "olla"],
  ["en sartén",           (r) => r.tecnica === "sarten"],
  ["sin cocinar",         (r) => r.montaje === true],
  ["para los niños",      (r) => r.kidFavourite === true],
  ["algo de fin de semana", (r) => r.occasion === "especial"],
  ["vegetariano",         (r) => !["cerdo", "ternera", "pollo", "pavo", "pescado_azul", "pescado_blanco", "marisco"].includes(r.mainProtein)],
  ["bajo en hidratos",    (r) => (r.carbs_g ?? 999) <= 15],
  ["ligero",              (r) => (r.kcal ?? 999) <= 350],
  ["rápido (≤20 min)",    (r) => (r.time ?? 99) <= 20],
  ["de tupper",           (r) => r.tupperFriendly === true],
  ["congelable",          (r) => r.freezable === true],
  ["italiana",            (r) => r.cocina === "italiana"],
  ["asiática",            (r) => r.cocina === "asiatica"],
  ["mexicana",            (r) => r.cocina === "mexicana"],
  ["mediterránea",        (r) => r.cocina === "mediterranea"],
];

const filas = PETICIONES.map(([label, match]) => {
  const hit = estrella.filter(match);
  const primero = hit.filter((r) => roles(r).includes("primero") || roles(r).includes("plato_unico")).length;
  const segundo = hit.filter((r) => roles(r).includes("segundo")).length;
  const cena = hit.filter((r) => roles(r).includes("cena") || roles(r).includes("plato_unico")).length;
  const total = hit.length;
  const conRol = [primero, segundo, cena].filter((n) => n >= POR_ROL).length;
  const ok = total >= SIRVE && conRol >= 2;
  const justo = !ok && total >= 6;
  return { label, total, primero, segundo, cena, conRol, estado: ok ? "sirve" : justo ? "justo" : "NO LLEGA" };
});

console.log(`Recetario Estrella jugable: ${estrella.length} recetas de ${all.length}\n`);
console.log("petición".padEnd(24) + "total".padStart(6) + "1º".padStart(6) + "2º".padStart(6) + "cena".padStart(6) + "  estado");
console.log("-".repeat(60));
for (const f of filas.sort((a, b) => a.total - b.total)) {
  console.log(
    f.label.padEnd(24) +
    String(f.total).padStart(6) + String(f.primero).padStart(6) +
    String(f.segundo).padStart(6) + String(f.cena).padStart(6) +
    "  " + f.estado,
  );
}

const faltan = filas.filter((f) => f.estado !== "sirve");
if (faltan.length > 0) {
  console.log("\nPara que el agente pueda servirlas hacen falta:");
  for (const f of faltan) {
    const piezas = [];
    if (f.total < SIRVE) piezas.push(`${SIRVE - f.total} recetas más`);
    if (f.conRol < 2) piezas.push(`reparto por rol (1º ${f.primero} · 2º ${f.segundo} · cena ${f.cena})`);
    console.log(`  ${f.label.padEnd(24)} ${piezas.join(", ")}`);
  }
}
void norm;
