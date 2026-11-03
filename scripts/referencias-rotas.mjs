#!/usr/bin/env node
/**
 * Cuántas referencias rotas hay hoy en la base (trozo 35 de #1037), por clase y por casa (scripts/lib/referenciasRotasBase.mjs
 * con src/lib/referenciasRotas.js). Solo lectura: el usuario consulta_lectura, en una transacción read only, y rollback.
 * La conexión es la de conLectura (scripts/lib/rolLectura.mjs). No escribe nada, ni en la base ni en disco. Saca solo cuentas e ids de fila, nunca nombres ni textos de las familias.
 *
 *   node scripts/referencias-rotas.mjs           # el resumen
 *   node scripts/referencias-rotas.mjs --filas   # además, cada rota (donde, id, tipo, ref, acción)
 */
import { leerEnv } from "./lib/env.mjs";
import { conLectura } from "./lib/rolLectura.mjs";
import { rotasDeLaBase } from "./lib/referenciasRotasBase.mjs";
import { TIPOS_ROTA } from "../src/lib/referenciasRotas.js";

const FILAS = process.argv.includes("--filas");

const r = await conLectura(leerEnv, rotasDeLaBase);
const { rotas, miradas, sinPersonas } = r;
const cuenta = Object.fromEntries(TIPOS_ROTA.map((t) => [t, rotas.filter((x) => x.tipo === t).length]));
console.log(`Miradas: ${miradas.preferencias} preferencias y ${miradas.tareas} tareas vivas de ${miradas.casas} casas.`);
console.log(`Referencias rotas: ${rotas.length}, en ${new Set(rotas.map((x) => x.casa)).size} casas. Por clase: ${JSON.stringify(cuenta)}.`);
console.log(`Tareas de casas sin ninguna persona conocida (se mira su campo, no su persona): ${sinPersonas}.`);
if (FILAS) for (const x of rotas) console.log(`  ${x.donde} ${x.id} ${x.tipo} ${x.ref} → ${x.accion}`);
