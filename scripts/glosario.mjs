#!/usr/bin/env node
/**
 * npm run glosario                 → todos los términos con su definición y sus excepciones
 * npm run glosario -- <término>    → uno (o los que empiezan así), con sinónimos, ref y excepciones
 * npm run glosario -- --medir      → lo que hay hoy en el repo frente a ops/glosario-excepciones.json,
 *                                    con fichero y línea de cada sinónimo nuevo
 *
 * Solo lee. El dato es ops/glosario.json (#469); lo vigila ops/glosario.test.js.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  comparar, excepcionesPorTermino, excepcionesPorZona, ficherosDe, leerExcepciones, leerGlosario, medir, pares, textoTermino, total,
} from "./lib/glosario.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const g = leerGlosario(RAIZ);
const exc = leerExcepciones(RAIZ);
const args = process.argv.slice(2);

if (args.includes("--medir")) {
  const { medida, detalle } = medir(RAIZ, g);
  const { nuevas, bajadas } = comparar(medida, exc);
  console.log(`glosario medida: ${total(medida)} excepciones_admitidas: ${total(exc)} nuevas: ${nuevas.length} bajadas: ${bajadas.length}`);
  for (const n of nuevas) {
    const donde = detalle.filter((d) => d.ruta === n.ruta && d.sinonimo === n.sinonimo).map((d) => d.donde).join(", ");
    console.log(`  NUEVO ${n.ruta}: «${n.sinonimo}» ${n.hay} (admitidas ${n.admitidas}) → di «${detalle.find((d) => d.sinonimo === n.sinonimo)?.canonico}» (línea ${donde})`);
  }
  for (const b of bajadas) console.log(`  BAJA ${b.ruta}: «${b.sinonimo}» ${b.hay} de ${b.admitidas} → baja la cifra en ops/glosario-excepciones.json`);
  process.exit(nuevas.length ? 1 : 0);
}

const pedido = args.find((a) => !a.startsWith("--"));
const terminos = pedido ? g.terminos.filter((t) => t.termino.toLowerCase().startsWith(pedido.toLowerCase())) : g.terminos;
if (pedido && terminos.length === 0) {
  // ¿Es un sinónimo prohibido?
  const t = g.terminos.find((x) => x.sinonimos_prohibidos.includes(pedido.toLowerCase()));
  console.log(t ? `«${pedido}» no se dice: es «${t.termino}».\n\n${textoTermino(t, g, exc)}` : `No hay ningún término «${pedido}» en ops/glosario.json.`);
  process.exit(t ? 0 : 1);
}
for (const t of terminos) console.log(`${textoTermino(t, g, exc)}\n`);
if (!pedido) {
  const porZona = excepcionesPorZona(g, exc, { ficheros: (p) => ficherosDe(RAIZ, p) });
  const conExc = Object.entries(excepcionesPorTermino(g, exc)).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const sinonimos = g.terminos.reduce((a, t) => a + t.sinonimos_prohibidos.length, 0);
  console.log(`glosario terminos: ${g.terminos.length} sinonimos_prohibidos: ${sinonimos} excepciones: ${total(exc)} pares: ${pares(exc)}`);
  console.log(`  por término: ${conExc.map(([t, n]) => `${t} ${n}`).join(", ") || "ninguna"}`);
  console.log(`  por zona: ${Object.entries(porZona).map(([z, n]) => `${z} ${n}`).join(", ") || "ninguna"}`);
}
