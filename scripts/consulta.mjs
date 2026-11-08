#!/usr/bin/env node
/**
 * Una consulta de solo lectura a producción: `npm run consulta -- "select …"`.
 *
 * Autorizada de forma permanente (CLAUDE.md, «Qué se le pregunta a Pablo»):
 * lee y no escribe. Cuatro barreras: el usuario `consulta_lectura` (0092), que
 * solo tiene permiso de leer; el texto (scripts/lib/consulta.mjs); una
 * transacción `read only` que Postgres hace cumplir aunque algo se colara, y un
 * rollback al final. Sin SUPABASE_DB_URL_LECTURA no entra (#238); como
 * administrador, solo con `--admin` explícito y un aviso
 * (`npm run consulta -- --admin "select …"`; scripts/lib/rolLectura.mjs).
 * Tope de 15 s y de 200 filas. Sin datos de familias en un
 * issue ni en un PR: lo que salga se resume en cifras.
 */
import pg from "pg";
import { leerEnv } from "./lib/env.mjs";
import { motivoParaNoLeer, avisosDeRetiradas } from "./lib/consulta.mjs";
import { argumentosDeConsulta, conexionDeConsulta, motivoUsuarioIncorrecto } from "./lib/rolLectura.mjs";

const { admin, sql } = argumentosDeConsulta(process.argv.slice(2));
const no = motivoParaNoLeer(sql);
if (no) {
  console.error(`No la lanzo: ${no}`);
  process.exit(1);
}

// Una copia retirada se puede auditar: se avisa por stderr y se sigue (#292).
for (const av of avisosDeRetiradas(sql)) console.error(av);

// Con el usuario de solo lectura (0092). Sin él, no entra: el administrador,
// solo con --admin (a todo o nada, #238).
let url;
let aviso;
let rol;
try {
  ({ url, aviso, rol } = conexionDeConsulta((k) => leerEnv(k), { admin }));
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
if (aviso) console.error(aviso);
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
// Con la dirección de lectura, que de verdad sea consulta_lectura (juez de
// seguridad de la 0092): una dirección de administrador ahí no pasa callada.
const { rows: [quien] } = await client.query("select current_user as yo");
const malUsuario = motivoUsuarioIncorrecto(rol, quien.yo);
if (malUsuario) {
  console.error(malUsuario);
  await client.end();
  process.exit(1);
}
try {
  await client.query("set session characteristics as transaction read only");
  await client.query("begin read only");
  await client.query("set local statement_timeout = '15s'");
  // Protocolo extendido ({ text, values }): Postgres no admite ahí varias
  // sentencias, pase lo que pase por el filtro de texto (juez del PR #223).
  const r = await client.query({ text: sql, values: [] });
  const filas = r.rows ?? [];
  if (filas.length) console.table(filas.slice(0, 200));
  console.log(`${filas.length} fila(s)${filas.length > 200 ? " (enseño las 200 primeras)" : ""}.`);
} catch (e) {
  console.error(`La base dice: ${e.message}`);
  process.exitCode = 1;
} finally {
  await client.query("rollback").catch((e) => console.warn(`rollback: ${e.message}`));
  await client.end();
}
