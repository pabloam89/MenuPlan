import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ficherosDeGit, directosDe } from "./ficherosGit.js";
import { tablas as tablasDeMigraciones } from "../scripts/cableado.mjs";
import { GRADOS_DESARROLLO, AMBITOS_MODULO, ESTADOS_METRICA, MOTIVOS_SIN_PUERTA } from "../src/lib/vocabularios.js";

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
/** Lo que git ve (versionado + nuevo, sin lo ignorado): lo generado por el build no cuenta. */
const FICHEROS = ficherosDeGit(RAIZ);
const mapa = JSON.parse(leer("ops/MODULOS.json"));
const cableado = JSON.parse(leer("supabase/cableado.json"));

/** Módulos y submódulos en una lista plana, con su padre. */
const unidades = mapa.modulos.flatMap((m) => [{ ...m, padre: null }, ...(m.submodulos ?? []).map((s) => ({ ...s, ambito: m.ambito, padre: m.id }))]);
const porId = new Map(unidades.map((u) => [u.id, u]));
const hojas = unidades.filter((u) => !(u.submodulos?.length));
const EXT = ["", ".js", ".jsx", ".mjs", "/index.js"];

/** Los ficheros a los que un fichero de test se refiere con import, require, mock o URL relativa. */
function refsDeTest(ruta) {
  const texto = leer(ruta);
  const dir = dirname(ruta);
  const salida = new Set();
  for (const m of texto.matchAll(/["'`](\.{1,2}\/[^"'`\s]+)["'`]/g)) {
    const base = join(dir, m[1]).replace(/\\/g, "/");
    for (const e of EXT) if (existsSync(join(RAIZ, base + e))) salida.add(base + e);
  }
  return salida;
}

describe("MODULOS.json: forma y vocabulario cerrado", () => {
  it("las definiciones del JSON dicen lo mismo que las constantes de src/lib/vocabularios.js", () => {
    const aviso = "Si añades un valor, ponlo en la constante de src/lib/vocabularios.js Y en `vocabularios` de ops/MODULOS.json con su definición.";
    expect(Object.keys(mapa.vocabularios.grados_desarrollo), aviso).toEqual(GRADOS_DESARROLLO);
    expect(Object.keys(mapa.vocabularios.ambitos_modulo), aviso).toEqual(AMBITOS_MODULO);
    expect(Object.keys(mapa.vocabularios.estados_metrica), aviso).toEqual(ESTADOS_METRICA);
    expect(Object.keys(mapa.vocabularios.motivos_sin_puerta), aviso).toEqual(MOTIVOS_SIN_PUERTA);
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
      for (const c of ["ficheros", "tests", "metricas"]) {
        if (!Array.isArray(u[c])) faltan.push(`${u.id}: «${c}» debe ser una lista (vacía si no hay nada)`);
      }
      if ("tablas" in u) faltan.push(`${u.id}: «tablas» no se guarda en el módulo; el dueño vive solo en el mapa \`tablas\``);
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

  it("cada test de una unidad prueba algo de esa unidad (importa o se refiere a uno de sus `ficheros`), salvo excepciones con motivo", () => {
    const excepciones = new Set((mapa.tests_ajenos_admitidos ?? []).map((e) => `${e.unidad}|${e.test}`));
    const malos = [];
    for (const u of unidades) {
      const suyos = new Set(u.ficheros);
      for (const t of u.tests) {
        if (!existsSync(join(RAIZ, t))) continue; // ya lo dice el test de ficheros
        if (excepciones.has(`${u.id}|${t}`)) continue;
        if (![...refsDeTest(t)].some((r) => suyos.has(r))) malos.push(`${u.id}: «${t}» no importa ningún fichero de su unidad`);
      }
    }
    expect(malos, "Un test solo cuenta como evidencia si toca código de la unidad. Cita otro test que sí lo haga, baja el grado, o añádelo a `tests_ajenos_admitidos` con unidad, test y motivo.").toEqual([]);
  });

  it("las excepciones de tests ajenos llevan motivo y apuntan a algo que existe", () => {
    const malos = (mapa.tests_ajenos_admitidos ?? []).flatMap((e) => {
      const u = porId.get(e.unidad);
      if (!u) return [`${e.unidad}: la unidad no existe`];
      if (!u.tests.includes(e.test)) return [`${e.unidad}: ya no cita «${e.test}»; quita la excepción`];
      if (typeof e.motivo !== "string" || e.motivo.trim().length < 15) return [`${e.unidad}/${e.test}: falta el motivo`];
      return [];
    });
    expect(malos).toEqual([]);
  });

  it("lo apagado nombra su interruptor, y ese interruptor existe y vale lo que dice", async () => {
    const malos = [];
    for (const u of unidades.filter((x) => x.apagado)) {
      const a = u.apagado_por;
      if (!a?.constante || !a?.fichero || a.valor === undefined) { malos.push(`${u.id}: apagado sin \`apagado_por\` {constante, fichero, valor}`); continue; }
      if (!existsSync(join(RAIZ, a.fichero))) { malos.push(`${u.id}: no existe «${a.fichero}»`); continue; }
      const modulo = await import(pathToFileURL(join(RAIZ, a.fichero)).href);
      if (!(a.constante in modulo)) malos.push(`${u.id}: ${a.fichero} no exporta ${a.constante}`);
      else if (modulo[a.constante] !== a.valor) malos.push(`${u.id}: ${a.constante} vale ${modulo[a.constante]} y el mapa dice ${a.valor} (¿se volvió a encender? cambia grado y quita \`apagado\`)`);
      else if (a.valor !== false) malos.push(`${u.id}: un módulo apagado tiene su interruptor en false`);
    }
    for (const u of unidades) if (u.apagado_por && !u.apagado) malos.push(`${u.id}: tiene \`apagado_por\` pero no \`apagado: true\``);
    expect(malos, "Si el interruptor cambió, actualiza `apagado`/`apagado_por` y el grado del módulo.").toEqual([]);
  });
});

describe("MODULOS.json: los ficheros existen y no queda código sin dueño", () => {
  it("todo fichero citado (código y tests) existe", () => {
    const faltan = [];
    const todos = [...unidades.map((u) => [u.id, [...u.ficheros, ...u.tests]]), ...(mapa.ficheros_sin_modulo ?? []).map((g, i) => [`ficheros_sin_modulo[${i}]`, g.ficheros])];
    for (const [id, lista] of todos) {
      for (const f of lista) {
        if (typeof f !== "string" || f.startsWith("/") || f.includes("\\") || f.includes("..")) faltan.push(`${id}: ruta mal escrita «${f}» (relativa y con /)`);
        else if (!existsSync(join(RAIZ, f))) faltan.push(`${id}: no existe «${f}»`);
      }
    }
    expect(faltan, "Se movió o se borró un fichero: corrige la ruta en ops/MODULOS.json (o quítala si ya no es de ese módulo).").toEqual([]);
  });

  it("los tests citados son ficheros de test", () => {
    const malos = unidades.flatMap((u) => u.tests.filter((t) => !/\.test\.(js|jsx|mjs)$/.test(t)).map((t) => `${u.id}: «${t}»`));
    expect(malos, "`tests` solo lleva ficheros *.test.js; el código va en `ficheros`.").toEqual([]);
  });

  it("ningún fichero está en más de una unidad, salvo los de `ficheros_compartidos` (con motivo)", () => {
    const dondeEsta = new Map();
    for (const u of unidades) for (const f of u.ficheros) dondeEsta.set(f, [...(dondeEsta.get(f) ?? []), u.id]);
    const compartidos = new Map((mapa.ficheros_compartidos ?? []).map((c) => [c.fichero, c]));
    const malos = [];
    for (const [f, ids] of dondeEsta) {
      if (ids.length > 1 && !compartidos.has(f)) malos.push(`${f}: en ${ids.join(" y ")}`);
    }
    for (const [f, c] of compartidos) {
      const ids = dondeEsta.get(f) ?? [];
      if (typeof c.motivo !== "string" || c.motivo.trim().length < 15) malos.push(`${f}: en ficheros_compartidos sin motivo`);
      if (ids.length < 2) malos.push(`${f}: está en ficheros_compartidos pero solo en ${ids.length} unidad(es); quítalo de la lista`);
      else if (JSON.stringify([...ids].sort()) !== JSON.stringify([...(c.unidades ?? [])].sort())) malos.push(`${f}: \`unidades\` dice ${(c.unidades ?? []).join(", ")} pero está en ${ids.join(", ")}`);
    }
    expect(malos, "Un fichero es de un solo módulo: asígnalo a su dueño natural o a ficheros_sin_modulo. Si de verdad es de dos, añádelo a `ficheros_compartidos` con { fichero, unidades, motivo }.").toEqual([]);
  });

  it("todo fichero de api/ y de src/screens y src/lib está en algún módulo o en ficheros_sin_modulo (con motivo)", () => {
    const enModulo = new Set(unidades.flatMap((u) => u.ficheros));
    const grupos = mapa.ficheros_sin_modulo ?? [];
    const sinModulo = new Set(grupos.flatMap((g) => g.ficheros));
    const sinMotivo = grupos.filter((g) => typeof g.motivo !== "string" || g.motivo.trim().length < 15).map((g) => g.ficheros.join(", "));
    const hay = [];
    for (const d of ["api", "api/_bot", "api/bot", "src/screens", "src/lib"]) {
      for (const f of directosDe(FICHEROS, d)) {
        if (/\.(js|jsx|mjs)$/.test(f) && !/\.test\./.test(f)) hay.push(f);
      }
    }
    const nuevos = hay.filter((f) => !enModulo.has(f) && !sinModulo.has(f));
    const dobles = hay.filter((f) => enModulo.has(f) && sinModulo.has(f));
    expect(nuevos, `Código sin módulo: ${nuevos.join(", ")}. Añádelo a \`ficheros\` del módulo al que pertenece en ops/MODULOS.json o, si de verdad no es de ninguno, a un grupo de \`ficheros_sin_modulo\` con su motivo.`).toEqual([]);
    expect(dobles, "Está en un módulo Y en ficheros_sin_modulo: quítalo de la lista de sin módulo.").toEqual([]);
    expect(sinMotivo, "Cada grupo de ficheros_sin_modulo dice por qué (una frase).").toEqual([]);
  });
});

describe("MODULOS.json: cada tabla tiene un único módulo dueño y sus dos puertas", () => {
  const enMigraciones = tablasDeMigraciones(RAIZ);
  const universo = new Set([...enMigraciones, ...Object.keys(cableado), ...(mapa.tablas_fuera_de_migraciones ?? [])]);
  const excepciones = new Map((mapa.tablas_excepciones ?? []).map((e) => [e.tabla, e.motivo]));

  it("toda tabla que crea una migración o toca el código tiene dueño, o está en tablas_excepciones con su motivo", () => {
    const sinModulo = [...universo].filter((t) => !mapa.tablas[t] && !excepciones.has(t)).sort();
    expect(
      sinModulo,
      `Tablas sin módulo: ${sinModulo.join(", ")}. Añádelas a \`tablas\` de ops/MODULOS.json (con su dueño y sus puertas) o, si de verdad no pertenecen a ninguno, a \`tablas_excepciones\` con el motivo. Una tabla cuya migración aún no está aplicada también puede tener dueño.`,
    ).toEqual([]);
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

  it("el dueño de cada tabla existe", () => {
    const malos = Object.entries(mapa.tablas).filter(([, i]) => !porId.has(i.dueno)).map(([t, i]) => `${t}: el dueño «${i.dueno}» no existe`);
    expect(malos, "PRINCIPIOS §15: una tabla, un módulo dueño (campo `dueno`, un id de módulo o submódulo).").toEqual([]);
  });

  it("las dos puertas de cada tabla (app y servidor) están en `ficheros` del dueño, o son null con motivo en `sin_puerta`", () => {
    const malos = [];
    for (const [t, info] of Object.entries(mapa.tablas)) {
      const dueno = porId.get(info.dueno);
      const puertas = info.fichero_dueno;
      if (!puertas || !("app" in puertas) || !("servidor" in puertas)) { malos.push(`${t}: \`fichero_dueno\` debe ser { app, servidor }`); continue; }
      for (const lado of ["app", "servidor"]) {
        const f = puertas[lado];
        if (f === null) {
          const sp = info.sin_puerta?.[lado];
          if (!sp || !MOTIVOS_SIN_PUERTA.includes(sp.motivo)) malos.push(`${t}: puerta ${lado} null sin \`sin_puerta.${lado}.motivo\` válido (${MOTIVOS_SIN_PUERTA.join(", ")})`);
          else if (sp.texto !== undefined && (typeof sp.texto !== "string" || sp.texto.trim().length < 10)) malos.push(`${t}: el texto de sin_puerta.${lado} es demasiado corto`);
          continue;
        }
        if (info.sin_puerta?.[lado]) malos.push(`${t}: puerta ${lado} definida pero con \`sin_puerta.${lado}\`; quita uno`);
        if (!existsSync(join(RAIZ, f))) malos.push(`${t}: no existe la puerta ${lado} «${f}»`);
        else if (dueno && !dueno.ficheros.includes(f)) malos.push(`${t}: la puerta ${lado} «${f}» no está en \`ficheros\` de su dueño (${info.dueno}); o el dueño es otro o la puerta es otra`);
        const deApp = f.startsWith("src/");
        if (lado === "app" && !deApp) malos.push(`${t}: la puerta app «${f}» debería estar en src/`);
        if (lado === "servidor" && deApp) malos.push(`${t}: la puerta servidor «${f}» no debería estar en src/`);
      }
    }
    expect(malos, "PRINCIPIOS §15 pide una puerta por lado. Si una no existe de verdad, ponla a null y explica por qué: no inventes.").toEqual([]);
  });

  it("`acceso` no se guarda: lo calcula el panel de supabase/cableado.json", () => {
    const guardado = Object.entries(mapa.tablas).filter(([, i]) => "acceso" in i).map(([t]) => t);
    expect(guardado, "Quita `acceso`: cuántos ficheros tocan una tabla sale de supabase/cableado.json, no se copia.").toEqual([]);
  });
});

describe("MODULOS.json: métricas", () => {
  /** Todo el código del producto y sus scripts, sin tests. */
  const codigo = (() => {
    const trozos = [];
    const EXCLUIDOS = new Set(["node_modules", "__snapshots__", "recipes"]);
    for (const f of FICHEROS) {
      if (!/^(src|api|scripts)\//.test(f) || !/\.(js|jsx|mjs)$/.test(f) || /\.test\./.test(f)) continue;
      if (f.split("/").some((p) => EXCLUIDOS.has(p))) continue;
      trozos.push(leer(f));
    }
    // Sin comentarios: un evento nombrado solo en un comentario no se emite.
    return trozos.join("\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  })();

  /**
   * Las llamadas de emisión del repo: trackEvent(user, EVENTO, …) y
   * rastro(casa, EVENTO, …) llevan el evento de segundo argumento;
   * registrar(EVENTO, …), de primero.
   */
  const llamadas = (arg) => [
    new RegExp(`\\b(?:trackEvent|rastro)\\(\\s*[^,()]*,\\s*${arg}`),
    new RegExp(`\\bregistrar\\(\\s*${arg}`),
  ];

  /** ¿Se emite este evento? Literal o por su constante EMBUDO/RASTRO en una llamada de emisión; o, si es de log, en la línea `evento: "…"`. */
  const seEmite = (ev, forma) => {
    if (forma === "log") return new RegExp(`\\bevento:\\s*["']${ev}["']`).test(codigo);
    if (llamadas(`["']${ev}["']`).some((r) => r.test(codigo))) return true;
    const claves = [...codigo.matchAll(new RegExp(`\\b([A-Z][A-Z_]+):\\s*["']${ev}["']`, "g"))].map((m) => m[1]);
    return claves.some((k) => llamadas(`(?:RASTRO|EMBUDO)\\.${k}\\b`).some((r) => r.test(codigo)));
  };

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

  it("un `evento` citado como medido se emite de verdad (trackEvent, registrar o rastro; o línea de log si dice emision: log)", () => {
    const malos = [];
    for (const u of unidades) {
      for (const m of u.metricas) {
        if (m.evento && !seEmite(m.evento, m.emision)) malos.push(`${u.id}/${m.id}: nadie emite el evento «${m.evento}» en una llamada trackEvent/registrar/rastro (¿se renombró? ¿se dejó de medir? pásala a «posible»)`);
      }
    }
    expect(malos).toEqual([]);
  });
});
