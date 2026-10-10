// presupuesto.mjs — el presupuesto de un fallo según su alcance y su causa (#339).
//
//   npm run presupuesto -- <alcance> <causa>   el presupuesto y el pipeline sugerido
//   npm run presupuesto -- <alcance> <causa> --json
//   npm run presupuesto -- --tabla             todas las celdas, una línea cada una
//
// Es el paso de consulta del triaje de /orquestar: la sesión fija el alcance y la
// causa con datos y sigue lo que sale aquí, sin escribir los números en ningún
// texto. El dato está en ops/presupuestos.json; la lógica, en
// scripts/lib/presupuestos.mjs. Una combinación desconocida sale con error (1)
// y la lista de valores válidos: nunca se inventa un presupuesto.
import { ALCANCES, CAUSAS, celdas, presupuestoDe, textoDe } from "./lib/presupuestos.mjs";

const args = process.argv.slice(2);
const json = args.includes("--json");
const posicionales = args.filter((a) => !a.startsWith("--"));

if (args.includes("--tabla")) {
  for (const { alcance, causa } of celdas()) {
    const p = presupuestoDe(alcance, causa);
    console.log(`${alcance.padEnd(12)} ${causa.padEnd(18)} hipotesis=${p.hipotesis_en_paralelo_max} jueces>=${p.jueces_min} rondas<=${p.rondas_max} min=${String(p.minutos_orientativos).padEnd(3)} obligatorios=${p.jueces_obligatorios.join("+") || "-"} ci=${p.reproducir_en_ci ? "si" : "no"}`);
  }
  process.exit(0);
}

const [alcance, causa] = posicionales;
const p = posicionales.length === 2 ? presupuestoDe(alcance, causa) : null;
if (!p) {
  console.error("Uso: npm run presupuesto -- <alcance> <causa> [--json]   (o --tabla)");
  if (posicionales.length === 2) {
    if (!ALCANCES.includes(alcance)) console.error(`  alcance «${String(alcance).slice(0, 30)}» desconocido`);
    if (!CAUSAS.includes(causa)) console.error(`  causa «${String(causa).slice(0, 30)}» desconocida`);
  }
  console.error(`  alcances: ${ALCANCES.join(", ")}`);
  console.error(`  causas:   ${CAUSAS.join(", ")}`);
  process.exit(1);
}
console.log(json ? JSON.stringify(p, null, 2) : textoDe(p));
