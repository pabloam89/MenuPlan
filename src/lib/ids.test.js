import { describe, it, expect } from "vitest";
import * as ids from "./ids.js";

const { _interno, payloadStart } = ids;

const CLASES = {
  persona: "per_", grupo: "grp_", regla: "reg_", roster: "ros_", recetaPropia: "user_",
  menu: "menu_", carpeta: "fld_", borrador: "draft_", objetivoPropio: "custom-",
  despensaLocal: "local_", gasto: "gst_", ticket: "tkt_",
};

describe("clases con prefijo: prefijo + 12 base36", () => {
  for (const [nombre, prefijo] of Object.entries(CLASES)) {
    it(nombre, () => {
      const c = ids[nombre];
      const vistos = new Set();
      for (let i = 0; i < 500; i++) {
        const id = c.nuevo();
        expect(id.startsWith(prefijo)).toBe(true);
        expect(id.slice(prefijo.length)).toMatch(/^[0-9a-z]{12}$/);
        expect(c.es(id)).toBe(true);
        vistos.add(id);
      }
      expect(vistos.size).toBe(500);
      expect(c.es(null)).toBe(false);
      expect(c.es(42)).toBe(false);
      expect(c.es("")).toBe(false);
    });
  }
});

describe("los ids viejos siguen valiendo (nunca se reescriben)", () => {
  const casos = {
    persona: ["k3j9x0ab", "a", "mlx8k2p0q1ab"], // uid() de la app, `m<tiempo><4>` del bot
    grupo: ["k3j9x0ab", "q1"],
    regla: ["k3j9x0ab"],
    roster: ["k3j9x0ab", "default", "other"],
    recetaPropia: ["user_k3j9x0ab", "user_3f2b1c4e-9a8b-4c7d-8e6f-0a1b2c3d4e5f", "user_mlx8k2p0a1b2c3"],
    menu: ["menu_k3j9x0abmlx8k2p0"],
    carpeta: ["fld_3f2b1c4e-9a8b-4c7d-8e6f-0a1b2c3d4e5f", "fld_1727000000000_9af3"],
    borrador: ["draft_mlx8k2p0", "draft_fx_guiso"],
    objetivoPropio: ["custom-k3j9x0", "custom-k3j9x0-2"],
    despensaLocal: ["local_k3j9x0ab"],
    gasto: ["m-1727000000000-k3j9"],
    ticket: ["r-1727000000000-k3j9"],
  };
  for (const [nombre, viejos] of Object.entries(casos)) {
    it(nombre, () => {
      for (const v of viejos) expect(ids[nombre].es(v), v).toBe(true);
    });
  }

  it("y lo que no es de la clase, no vale", () => {
    expect(ids.recetaPropia.es("carnes_012")).toBe(false);
    expect(ids.carpeta.es("favoritos")).toBe(false);
    expect(ids.grupo.es("Adultos con espacios")).toBe(false);
    expect(ids.roster.es("Otro grupo")).toBe(false);
    expect(ids.menu.es("user_k3j9x0ab")).toBe(false);
    expect(ids.persona.es("per_corto")).toBe(false);
  });
});

describe("uuid (cocinadas, anónimo de analítica)", () => {
  it("v4 bien formado y distinto cada vez", () => {
    const vistos = new Set();
    for (let i = 0; i < 1000; i++) {
      const u = ids.cocinada.nuevo();
      expect(u).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(ids.cocinada.es(u)).toBe(true);
      vistos.add(u);
    }
    expect(vistos.size).toBe(1000);
  });
  it("el anónimo acepta también el de respaldo viejo (sin randomUUID)", () => {
    expect(ids.anonimo.es(ids.anonimo.nuevo())).toBe(true);
    expect(ids.anonimo.es("k3j9x0abcdmlx8k2p0")).toBe(true);
  });
});

describe("piezas", () => {
  it("base64url igual que el de Node", () => {
    for (let n = 0; n < 40; n++) {
      const b = new Uint8Array(n);
      globalThis.crypto.getRandomValues(b);
      expect(_interno.base64url(b)).toBe(Buffer.from(b).toString("base64url"));
    }
  });
  it("base36 sin sesgo grueso: todas las letras salen", () => {
    const cuenta = {};
    for (const ch of _interno.base36(36000)) cuenta[ch] = (cuenta[ch] ?? 0) + 1;
    expect(Object.keys(cuenta)).toHaveLength(36);
    // ~1000 cada una; con sesgo (x % 36 sobre 256) las 4 primeras saldrían ~14 % de más.
    for (const n of Object.values(cuenta)) expect(n).toBeGreaterThan(820);
    for (const n of Object.values(cuenta)) expect(n).toBeLessThan(1180);
  });
  it("llave: 32 hex, como gen_invite_token()", () => {
    const l = ids.llave.nuevo();
    expect(l).toMatch(/^[0-9a-f]{32}$/);
    expect(ids.llave.es(l)).toBe(true);
    expect(ids.llave.es(l.toUpperCase())).toBe(false);
  });
});

describe("códigos del bot", () => {
  it("22 caracteres base64url, y nunca con el principio de otra clase de /start", () => {
    // Con 40 000, un generador que no lo evitara daría ~10 «m_» y ~10 «p-».
    const malos = [];
    for (let i = 0; i < 40000; i++) {
      const c = ids.codigoBot.nuevo();
      const leido = payloadStart.leer(c);
      if (c.length !== 22 || !ids.codigoBot.es(c) || leido?.tipo !== "enlace" || leido.codigo !== c
        || _interno.PREFIJOS_DE_OTROS.some((p) => c.startsWith(p))) malos.push(c);
    }
    expect(malos).toEqual([]);
  });
  it("los de grupo: g + 22, se leen como de grupo y no como código de privado", () => {
    const malos = [];
    for (let i = 0; i < 20000; i++) {
      const c = ids.codigoGrupo.nuevo();
      if (!/^g[A-Za-z0-9_-]{22}$/.test(c) || !ids.codigoGrupo.es(c) || ids.codigoBot.es(c)
        || payloadStart.leer(c)?.tipo !== "codigoGrupo") malos.push(c);
    }
    expect(malos).toEqual([]);
    expect(ids.codigoGrupo.es(ids.codigoBot.nuevo())).toBe(false);
  });
});

describe("payloadStart.leer: cada clase por su forma entera", () => {
  const LLAVE = "0123456789abcdef0123456789abcdef";
  const CODIGO = "Q3xk9TzA1bVwPq7yRt2uAb";
  it.each([
    ["c123456", { tipo: "correo", codigo: "123456" }],
    [`inv_${LLAVE}`, { tipo: "invitacion", token: LLAVE }],
    [`ru_${LLAVE}`, { tipo: "recetaPropia", llave: LLAVE }],
    [`m_${LLAVE}`, { tipo: "semana", llave: LLAVE }],
    ["rc_carnes_012", { tipo: "receta", id: "carnes_012" }],
    ["rc_pollo-al-ajillo", { tipo: "receta", id: "pollo-al-ajillo" }],
    ["grupo", { tipo: "grupo" }],
    [`g${CODIGO}`, { tipo: "codigoGrupo", codigo: `g${CODIGO}` }],
    [CODIGO, { tipo: "enlace", codigo: CODIGO, pedido: null }],
    [`${CODIGO}-c20261007N2`, { tipo: "pedido", codigo: CODIGO, pedido: "c20261007N2" }],
    ["p-gs", { tipo: "pedido", codigo: null, pedido: "gs" }],
  ])("%s", (p, esperado) => {
    expect(payloadStart.leer(p)).toEqual(esperado);
  });

  it("un código viejo que empieza como un compartido es un código, no un compartido", () => {
    // Los de antes de este cambio podían salir así (1 de cada 4096 con «m_»).
    for (const c of ["m_Q3xk9TzA1bVwPq7yRt2u", "ru_3xk9TzA1bVwPq7yRt2u", "rc_3XK9TzA1bVwPq7yRt2u", "inv_xk9TzA1bVwPq7yRt2u"]) {
      expect(c).toHaveLength(22);
      expect(payloadStart.leer(c)?.tipo, c).toBe("enlace");
      expect(payloadStart.esCompartido(c), c).toBe(false);
    }
  });

  it("lo que no es de los nuestros: null", () => {
    for (const p of [null, undefined, "", "hola", "m_", `m_${LLAVE}x`, "c12345", "rc_", "x".repeat(65), "p-", `inv_${LLAVE.toUpperCase()}`]) {
      expect(payloadStart.leer(p), String(p)).toBe(null);
    }
  });

  it("esCompartido", () => {
    expect(payloadStart.esCompartido(`m_${LLAVE}`)).toBe(true);
    expect(payloadStart.esCompartido("rc_carnes_012")).toBe(true);
    expect(payloadStart.esCompartido(`inv_${LLAVE}`)).toBe(false);
    expect(payloadStart.esCompartido(CODIGO)).toBe(false);
  });
});

describe("compuestos", () => {
  it("recetaEnGrupo ida y vuelta, con grupos viejos y nuevos", () => {
    for (const g of ["k3j9x0ab", ids.grupo.nuevo()]) {
      for (const r of ["carnes_012", "user_k3j9x0ab", ids.recetaPropia.nuevo()]) {
        const x = ids.recetaEnGrupo.formatear(g, r);
        expect(x).toBe(`${g}__${r}`);
        expect(ids.recetaEnGrupo.leer(x)).toEqual({ grupo: g, receta: r });
      }
    }
    expect(ids.recetaEnGrupo.formatear(null, "carnes_012")).toBe("carnes_012");
    expect(ids.recetaEnGrupo.leer("carnes_012")).toEqual({ grupo: null, receta: "carnes_012" });
  });
  it("huecoPlan ida y vuelta", () => {
    expect(ids.huecoPlan.formatear("Miércoles", "Cena")).toBe("Miércoles-Cena");
    expect(ids.huecoPlan.leer("Miércoles-Cena")).toEqual({ dia: "Miércoles", comida: "Cena" });
    expect(ids.huecoPlan.leer("Lunes")).toBe(null);
    expect(ids.huecoPlan.leer("-Cena")).toBe(null);
    expect(ids.huecoPlan.leer("Lunes-")).toBe(null);
  });
});
