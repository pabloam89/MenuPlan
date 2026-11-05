#!/usr/bin/env node
/**
 * ¿Lola repite lo que ya preguntó? La cifra de antes del tramo 10 del plan de fichas (trozo 62, #1210):
 * `npm run pedidos`. Solo lee, con el usuario de lectura, y solo saca cifras: nada de familias.
 *
 *  - pregunta: un mensaje de Lola con los tres caminos.
 *  - pedido: una o varias preguntas seguidas de una casa, sin menú entre medias y con menos de 24 h de una a otra.
 *  - repetida: una pregunta que no es la primera de su pedido.
 *  - sin_menu: un pedido sin menú en las 24 h siguientes a su última pregunta.
 *  - abierto: un pedido cuya última pregunta tiene menos de 24 h y aún no tiene menú.
 *
 * `bot_messages` y `menu_generado` guardan lo que su poda deja: la salida dice desde cuándo mira.
 */
import { pathToFileURL } from "node:url";
import { CAMINOS } from "../src/lib/caminos.js";

export const VENTANA_MS = 24 * 60 * 60 * 1000;

/**
 * Pura. Las cifras a partir de las preguntas y los menús ({ casa, at }, `at` en ms).
 * @returns {{ preguntas: number, pedidos: number, repetidas: number, sin_menu: number, abiertos: number }}
 */
export function contarPedidos(preguntas, menus, ahora, ventana = VENTANA_MS) {
  const hayMenu = (casa, desde, hasta) => menus.some((m) => m.casa === casa && m.at > desde && m.at <= hasta);
  const ordenadas = [...preguntas].sort((a, b) => a.at - b.at);
  const ultimaDe = new Map();
  const cifras = { preguntas: ordenadas.length, pedidos: 0, repetidas: 0, sin_menu: 0, abiertos: 0 };
  const cerrar = (p) => {
    if (hayMenu(p.casa, p.at, p.at + ventana)) return;
    if (ahora - p.at > ventana) cifras.sin_menu += 1;
    else cifras.abiertos += 1;
  };
  for (const p of ordenadas) {
    const antes = ultimaDe.get(p.casa);
    if (antes && p.at - antes.at <= ventana && !hayMenu(p.casa, antes.at, p.at)) cifras.repetidas += 1;
    else {
      if (antes) cerrar(antes);
      cifras.pedidos += 1;
    }
    ultimaDe.set(p.casa, p);
  }
  for (const p of ultimaDe.values()) cerrar(p);
  return cifras;
}

/** El filtro de SQL: un mensaje de Lola que trae el título de los tres caminos. */
export const conLosCaminos = () => CAMINOS.map((c) => `content->>'texto' like '%${c.titulo}%'`).join(" and ");

async function main() {
  const { conLectura } = await import("./lib/rolLectura.mjs");
  const { leerEnv } = await import("./lib/env.mjs");
  const aMs = ({ casa, at }) => ({ casa, at: new Date(at).getTime() });
  const { preguntas, menus } = await conLectura(leerEnv, async (consultar) => ({
    preguntas: await consultar(`select household_id casa, created_at at from bot_messages where role = 'assistant' and ${conLosCaminos()}`),
    menus: await consultar("select household_id casa, created_at at from menu_generado"),
  }));
  const desde = preguntas.length ? new Date(Math.min(...preguntas.map((p) => new Date(p.at).getTime()))).toISOString().slice(0, 10) : "sin datos";
  console.log(JSON.stringify({ desde, ...contarPedidos(preguntas.map(aMs), menus.map(aMs), Date.now()) }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => {
    console.error(`[pedidos] ${e.message}`);
    process.exit(1);
  });
}
