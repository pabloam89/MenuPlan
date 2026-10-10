import { describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { REFERENCIA, jsonEnReferencia } from "../scripts/lib/forjaReferencia.mjs";
import {
  RUTA_VOCABULARIOS, VOCABULARIOS, anclar, leerRegistro, problemasContraReferencia, problemasDeRetiros, problemasLocales, valoresActuales,
} from "../scripts/lib/vocabulariosVida.mjs";

/**
 * Ciclo de vida de los vocabularios cerrados de proceso (#481, fondo #479). Un valor
 * no se borra ni se reutiliza con otro significado: se retira en ops/vocabularios-vida.json
 * y dice a cuál pasa. Vigila:
 *
 *  1. local: lo anclado coincide con el código, y lo que falta del código está retirado;
 *  2. contra origin/staging (FORJA_REF la cambia, como en la forja): nada anclado o
 *     retirado allí desaparece aquí sin quedar retirado. Pilla el borrado doble (del
 *     código y del anclaje a la vez), que el paso 1 no ve;
 *  3. un valor retirado no vuelve al código.
 *
 * Plan B documentado: sin git, sin la referencia o sin el fichero en ella (antes de que
 * este PR entre en staging), el paso 2 se hace contra FIJADA, la copia de lo anclado al
 * nacer. Ese literal no se edita: un retiro no lo toca (el valor sigue en «retirados»).
 * El CI trae origin/staging (paso «Traer staging para los trinquetes» de tests.yml).
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REG = leerRegistro(RAIZ);
const ACT = valoresActuales();
const REF = REFERENCIA();
const enRef = jsonEnReferencia(RAIZ, REF, RUTA_VOCABULARIOS);
if (!enRef) console.info(`[vocabularios] contra ${REF}: sin git, sin la referencia o sin ${RUTA_VOCABULARIOS} en ella; se compara con la copia fijada`);

// Lo anclado el 10 oct 2026, al nacer (#481). NO se edita: ni para quitar ni para cambiar.
const FIJADA = {
  "flujo.actores": ["agente_dominio", "orquestador", "juez", "persona", "automatico"],
  "flujo.alcance_fallo": ["local", "modulo", "transversal"],
  "flujo.diagnostican": ["agente_dominio", "orquestador_con_diagnosticadores"],
  "flujo.estado_medida": ["existe", "pendiente"],
  "flujo.estado_tipo_skill": ["existe", "en_plan", "reservado"],
  "flujo.pasos": ["detectar", "registrar_caso", "triaje", "diagnosticar", "fondo", "plan", "ejecutar", "verificar", "observar", "cerrar", "aprender", "medir"],
  "fondos.estado": ["abierto", "diagnosticado", "plan", "en-curso", "en-observacion", "cerrado-eficaz", "reabierto"],
  "glosario.clase": ["accion", "estado", "artefacto", "rol", "campo", "lugar"],
  "glosario.estado": ["activo", "retirado"],
  "issues.analisis": ["nuevo", "abierto", "no-aguanto-roto", "no-aguanto-corto", "puntual"],
  "issues.area": ["datos", "lola", "ui", "catalogo", "motor", "ops"],
  "issues.arreglo": ["test", "guardia", "script", "regla", "skill", "ninguno"],
  "issues.causa": ["vigilante-falso", "vigilante-hueco", "entorno", "dos-fuentes", "error-silencioso", "coordinacion", "modelo-datos", "codigo", "sin-comprobar"],
  "issues.control": ["ok", "falla"],
  "issues.tipo": ["fondo", "caso", "encargo", "decision"],
  "issues.tipo_accion": ["preventivo", "detectivo", "correctivo"],
};

describe("los vocabularios de proceso: se retiran, no se borran", () => {
  it("cada vocabulario vigilado tiene valores y su fichero existe en el registro", () => {
    for (const [id, v] of Object.entries(VOCABULARIOS)) {
      expect(Object.keys(v.textos()).length, id).toBeGreaterThan(0);
      expect(v.fichero, id).toMatch(/^scripts\/lib\/\w+\.mjs$/);
    }
  });

  it("lo anclado coincide con el código, y lo que falta está retirado", () => {
    expect(problemasLocales(REG, ACT), "Lanza «npm run glosario -- --vocabularios --escribir»; si quitaste un valor, retíralo").toEqual([]);
  });

  it("los retiros están bien formados y ningún valor retirado vuelve al código", () => {
    expect(problemasDeRetiros(REG, ACT)).toEqual([]);
  });

  it(`nada de ${enRef ? REF : "la copia fijada"} desaparece sin retirarse`, () => {
    expect(problemasContraReferencia(REG, ACT, enRef ?? { anclados: FIJADA }), "Un valor no se borra: añádelo a «retirados» con su pasa_a").toEqual([]);
  });

  it("la copia fijada también se respeta aunque haya referencia", () => {
    expect(problemasContraReferencia(REG, ACT, { anclados: FIJADA })).toEqual([]);
  });
});

// ── Autotest: cada regla falla con datos malos ──────────────────────────────

describe("autotest del ciclo de vida", () => {
  const act = { "x.estado": ["abierto", "cerrado"] };
  const reg = (retirados = [], anclados = { "x.estado": ["abierto", "cerrado"] }) => ({ anclados, retirados });

  it("quitar un valor del código sin retirarlo falla en local", () => {
    expect(problemasLocales(reg(), { "x.estado": ["abierto"] }).join()).toMatch(/x\.estado: cerrado: ha desaparecido del código sin retirarse/);
  });

  it("un valor nuevo sin anclar falla, y anclar lo arregla", () => {
    const nuevo = { "x.estado": ["abierto", "cerrado", "pausado"] };
    expect(problemasLocales(reg(), nuevo).join()).toMatch(/pausado: valor nuevo sin anclar/);
    expect(problemasLocales(anclar(reg(), nuevo), nuevo)).toEqual([]);
  });

  it("el borrado doble (código y anclaje) pasa en local y falla contra la referencia", () => {
    const sinCerrado = { "x.estado": ["abierto"] };
    const borrado = anclar(reg(), sinCerrado);
    expect(problemasLocales(borrado, sinCerrado)).toEqual([]);
    expect(problemasContraReferencia(borrado, sinCerrado, reg()).join()).toMatch(/cerrado: estaba en la referencia y ha desaparecido sin retirarse/);
  });

  it("retirado con pasa_a vivo, todo bien; y la referencia no puede perder un retiro", () => {
    const sinCerrado = { "x.estado": ["abierto"] };
    const retiro = { vocabulario: "x.estado", valor: "cerrado", pasa_a: "abierto", desde: "2026-10-10" };
    const bien = anclar(reg([retiro]), sinCerrado);
    expect([...problemasLocales(bien, sinCerrado), ...problemasDeRetiros(bien, sinCerrado), ...problemasContraReferencia(bien, sinCerrado, reg())]).toEqual([]);
    expect(problemasContraReferencia(anclar(reg(), sinCerrado), sinCerrado, bien).join()).toMatch(/se ha quitado de «retirados»/);
  });

  it("un valor retirado que vuelve al código (otro significado) falla", () => {
    const retiro = { vocabulario: "x.estado", valor: "cerrado", pasa_a: "abierto", desde: "2026-10-10" };
    expect(problemasDeRetiros(reg([retiro]), act).join()).toMatch(/vuelve a estar en el código/);
  });

  it("pasa_a muerto, sin motivo, fecha mala, vocabulario inventado o campo de más fallan", () => {
    const sin = { "x.estado": ["abierto"] };
    const r = (x) => problemasDeRetiros(reg([{ vocabulario: "x.estado", valor: "cerrado", pasa_a: "abierto", desde: "2026-10-10", ...x }]), sin).join();
    expect(r({ pasa_a: "pausado" })).toMatch(/no es un valor vivo/);
    expect(r({ pasa_a: null })).toMatch(/hace falta un motivo/);
    expect(r({ pasa_a: null, motivo: "Ya no hay estado de cierre en la ficha" })).toBe("");
    expect(r({ desde: "10/10/2026" })).toMatch(/desde no es AAAA-MM-DD/);
    expect(r({ vocabulario: "y.otro" })).toMatch(/no está en VOCABULARIOS/);
    expect(r({ significado: "x" })).toMatch(/campo desconocido/);
  });
});

describe("autotest de las redefiniciones (#481, revisión M1)", () => {
  const act = { "x.estado": { abierto: "Registrado, sin diagnóstico", cerrado: "Ya no se mira" } };
  const reg = (extra = {}) => ({ anclados: { "x.estado": { abierto: "Registrado, sin diagnóstico", cerrado: "Ya no se mira" } }, retirados: [], redefiniciones: [], ...extra });
  const otro = { "x.estado": { abierto: "Cualquier issue sin cerrar", cerrado: "Ya no se mira" } };
  const redef = { vocabulario: "x.estado", valor: "abierto", desde: "2026-10-10", motivo: "Se amplía a todo issue sin cerrar" };

  it("cambiar la definición en el código sin re-anclar falla en local", () => {
    expect(problemasLocales(reg(), otro).join()).toMatch(/x\.estado: abierto: su definición ha cambiado/);
    expect(problemasLocales(reg(), act)).toEqual([]);
  });

  it("re-anclar sin registrar pasa en local y falla contra la referencia; con la redefinición, pasa", () => {
    const sinRegistro = anclar(reg(), otro);
    expect(problemasLocales(sinRegistro, otro)).toEqual([]);
    expect(problemasContraReferencia(sinRegistro, otro, reg()).join()).toMatch(/abierto: su definición ha cambiado respecto a la referencia sin una redefinición/);
    const conRegistro = anclar(reg({ redefiniciones: [redef] }), otro);
    expect([...problemasContraReferencia(conRegistro, otro, reg()), ...problemasDeRetiros(conRegistro, otro)]).toEqual([]);
  });

  it("una redefinición vieja no vale para un cambio nuevo, y el registro solo crece", () => {
    const ref = anclar(reg({ redefiniciones: [redef] }), otro);
    const tercero = { "x.estado": { abierto: "Otra cosa distinta", cerrado: "Ya no se mira" } };
    expect(problemasContraReferencia(anclar(ref, tercero), tercero, ref).join()).toMatch(/sin una redefinición registrada/);
    expect(problemasContraReferencia(anclar(reg(), otro), otro, ref).join()).toMatch(/tenía 1 redefinición\(es\) en la referencia y ahora menos/);
  });

  it("la forma de una redefinición y de un vocabulario retirado", () => {
    const p = (x) => problemasDeRetiros(reg({ redefiniciones: [{ ...redef, ...x }] }), act).join();
    expect(p({})).toBe("");
    expect(p({ motivo: "corto" })).toMatch(/motivo de la redefinición/);
    expect(p({ desde: "hoy" })).toMatch(/desde que no es AAAA-MM-DD/);
    expect(p({ valor: "pausado" })).toMatch(/redefinición de un valor que no está vivo/);
    expect(p({ extra: 1 })).toMatch(/campo desconocido extra/);
    expect(problemasDeRetiros(reg({ vocabularios_retirados: [{ vocabulario: "x.estado", desde: "2026-10-10", motivo: "Ya no se vigila este vocabulario" }] }), act).join()).toMatch(/está retirado y sigue en VOCABULARIOS/);
  });

  it("retirar un vocabulario entero: sin registro falla; con él, pasa en local y contra la referencia", () => {
    const sinVoc = {};
    expect(problemasLocales(reg(), sinVoc).join()).toMatch(/x\.estado: está anclado y ya no está en VOCABULARIOS/);
    expect(problemasContraReferencia(anclar(reg(), sinVoc), sinVoc, reg()).join()).toMatch(/ha desaparecido sin retirarse/);
    const retirado = anclar(reg({ vocabularios_retirados: [{ vocabulario: "x.estado", desde: "2026-10-10", motivo: "Ya no se vigila este vocabulario" }] }), sinVoc);
    expect([...problemasLocales(retirado, sinVoc), ...problemasDeRetiros(retirado, sinVoc), ...problemasContraReferencia(retirado, sinVoc, reg())]).toEqual([]);
  });
});
