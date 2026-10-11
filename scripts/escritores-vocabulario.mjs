#!/usr/bin/env node
/**
 * escritores-vocabulario.mjs — la cifra del escáner de escritores de vocabulario (#549,
 * fondo #479): columnas vigiladas, asignaciones que pasan por la lista viva, las que no y los
 * literales sueltos. Solo lee; el escáner es scripts/lib/escritoresVocabulario.mjs.
 *
 *   node scripts/escritores-vocabulario.mjs                     → el árbol de trabajo
 *   node scripts/escritores-vocabulario.mjs --ref origin/staging → el código de esa rama o commit
 *   … --detalle                                                  → además, cada una sin filtro y cada literal
 *
 * Con `--ref`, el código y supabase/cableado.json salen de ese commit, y las columnas y el
 * escáner, de esta copia: así se mide el «antes» con la misma regla que el «después».
 * Línea final que se puede contar:
 *   escritores_vocabulario: ref=<ref|trabajo> columnas=<n> filtradas=<n> sin_filtro=<n> literales=<n>
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cifra } from "./lib/escritoresVocabulario.mjs";
import { VOCABULARIOS, RETIRADOS } from "../src/lib/vocabularios.js";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const ref = args.includes("--ref") ? args[args.indexOf("--ref") + 1] : null;
const esCodigo = (f) => /^(src|api)\//.test(f) && /\.(js|jsx|mjs)$/.test(f) && !/\.test\./.test(f) && !f.includes("node_modules/");

function delDisco() {
  const out = [];
  const andar = (d) => {
    for (const f of readdirSync(join(RAIZ, d))) {
      const p = `${d}/${f}`;
      if (statSync(join(RAIZ, p)).isDirectory()) { if (f !== "node_modules") andar(p); } else if (esCodigo(p)) out.push(p);
    }
  };
  andar("src");
  andar("api");
  const leer = (f) => readFileSync(join(RAIZ, f), "utf8");
  return { ficheros: out.map((f) => ({ fichero: f, texto: leer(f) })), cableado: JSON.parse(leer("supabase/cableado.json")) };
}

function deRef(r) {
  const git = (...a) => execFileSync("git", a, { cwd: RAIZ, encoding: "utf8", maxBuffer: 1 << 28 });
  const lista = git("ls-tree", "-r", "--name-only", r, "--", "src", "api").split("\n").filter(esCodigo);
  return { ficheros: lista.map((f) => ({ fichero: f, texto: git("show", `${r}:${f}`) })), cableado: JSON.parse(git("show", `${r}:supabase/cableado.json`)) };
}

const { ficheros, cableado } = ref ? deRef(ref) : delDisco();
const c = cifra(ficheros, cableado, VOCABULARIOS, RETIRADOS);
if (args.includes("--detalle")) {
  for (const a of c.sinFiltro) console.log(`sin filtro  ${a.fichero}:${a.linea} [${a.columna}] ${a.motivo}`);
  for (const l of c.literales) console.log(`literal     ${l.fichero}:${l.linea} «${l.valor}»`);
}
console.log(`escritores_vocabulario: ref=${ref ?? "trabajo"} columnas=${c.columnas} filtradas=${c.filtradas} sin_filtro=${c.sinFiltro.length} literales=${c.literales.length}`);
