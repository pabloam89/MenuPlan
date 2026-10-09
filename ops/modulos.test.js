import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tablas as tablasDeMigraciones } from "../scripts/cableado.mjs";
import { GRADOS_DESARROLLO, AMBITOS_MODULO, ESTADOS_METRICA, ACCESOS_TABLA } from "../src/lib/vocabularios.js";

/**
 * El mapa de módulos (ops/MODULOS.json, issue #157) no se puede quedar viejo.
 *
 * Lo lee el panel de la factoría (#158), así que un dato falso aquí es un
 * panel que miente. Cuando este test se pone rojo, el mensaje dice qué falta y
 * qué hacer; casi siempre es editar ops/MODULOS.json en el mismo PR que
 * cambió el código o la base.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const leer = (ruta) => readFileSync(join(RAIZ, ruta), "utf8");
const mapa = JSON.parse(leer("ops/MODULOS.json"));
const cableado = JSON.parse(leer("supabase/cableado.json"));

/** Módulos y submódulos en una lista plana, con su padre. */
const unidades = mapa.modulos.flatMap((m) => [{ ...m, padre: null }, ...(m.submodulos ?? []).map((s) => ({ ...s, ambito: m.ambito, padre: m.id }))]);
const porId = new Map(unidades.map((u) => [u.id, u]));
const hojas = unidades.filter((u) => !(u.submodulos?.length));

const LISTA_O_VACIA = (v) => Array.isArray(v);

describe("MODULOS.json: forma y vocabulario cerrado", () => {
  it("las definiciones del JSON dicen lo mismo que las constantes de src/lib/vocabularios.js", () => {
    const aviso = "Si añades un valor, ponlo en la constante de src/lib/vocabularios.js Y en `vocabularios` de ops/MODULOS.json con su definición.";
    expect(Object.keys(mapa.vocabularios.grados_desarrollo), aviso).toEqual(GRADOS_DESARROLLO);
    expect(Object.keys(mapa.vocabularios.ambitos_modulo), aviso).toEqual(AMBITOS_MODULO);
    expect(Object.keys(mapa.vocabularios.accesos_tabla), aviso).toEqual(ACCESOS_TABLA);
  });

  it("los ids son únicos y con forma de id (minúsculas, números y guiones)", () => {
    const vistos = new Set();
    const malos = [];
    for (const u of unidades) {
      if (!/^[a-z][a-z0-9-]*$/.test(u.id ?? "")) malos.push(`${u.id}: forma de id`);
      if (vistos.has(u.id)) malos.push(`${u.id}: repetido`);
      vistos.add(u.id);
    }
    expect(malos, "Cada módulo y submódulo necesita un `id` estable y distinto; no lo renombres si el panel ya lo usa.").toEqual([]);
  });

  it("cada módulo y submódulo trae todos los campos obligatorios", () => {
    const faltan = [];
    for (const u of unidades) {
      for (const c of ["id", "nombre", "ambito", "hace", "grado", "motivo_grado"]) {
        if (typeof u[c] !== "string" || !u[c].trim()) faltan.push(`${u.id}: falta «${c}» (texto no vacío)`);
      }
      for (const c of ["ficheros", "tests", "tablas", "metricas"]) {
        if (!LISTA_O_VACIA(u[c])) faltan.push(`${u.id}: «${c}» debe ser una lista (vacía si no hay nada)`);
      }
    }
    expect(faltan, "Rellena el campo que falta en ops/MODULOS.json; `hace` es una frase de castellano llano.").toEqual([]);
  });

  it("grado y ámbito están dentro del vocabulario cerrado", () => {
    const malos = [];
    for (const u of unidades) {
      if (!GRADOS_DESARROLLO.includes(u.grado)) malos.push(`${u.id}: grado «${u.grado}»`);
      if (!AMBITOS_MODULO.includes(u.ambito)) malos.push(`${u.id}: ámbito «${u.ambito}»`);
    }
    expect(malos, `Grados válidos: ${GRADOS_DESARROLLO.join(", ")}. Ámbitos: ${AMBITOS_MODULO.join(", ")}.`).toEqual([]);
  });
});

describe("MODULOS.json: el grado se justifica con algo comprobable", () => {
  it("el grado cumple su criterio objetivo (ver `vocabularios.grados_desarrollo`)", () => {
    const malos = [];
    for (const u of hojas) {
      const medidas = u.metricas.filter((m) => m.estado === "medida").length;
      if (u.grado === "idea" && u.ficheros.length) malos.push(`${u.id}: «idea» no puede citar ficheros (si ya hay código, es «en_marcha»)`);
      if (u.grado !== "idea" && !u.ficheros.length) malos.push(`${u.id}: «${u.grado}» sin ficheros (sin código en staging es «idea»)`);
      if ((u.grado === "usable" || u.grado === "estable") && !u.tests.length) malos.push(`${u.id}: «${u.grado}» exige al menos un test propio en \`tests\``);
      if ((u.grado === "usable" || u.grado === "estable") && u.apagado) malos.push(`${u.id}: apagado no puede ser «${u.grado}»`);
      if (u.grado === "estable" && !medidas) malos.push(`${u.id}: «estable» exige al menos una métrica «medida»`);
    }
    expect(malos, "Baja el grado, o aporta la evidencia (el test o la métrica que falta).").toEqual([]);
  });

  it("un módulo con submódulos no se declara más avanzado que su mejor submódulo", () => {
    const malos = [];
    for (const m of mapa.modulos.filter((x) => x.submodulos?.length)) {
      const mejor = Math.max(...m.submodulos.map((s) => GRADOS_DESARROLLO.indexOf(s.grado)));
      if (GRADOS_DESARROLLO.indexOf(m.grado) > mejor) malos.push(`${m.id}: «${m.grado}» pero su mejor submódulo es «${GRADOS_DESARROLLO[mejor]}»`);
    }
    expect(malos).toEqual([]);
  });
});

describe("MODULOS.json: los ficheros existen", () => {
  it("todo fichero citado (código y tests) existe", () => {
    const faltan = [];
    for (const u of unidades) {
      for (const f of [...u.ficheros, ...u.tests]) {
        if (typeof f !== "string" || f.startsWith("/") || f.includes("\\") || f.includes("..")) faltan.push(`${u.id}: ruta mal escrita «${f}» (relativa y con /)`);
        else if (!existsSync(join(RAIZ, f))) faltan.push(`${u.id}: no existe «${f}»`);
      }
    }
    expect(faltan, "Se movió o se borró un fichero: corrige la ruta en ops/MODULOS.json (o quítala si ya no es de ese módulo).").toEqual([]);
  });

  it("los tests citados son ficheros de test", () => {
    const malos = unidades.flatMap((u) => u.tests.filter((t) => !/\.test\.(js|jsx|mjs)$/.test(t)).map((t) => `${u.id}: «${t}»`));
    expect(malos, "`tests` solo lleva ficheros *.test.js; el código va en `ficheros`.").toEqual([]);
  });
});

describe("MODULOS.json: cada tabla tiene un único módulo dueño", () => {
  const enMigraciones = tablasDeMigraciones(RAIZ);
  const universo = new Set([...enMigraciones, ...Object.keys(cableado), ...(mapa.tablas_fuera_de_migraciones ?? [])]);
  const excepciones = new Map((mapa.tablas_excepciones ?? []).map((e) => [e.tabla, e.motivo]));

  it("toda tabla que crea una migración o toca el código tiene dueño, o está en tablas_excepciones con su motivo", () => {
    const sinModulo = [...universo].filter((t) => !mapa.tablas[t] && !excepciones.has(t)).sort();
    expect(
      sinModulo,
      `Tablas sin módulo: ${sinModulo.join(", ")}. Añádelas a \`tablas\` de ops/MODULOS.json (con su dueño, y en el \`tablas\` de ese módulo) o, si de verdad no pertenecen a ninguno, a \`tablas_excepciones\` con el motivo.`,
    ).toEqual([]);
  });

  it("cada tabla citada en supabase/ESTADO.md (entre comillas invertidas) tiene dueño o excepción", () => {
    // ESTADO.md no tiene una lista parseable de tablas: es prosa. La fuente
    // fiable es migraciones + cableado.json (test de arriba); esto añade las
    // que ESTADO.md nombra a mano, por si una tabla vive solo allí.
    const nombres = new Set([...leer("supabase/ESTADO.md").matchAll(/`([a-z][a-z0-9_]*)`/g)].map((m) => m[1]));
    const citadas = [...nombres].filter((n) => enMigraciones.has(n));
    const sinModulo = citadas.filter((t) => !mapa.tablas[t] && !excepciones.has(t)).sort();
    expect(sinModulo, `ESTADO.md nombra tablas sin módulo: ${sinModulo.join(", ")}. Añádelas a ops/MODULOS.json.`).toEqual([]);
  });

  it("una tabla no está a la vez con dueño y en excepciones, y las excepciones llevan motivo", () => {
    const dobles = [...excepciones.keys()].filter((t) => mapa.tablas[t]);
    const sinMotivo = [...excepciones].filter(([, m]) => typeof m !== "string" || m.trim().length < 15).map(([t]) => t);
    expect(dobles, "Una tabla con dueño no puede ser excepción: quita una de las dos.").toEqual([]);
    expect(sinMotivo, "Toda excepción dice por qué (una frase).").toEqual([]);
  });

  it("no queda en el mapa ninguna tabla que ya no existe en las migraciones ni en el código", () => {
    const fantasmas = [...Object.keys(mapa.tablas), ...excepciones.keys()].filter((t) => !universo.has(t)).sort();
    expect(fantasmas, `Tablas del mapa que nadie crea ni toca: ${fantasmas.join(", ")}. Quítalas de ops/MODULOS.json (o añádelas a \`tablas_fuera_de_migraciones\` si existen en la base sin migración).`).toEqual([]);
  });

  it("el dueño de cada tabla existe, la lista en su `tablas`, y ningún otro módulo se la queda", () => {
    const malos = [];
    for (const [t, info] of Object.entries(mapa.tablas)) {
      const dueno = porId.get(info.dueno);
      if (!dueno) { malos.push(`${t}: el dueño «${info.dueno}» no existe`); continue; }
      if (!dueno.tablas.includes(t)) malos.push(`${t}: ${dueno.id} es su dueño pero no la lista en su \`tablas\``);
    }
    for (const u of unidades) {
      for (const t of u.tablas) {
        const info = mapa.tablas[t];
        if (!info) malos.push(`${u.id}: lista «${t}», que no está en \`tablas\` (el mapa de dueños)`);
        else if (info.dueno !== u.id) malos.push(`${u.id}: lista «${t}», pero su dueño es ${info.dueno} (una tabla, un dueño; si ${u.id} solo la usa, no la listes aquí)`);
      }
    }
    expect(malos, "PRINCIPIOS §15: una tabla, un módulo dueño. `tablas` de un módulo lleva solo las que posee.").toEqual([]);
  });

  it("`acceso` de cada tabla cuadra con supabase/cableado.json (cuántos ficheros la tocan)", () => {
    const malos = [];
    for (const [t, info] of Object.entries(mapa.tablas)) {
      if (!ACCESOS_TABLA.includes(info.acceso)) { malos.push(`${t}: acceso «${info.acceso}» fuera del vocabulario`); continue; }
      const n = (cableado[t] ?? []).length;
      const real = n === 0 ? "sin_fichero" : n === 1 ? "unico" : "repartido";
      if (info.acceso !== real) malos.push(`${t}: dice «${info.acceso}» pero cableado.json tiene ${n} fichero(s) → «${real}»`);
      if (real === "unico" && info.fichero_dueno !== cableado[t][0]) malos.push(`${t}: su único fichero es ${cableado[t][0]}, no ${info.fichero_dueno}`);
    }
    expect(malos, "Cambia `acceso` en ops/MODULOS.json (el cableado cambió: un PR sacó o añadió un fichero de esa tabla).").toEqual([]);
  });

  it("`fichero_dueno` (la única puerta) existe, o es null con una nota", () => {
    const malos = [];
    for (const [t, info] of Object.entries(mapa.tablas)) {
      if (info.fichero_dueno === null) { if (!info.nota) malos.push(`${t}: sin fichero_dueno y sin nota que lo explique`); continue; }
      if (!existsSync(join(RAIZ, info.fichero_dueno))) malos.push(`${t}: no existe «${info.fichero_dueno}»`);
    }
    expect(malos, "Pon el fichero que debe ser la única puerta a la tabla, o null con una nota (en desuso, solo RPC…).").toEqual([]);
  });
});

describe("MODULOS.json: métricas", () => {
  /** Todo el texto del producto y sus scripts, sin tests, para buscar nombres de evento. */
  const codigo = (() => {
    const trozos = [];
    const rec = (dir) => {
      for (const e of readdirSync(join(RAIZ, dir), { withFileTypes: true })) {
        const ruta = `${dir}/${e.name}`;
        if (e.isDirectory()) { if (!["node_modules", "__snapshots__", "recipes"].includes(e.name)) rec(ruta); }
        else if (/\.(js|jsx|mjs)$/.test(e.name) && !/\.test\./.test(e.name)) trozos.push(leer(ruta));
      }
    };
    for (const d of ["src", "api", "scripts"]) rec(d);
    return trozos.join("\n");
  })();

  it("cada métrica tiene id, qué mide, estado del vocabulario y dónde se saca", () => {
    const malos = [];
    for (const u of unidades) {
      const ids = new Set();
      for (const m of u.metricas) {
        for (const c of ["id", "que", "donde"]) if (typeof m[c] !== "string" || !m[c].trim()) malos.push(`${u.id}: una métrica sin «${c}»`);
        if (!ESTADOS_METRICA.includes(m.estado)) malos.push(`${u.id}/${m.id}: estado «${m.estado}» (valen: ${ESTADOS_METRICA.join(", ")})`);
        if (ids.has(m.id)) malos.push(`${u.id}/${m.id}: id de métrica repetido`);
        ids.add(m.id);
        if (m.estado === "posible" && m.evento) malos.push(`${u.id}/${m.id}: «posible» no puede nombrar un \`evento\` que ya existe (¿es «medida»?)`);
      }
    }
    expect(malos, "Una métrica es «medida» si hoy deja rastro y dice dónde; si no, «posible» y dice dónde se sacaría.").toEqual([]);
  });

  it("un `evento` citado como medido existe de verdad en el código", () => {
    const malos = [];
    for (const u of unidades) {
      for (const m of u.metricas) {
        if (m.evento && !codigo.includes(`"${m.evento}"`)) malos.push(`${u.id}/${m.id}: no encuentro el evento «${m.evento}» en src/, api/ ni scripts/ (¿se renombró? ¿se dejó de medir? pásala a «posible»)`);
      }
    }
    expect(malos).toEqual([]);
  });
});
