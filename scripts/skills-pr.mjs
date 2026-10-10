/**
 * Caducidad de las skills que toca un PR (#336). Paso «Skills del PR» del CI.
 *
 *   node scripts/skills-pr.mjs <fichero-con-la-lista>   → CI: falla si el PR toca una skill caducada
 *   node scripts/skills-pr.mjs                          → en local: avisa de las caducadas y próximas, no falla
 *
 * Por qué aquí y no en `npm test`: el reloj no puede poner en rojo los PR que
 * no tocan ninguna skill. Quien toca una skill caducada es quien la vuelve a
 * comprobar. La lista es la misma que usa el paso «Runbook del PR» (una ruta
 * por línea). Sin dependencias: corre antes de `npm ci`.
 *
 * Una línea por skill tocada, para contarla:
 *   skills-pr skill: <s> comprobado: AAAA-MM-DD dias: n estado: vigente|proxima|caducada|sin_fecha
 */
import { existsSync, readFileSync } from "node:fs";
import { AVISO_ANTES_DIAS, PLAZO_COMPROBADO_DIAS, caducidades, comprobarSkillsPr } from "./lib/skills.mjs";

const lista = process.argv[2];
const estados = caducidades();

if (!lista) {
  const malas = estados.filter((e) => e.estado !== "vigente");
  for (const e of malas) console.warn(`aviso: skill ${e.nombre} ${e.estado} (comprobado ${e.comprobado}, hace ${e.dias} días; plazo ${PLAZO_COMPROBADO_DIAS}, aviso ${AVISO_ANTES_DIAS} antes)`);
  console.log(`Skills: ${malas.length} caducadas o a menos de ${AVISO_ANTES_DIAS} días, de ${estados.length}. Sin lista de ficheros no falla.`);
  process.exit(0);
}

const ficheros = existsSync(lista) ? readFileSync(lista, "utf8").split(/\r?\n/).filter(Boolean) : [];
const r = comprobarSkillsPr(ficheros, estados);
for (const n of r.tocadas) {
  const e = estados.find((x) => x.nombre === n);
  if (e) console.log(`skills-pr skill: ${n} comprobado: ${e.comprobado} dias: ${e.dias} estado: ${e.estado}`);
}
if (r.ok) {
  console.log(`Skills del PR: ok. ${r.tocadas.length ? `Toca ${r.tocadas.join(", ")}, ninguna caducada.` : "No toca ninguna skill."}`);
  process.exit(0);
}
for (const f of r.faltas) console.log(`::error title=Skill caducada::${f.detalle}`);
console.log(`Skills del PR: FALLA. ${r.faltas.length} skill(s) tocadas sin comprobar en ${PLAZO_COMPROBADO_DIAS} días.`);
process.exit(1);
