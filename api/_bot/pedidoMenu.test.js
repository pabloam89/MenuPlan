import { beforeEach, describe, expect, it, vi } from "vitest";

const AHORA = new Date("2026-11-05T18:00:00Z");
const db = vi.hoisted(() => ({ filas: [], antesDeInsertar: null }));
const duplicado = () => Object.assign(new Error("duplicate key"), { codigo: "23505" });

vi.mock("./db.js", () => ({
  eq: (v) => `eq.${v}`,
  select: vi.fn(async () => db.filas.filter((f) => f.status === "abierta")),
  insert: vi.fn(async (_tabla, [fila]) => {
    db.antesDeInsertar?.();
    if (db.filas.some((f) => f.status === "abierta")) throw duplicado();
    db.filas.push({ id: "t1", status: "abierta", updated_at: AHORA.toISOString(), ...fila });
  }),
  update: vi.fn(async (_tabla, _filtro, cambios) => {
    const f = db.filas.find((x) => x.status === "abierta");
    if (f) Object.assign(f, cambios);
    return f ? [f] : [];
  }),
}));

const { bloqueDePedido, cerrarPedido, ejesConElPedido, guardarPedido, pedidoDeFila, pedidoDelTurno, pedidoEnCurso } = await import("./pedidoMenu.js");
const { insert, update } = await import("./db.js");
const { COSAS_QUE_CADUCAN, CADUCA } = await import("./caducidades.js");
const VIDA = COSAS_QUE_CADUCAN[CADUCA.PEDIDO_MENU].vidaMs;
const CTX = { householdId: "casa", chatId: 7, userId: "u" };

beforeEach(() => {
  db.filas = [];
  db.antesDeInsertar = null;
  insert.mockClear();
});

describe("el pedido de cada turno (trozo 67)", () => {
  it("el aviso de rehacer sigue guardado en la fila (trozo 72)", () => {
    expect(pedidoDeFila({ pedido: JSON.stringify({ avisado: true }) }).avisado).toBe(true);
  });

  const ABIERTO = { camino: "medio", desde: "2026-11-09", forzado: false, preguntado: true, estructura: null, estructuraCena: null, avisado: false };

  it("lo ya dicho sigue aunque la llamada no lo traiga", () => {
    expect(pedidoDelTurno(ABIERTO, {})).toEqual(ABIERTO);
  });

  it("el botón pulsado elige el camino", () => {
    expect(pedidoDelTurno(null, { texto: "Solo los días" }).camino).toBe("basico");
  });

  it("cambiar de camino deja sus preguntas por hacer", () => {
    expect(pedidoDelTurno(ABIERTO, { camino: "avanzado" })).toMatchObject({ camino: "avanzado", preguntado: false });
  });

  it("«Ya está, genéralo» fuerza, y forzado sigue forzado", () => {
    expect(pedidoDelTurno(null, { texto: "Ya está, genéralo" }).forzado).toBe(true);
    expect(pedidoDelTurno({ ...ABIERTO, forzado: true }, {}).forzado).toBe(true);
  });

  it("lo dicho para este menú sigue en el pedido y cuenta como contestado (trozo 69)", () => {
    const p = pedidoDelTurno(pedidoDelTurno(null, { estructura: "1_plato" }), { estructuraCena: "primero_segundo" });
    expect(p).toMatchObject({ estructura: "1_plato", estructuraCena: "primero_segundo" });
    expect(ejesConElPedido({ mealStructure: { estado: "falta" }, cookLevel: { estado: "falta" } }, p)).toMatchObject({ mealStructure: { estado: "sabido" }, mealStructureCena: { estado: "sabido" }, cookLevel: { estado: "falta" } });
    expect(ejesConElPedido(null, p)).toBeNull();
  });

  it("una estructura que no es del vocabulario no entra", () => {
    expect(pedidoDeFila({ pedido: JSON.stringify({ estructura: "tres" }) }).estructura).toBeNull();
  });

  it("Lola ve lo que hay del pedido, y nada si no hay", () => {
    expect(bloqueDePedido(null)).toBe("");
    expect(bloqueDePedido({ camino: "basico", desde: null })).toMatch(/camino «Solo los días», aún sin fecha/);
  });
});

describe("pedido de menú en curso (trozo 66)", () => {
  it("se abre como una espera de generar_menu, con su clave y su caducidad", async () => {
    await guardarPedido(CTX, { camino: "basico" }, AHORA);
    expect(db.filas[0]).toMatchObject({ tipo: "espera", objetivo: "generar_menu", clave: "pedido_menu", household_id: "casa", chat_id: "7" });
    expect(db.filas[0].pedido.length).toBeLessThanOrEqual(240);
    expect(Date.parse(db.filas[0].caduca_at)).toBe(AHORA.getTime() + VIDA);
  });

  it("lo siguiente se suma al mismo pedido, sin abrir otro", async () => {
    await guardarPedido(CTX, { camino: "basico" }, AHORA);
    const r = await guardarPedido(CTX, { desde: "2026-11-09" }, AHORA);
    expect(r).toEqual({ camino: "basico", desde: "2026-11-09", forzado: false, preguntado: false, estructura: null, estructuraCena: null, avisado: false });
    expect(db.filas).toHaveLength(1);
    expect(await pedidoEnCurso("casa", AHORA)).toEqual(r);
  });

  it("dos adultos no abren dos pedidos: el segundo se suma al del primero", async () => {
    db.antesDeInsertar = () => {
      db.filas.push({ id: "t2", status: "abierta", updated_at: AHORA.toISOString(), pedido: JSON.stringify({ camino: "medio" }) });
    };
    const r = await guardarPedido(CTX, { desde: "2026-11-09" }, AHORA);
    expect(r).toEqual({ camino: "medio", desde: "2026-11-09", forzado: false, preguntado: false, estructura: null, estructuraCena: null, avisado: false });
    expect(db.filas).toHaveLength(1);
  });

  it("otro fallo al abrir no se confunde con el duplicado", async () => {
    insert.mockRejectedValueOnce(new Error("sin red"));
    await expect(guardarPedido(CTX, { camino: "basico" }, AHORA)).rejects.toThrow("sin red");
  });

  it("pasada su vida ya no cuenta, y el siguiente empieza de cero en la misma fila", async () => {
    await guardarPedido(CTX, { camino: "basico" }, AHORA);
    const luego = new Date(AHORA.getTime() + VIDA + 1000);
    expect(await pedidoEnCurso("casa", luego)).toBeNull();
    expect(await guardarPedido(CTX, { desde: "2026-11-16" }, luego)).toEqual({ camino: null, desde: "2026-11-16", forzado: false, preguntado: false, estructura: null, estructuraCena: null, avisado: false });
    expect(db.filas).toHaveLength(1);
  });

  it("cerrado no sigue en curso", async () => {
    await guardarPedido(CTX, { camino: "basico" }, AHORA);
    await cerrarPedido("casa", "hecha", AHORA);
    expect(db.filas[0]).toMatchObject({ status: "hecha", closed_at: AHORA.toISOString() });
    expect(await pedidoEnCurso("casa", AHORA)).toBeNull();
  });

  it("no da por bueno lo que no sea del vocabulario", () => {
    expect(pedidoDeFila({ pedido: JSON.stringify({ camino: "otro", desde: "mañana", forzado: "si" }) })).toEqual({ camino: null, desde: null, forzado: false, preguntado: false, estructura: null, estructuraCena: null, avisado: false });
  });

  it("un pedido ilegible lanza: no se pisa con uno vacío", async () => {
    db.filas = [{ id: "t", status: "abierta", updated_at: AHORA.toISOString(), pedido: "{roto" }];
    await expect(guardarPedido(CTX, { desde: "2026-11-09" }, AHORA)).rejects.toThrow();
    expect(db.filas[0].pedido).toBe("{roto");
  });

  it("si se cierra mientras se guarda, lo dice: no da por guardado lo que no se escribió", async () => {
    await guardarPedido(CTX, { camino: "basico" }, AHORA);
    update.mockResolvedValueOnce([]);
    await expect(guardarPedido(CTX, { desde: "2026-11-09" }, AHORA)).rejects.toThrow("se cerró");
  });
});
