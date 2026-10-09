// El vigía de Lola (scripts/vigia.mjs, #267): un aviso por incidente y no uno
// por fallo, que diga cuándo se resuelve, que se note si él mismo se para, y
// que ningún aviso lleve nada de las familias.
import { describe, it, expect } from "vitest";
import {
  pasada, evaluarReglas, evaluarSeguidos, tocaModelo, tocaResumen, textoDe, lineaDe,
  enviarAviso, llamarCanario, estadoVacio, normalizarEstado, FRASE_MOTIVO, FRASE_CHEQUEO, entregar, resumenDiario,
} from "./vigia.mjs";
import { fallosDe, entornoDeVercel } from "./bot-fallos.mjs";
import { VIGIA } from "../src/lib/vigia.js";
import { MOTIVOS_FALLO, CHEQUEOS_CANARIO, TIPOS_AVISO_VIGIA } from "../src/lib/vocabularios.js";

const MIN = 60_000;
const DIA_MS = 24 * 60 * MIN;
// Un jueves a las 03:00 de Madrid (01:00 UTC): antes de la hora del resumen.
const T0 = Date.parse("2026-10-08T01:00:00Z");
const fallo = (ts, motivo = "modelo", extra = {}) => ({ evento: "bot_fallo", donde: "lola", motivo, codigo: null, grave: true, ts, ...extra });
const varios = (n, ts, motivo, extra) => Array.from({ length: n }, (_, i) => fallo(ts - i * 1000, motivo, extra));
const regla = (clave) => VIGIA.reglas.find((r) => r.clave === clave);

/** Varias pasadas seguidas, cada `cadaMin`, con los fallos que se le den. */
function pasadas(n, fallosEn, { desde = T0, estado = estadoVacio(), canario = () => ({}) } = {}) {
  const avisos = [];
  for (let i = 0; i < n; i++) {
    const ahora = desde + i * VIGIA.cadaMin * MIN;
    const r = pasada({ ahora, fallos: fallosEn(ahora, i), canario: canario(i), estado });
    estado = r.estado;
    avisos.push(...r.avisos.map((a) => ({ ...a, pasada: i })));
  }
  return { avisos, estado };
}

describe("vigía: incidentes de fallos", () => {
  it("abre al pasar el umbral y no lo repite mientras sigue", () => {
    const r = regla("modelo");
    // Cuatro pasadas con fallos por encima del umbral, todas.
    const { avisos, estado } = pasadas(4, (ahora) => varios(r.abrirDesde + 2, ahora, "modelo"));
    const abiertos = avisos.filter((a) => a.tipo === "incidente_abierto" && a.clave === "modelo");
    expect(abiertos).toHaveLength(1);
    expect(abiertos[0]).toMatchObject({ n: r.abrirDesde + 2, ventanaMin: r.ventanaMin, umbral: r.abrirDesde, sitios: ["lola"] });
    expect(estado.abiertos.modelo).toBeTruthy();
  });

  it("por debajo del umbral no avisa", () => {
    const r = regla("modelo");
    const { avisos } = pasadas(3, (ahora) => varios(r.abrirDesde - 1, ahora, "modelo"));
    expect(avisos.filter((a) => a.clave === "modelo")).toEqual([]);
  });

  it("los leves no cuentan para abrir", () => {
    const r = regla("modelo");
    const { avisos } = pasadas(1, (ahora) => varios(r.abrirDesde + 5, ahora, "modelo", { grave: false }));
    expect(avisos.filter((a) => a.clave === "modelo")).toEqual([]);
  });

  it("dice cuándo se resuelve: con la calma, una vez, con lo que duró y el pico", () => {
    const r = regla("modelo");
    const pasadasConFallo = 2;
    const n = pasadasConFallo + Math.ceil(r.calmaMin / VIGIA.cadaMin) + 3;
    // Los fallos solo en las primeras pasadas; luego, nada.
    const todos = [];
    const { avisos, estado } = pasadas(n, (ahora, i) => {
      if (i < pasadasConFallo) todos.push(...varios(r.abrirDesde + i, ahora, "modelo"));
      return todos;
    });
    const deModelo = avisos.filter((a) => a.clave === "modelo");
    expect(deModelo.map((a) => a.tipo)).toEqual(["incidente_abierto", "incidente_resuelto"]);
    const resuelto = deModelo[1];
    expect(resuelto.pico).toBe(r.abrirDesde + 1);
    expect(resuelto.duroMin).toBeGreaterThanOrEqual(r.calmaMin);
    expect(estado.abiertos.modelo).toBeUndefined();
    expect(estado.historia.incidentes.map((x) => x.clave)).toContain("modelo");
  });

  it("los motivos van a su regla: una caída de la base no abre «modelo»", () => {
    const { avisos } = evaluarReglas({ fallos: varios(regla("base").abrirDesde, T0, "tiempo"), ahora: T0 });
    expect(avisos.map((a) => a.clave)).toEqual(["base"]);
  });

  it("los fallos de fuera de la ventana no cuentan", () => {
    const r = regla("modelo");
    const viejos = varios(r.abrirDesde + 3, T0 - (r.ventanaMin + 1) * MIN, "modelo");
    expect(evaluarReglas({ fallos: viejos, ahora: T0 }).avisos).toEqual([]);
  });
});

describe("vigía: el canario y los logs", () => {
  const malo = { ok: true, chequeos: [{ chequeo: "webhook_vivo", ok: false, motivo: "servidor" }] };
  const bueno = { ok: true, chequeos: [{ chequeo: "webhook_vivo", ok: true }] };

  it("un tropiezo suelto no avisa; dos seguidos, sí, una vez; y avisa al volver", () => {
    const secuencia = [malo, bueno, malo, malo, malo, bueno, bueno];
    const { avisos } = pasadas(secuencia.length, () => [], { canario: (i) => ({ salud: secuencia[i] }) });
    const deCanario = avisos.filter((a) => a.clave === "canario");
    expect(deCanario.map((a) => [a.tipo, a.pasada])).toEqual([["incidente_abierto", 3], ["incidente_resuelto", 5]]);
    expect(deCanario[0].fallan).toEqual([{ chequeo: "webhook_vivo", motivo: "servidor" }]);
  });

  it("sin el token de Vercel lo dice ya, una sola vez", () => {
    let estado = estadoVacio();
    const tipos = [];
    for (let i = 0; i < 3; i++) {
      const r = pasada({ ahora: T0 + i * VIGIA.cadaMin * MIN, fallos: null, logs: "sin_configurar", estado });
      estado = r.estado;
      tipos.push(...r.avisos.filter((a) => a.clave === "logs").map((a) => a.tipo));
    }
    expect(tipos).toEqual(["incidente_abierto"]);
  });

  it("el turno con modelo: la primera vez, luego cada `modeloCadaHoras`, y si falla, en la pasada siguiente", () => {
    const e = estadoVacio();
    expect(tocaModelo(e, T0)).toBe(true);
    const hecho = { ...e, ultimoModelo: T0 };
    expect(tocaModelo(hecho, T0 + VIGIA.cadaMin * MIN)).toBe(false);
    expect(tocaModelo(hecho, T0 + VIGIA.canario.modeloCadaHoras * 60 * MIN)).toBe(true);
    expect(tocaModelo({ ...hecho, seguidos: { canario_modelo: 1 } }, T0 + VIGIA.cadaMin * MIN)).toBe(true);
  });

  it("evaluarSeguidos no toca otras claves", () => {
    const estado = { ...estadoVacio(), abiertos: { modelo: { desde: T0 } } };
    const r = evaluarSeguidos({ clave: "canario", resultado: { ok: true }, ahora: T0, estado });
    expect(r.estado.abiertos.modelo).toBeTruthy();
  });
});

describe("vigía: latido y resumen", () => {
  it("un hueco sin pasadas más largo que `huecoMin` avisa al volver", () => {
    const primera = pasada({ ahora: T0, fallos: [], estado: estadoVacio() });
    const tarde = T0 + (VIGIA.huecoMin + 10) * MIN;
    const r = pasada({ ahora: tarde, fallos: [], estado: primera.estado });
    expect(r.avisos.find((a) => a.tipo === "vigia_parado")).toMatchObject({ desde: T0, hasta: tarde, minutos: VIGIA.huecoMin + 10 });
    // Un retraso normal de GitHub, no.
    const normal = pasada({ ahora: T0 + 2 * VIGIA.cadaMin * MIN, fallos: [], estado: primera.estado });
    expect(normal.avisos.filter((a) => a.tipo === "vigia_parado")).toEqual([]);
  });

  it("el resumen sale una vez al día, a partir de su hora de Madrid", () => {
    // 06:45 UTC = 08:45 en Madrid (verano): aún no; 07:00 UTC = 09:00: sí.
    const antes = Date.parse("2026-10-08T06:45:00Z");
    const despues = Date.parse("2026-10-08T07:00:00Z");
    expect(tocaResumen(estadoVacio(), antes)).toBe(false);
    const r = pasada({ ahora: despues, fallos: [fallo(despues - MIN, "red"), fallo(despues - 2 * DIA_MS, "red")], estado: estadoVacio() });
    const resumen = r.avisos.find((a) => a.tipo === "resumen_diario");
    expect(resumen).toMatchObject({ fecha: "2026-10-08", total: 1, graves: 1, porMotivo: [["red", 1]] });
    const otra = pasada({ ahora: despues + VIGIA.cadaMin * MIN, fallos: [], estado: r.estado });
    expect(otra.avisos.filter((a) => a.tipo === "resumen_diario")).toEqual([]);
    expect(tocaResumen(r.estado, despues + 24 * 60 * MIN)).toBe(true);
  });

  it("un estado roto o de otra versión empieza de cero", () => {
    expect(normalizarEstado(null)).toEqual(estadoVacio());
    expect(normalizarEstado({ version: 99, abiertos: { x: 1 } })).toEqual(estadoVacio());
  });
});

describe("vigía: los textos", () => {
  it("cada motivo y cada chequeo tiene su frase en llano", () => {
    for (const m of MOTIVOS_FALLO) expect(FRASE_MOTIVO[m], m).toBeTruthy();
    for (const c of CHEQUEOS_CANARIO) expect(FRASE_CHEQUEO[c], c).toBeTruthy();
  });

  it("ningún aviso lleva el texto de un fallo «otro» ni un sitio fuera de la lista", () => {
    const secreto = "Ana López alergia cacahuete 600111222";
    const fallos = varios(regla("todos").abrirDesde + 1, T0, "otro", { texto: secreto, donde: "casa_de_ana", sitio: "casa_de_ana" });
    const r = pasada({ ahora: Date.parse("2026-10-08T07:00:00Z"), fallos: fallos.map((f) => ({ ...f, ts: Date.parse("2026-10-08T06:59:00Z") })), estado: estadoVacio() });
    expect(r.avisos.length).toBeGreaterThan(1);
    for (const a of r.avisos) {
      const texto = textoDe(a, { logs: "https://vercel.example/logs", run: "https://github.example/run/1" });
      expect(texto).not.toContain("Ana");
      expect(texto).not.toContain("casa_de_ana");
      expect(lineaDe(a, false)).not.toContain("Ana");
      expect(JSON.stringify(r.estado)).not.toContain("Ana");
    }
  });

  it("los textos son cortos y llevan los enlaces", () => {
    const { avisos } = pasadas(1, (ahora) => varios(regla("modelo").abrirDesde, ahora, "modelo"));
    const t = textoDe(avisos[0], { logs: "https://vercel.example/logs", run: "https://github.example/run/1" });
    expect(t).toMatch(/^🔴 /);
    expect(t).toContain("https://vercel.example/logs");
    expect(t).toContain("https://github.example/run/1");
    expect(t.length).toBeLessThan(500);
  });

  it("la línea estructurada lleva un tipo del vocabulario", () => {
    const { avisos } = pasadas(1, (ahora) => varios(regla("modelo").abrirDesde, ahora, "modelo"));
    const l = JSON.parse(lineaDe(avisos[0], true));
    expect(l).toMatchObject({ evento: "vigia_aviso", tipo: "incidente_abierto", clave: "modelo", enviado: true });
    expect(TIPOS_AVISO_VIGIA).toContain(l.tipo);
  });
});

describe("vigía: lo de fuera", () => {
  it("sin token de avisos no manda nada (plan B: el log)", async () => {
    let llamado = false;
    const r = await enviarAviso("hola", { token: "", chat: "-100", pedir: async () => { llamado = true; } });
    expect(r).toEqual({ enviado: false, motivo: "sin_configurar" });
    expect(llamado).toBe(false);
  });

  it("con token, al chat del grupo y sin vista previa", async () => {
    let pedido = null;
    const r = await enviarAviso("hola", { token: "T", chat: "-100", pedir: async (url, o) => { pedido = { url, cuerpo: JSON.parse(o.body) }; return { ok: true }; } });
    expect(r.enviado).toBe(true);
    expect(pedido.cuerpo).toEqual({ chat_id: "-100", text: "hola", disable_web_page_preview: true });
  });

  it("del canario solo se queda con chequeos y motivos de los vocabularios", async () => {
    const pedir = async () => ({ ok: true, json: async () => ({
      ok: false, modelo: "claude-sonnet-5", uso: { in: 1000, out: 100, cr: 0, cw: 20000 },
      chequeos: [{ chequeo: "modelo", ok: false, motivo: "lento", texto: "Ana" }, { chequeo: "inventado", ok: false, motivo: "x" }, { chequeo: "base", ok: false, motivo: "raro" }],
    }) });
    const r = await llamarCanario("modelo", { url: "https://x/api/bot/canario", secreto: "s", pedir });
    expect(r.chequeos).toEqual([{ chequeo: "modelo", ok: false, motivo: "lento" }, { chequeo: "base", ok: false, motivo: "otro" }]);
    expect(r.tokens).toBe(21100);
    expect(r.usd).toBeGreaterThan(0.07);
    expect(r.usd).toBeLessThan(0.1);
  });

  it("si el canario no contesta, falla el chequeo «canario» con su motivo", async () => {
    const r = await llamarCanario("salud", { url: "https://x", secreto: "s", pedir: async () => ({ ok: false, status: 401 }) });
    expect(r).toEqual({ ok: false, chequeos: [{ chequeo: "canario", ok: false, motivo: "sin_sesion" }] });
    expect(await llamarCanario("salud", { url: "", secreto: "s" })).toBe(null);
  });

  it("lee la hora de cada fallo de un export de Vercel", () => {
    const linea = JSON.stringify({ id: "a", timestamp: T0, logs: [{ message: JSON.stringify(fallo(undefined, "red")) }] });
    expect(fallosDe(linea)[0].ts).toBe(T0);
    const suelta = `2026-10-08T10:00:00Z error ${JSON.stringify({ evento: "bot_fallo", donde: "papel", motivo: "servidor", grave: true })}`;
    expect(fallosDe(suelta)[0].ts).toBe(Date.parse("2026-10-08T10:00:00Z"));
  });
});

describe("vigía: lo que pidieron revisor y seguridad (PR #276)", () => {
  it("un aviso que Telegram rechaza cuenta como rechazado, vuelve a la cola y su línea lleva el motivo", async () => {
    const lineas = [];
    const cola = [{ aviso: { tipo: "vigia_sin_estado" }, intentos: 0 }];
    const r = await entregar({ cola, enviar: async () => ({ enviado: false, motivo: "sin_sesion" }), log: (l) => lineas.push(l) });
    expect(r.rechazados).toBe(1);
    expect(r.pendientes).toHaveLength(1);
    expect(JSON.parse(lineas[0])).toMatchObject({ evento: "vigia_aviso", enviado: false, motivo: "sin_sesion" });
    // Sin token (plan B) no es un fallo del run.
    const b = await entregar({ cola, enviar: async () => ({ enviado: false, motivo: "sin_configurar" }), log: () => {} });
    expect(b).toEqual({ pendientes: [], rechazados: 0 });
  });

  it("un 401 de Telegram se apunta con un motivo del vocabulario", async () => {
    const r = await enviarAviso("hola", { token: "T", chat: "-1", pedir: async () => ({ ok: false, status: 401 }) });
    expect(r).toEqual({ enviado: false, motivo: "sin_sesion" });
  });

  it("del estado guardado solo se queda con lo que reconoce", () => {
    const e = normalizarEstado({
      version: 1, ultimaVez: T0,
      abiertos: { modelo: { desde: T0, pico: 4, texto: "Ana" }, inventada: { desde: T0 } },
      pendientes: [
        { aviso: { tipo: "incidente_abierto", clave: "canario", fallan: [{ chequeo: "base", motivo: "Ana López" }, { chequeo: "raro", motivo: "x" }], texto: "Ana" }, intentos: 1 },
        { aviso: { tipo: "lo_que_sea", clave: "modelo" }, intentos: 0 },
        { aviso: { tipo: "incidente_abierto", clave: "inventada" }, intentos: 0 },
      ],
    });
    expect(Object.keys(e.abiertos)).toEqual(["modelo"]);
    expect(e.pendientes).toEqual([{ aviso: { tipo: "incidente_abierto", clave: "canario", fallan: [{ chequeo: "base", motivo: "otro" }] }, intentos: 1 }]);
    expect(JSON.stringify(e)).not.toContain("Ana");
  });

  it("si abren a la vez «todos» y una concreta, un solo aviso; y la de todos se cierra callada", () => {
    const r = regla("modelo");
    const todos = regla("todos");
    const fallos = [];
    const n = 2 + Math.ceil(Math.max(todos.calmaMin, r.calmaMin) / VIGIA.cadaMin) + 2;
    const { avisos } = pasadas(n, (ahora, i) => {
      if (i === 0) fallos.push(...varios(Math.max(todos.abrirDesde, r.abrirDesde), ahora, "modelo"));
      return fallos;
    });
    expect(avisos.map((a) => `${a.tipo}:${a.clave}`)).toEqual(["incidente_abierto:modelo", "incidente_resuelto:modelo"]);
  });

  describe("«todos» callado no se queda así cuando la concreta se cierra (segunda vuelta del PR #276)", () => {
    const n = 12;
    // Pasada 0: un golpe de «modelo» que abre las dos. Luego, ni un «modelo» más.
    const golpe = (ahora) => varios(Math.max(regla("todos").abrirDesde, regla("modelo").abrirDesde), ahora, "modelo");
    const correr = (deFondo) => {
      const fallos = [];
      return pasadas(n, (ahora, i) => {
        fallos.push(...(i === 0 ? golpe(ahora) : deFondo(ahora)));
        return fallos;
      });
    };

    it("si sigue por encima de su umbral, avisa al cerrarse la concreta", () => {
      // 15 graves cada pasada, repartidos para que ninguna regla concreta abra.
      const reparto = { telegram: 4, tiempo: 4, otro: 2, limite: 2, no_existe: 1, sin_sesion: 1, permiso: 1 };
      expect(Object.values(reparto).reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(regla("todos").abrirDesde);
      const { avisos } = correr((ahora) => Object.entries(reparto).flatMap(([m, k]) => varios(k, ahora - 1000, m)));
      const claves = avisos.map((a) => `${a.tipo}:${a.clave}`);
      expect(claves.slice(0, 2)).toEqual(["incidente_abierto:modelo", "incidente_resuelto:modelo"]);
      expect(claves).toContain("incidente_abierto:todos");
      expect(claves.filter((c) => c.startsWith("incidente_abierto:") && c !== "incidente_abierto:todos")).toEqual(["incidente_abierto:modelo"]);
    });

    it("si ya está por debajo de su umbral, se cierra en silencio y no queda abierto", () => {
      // Pocos, pero más de los que dejan cerrar «todos» por calma.
      const { avisos, estado } = correr((ahora) => varios(3, ahora - 1000, "telegram"));
      expect(avisos.map((a) => `${a.tipo}:${a.clave}`)).toEqual(["incidente_abierto:modelo", "incidente_resuelto:modelo"]);
      expect(estado.abiertos.todos).toBeUndefined();
    });
  });

  it("el resumen cuenta los incidentes cerrados en el día, aunque empezaran antes", () => {
    const ahora = Date.parse("2026-10-08T07:00:00Z");
    const estado = { ...estadoVacio(), historia: { pasadas: [], canario: [], incidentes: [{ clave: "modelo", desde: ahora - 30 * 60 * MIN, hasta: ahora - 60 * MIN }] } };
    expect(resumenDiario({ fallos: [], ahora, estado }).incidentes).toBe(1);
  });

  it("solo cuenta líneas que SON un bot_fallo, no una marca dentro de otro texto", () => {
    const marca = JSON.stringify({ evento: "bot_fallo", donde: "lola", motivo: "modelo", grave: true });
    const peticion = (m) => JSON.stringify({ id: "a", timestamp: T0, logs: [{ message: m }] });
    expect(fallosDe(peticion(marca))).toHaveLength(1);
    expect(fallosDe(peticion(`[turno] texto del usuario: ${marca}`))).toHaveLength(0);
    expect(fallosDe(`hola ${marca}`)).toHaveLength(0);
  });

  it("la CLI de Vercel solo ve su token y lo que necesita para arrancar", () => {
    const env = entornoDeVercel({ PATH: "/bin", HOME: "/h", VERCEL_TOKEN: "v", AVISOS_TELEGRAM_TOKEN: "t", CANARIO_SECRET: "c" });
    expect(env).toEqual({ PATH: "/bin", HOME: "/h", VERCEL_TOKEN: "v" });
  });
});
