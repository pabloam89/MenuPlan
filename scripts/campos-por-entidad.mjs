#!/usr/bin/env node
/**
 * Entidad × tipo de campo (#711, continúa #706).
 *
 *   npm run campos-por-entidad                  las entidades HORIZONTALES (scope: horizontal)
 *   npm run campos-por-entidad -- --todas       las de todo `scope` (las `vertical` también)
 *   npm run campos-por-entidad -- --entidad norm,household   solo esas (gana a --todas)
 *   npm run campos-por-entidad -- --campos      además una línea por campo, con sus frecuencias
 *
 * Repite el recuento del comentario «Inventario de texto libre frente a campo cerrado, por
 * entidad» de #706: cada campo cae en uno de nueve tipos (TIPOS_CAMPO de
 * scripts/lib/camposPorEntidad.mjs). Por defecto cuenta solo lo horizontal (decisión de Pablo,
 * 13 oct 2026): lo que es de la factoría, no del producto. Las `vertical`
 * NO entran por defecto; `--todas` las cuenta para poder comparar con las cifras de #706.
 *
 * Fuentes: ops/entidades.json (qué entidades y su `scope`), ops/campos-por-entidad.json (dónde
 * viven los campos de cada una), los ficheros de datos de git y, solo si una entidad medida
 * tiene tablas, el esquema de la base en SOLO LECTURA (SUPABASE_DB_URL_LECTURA, como
 * `npm run consulta`): las clases de ops/columnas-texto.json y, para las columnas de texto
 * libre, cuántos valores distintos tienen. No escribe en la base ni en el repo.
 *
 * Salida: líneas `campo: valor`. `texto_repetido:` lista los campos que se repiten sin ser
 * cerrados (los que hay que cerrar o derivar): tras arreglar uno, su línea desaparece.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { leerEnv } from "./lib/env.mjs";
import { motivoParaNoLeer } from "./lib/consulta.mjs";
import { conexionDeConsulta, motivoUsuarioIncorrecto } from "./lib/rolLectura.mjs";
import { RUTA_COLUMNAS_TEXTO } from "./lib/columnasTexto.mjs";
import { consultaDeColumna } from "./lib/pocosValores.mjs";
import { camposDeRegistros, cuentaPorTipo, sumaCuentas, textoCuenta, textoFrecuencias, tipoDeColumna } from "./lib/camposPorEntidad.mjs";
import { RUTA_REGISTRO, nombreDeFuente, registrosDeFuente } from "./lib/camposPorEntidadFuentes.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const iEnt = args.indexOf("--entidad");
const soloEstas = iEnt === -1 ? null : (args[iEnt + 1] ?? "").split(",").filter(Boolean);
const todas = args.includes("--todas");
const conCampos = args.includes("--campos");
const leer = (ruta) => JSON.parse(readFileSync(join(RAIZ, ruta), "utf8"));
const lim = (x) => String(x).replace(/\s+/g, "_");

const { entities } = leer("ops/entidades.json");
const registro = leer(RUTA_REGISTRO);
if (soloEstas) {
  const mal = soloEstas.filter((id) => !entities.some((e) => e.id === id));
  if (mal.length) { console.error(`No existe la entidad ${mal.join(", ")} en ops/entidades.json`); process.exit(1); }
}
const alcance = soloEstas ? "elegidas" : todas ? "todas" : "horizontal";
const medidas = entities.filter((e) => (soloEstas ? soloEstas.includes(e.id) : todas || e.scope === "horizontal"));
const porScope = (s) => entities.filter((e) => e.scope === s).length;
console.log(`campos_por_entidad: alcance=${alcance} entidades_medidas=${medidas.length} de=${entities.length} horizontal=${porScope("horizontal")} vertical=${porScope("vertical")}`);
if (alcance === "horizontal") console.log(`campos_por_entidad_nota: solo scope=horizontal; las ${porScope("vertical")} vertical no entran (--todas las cuenta)`);

const lineasRepetidos = [];
const lineasCampo = [];
const cuentasFicheros = [];
const cuentasBase = [];
const sinFuente = [];

function lineasDeCampos(entidad, origen, fuente, campos) {
  for (const c of campos.values()) {
    if (c.tipo === "texto_repetido") lineasRepetidos.push(`texto_repetido: entidad=${entidad} origen=${origen} fuente=${fuente} campo=${c.clave} filas=${c.filas} distintos=${c.distintos} top=${textoFrecuencias(c.frecuencias)}`);
    if (conCampos) lineasCampo.push(`campo: entidad=${entidad} origen=${origen} fuente=${fuente} campo=${c.clave} tipo=${c.tipo ?? "sin_valor"} filas=${c.filas} distintos=${c.distintos} top=${textoFrecuencias(c.frecuencias)}`);
  }
}

// ---- ficheros ----
for (const e of medidas) {
  const r = registro.entidades[e.id];
  if (!r) { console.log(`entidad_sin_registro: entidad=${e.id} alcance=${e.scope} motivo=falta_en_${RUTA_REGISTRO}`); continue; }
  if (r.sin_fuente) { sinFuente.push(e.id); console.log(`entidad_sin_fuente: entidad=${e.id} alcance=${e.scope} motivo=${lim(r.sin_fuente)}`); continue; }
  if (!r.ficheros) continue;
  const tipos = [];
  let nFicheros = 0;
  let nRegistros = 0;
  // Las fuentes con el mismo `grupo` guardan lo mismo (normas de la factoría y de un proyecto): se cuentan juntas.
  const grupos = new Map();
  for (const [i, f] of r.ficheros.entries()) {
    const k = f.grupo ?? `fuente${i}`;
    const { registros, ficheros } = await registrosDeFuente(RAIZ, f);
    if (!grupos.has(k)) grupos.set(k, { registros: [], fuentes: [] });
    grupos.get(k).registros.push(...registros);
    grupos.get(k).fuentes.push(nombreDeFuente(f));
    nFicheros += ficheros;
    nRegistros += registros.length;
  }
  for (const g of grupos.values()) {
    const campos = camposDeRegistros(g.registros);
    lineasDeCampos(e.id, "ficheros", g.fuentes.join("+"), campos);
    tipos.push(...[...campos.values()].map((c) => c.tipo));
  }
  const cuenta = cuentaPorTipo(tipos);
  cuentasFicheros.push(cuenta);
  console.log(`entidad_campos: entidad=${e.id} alcance=${e.scope} origen=ficheros fuentes=${r.ficheros.length} ficheros=${nFicheros} registros=${nRegistros} ${textoCuenta(cuenta)}`);
}

// ---- base ----
const conTablas = medidas.filter((e) => registro.entidades[e.id]?.tablas?.length);
const quiereSinEntidad = alcance === "todas";
if (conTablas.length || quiereSinEntidad) {
  const { columns: clases } = leer(RUTA_COLUMNAS_TEXTO);
  let url, rol;
  try {
    ({ url, rol } = conexionDeConsulta((k) => leerEnv(k), { admin: false }));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const { rows: [quien] } = await client.query("select current_user as yo");
    const mal = motivoUsuarioIncorrecto(rol, quien.yo);
    if (mal) { console.error(mal); process.exit(1); }
    await client.query("set session characteristics as transaction read only");
    await client.query("begin read only");
    await client.query("set local statement_timeout = '15s'");
    const sqlColumnas = "select table_name, column_name, data_type from information_schema.columns where table_schema = 'public' order by table_name, ordinal_position";
    const no = motivoParaNoLeer(sqlColumnas);
    if (no) throw new Error(no);
    const { rows } = await client.query({ text: sqlColumnas, values: [] });
    const porTabla = new Map();
    for (const r of rows) {
      if (!porTabla.has(r.table_name)) porTabla.set(r.table_name, []);
      porTabla.get(r.table_name).push(r);
    }
    const dueno = new Map();
    for (const [id, r] of Object.entries(registro.entidades)) for (const t of r.tablas ?? []) dueno.set(t, id);
    const grupos = conTablas.map((e) => ({ id: e.id, alcance: e.scope, tablas: registro.entidades[e.id].tablas }));
    if (quiereSinEntidad) {
      const sueltas = [...porTabla.keys()].filter((t) => !dueno.has(t));
      grupos.push({ id: "(sin_entidad)", alcance: "-", tablas: sueltas });
    }
    for (const g of grupos) {
      const tipos = [];
      for (const t of g.tablas) {
        const cols = porTabla.get(t);
        if (!cols) throw new Error(`${g.id}: la tabla ${t} no existe en la base (${RUTA_REGISTRO})`);
        for (const c of cols) {
          const clave = `${t}.${c.column_name}`;
          const clase = clases[clave]?.class;
          let medida;
          if (clase === "free_text") {
            const sql = consultaDeColumna(clave, c.data_type === "ARRAY" ? "text[]" : "text");
            const nol = motivoParaNoLeer(sql);
            if (nol) throw new Error(nol);
            const { rows: [m] } = await client.query({ text: sql, values: [] });
            medida = { filas: Number(m.filas), conValor: Number(m.con_valor), distintos: Number(m.distintos) };
          }
          const tipo = tipoDeColumna({ sql: { tipo: c.data_type }, clase, medida });
          tipos.push(tipo);
          if (tipo === "texto_repetido") lineasRepetidos.push(`texto_repetido: entidad=${g.id} origen=base fuente=${t} campo=${c.column_name} filas=${medida.filas} con_valor=${medida.conValor} distintos=${medida.distintos}`);
          if (conCampos) lineasCampo.push(`campo: entidad=${g.id} origen=base fuente=${t} campo=${c.column_name} tipo=${tipo} sql=${lim(c.data_type)}${medida ? ` filas=${medida.filas} con_valor=${medida.conValor} distintos=${medida.distintos}` : ""}`);
        }
      }
      const cuenta = cuentaPorTipo(tipos);
      cuentasBase.push(cuenta);
      console.log(`entidad_campos: entidad=${g.id} alcance=${g.alcance} origen=base tablas=${g.tablas.length} ${textoCuenta(cuenta)}`);
    }
  } finally {
    await client.query("rollback").catch((e) => console.warn(`rollback: ${e.message}`));
    await client.end();
  }
}

for (const l of lineasCampo) console.log(l);
for (const l of lineasRepetidos) console.log(l);

function totales(nombre, cuentas) {
  if (!cuentas.length) return;
  const s = sumaCuentas(cuentas);
  const total = Object.values(s).reduce((a, b) => a + b, 0);
  const libre = s.texto_unico + s.texto_repetido;
  console.log(`total_${nombre}: ${textoCuenta(s)}`);
  console.log(`texto_libre_${nombre}: libre=${libre} de=${total} repetido=${s.texto_repetido} cerrado=${s.cerrado}`);
}
totales("ficheros", cuentasFicheros);
totales("base", cuentasBase);
console.log(`campos_por_entidad_resumen: alcance=${alcance} entidades_medidas=${medidas.length} con_ficheros=${cuentasFicheros.length} con_base=${cuentasBase.length} sin_fuente=${sinFuente.length} texto_repetido_campos=${lineasRepetidos.length}`);
