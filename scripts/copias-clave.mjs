#!/usr/bin/env node
/**
 * La clave de las copias de la base (encargo #247): genera un par de claves
 * age, guarda la PRIVADA en 1Password (bóveda «Panel HoMenu», ficha «Copias de
 * la base») y escribe la PÚBLICA en ops/copias/destinatarios.txt, que va al
 * repo y al servidor. La privada no se imprime ni toca el disco: va de
 * `age-keygen` a `op` por memoria y stdin.
 *
 *   node scripts/copias-clave.mjs          ensayo: comprueba herramientas y que la ficha no existe
 *   node scripts/copias-clave.mjs --si     la crea (Pablo, con `!`; 1Password pide aprobar)
 *   node scripts/copias-clave.mjs --comprobar   ¿destinatarios.txt es justo la pública de la ficha?
 *                                         (antes de subirlo al servidor; no lee la privada)
 *
 * Si la ficha ya existe, no hace nada: rotar la clave es otra operación
 * (skill hetzner, «Rotar la clave de las copias»), porque las copias viejas
 * siguen necesitando la privada vieja.
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { RAIZ, opPorLaApp } from "./lib/env.mjs";
import { BOVEDA_COPIAS, CAMPO_CLAVE, CLAVE_PRIVADA, CLAVE_PUBLICA, FICHA_COPIAS, comprobarDestinatarios } from "./lib/copias.mjs";
import { estadoFicha } from "./lib/rolLectura.mjs";

const SI = process.argv.includes("--si");
const DESTINATARIOS = join(RAIZ, "ops", "copias", "destinatarios.txt");
const salir = (msg) => { console.error(msg); process.exit(1); };

// Sin la service account: solo lee HoMenu, y para escribir hace falta la app (opPorLaApp).

if (process.argv.includes("--comprobar")) {
  // Solo el campo público (texto, no oculto): no hace falta leer la privada.
  const p = opPorLaApp(["item", "get", FICHA_COPIAS, "--vault", BOVEDA_COPIAS, "--fields", "label=clave_publica"]);
  if (p.status !== 0) salir(`No pude leer la ficha «${FICHA_COPIAS}»: ${(p.stderr || "").trim().split(/\r?\n/)[0]}`);
  const c = comprobarDestinatarios(readFileSync(DESTINATARIOS, "utf8"), p.stdout);
  if (c.coincide) {
    console.log(`COINCIDEN: destinatarios.txt es solo la pública de «${FICHA_COPIAS}». Se puede subir al servidor.`);
    process.exit(0);
  }
  salir(`NO COINCIDEN: ${c.falta ? "falta la pública de la ficha" : ""}${c.falta && c.sobran.length ? " y " : ""}${c.sobran.length ? `sobran ${c.sobran.length} clave(s) que no son la de la ficha` : ""}. No lo subas al servidor.`);
}

const v = spawnSync("age-keygen", ["--version"], { encoding: "utf8" });
if (v.status !== 0) salir("No encuentro age-keygen: winget install FiloSottile.age y reinicia el terminal.");

const ficha = estadoFicha(opPorLaApp(["item", "get", FICHA_COPIAS, "--vault", BOVEDA_COPIAS, "--format", "json"]));
if (ficha === "existe") salir(`La ficha «${FICHA_COPIAS}» ya existe en Panel HoMenu: no creo otra. Para rotar, mira la skill hetzner.`);
if (ficha === "error") salir("No pude preguntar a 1Password si la ficha existe (¿app abierta y desbloqueada?). No sigo: crearla a ciegas podría duplicarla.");

const yaHay = readFileSync(DESTINATARIOS, "utf8").split(/\r?\n/).filter((l) => CLAVE_PUBLICA.test(l.trim()));
if (yaHay.length) console.warn(`Aviso: destinatarios.txt ya tiene ${yaHay.length} clave(s); se añadirá otra.`);

if (!SI) {
  console.log("Ensayo: age-keygen y 1Password responden, y la ficha no existe. Para crearla: node scripts/copias-clave.mjs --si");
  process.exit(0);
}

const g = spawnSync("age-keygen", [], { encoding: "utf8" });
if (g.status !== 0) salir(`age-keygen salió con ${g.status}`);
const privada = g.stdout.split(/\r?\n/).map((l) => l.trim()).find((l) => CLAVE_PRIVADA.test(l));
if (!privada) salir("age-keygen no devolvió una clave privada reconocible.");
// La pública se saca de la privada (no del comentario), así no pueden no casar.
const y = spawnSync("age-keygen", ["-y"], { input: `${privada}\n`, encoding: "utf8" });
const publica = (y.stdout || "").trim();
if (y.status !== 0 || !CLAVE_PUBLICA.test(publica)) salir("age-keygen -y no devolvió la clave pública.");

const item = JSON.stringify({
  title: FICHA_COPIAS,
  category: "PASSWORD",
  notesPlain: `Clave age de las copias cifradas de la base de MenuPlan (encargo #247). Pública: ${publica}. Sin ella no se puede leer ninguna copia. Uso: scripts/copias-ensayo.mjs (skill hetzner).`,
  // La privada, una sola vez: en el campo de contraseña propio de la categoría,
  // con la etiqueta que se lee (op://…/${CAMPO_CLAVE} resuelve por etiqueta).
  // Si op lo guardara con otra etiqueta, la relectura de abajo no coincide y no
  // se escribe la pública: falla sin daño.
  fields: [
    { id: "password", type: "CONCEALED", purpose: "PASSWORD", label: CAMPO_CLAVE, value: privada },
    { id: "clave_publica", type: "STRING", label: "clave_publica", value: publica },
  ],
});
const c = opPorLaApp(["item", "create", "--vault", BOVEDA_COPIAS, "--format", "json", "-"], { input: item });
if (c.status !== 0) salir(`op item create falló: ${(c.stderr || "").trim().split("\n")[0]}. No escribo la pública: sin la privada guardada no serviría.`);

// Comprobación a ciegas: lo guardado es lo generado.
const r = opPorLaApp(["read", `op://${BOVEDA_COPIAS}/${FICHA_COPIAS}/${CAMPO_CLAVE}`]);
if (r.status !== 0 || r.stdout.trim() !== privada) salir("La ficha se creó pero al leerla no coincide: revísala en 1Password antes de seguir. No escribo la pública.");

appendFileSync(DESTINATARIOS, `${publica}\n`);
console.log(`Ficha «${FICHA_COPIAS}» creada en Panel HoMenu y comprobada (COINCIDEN).`);
console.log(`Clave pública añadida a ops/copias/destinatarios.txt: ${publica}`);
console.log("Siguiente: commitear destinatarios.txt y subirlo al servidor (skill hetzner).");
