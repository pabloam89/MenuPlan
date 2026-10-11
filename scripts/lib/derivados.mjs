/**
 * El inventario general de lo que se deriva de otra cosa (#584, norma C3 «un dato, un sitio»).
 *
 * Había paridad probada en los vocabularios, las normas y los documentos generados, pero ningún
 * lugar que dijera, de todo lo derivado del repo, de qué sale, quién lo regenera y qué test vigila
 * que no se quede viejo. Aquí está, sin segunda lista:
 *   - las entradas escritas a mano viven en `DERIVADOS` de `scripts/lib/generados.mjs`; el
 *     `GENERADOS` de los drivers de fusión es un filtro suyo;
 *   - los datos derivados de `TABLAS` (`src/data/model.js`) salen de ahí, que es su única fuente:
 *     aquí solo se añade qué test los vigila (`PRUEBAS_DE_TABLAS`), que el modelo no dice.
 *
 * Vive aparte de `generados.mjs` porque ese módulo lo carga el driver de fusión de git, y no debe
 * depender del modelo de datos del producto. El test es `ops/derivados.test.js`.
 */
import { TABLAS } from "../../src/data/model.js";
import { CLASES_DERIVADOS, DERIVADOS, casaRuta } from "./generados.mjs";

/**
 * Qué test vigila que cada tabla derivada con fichero está al día. `none` lleva su motivo.
 * Clave: el `id` de la tabla en `TABLAS`.
 */
export const PRUEBAS_DE_TABLAS = {
  recetaNutricion: { test: "src/data/derived.test.js" },
  recetaPartes: { test: "src/data/derived.test.js" },
  recetaFamilias: { test: "src/data/derived.test.js" },
  derivedMeta: { test: "src/data/derived.test.js" },
  recetaCoste: {
    test: "none",
    noTestReason: "coste.test.js compara los tres lectores entre sí, no el fichero con los precios de Mercadona; no hay hash de entrada como en derived.test.js",
  },
  alimentosApp: { test: "src/data/alimentos.test.js" },
  alimentoPorIngrediente: { test: "src/data/alimentos.test.js" },
  retencion: {
    test: "none",
    noTestReason: "sale de un CSV de la USDA que no está en el repo; factorRetencion.test.js audita la tabla, no la regenera",
  },
  vectoresRecetas: {
    test: "none",
    noTestReason: "vectores.test.js solo comprueba el tamaño del índice; regenerarlo cuesta llamadas al gateway de IA y no hay hash de las recetas",
  },
  fotosPlatosDerivadas: {
    test: "none",
    noTestReason: "se regenera desde las fotos en Blob, que ningún test lee",
  },
  catalogoGaleria: {
    test: "none",
    noTestReason: "lo escriben varios scripts de fotos desde el manifiesto de la galería; ningún test lo compara con él",
  },
};

/**
 * Las entradas de datos derivados que salen de `TABLAS`: las de rol `derivado` con ficheros en el
 * repo (las «en memoria» no tienen fichero que registrar). Una entrada por fichero.
 */
export function derivadosDeTablas(tablas = TABLAS, pruebas = PRUEBAS_DE_TABLAS) {
  const salida = [];
  for (const t of tablas) {
    if (t.rol !== "derivado" || !t.ficheros?.length) continue;
    const prueba = pruebas[t.id] ?? { test: "none", noTestReason: "sin decidir: añade la tabla a PRUEBAS_DE_TABLAS" };
    const script = (t.productor ?? []).find((p) => p.startsWith("scripts/"));
    for (const ruta of t.ficheros) {
      salida.push({
        ruta,
        clase: "data",
        source: `TABLAS.${t.id} de src/data/model.js: ${t.procedencia}`,
        regenera: script ?? "manual",
        ...(script ? {} : { manualReason: "el modelo no nombra ningún script en scripts/ que lo escriba" }),
        ...prueba,
      });
    }
  }
  return salida;
}

/** El inventario completo: lo escrito a mano más los datos derivados del modelo. */
export const REGISTRO = [...DERIVADOS, ...derivadosDeTablas()];

/** Cuenta de entradas por clase, en el orden de `CLASES_DERIVADOS`. */
export function contarPorClase(registro = REGISTRO) {
  const n = Object.fromEntries(Object.keys(CLASES_DERIVADOS).map((c) => [c, 0]));
  for (const g of registro) n[g.clase] = (n[g.clase] ?? 0) + 1;
  return n;
}

/**
 * Los problemas de forma de un inventario. `existe(ruta)` dice si un fichero del repo existe y
 * `ficheros`, los que sigue git. Devuelve una lista de textos; vacía si está bien.
 */
export function problemasDelRegistro(registro, { existe, ficheros }) {
  const malos = [];
  const vistas = new Set();
  for (const g of registro) {
    const dice = (m) => malos.push(`${g.ruta}: ${m}`);
    if (vistas.has(g.ruta)) dice("está dos veces en el inventario");
    vistas.add(g.ruta);
    if (!(g.clase in CLASES_DERIVADOS)) dice(`clase desconocida «${g.clase}»`);
    if (!g.source || typeof g.source !== "string") dice("falta `source` (de qué fuente sale)");
    if (!ficheros.some((f) => casaRuta(g.ruta, f))) dice("ningún fichero de git casa con la ruta");
    if (g.regenera === "manual") {
      if (!g.manualReason) dice("es `manual` y falta `manualReason`");
    } else if (!g.regenera || !existe(g.regenera)) dice(`el script \`${g.regenera}\` que lo regenera no existe`);
    if (g.test === "none") {
      if (!g.noTestReason) dice("no tiene test (`none`) y falta `noTestReason`");
    } else if (!g.test || !existe(g.test)) dice(`el test \`${g.test}\` que lo vigila no existe`);
  }
  return malos;
}

/** Marcas de un fichero escrito a mano con bloques generados (`partial`), además de la cabecera. */
const MARCAS_PARCIALES = [
  /<!--\s*[\w-]+:[\w-]+:inicio/, // FLUJO.md, PLANOS.md
  /^Fuente única: `ops\/estandares-agentes\.json`\. Esta lista la genera/m, // .claude/agents/*.md
];
/** Cabecera de un fichero generado entero: las primeras líneas dicen que no se edita a mano. */
const CABECERA = /\bGENERADO\b|Generado (desde|con|por)|Generated by|No se edita a mano|NO SE EDITA|do not edit by hand/;
const LINEAS_DE_CABECERA = 6;
const TEXTO = /\.(md|mjs|js|jsx|cjs|css|yml|yaml|py|sql|json)$/;

/**
 * Ficheros con cabecera o marcas de generado que no casan con ninguna entrada del inventario.
 * `leer(ruta)` devuelve el texto. Un fichero nuevo que se genera y no se registra falla aquí.
 */
export function generadosSinRegistrar(registro, ficheros, leer) {
  const sueltos = [];
  for (const f of ficheros) {
    if (!TEXTO.test(f)) continue;
    if (registro.some((g) => casaRuta(g.ruta, f))) continue;
    let texto;
    try {
      texto = leer(f);
    } catch {
      // a propósito: un fichero borrado en el árbol pero aún en el índice no tiene cabecera que mirar
      continue;
    }
    const cabecera = texto.split("\n", LINEAS_DE_CABECERA).join("\n");
    if (CABECERA.test(cabecera) || (f.endsWith(".md") && MARCAS_PARCIALES.some((m) => m.test(texto)))) sueltos.push(f);
  }
  return sueltos;
}
