import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CAMPOS_FICHA, comentario, falla, fijarCampos, leerFicha, validarFicha } from "./lib/fondos.mjs";
import { CATALOGO, TOPE_RONDAS, celdas, presupuestoDe } from "./lib/presupuestos.mjs";

/**
 * El tope de rondas es DURO (#339): construir → juzgar → reparar, como mucho
 * `rondas_max` del catálogo para su alcance y causa. El conteo vive en el campo
 * `rondas` de la ficha del fondo (no en la sesión) y la regla `rondas-excedidas`
 * de validarFicha lo falla al pasarse. El workflow `fondos` ejecuta validarFicha
 * en cada evento del issue. La escalada a la tercera ronda está probada abajo.
 */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

const bloque = (lineas) => `Texto del fondo.\n\n\`\`\`fondo\n${lineas.join("\n")}\n\`\`\`\n`;
const BUENA = {
  estado: "plan", tipo_causa: "codigo", alcance: "local", severidad: "medio", capa_agente: "gobierno",
  mecanismo: "El control solo corre si alguien lo lanza", causa_escape: "Ningún workflow reacciona",
};
const ficha = (extra = {}, quitar = []) => {
  const d = { ...BUENA, ...extra };
  for (const q of quitar) delete d[q];
  return bloque(Object.entries(d).map(([k, v]) => `${k}: ${v}`));
};
const fondo = (cuerpo, causa = "codigo") => ({
  number: 50, title: "[fondo] x", state: "OPEN", stateReason: null, createdAt: "2026-10-12T10:00:00Z", closedAt: null,
  body: `${cuerpo}\n### Arreglo general\n\nUna pieza.`, labels: ["tipo:fondo", `causa:${causa}`, "area:ops"].map((name) => ({ name })), hijos: [],
});
const CTX = { hoy: "2026-10-20", existeEnStaging: () => true };
const reglas = (r, gravedad) => r.hallazgos.filter((h) => !gravedad || h.gravedad === gravedad).map((h) => h.regla);
const con = (extra, causa) => validarFicha(fondo(ficha(extra, []), causa ?? extra.tipo_causa ?? "codigo"), CTX);

describe("el campo «rondas» de la ficha", () => {
  it("es de la ficha y la plantilla del fondo lo trae", () => {
    expect(CAMPOS_FICHA.rondas).toEqual({ tipo: "entero" });
    const yml = readFileSync(join(RAIZ, ".github", "ISSUE_TEMPLATE", "2-fondo.yml"), "utf8");
    expect(yml).toMatch(/^ {8}rondas:$/m);
    expect(yml).toMatch(/^ {8}rondas: número entero/m);
  });

  it("se lee como número, también el cero", () => {
    expect(leerFicha(bloque(["rondas: 2"])).ficha).toEqual({ rondas: 2 });
    expect(leerFicha(bloque(["rondas: 0"])).ficha).toEqual({ rondas: 0 });
    expect(leerFicha(bloque(["rondas:"])).ficha).toEqual({});
  });

  it.each(["-1", "2.5", "x", "100", "1e1", "dos", "#2", "2 rondas", "0x2"])("rechaza «%s»", (valor) => {
    const l = leerFicha(bloque([`rondas: ${valor}`]));
    expect(l.errores.map((e) => e.regla)).toEqual(["ficha-vocabulario"]);
    expect(l.errores[0].mensaje).toMatch(/número entero de 0 a 99/);
  });

  it("fijarCampos puede escribirlo en la ficha", () => {
    const nuevo = fijarCampos(ficha({ rondas: 1 }), { rondas: 2 });
    expect(leerFicha(nuevo).ficha.rondas).toBe(2);
  });
});

describe("rondas-excedidas: el tope duro, celda a celda", () => {
  it.each(celdas().map((c) => [`${c.alcance} × ${c.causa}`, c]))("%s: el máximo pasa y el siguiente falla", (_n, { alcance, causa }) => {
    const max = presupuestoDe(alcance, causa).rondas_max;
    const base = { tipo_causa: causa, alcance };
    for (let r = 0; r <= max; r++) {
      expect(reglas(con({ ...base, rondas: r })), `${r} rondas`).not.toContain("rondas-excedidas");
    }
    const mas = con({ ...base, rondas: max + 1 });
    expect(reglas(mas, "error")).toContain("rondas-excedidas");
    expect(falla(mas)).toBe(true);
  });

  it("sin el campo no hay control (no se inventa un conteo)", () => {
    expect(reglas(con({}))).not.toContain("rondas-excedidas");
  });

  it("la escalada a la tercera ronda: 0, 1 y 2 pasan; a la tercera falla y pide la decisión a Pablo", () => {
    const max = presupuestoDe("local", "codigo").rondas_max;
    expect(max).toBe(TOPE_RONDAS); // con los valores de hoy el tope es de dos; si F lo baja, el test sigue por el catálogo
    for (const r of [0, 1, 2]) expect(falla(con({ rondas: r })), `ronda ${r}`).toBe(false);
    const tercera = con({ rondas: 3 });
    expect(falla(tercera)).toBe(true);
    const h = tercera.hallazgos.find((x) => x.regla === "rondas-excedidas");
    expect(h.gravedad).toBe("error");
    expect(h.mensaje).toMatch(/no hay otra vuelta/);
    expect(h.mensaje).toMatch(/tipo decision asignado a Pablo/);
    expect(h.mensaje).toContain("--tipo decision");
    // El comentario del bot lo deja a la vista: estado=falla y la regla.
    const c = comentario(tercera, { run: 123 });
    expect(c).toMatch(/^<!-- menuplan:fondo estado=falla/);
    expect(c).toContain("`rondas-excedidas`");
  });

  it("no hay acción automática: falla y avisa, no cierra ni reabre nada", () => {
    expect(con({ rondas: 3 }).acciones).toEqual([]);
  });

  it("una causa puede bajar el tope de su celda (catálogo de prueba) y solo la de esa causa", () => {
    const c = structuredClone(CATALOGO);
    c.por_causa.entorno = { ...c.por_causa.entorno, rondas_max: 1 };
    const prueba = (causa, rondas) => validarFicha(fondo(ficha({ tipo_causa: causa, alcance: "modulo", rondas }), causa), { ...CTX, presupuestos: c });
    expect(reglas(prueba("entorno", 2), "error")).toContain("rondas-excedidas");
    expect(reglas(prueba("entorno", 1), "error")).not.toContain("rondas-excedidas");
    expect(reglas(prueba("codigo", 2), "error")).not.toContain("rondas-excedidas");
  });

  it("sin alcance o sin causa en la ficha, rige el tope duro general; la causa puede venir de la etiqueta", () => {
    const sinAlcance = validarFicha(fondo(ficha({ rondas: TOPE_RONDAS + 1 }, ["alcance"])), CTX);
    expect(reglas(sinAlcance, "error")).toEqual(expect.arrayContaining(["rondas-excedidas", "ficha-incompleta"]));
    expect(reglas(validarFicha(fondo(ficha({ rondas: TOPE_RONDAS }, ["alcance"])), CTX), "error")).not.toContain("rondas-excedidas");
    const sinCausa = validarFicha(fondo(ficha({ rondas: 3 }, ["tipo_causa"]), "entorno"), CTX);
    expect(reglas(sinCausa, "error")).toContain("rondas-excedidas");
  });

  it("el mensaje solo lleva vocabulario y números nuestros (nada del autor)", () => {
    const h = con({ rondas: 3 }).hallazgos.find((x) => x.regla === "rondas-excedidas");
    expect(h.mensaje).not.toContain("@");
    expect(h.mensaje).toContain("alcance local");
    expect(h.mensaje).toContain("causa codigo");
  });
});
