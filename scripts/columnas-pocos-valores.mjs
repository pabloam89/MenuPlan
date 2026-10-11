#!/usr/bin/env node
/**
 * Columnas de texto libre con pocos valores distintos en producción (#585, norma C4).
 *
 *   npm run columnas-pocos-valores                 las `free_text` de ops/columnas-texto.json
 *   npm run columnas-pocos-valores -- --clases free_text,identifier
 *
 * SOLO LECTURA, como `npm run consulta`: entra con SUPABASE_DB_URL_LECTURA (el rol
 * consulta_lectura, 0092), cada select pasa por motivoParaNoLeer, va en una transacción
 * `read only` con tope de tiempo y se deshace. Sin la clave de lectura no entra. No escribe
 * en la base ni en el repo.
 *
 * Deja una línea contable por columna (`columna_pocos_valores: columna=… filas=… distintos=…
 * candidata=si|no`) y al final el resumen. Una candidata no se cambia aquí: se apunta y se
 * decide en su propia migración (CHECK en dos tiempos, constante JS y test). El umbral y su
 * porqué: scripts/lib/pocosValores.mjs. El test del CI (supabase/columnasTexto.test.js) no
 * depende de este script.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { leerEnv } from "./lib/env.mjs";
import { motivoParaNoLeer } from "./lib/consulta.mjs";
import { conexionDeConsulta, motivoUsuarioIncorrecto } from "./lib/rolLectura.mjs";
import { RUTA_COLUMNAS_TEXTO, columnasDeTexto, leerMigracionesSql } from "./lib/columnasTexto.mjs";
import { consultaDeColumna, lineaContable, esCandidata, MAX_DISTINTOS, MIN_FILAS } from "./lib/pocosValores.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const i = process.argv.indexOf("--clases");
const clases = (i === -1 ? "free_text" : process.argv[i + 1] ?? "").split(",").filter(Boolean);
const { columns } = JSON.parse(readFileSync(join(RAIZ, RUTA_COLUMNAS_TEXTO), "utf8"));
const elegidas = Object.keys(columns).filter((c) => clases.includes(columns[c].class));
const tipos = columnasDeTexto(leerMigracionesSql(RAIZ)); // «text» o «text[]»: el array se cuenta por elementos
if (!elegidas.length) {
  console.error(`Ninguna columna de clase ${clases.join(", ")} en ${RUTA_COLUMNAS_TEXTO}.`);
  process.exit(1);
}

let url, rol;
try {
  ({ url, rol } = conexionDeConsulta((k) => leerEnv(k), { admin: false }));
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
const { rows: [quien] } = await client.query("select current_user as yo");
const mal = motivoUsuarioIncorrecto(rol, quien.yo);
if (mal) { console.error(mal); await client.end(); process.exit(1); }

const candidatas = [];
let medidas = 0;
try {
  await client.query("set session characteristics as transaction read only");
  await client.query("begin read only");
  await client.query("set local statement_timeout = '15s'");
  for (const col of elegidas) {
    const sql = consultaDeColumna(col, tipos.get(col)?.tipo ?? "text");
    const no = motivoParaNoLeer(sql);
    let medida;
    if (no) medida = { error: no };
    else {
      // Un error de una columna (permiso, tabla ausente) deshace la transacción: savepoint por columna no cabe
      // en la lista de palabras de consulta.mjs, así que se abre una transacción nueva tras cada fallo.
      try {
        const { rows: [r] } = await client.query({ text: sql, values: [] });
        medida = { filas: Number(r.filas), conValor: Number(r.con_valor), distintos: Number(r.distintos) };
        medidas++;
      } catch (e) {
        medida = { error: e.message };
        await client.query("rollback");
        await client.query("begin read only");
        await client.query("set local statement_timeout = '15s'");
      }
    }
    console.log(lineaContable(col, medida));
    if (!medida.error && esCandidata({ filas: medida.conValor, distintos: medida.distintos })) candidatas.push(col);
  }
} finally {
  await client.query("rollback").catch((e) => console.warn(`rollback: ${e.message}`));
  await client.end();
}
console.log(`columnas_pocos_valores_resumen: clases=${clases.join("+")} columnas=${elegidas.length} medidas=${medidas} candidatas=${candidatas.length} umbral_distintos=${MAX_DISTINTOS} umbral_filas=${MIN_FILAS}`);
if (candidatas.length) console.log(`candidatas a vocabulario: ${candidatas.join(", ")}`);
