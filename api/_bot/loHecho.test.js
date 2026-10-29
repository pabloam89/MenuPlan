/**
 * Los casos reales de #958 (raíz 1, «lo hecho se cuenta en texto»): cada uno
 * con la pieza pura que ahora dice lo que hizo y lo que no.
 */
import { describe, it, expect } from "vitest";

process.env.VITE_SUPABASE_URL ||= "https://sin-base.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "sin-clave";

const { entradasDeDespensa } = await import("./despensa.js");
const { vaPorLaRapida, esPreguntaDeDespensa } = await import("./router.js");
const { semanasDelCole } = await import("./cole.js");
const { semanaDelInvitado, leerDias, aplicarSemana } = await import("./ajustes.js");
const { quitarDeLista } = await import("./menu.js");

describe("despensa: un nombre que casa con varios alimentos no se funde con el primero", () => {
  // Real: dos tipos de patatas de bolsa acabaron sumadas al puré de patata.
  const m = {
    normalizePantryInput: (n) => (/patatas fritas/i.test(n)
      ? [{ raw: n, matched: true, ambiguous: true, candidates: [{ normalized: "pure de patata", label: "Puré de patata" }, { normalized: "patata", label: "Patata" }] }]
      : [{ raw: n, normalized: n.toLowerCase(), matched: true, ambiguous: false }]),
  };
  it("se guarda tal cual, con la duda dicha", () => {
    const [a, b, c] = entradasDeDespensa([{ nombre: "Patatas fritas onduladas" }, { nombre: "Patatas fritas lisas" }, { nombre: "Leche" }], m);
    expect(a.normalized).toBe("patatas fritas onduladas");
    expect(b.normalized).toBe("patatas fritas lisas");
    expect(a.normalized).not.toBe(b.normalized);
    expect(a.duda).toEqual(["Puré de patata", "Patata"]);
    expect(c).toMatchObject({ normalized: "leche", duda: null });
  });
});

describe("«tengo esto en la nevera…» no va a «ver despensa»", () => {
  const d = () => ({ modo: "despensa", confianza: 0.95, datos: { varias: false } });
  it("contar lo que hay es apuntar: a Lola", () => {
    for (const t of ["tengo esto en la nevera: leche, huevos, pollo", "me quedan tres huevos", "he comprado pollo y arroz", "tengo en la nevera leche, ¿me lo apuntas?"]) {
      expect(esPreguntaDeDespensa(t), t).toBe(false);
      expect(vaPorLaRapida(d(t), { texto: t }), t).toBe(false);
    }
  });
  it("preguntar por lo que hay sigue por la vía rápida", () => {
    for (const t of ["¿qué tengo en la despensa?", "qué queda en el congelador", "¿tengo huevos?"]) {
      expect(vaPorLaRapida(d(t), { texto: t }), t).toBe(true);
    }
  });
});

describe("guardar_menu_cole: solo lo que está a la vista", () => {
  const semana = { dias: { lunes: { primero: "Lentejas estofadas" }, martes: { primero: "Arroz a la cubana" }, miercoles: { primero: "Macarrones con tomate" }, jueves: { sinClase: true }, viernes: { primero: "Pescado rebozado" } } };
  it("con el PDF en este mensaje, se guarda", () => {
    const r = semanasDelCole([semana], { adjunto: { tipo: "document" } });
    expect(r.semanas).toHaveLength(1);
    expect(r.sinHacer).toEqual([]);
  });
  it("en otro turno, un plato que no salió en el resumen no se guarda (el caso real)", () => {
    const anterior = "Menú del cole: lunes lentejas estofadas, martes arroz a la cubana, miércoles macarrones con tomate, viernes pescado rebozado.";
    const conInventado = { dias: { ...semana.dias, martes: { primero: "Pollo al curry" } } };
    const r = semanasDelCole([conInventado], { texto: "sí, guárdalo", anterior });
    expect(r.sinHacer.map((x) => x.que)).toContain("Pollo al curry");
    expect(r.semanas[0].dias.martes.primero).toBeUndefined();
  });
  it("una semana casi vacía no se guarda: pisaría la que hay", () => {
    const r = semanasDelCole([{ dias: { lunes: { primero: "Lentejas" } } }], { texto: "el lunes lentejas" });
    expect(r.semanas).toEqual([]);
    expect(r.sinHacer[0].motivo).toMatch(/1 de 5 días/);
  });
});

describe("ajustar_semana: nunca «Guardado» con nada dentro", () => {
  it("«el finde», «fines de semana», «de lunes a jueves» se entienden", () => {
    expect(leerDias(["el finde"]).dias).toEqual(["Sáb", "Dom"]);
    expect(leerDias(["fines de semana"]).dias).toEqual(["Sáb", "Dom"]);
    expect(leerDias(["de lunes a jueves"]).dias).toEqual(["Lun", "Mar", "Mié", "Jue"]);
    expect(leerDias(["lunes, martes y jueves"]).dias).toEqual(["Lun", "Mar", "Jue"]);
    expect(leerDias(["los sábados"]).dias).toEqual(["Sáb"]);
  });
  it("lo que no se entiende se dice y no se guarda", () => {
    const r = aplicarSemana({ menuWeekOffsets: [0] }, { semana: "siguiente", dias: ["cuando haga sol"] }, { hoyIdx: 0 });
    expect(r.data).toBeUndefined();
    expect(r.resultado.estado).toBe("nada");
    expect(r.texto).not.toMatch(/Guardado/);
  });
  it("de lunes a jueves, guardado y en el recibo", () => {
    const r = aplicarSemana({ menuWeekOffsets: [0] }, { semana: "siguiente", dias: ["de lunes a jueves"] }, { hoyIdx: 0 });
    expect(Object.values(r.data.menuWeekDays)).toContainEqual(["Lun", "Mar", "Mié", "Jue"]);
    expect(r.resultado.hecho[0]).toMatch(/lunes, martes, miércoles, jueves/);
  });
});

describe("anadir_invitado: el próximo día con ese nombre", () => {
  const SABADO = 5;
  it("un sábado, «el lunes» es el de la semana que viene", () => {
    expect(semanaDelInvitado("Lun", undefined, SABADO)).toEqual({ semana: "siguiente", pasado: false });
    expect(semanaDelInvitado("Dom", undefined, SABADO)).toEqual({ semana: "esta", pasado: false });
  });
  it("con «esta» dicha y el día pasado, no se apunta", () => {
    expect(semanaDelInvitado("Lun", "esta", SABADO).pasado).toBe(true);
  });
});

describe("ver_ajustes cuenta lo que hay puesto", () => {
  it("desayuno, merienda, postre, despensa, variedad, días y peques", async () => {
    const { otrosAjustes } = await import("./ajustes.js");
    const t = otrosAjustes({
      extraMeals: { desayuno: "variado", merienda: "laborables", postre: "cena", postreTipo: "inmediato", postreInmediato: "fruta" },
      pantryMode: "only", pantryModeSet: true, menuVarietyPref: "moderate",
      menuWeekDays: { "2026-11-02": ["Lun", "Mar"] },
    }, { peques: { byMember: { k1: { dinner: "different", weekdayLunch: "own", weekend: "together", avoid: { protein: true } } } }, nombre: () => "Leo" });
    expect(t).toMatch(/Desayuno: desayuno variado/);
    expect(t).toMatch(/merienda de lunes a viernes/);
    expect(t).toMatch(/postre en la cena \(postres sin cocinar, de fruta\)/);
    expect(t).toMatch(/sobre todo lo de casa/);
    expect(t).toMatch(/sin repetir los de la semana anterior/);
    expect(t).toMatch(/la del 2026-11-02: lunes, martes/);
    expect(t).toMatch(/Leo \(peque\): cena algo suyo; a mediodía en casa, algo suyo; el finde, con la familia; en la cena no repite del cole: proteina/);
  });
});

describe("quitar_compra: quitar de verdad, no marcar como comprado", () => {
  const items = [
    { id: "1", name: "Pan", manual: true }, { id: "2", name: "Leche entera" }, { id: "3", name: "Leche desnatada" }, { id: "4", name: "Yogures", manual: true },
  ];
  it("quita lo dicho y dice lo que no estaba o es dudoso", () => {
    const r = quitarDeLista(items, ["pan", "leche", "aceite"]);
    expect(r.quitados).toEqual(["Pan"]);
    expect(r.items.map((x) => x.id)).toEqual(["2", "3", "4"]);
    expect(r.noEncontrados).toEqual(["aceite"]);
    expect(r.dudosos[0].parecidos).toEqual(["Leche entera", "Leche desnatada"]);
  });
  it("manuales: todo lo añadido a mano", () => {
    expect(quitarDeLista(items, [], { manuales: true }).items.map((x) => x.id)).toEqual(["2", "3"]);
  });
});
