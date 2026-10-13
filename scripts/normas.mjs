#!/usr/bin/env node
/**
 * El registro de normas y sus cifras (#296).
 *
 *   npm run normas                 recuento del registro y palabras fuertes sin
 *                                  citar norma, por fichero (solo informa)
 *   npm run normas -- --fondo      las cifras del fondo (#185), con red
 *   npm run normas -- --medir [--log <fichero>]…
 *                                  cuenta por norma las líneas `norma: <id> resultado: ok|warning|fail|exempt|declared`
 *                                  (#621): los bloqueos de la guardia del registro local de eventos y, si se
 *                                  da, el log de CI (una vez por PR, norma y resultado) (`gh run view <run> --log > f.txt`); dice cuáles nunca
 *                                  saltan, cuáles no han dejado dato y cuáles se exceptúan siempre
 *   npm run normas -- --escribir   regenera docs/ops/NORMAS.md desde ops/normas.json y los avisos de la guardia (#494)
 *
 * Lo que bloquea un PR es scripts/normas-pr.mjs (en tests.yml), que mira solo
 * las líneas añadidas. Esto es para mirar el conjunto; la cifra total la vigila
 * `npm run planos` cada semana.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { AVISOS } from "../.claude/hooks/avisos-guardia.mjs";
import { dirFabrica } from "../.claude/hooks/eventos.mjs";
import { contarPorNorma, leerLineasDeNorma, medir, saltosDeLaGuardia } from "./lib/medicionNormas.mjs";
import { RUTA_MD, generarMd, leerRegistro, medirFondo, medirFrases, recuento, totalFrases } from "./lib/normas.mjs";
import { leerIssuesGh } from "./lib/planos.mjs";

const RAIZ = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);

if (args.includes("--fondo")) {
  const m = medirFondo(leerIssuesGh());
  for (const [k, v] of Object.entries(m)) console.log(`fondo ${k}: ${v}`);
  process.exit(0);
}

const registro = leerRegistro(RAIZ);

if (args.includes("--medir")) {
  // Dos fuentes: el registro local de la guardia y, si se da, el log de CI. Leer los runs de Actions pide red y
  // el token de un administrador de la API; hasta que haya un registro fuera del PC, el de CI se pasa a mano.
  const leer = (r) => (existsSync(r) ? readFileSync(r, "utf8") : "");
  const dir = dirFabrica();
  const guardia = saltosDeLaGuardia(`${leer(join(dir, "eventos.anterior.jsonl"))}\n${leer(join(dir, "eventos.jsonl"))}`);
  const logs = args.flatMap((a, i) => (a === "--log" && args[i + 1] ? [args[i + 1]] : []));
  // La unidad es el run de un PR: contarPorNorma cuenta una vez por pr + norma + resultado (medicionNormas.mjs).
  const ci = logs.flatMap((f) => leerLineasDeNorma(leer(f)));
  const m = medir(registro.normas, contarPorNorma([...guardia, ...ci]));
  for (const f of m.filas.filter((x) => x.ok + x.warning + x.fail + x.exempt + x.declared > 0)) console.log(`norma_medida: ${f.norma} ok: ${f.ok} warning: ${f.warning} fail: ${f.fail} exempt: ${f.exempt} declared: ${f.declared}`);
  console.log(`normas_medidas total: ${m.filas.length} nunca_saltan: ${m.nuncaSaltan.length} sin_dato: ${m.sinDato.length} exceptuadas_siempre: ${m.exceptuadasSiempre.length} fuente: ${logs.length ? "guardia-local+ci" : "guardia-local"}`);
  if (m.nuncaSaltan.length) console.log(`  nunca saltan (se comprobaron y no saltó ni una vez): ${m.nuncaSaltan.join(", ")}`);
  if (m.exceptuadasSiempre.length) console.log(`  se exceptúan siempre (mal puestas, o la excepción es un atajo): ${m.exceptuadasSiempre.join(", ")}`);
  if (m.desconocidas.length) console.log(`  líneas de normas que no existen: ${m.desconocidas.join(", ")}`);
  if (!logs.length) console.log("  El registro de CI queda para cuando haya registro fuera del PC: hoy, pasa el log con --log <fichero> (gh run view <run> --log).");
  process.exit(0);
}

if (args.includes("--escribir")) {
  writeFileSync(join(RAIZ, RUTA_MD), generarMd(registro, AVISOS));
  console.log(`${RUTA_MD} regenerado desde ops/normas.json y los avisos de la guardia.`);
}
const ids = new Set(registro.normas.map((n) => n.id));
const r = recuento(registro.normas);
console.log(`normas total: ${r.total} ${Object.entries(r.veredicto).map(([k, v]) => `${k}: ${v}`).join(" ")}`);
console.log(`normas control_tipo ${Object.entries(r.control_tipo).map(([k, v]) => `${k}: ${v}`).join(" ")}`);
console.log(`normas control_ejes ${Object.entries({ ...r.ejes.control_procesador, ...r.ejes.control_fuerza, juez_sin_test: r.sin_test_del_juez, ejecutor_persona: r.ejecutor_persona }).map(([k, v]) => `${k}: ${v}`).join(" ")}`);
console.log(`normas sujetos: ${Object.keys(registro.sujetos).length} avisos_guardia: ${Object.keys(AVISOS).length}`);
console.log(`normas riesgo ${Object.entries(r.riesgo).map(([k, v]) => `${k}: ${v}`).join(" ")}`);
const { actual, citasMalas } = medirFrases(RAIZ, ids);
console.log(`normas_frases sin_cita: ${totalFrases(actual)} ficheros: ${Object.keys(actual).length} citas_malas: ${citasMalas.length}`);
for (const [ruta, cuenta] of Object.entries(actual)) console.log(`  ${ruta}: ${Object.entries(cuenta).map(([k, v]) => `${k} ${v}`).join(", ")}`);
for (const c of citasMalas) console.log(`  cita a una norma que no existe: ${c}`);
