import { describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { leerEstandares, tareasDe } from "../scripts/lib/estandaresAgentes.mjs";
import { idDeCombinacion, generarN2, leerN2, problemasDeN2 } from "../scripts/lib/estandaresN2.mjs";
import { leerRegistro } from "../scripts/lib/normas.mjs";

/**
 * El estándar por combinación acción × ámbitos (N2, #684, programa #652). Falla si:
 *  1. la lista de normas de una combinación no es la que dan sus ámbitos y su acción (dice cuál falta o sobra);
 *  2. una tarea no apunta a una combinación, apunta a una que no existe o a una que no es la suya;
 *  3. una combinación no la usa ninguna tarea, o su id no es el de su acción y sus ámbitos;
 *  4. una norma que recibía una tarea por consulta deja de estar en el estándar de su combinación;
 *  5. el fichero no es lo que genera el script (`npm run estandar-n2 -- --escribir`).
 * Y cada regla se ve fallar con datos malos: cada caso cambia UNA cosa.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const datos = leerEstandares(RAIZ);
const n2 = leerN2(RAIZ);
const normas = leerRegistro(RAIZ).normas;
const malo = (cambio) => { const c = structuredClone(n2); cambio(c.combinaciones); return problemasDeN2(c, datos, normas); };
const primera = Object.keys(n2.combinaciones).find((id) => n2.combinaciones[id].normas.length > 2);

describe("el estándar de cada combinación acción × ámbitos (#684)", () => {
  it("la lista de cada combinación es la que dan sus ámbitos y su acción, y cada tarea apunta a la suya", () => {
    expect(problemasDeN2(n2, datos, normas)).toEqual([]);
  });

  it("hay una combinación por cada par acción × ámbitos distinto, y cada tarea cuenta en una", () => {
    const pares = new Set(tareasDe(datos).map(({ tarea: t }) => idDeCombinacion(t.accion, t.ambitos)));
    expect(Object.keys(n2.combinaciones).sort()).toEqual([...pares].sort());
    expect(tareasDe(datos).every(({ tarea }) => tarea.n2 in n2.combinaciones)).toBe(true);
  });

  it("el fichero es lo que genera el script: no se edita a mano ni se queda atrás", () => {
    const { $comentario, ...generado } = generarN2(datos, normas);
    const { $comentario: _, ...guardado } = n2;
    expect(guardado).toEqual(generado);
    expect($comentario).toBe(n2.$comentario);
  });

  it("toda norma que una tarea recibe por consulta está en el estándar de su combinación", () => {
    const enCombinaciones = new Set(Object.values(n2.combinaciones).flatMap((c) => c.normas));
    for (const { tarea: t } of tareasDe(datos)) {
      const c = n2.combinaciones[t.n2];
      for (const n of normas.filter((x) => x.lado === "horizontal" && t.ambitos.includes(x.ambito) && x.acciones.some((a) => (["construir", "juzgar"].includes(t.accion) ? ["construir", "juzgar"] : [t.accion]).includes(a)))) {
        expect(c.normas, `${t.id}: ${n.id}`).toContain(n.id);
        expect(enCombinaciones.has(n.id)).toBe(true);
      }
    }
  });

  describe("se ve fallar con datos malos", () => {
    it("una norma que falta en la lista", () => {
      const quitada = n2.combinaciones[primera].normas[1];
      expect(malo((c) => { c[primera].normas.splice(1, 1); })).toContain(`${primera}: falta la norma «${quitada}», que dan sus ámbitos (${n2.combinaciones[primera].ambitos.join(", ")}) × ${n2.combinaciones[primera].accion}`);
    });
    it("una norma que sobra (existe, pero no es de sus ámbitos ni de su acción)", () => {
      const ajena = normas.find((n) => n.lado === "horizontal" && !n2.combinaciones[primera].normas.includes(n.id)).id;
      expect(malo((c) => { c[primera].normas.push(ajena); }).join("\n")).toContain(`${primera}: sobra la norma «${ajena}»`);
    });
    it("una norma que no existe", () => {
      expect(malo((c) => { c[primera].normas.push("norma-inventada"); }).join("\n")).toMatch(/cita la norma «norma-inventada», que no está en ops\/normas\.json/);
    });
    it("una norma repetida", () => {
      expect(malo((c) => { c[primera].normas.push(c[primera].normas[0]); }).join("\n")).toMatch(/repite una norma/);
    });
    it("una combinación que ninguna tarea usa", () => {
      expect(malo((c) => { c["operar.api"] = { accion: "operar", ambitos: ["api"], normas: [] }; }).join("\n")).toMatch(/operar\.api: ninguna tarea apunta/);
    });
    it("un id que no es el de su acción y sus ámbitos", () => {
      expect(malo((c) => { c[primera].accion = "medir"; }).join("\n")).toContain(`${primera}: su id no es el de su acción`);
    });
    it("una tarea sin combinación, con una que no existe o con la de otra", () => {
      const quitar = (cambio) => { const d = structuredClone(datos); cambio(tareasDe(d)[0].tarea); return problemasDeN2(n2, d, normas); };
      const t0 = tareasDe(datos)[0];
      expect(quitar((t) => { delete t.n2; }).join("\n")).toMatch(new RegExp(`${t0.agente}/${t0.tarea.id}: no apunta a ninguna combinación`));
      expect(quitar((t) => { t.n2 = "construir.nada"; }).join("\n")).toMatch(/apunta a la combinación «construir\.nada», que no está/);
      const otra = Object.keys(n2.combinaciones).find((id) => id !== t0.tarea.n2);
      expect(quitar((t) => { t.n2 = otra; }).join("\n")).toMatch(/su combinación es «.*» pero su acción y sus ámbitos dan/);
    });
    it("la consulta cambia: una acción que deja de dar normas se ve en las listas", () => {
      const soloLaSuya = (a) => [a];
      expect(problemasDeN2(n2, datos, normas, { deConsulta: soloLaSuya }).join("\n")).toMatch(/sobra la norma|falta la norma/);
    });
  });
});
