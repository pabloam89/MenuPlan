// Los vetos y sesgos de las reglas como filas de preferencia (trozo 14 de #1037).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { filaDeRegla, reglaDeFila, reglasDeFilas, cambiosDeReglas, CLAVES_DE_FIRMA } from "./reglasEnFilas.js";
import { PreferenciaInvalida, filaDeApunte } from "./preferencias.js";
import { nuevaRegla, proyectarReglas, reglaDeInvitado } from "./reglas.js";
import { conLibretaDeFilas, sinLibreta, cambiosDePreferencias } from "./libretaEnData.js";
import { poner, libretaVacia } from "./notepad.js";

const HOY = "2026-11-02";
const GRUPOS = [{ id: "g-adultos", label: "Adultos" }, { id: "g-ninos", label: "Niños" }];
const MIEMBROS = [{ id: "p-ana", name: "Ana" }, { id: "p-leo", name: "Leo" }];
const CTX = { grupos: GRUPOS, miembros: MIEMBROS };
const SEMANA = { inicioISO: "2026-11-02", finISO: "2026-11-08", dias: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] };
/** Lo que haría escribir_preferencias con una fila pedida: id, el resto de columnas a null y su sobre. */
const comoLaBase = (fila, id) => ({ persona_id: null, grupo_id: null, plan_id: null, dias: null, comidas: null, semanas: null, salvo_dias: null,
  salvo_comidas: null, salvo_semanas: null, desde: null, hasta: null, frase: null, ...fila, id, confirmado_at: null, rechazada_at: null, created_at: `${HOY}T10:00:00Z` });
const filasDe = (reglas) => reglas.map((r, i) => comoLaBase(filaDeRegla(r, CTX), `00000000-0000-4000-8000-0000000000${String(10 + i)}`));

/** Las reglas que se dicen hoy (Lola, gustosPorDias) y las que la tabla tiene que saber guardar. */
const r = (o) => nuevaRegla({ origen: "texto", hoy: HOY, ...o });
const reglasDePrueba = () => [
  r({ sujeto: { tipo: "casa" }, efecto: { tipo: "excluir", valor: "grupo:carne" }, ambito: { dias: ["Lun"] }, frase: "los lunes sin carne" }),
  r({ sujeto: { tipo: "casa" }, efecto: { tipo: "excluir", valor: "tecnica:sarten" }, ambito: { dias: ["Lun", "Mar", "Mié", "Jue", "Vie"], comidas: ["Cena"] } }),
  r({ sujeto: { tipo: "casa" }, efecto: { tipo: "excluir", valor: "coliflor" }, ambito: { comidas: ["Comida"] }, salvedad: { dias: ["Sáb"] }, vigencia: { desde: "2026-11-01", hasta: "2026-11-30" } }),
  r({ sujeto: { tipo: "casa" }, efecto: { tipo: "excluir", valor: "grupo:pescado" }, vigencia: { hasta: "2026-11-20" } }),
  r({ sujeto: { tipo: "miembro", ref: "p-leo" }, efecto: { tipo: "excluir", valor: "pescado" }, ambito: { semanas: ["2026-11-02"] } }),
  r({ sujeto: { tipo: "casa" }, efecto: { tipo: "sesgo", valor: { campo: "cocina", valor: "mexicana", peso: -1 } }, ambito: { dias: ["Vie"] } }),
  r({ sujeto: { tipo: "casa" }, efecto: { tipo: "sesgo", valor: { campo: "salsa", valor: "si", peso: 2 } }, ambito: { dias: ["Sáb", "Dom"] }, vigencia: { desde: "2026-11-03" } }),
];
const DATA = { members: MIEMBROS.map((m) => ({ ...m, role: "adulto" })), groups: GRUPOS, schedule: {}, meals: ["Comida", "Cena"] };
const delta = (reglas) => proyectarReglas(reglas, DATA, { hoy: HOY, semana: SEMANA }).delta;

describe("las reglas de veto y sesgo como preferencias (0109, trozo 14)", () => {
  it("escritas en filas y leídas de vuelta, el motor recibe lo mismo (vetos por hueco, de la casa, de una persona y sesgos)", () => {
    const reglas = reglasDePrueba();
    const leidas = reglasDeFilas(filasDe(reglas), CTX);
    expect(leidas).toHaveLength(reglas.length);
    expect(delta(leidas)).toEqual(delta(reglas));
    expect(Object.keys(delta(reglas))).toEqual(expect.arrayContaining(["excluirPorHueco", "members", "sesgos"]));
    expect(leidas[0]).toMatchObject({ frase: "los lunes sin carne", creadaEn: HOY, origen: "texto" });
  });

  it("cada cosa en su eje: una técnica en tecnica, un ingrediente o un grupo en subtipoIngrediente; un veto manda, un sesgo pesa", () => {
    const [carne, sarten, , , , cocina, salsa] = reglasDePrueba().map((r) => filaDeRegla(r, CTX));
    expect(carne).toMatchObject({ eje: "subtipoIngrediente", valor: "grupo:carne", operador: "no_es", fuerza: "obligatoria", dias: ["Lun"] });
    expect(sarten).toMatchObject({ eje: "tecnica", valor: "sarten", comidas: ["Cena"] });
    expect(cocina).toMatchObject({ eje: "cocina", valor: "mexicana", operador: "menos", cantidad: 1, fuerza: "medio" });
    expect(salsa).toMatchObject({ eje: "llevaSalsa", valor: true, operador: "mas", cantidad: 2, desde: "2026-11-03" });
  });

  it("lo que no es una preferencia de la casa falla en alto: un presente, un invitado, una persona o un grupo que no están, una comida fuera de la lista", () => {
    const veto = (o) => r({ sujeto: { tipo: "casa" }, efecto: { tipo: "excluir", valor: "coliflor" }, ...o });
    const malas = [reglaDeInvitado({ dia: "Mié", comida: "Cena", hoy: HOY }), veto({ sujeto: { tipo: "invitado", nombre: "mi tío" } }),
      veto({ sujeto: { tipo: "miembro", ref: "p-otro" } }), veto({ sujeto: { tipo: "grupo", ref: "g-otro" } }), veto({ ambito: { comidas: ["Aperitivo"] } })];
    for (const m of malas) expect(() => filaDeRegla(m, CTX), JSON.stringify(m)).toThrow(PreferenciaInvalida);
  });

  it("la libreta lee primero: un veto de toda la casa sin días es un excluido de la libreta, y uno de un grupo de búsqueda no", () => {
    const veto = (valor) => comoLaBase(filaDeRegla(nuevaRegla({ sujeto: { tipo: "casa" }, efecto: { tipo: "excluir", valor }, hoy: HOY }), CTX), "00000000-0000-4000-8000-0000000000aa");
    expect(reglaDeFila(veto("coliflor"), CTX)).toBeNull();
    expect(reglaDeFila(veto("grupo:carne"), CTX)).toMatchObject({ efecto: { tipo: "excluir", valor: "grupo:carne" } });
    const data = conLibretaDeFilas({ groups: GRUPOS }, [veto("coliflor"), veto("grupo:carne")]);
    expect(data.excluidos).toEqual(["coliflor"]);
    expect(data.reglas.map((r) => r.efecto.valor)).toEqual(["grupo:carne"]);
    const libreta = comoLaBase(filaDeApunte("cocina.india", { valor: 1, origen: "texto" }, { grupos: GRUPOS }), "00000000-0000-4000-8000-0000000000ab");
    expect(reglaDeFila(libreta, CTX)).toBeNull();
  });

  it("la firma con la que se encuentra una regla recién creada son las columnas de preferencia_unica (0109), sin la casa", () => {
    const cols = readFileSync(new URL("../../supabase/migrations/0109_preferencia_senal_historial.sql", import.meta.url), "utf8").match(/create unique index preferencia_unica on public\.preferencia \(([^)]*)\)/)[1].split(",").map((c) => c.trim());
    expect(CLAVES_DE_FIRMA).toEqual(cols.filter((c) => c !== "household_id"));
  });

  it("los cambios son la operación: crear sin id, cambiar y borrar con el de su fila, también lo recién creado; los presente no van", () => {
    const reglas = reglasDePrueba();
    const filas = filasDe(reglas);
    const leidas = reglasDeFilas(filas, CTX);
    const invitado = reglaDeInvitado({ dia: "Mié", comida: "Cena", hoy: HOY });
    expect(cambiosDeReglas(leidas, [...leidas, invitado], filas, CTX)).toEqual([]);
    const nueva = nuevaRegla({ sujeto: { tipo: "casa" }, efecto: { tipo: "excluir", valor: "tecnica:horno" }, ambito: { dias: ["Dom"] }, hoy: HOY });
    const cambiada = { ...leidas[0], ambito: { dias: ["Mar"] } };
    const cambios = cambiosDeReglas(leidas, [cambiada, ...leidas.slice(2), nueva], filas, CTX);
    expect(cambios).toEqual([
      expect.objectContaining({ id: leidas[0].id, dias: ["Mar"], valor: "grupo:carne" }),
      expect.not.objectContaining({ id: expect.anything() }),
      { id: leidas[1].id, borrar: true }]);
    // La que se creó en este guardado vuelve con el id de ids.regla; tras releer, su fila tiene otro: se borra por su firma.
    const conNueva = [...filas, comoLaBase(filaDeRegla(nueva, CTX), "00000000-0000-4000-8000-0000000000ff")];
    expect(cambiosDeReglas([...leidas, nueva], leidas, conNueva, CTX)).toEqual([{ id: "00000000-0000-4000-8000-0000000000ff", borrar: true }]);
    expect(cambiosDeReglas([...leidas, nueva], [...leidas, { ...nueva, ambito: { dias: ["Sáb"] } }], conNueva, CTX)).toEqual([expect.objectContaining({ id: "00000000-0000-4000-8000-0000000000ff", dias: ["Sáb"] })]);
    const coliflor = r({ sujeto: { tipo: "casa" }, efecto: { tipo: "excluir", valor: "coliflor" } });
    expect(cambiosDeReglas([coliflor], [], filasDe([coliflor]), CTX)).toEqual([{ id: filasDe([coliflor])[0].id, borrar: true }]);
  });

  it("en data: las reglas de las filas junto a las presente del documento; las de veto del documento no se leen y no vuelven a él", () => {
    const invitado = reglaDeInvitado({ dia: "Mié", comida: "Cena", hoy: HOY });
    const vieja = nuevaRegla({ sujeto: { tipo: "casa" }, efecto: { tipo: "excluir", valor: "grupo:pollo" }, ambito: { dias: ["Mar"] }, hoy: HOY });
    const filas = filasDe(reglasDePrueba().slice(0, 1));
    const data = conLibretaDeFilas({ groups: GRUPOS, reglas: [invitado, vieja] }, filas);
    expect(data.reglas.map((r) => r.efecto.valor)).toEqual(["casa", "grupo:carne"]);
    expect(sinLibreta(data).reglas).toEqual([invitado]);
    const conLibreta = { ...data, members: MIEMBROS, notepad: poner(libretaVacia(), "favoritos.queso", true, { origen: "texto" }) };
    const sinRegla = { ...conLibreta, reglas: [invitado] };
    expect(cambiosDePreferencias(data, sinRegla, filas)).toEqual([
      expect.objectContaining({ eje: "subtipoIngrediente", valor: "queso", operador: "mas" }),
      { id: filas[0].id, borrar: true }]);
    expect(cambiosDePreferencias(data, { groups: GRUPOS }, filas)).toEqual([]);
  });
});
