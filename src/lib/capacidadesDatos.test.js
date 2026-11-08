/**
 * Por dato del registro de la ficha, quién lo pregunta en Lola y quién lo
 * rellena en la app (plan de fichas, trozo 23). Sale de las fichas de las
 * herramientas (api/_bot/agente.js) y de las pantallas del mapa de
 * capacidades: aquí se comprueba que no se escribe a mano en otro sitio y que
 * sus dos cifras solo bajan, como los huecos.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
// Namespace: si falta una función, falla su test, no el fichero entero.
import * as mapa from "./capacidades.js";
import { FICHAS as FICHAS_HERRAMIENTAS } from "../../api/_bot/agente.js";
import { DATOS_CASA, DATOS_PERSONA } from "./registroFicha.js";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = JSON.parse(readFileSync(join(raiz, "src/lib/capacidades.base.json"), "utf8"));
const FUENTE = readFileSync(join(raiz, "src/lib/capacidades.js"), "utf8");
// Sin la función el mapa sale vacío: falla la regla que se mide, no la importación.
const datosDelMapa = () => mapa.mapaDeDatos?.() ?? [];

describe("datos con quien los pregunta y quien los rellena (trozo 23)", () => {
  it("los datos de una capacidad no se escriben a mano: salen de las fichas de sus herramientas y de su pantalla", () => {
    const escritas = FUENTE.split("\n").filter((l) => /^\s+c\(".*\bdatos: \[/.test(l));
    expect(escritas).toEqual([]);
  });

  it("están todos los datos del registro, una vez", () => {
    const claves = datosDelMapa().map((d) => d.clave);
    expect(new Set(claves).size).toBe(claves.length);
    expect(claves.length).toBe(Object.keys(DATOS_CASA).length + Object.keys(DATOS_PERSONA).length);
  });

  it("un dato lo pregunta en Lola justo la herramienta que lo escribe", () => {
    const porClave = new Map(datosDelMapa().map((d) => [d.clave, d]));
    for (const [n, f] of FICHAS_HERRAMIENTAS) {
      for (const clave of f.escribe) expect(porClave.get(clave)?.lola, `${n} → ${clave}`).toContain(n);
    }
    for (const d of porClave.values()) {
      for (const n of d.lola) expect(FICHAS_HERRAMIENTAS.get(n).escribe, `${d.clave} ← ${n}`).toContain(d.clave);
    }
  });

  it("en la app solo cuenta la pantalla a la que se llega: una apagada no rellena nada", () => {
    const apagadas = new Set(mapa.CAPACIDADES.filter((c) => c.app?.apagada).map((c) => c.id));
    expect(apagadas.size).toBeGreaterThan(0);
    for (const d of datosDelMapa()) expect(d.app.filter((id) => apagadas.has(id)), d.clave).toEqual([]);
  });

  it("los datos sin pregunta en Lola y sin pantalla en la app solo bajan", () => {
    // Si sube: npm run capacidades -- --datos dice cuál (con «!»). Si baja: actualiza capacidades.base.json.
    expect(mapa.cifrasDeDatos?.() ?? {}).toEqual({ sinPreguntaEnLola: BASE.sinPreguntaEnLola, sinPantallaEnApp: BASE.sinPantallaEnApp });
  });
});
