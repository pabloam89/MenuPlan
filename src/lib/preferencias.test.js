import { describe, it, expect } from "vitest";
import { CAMPOS } from "./notepadFields.js";
import { poner, rechazar, olvidar, proyectar, estadoDe, matizDe, libretaVacia } from "./notepad.js";
import { dataConLibreta, conTandaPedida, sinLibreta, CLAVES_DE_LA_LIBRETA } from "./libretaEnData.js";
import { filaDeApunte, apunteDeFila, libretaDeFilas, cambiosDeLibreta, PreferenciaInvalida, FORMA_DE_PROYECCION } from "./preferencias.js";

const GRUPOS = [{ id: "g-adultos", label: "Adultos" }, { id: "g-ninos", label: "Niños" }];
const FECHA = "2026-11-02";

/** Lo que haría escribir_preferencias (0109) con una fila pedida: id, fechas y su sobre. */
function comoLaBase(fila, id) {
  const { confirmado, ...resto } = fila;
  return { ...resto, id, persona_id: null, plan_id: null, dias: null, semanas: null, salvo_dias: null, salvo_comidas: null,
    salvo_semanas: null, confirmado_at: confirmado ? `${FECHA}T10:00:00Z` : null, rechazada_at: null, updated_at: `${FECHA}T10:00:00Z` };
}

/** Las filas de una libreta, como las devolvería preferencias_de_casa tras escribirlas. */
function filasDe(libreta) {
  return Object.entries(libreta.campos).flatMap(([ruta, apunte], i) => {
    const fila = filaDeApunte(ruta, apunte, { grupos: GRUPOS });
    return fila ? [comoLaBase(fila, `id-${i}`)] : [];
  });
}

/** Una libreta con un apunte de cada campo, con ámbito, servicio, fechas, frase, y lo supuesto. */
function libretaDePrueba() {
  let l = libretaVacia();
  const p = (ruta, valor, o = {}) => { l = poner(l, ruta, valor, { origen: "texto", fecha: FECHA, ...o }); };
  p("freqs.pescado", 2, { origen: "pregunta", confirmado: true });
  p("freqs.carne.@ninos", 1);
  p("reparto.legumbres", 25, { origen: "pregunta" });
  p("base.pasta", 1, { frase: "echo de menos la pasta" });
  p("tanda.sofrito", 3, { origen: "pregunta" });
  p("tandaPlatos.croquetas", 2, { origen: "pregunta" });
  p("cocina.mexicana", -1, { desde: "2026-11-01", hasta: "2026-11-30" });
  p("tecnica.horno.#cena", 2, { fuente: "supuesto" });
  p("salsa.si", 1, { fuente: "visto" });
  p("esfuerzo.rapido", 1);
  p("favoritos.queso", true);
  p("excluidos.cilantro.@adultos", true);
  return l;
}

describe("la libreta como preferencias (0109, trozo 14)", () => {
  it("cada campo de la libreta tiene su forma, y dos campos nunca comparten fila (eje, nivel, medida, operador)", () => {
    const firmas = CAMPOS.flatMap((c) => {
      const f = FORMA_DE_PROYECCION[c.proyecta];
      expect(f, `${c.id}: sin forma para «${c.proyecta}»`).toBeTruthy();
      return (f.sesgo ? ["mas", "menos"] : [f.operador]).map((op) => [c.eje, f.nivel, f.medida, op].join("|"));
    });
    expect(new Set(firmas).size).toBe(firmas.length);
  });

  it("escrita en filas y leída de vuelta, la libreta proyecta lo mismo al motor y cada apunte tiene el mismo estado y matiz", () => {
    const libreta = libretaDePrueba();
    const leida = libretaDeFilas(filasDe(libreta), { grupos: GRUPOS });
    expect(Object.keys(leida.campos).sort()).toEqual(Object.keys(libreta.campos).sort());
    for (const hoy of [undefined, "2026-11-15", "2026-12-15"]) {
      expect(proyectar(leida, { hoy }), `proyección con hoy=${hoy}`).toEqual(proyectar(libreta, { hoy }));
    }
    for (const ruta of Object.keys(libreta.campos)) {
      expect(estadoDe(leida, ruta), ruta).toBe(estadoDe(libreta, ruta));
      expect(matizDe(leida.campos[ruta]), ruta).toBe(matizDe(libreta.campos[ruta]));
    }
  });

  it("lo rechazado vuelve como rechazado: sin valor y con lo que se rechazó, para no volver a suponerlo", () => {
    const [ruta, apunte] = apunteDeFila({ ...comoLaBase(filaDeApunte("tecnica.horno", { valor: 2, fuente: "supuesto", origen: "texto" }), "x"),
      rechazada_at: `${FECHA}T11:00:00Z` });
    expect(ruta).toBe("tecnica.horno");
    expect(apunte.valor).toBeUndefined();
    expect(apunte.rechazos).toEqual([{ valor: 2, fecha: FECHA }]);
    // Y poner lo mismo supuesto no entra (notepad.js lo bloquea con sus rechazos).
    const l = poner({ v: 1, campos: { [ruta]: apunte } }, ruta, 2, { fuente: "supuesto", fecha: FECHA });
    expect(l.campos[ruta].valor).toBeUndefined();
  });

  it("los cambios de la libreta son la operación: cambiar con el id de su fila, crear sin él, rechazar y borrar; sin cambios, nada", () => {
    const antes = libretaDePrueba();
    const filas = filasDe(antes);
    const idDe = (ruta) => filas.find((f) => apunteDeFila(f, { grupos: GRUPOS })?.[0] === ruta).id;
    expect(cambiosDeLibreta(antes, antes, filas, { grupos: GRUPOS })).toEqual([]);

    let despues = poner(antes, "freqs.pescado", 3, { origen: "pregunta", confirmado: true });
    despues = poner(despues, "favoritos.aguacate", true, { origen: "texto" });
    despues = rechazar(despues, "tecnica.horno.#cena", { fecha: FECHA }).libreta;
    despues = olvidar(despues, "cocina.mexicana");
    const cambios = cambiosDeLibreta(antes, despues, filas, { grupos: GRUPOS });
    expect(cambios).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: idDe("freqs.pescado"), eje: "composicion", operador: "como_mucho", valor: "pescado", cantidad: 3 }),
      expect.objectContaining({ eje: "subtipoIngrediente", operador: "mas", valor: "aguacate" }),
      { id: idDe("tecnica.horno.#cena"), rechazar: true },
      { id: idDe("cocina.mexicana"), borrar: true },
    ]));
    expect(cambios).toHaveLength(4);
    expect(cambios.find((c) => c.valor === "aguacate").id).toBeUndefined();
  });

  it("lo que la libreta no puede decir falla en alto: un ámbito sin su grupo en la casa, un valor que no es número", () => {
    expect(() => filaDeApunte("freqs.carne.@bebes", { valor: 1, origen: "texto" }, { grupos: GRUPOS })).toThrow(PreferenciaInvalida);
    expect(() => filaDeApunte("freqs.carne", { valor: "mucho", origen: "texto" }, { grupos: GRUPOS })).toThrow(PreferenciaInvalida);
    expect(() => filaDeApunte("nada.carne", { valor: 1, origen: "texto" })).toThrow(PreferenciaInvalida);
  });

  it("cada ámbito y cada servicio de la libreta cabe en una fila: un grupo de su tipo, una comida de su nombre", () => {
    const grupos = [{ id: "g-a", tipo: "adultos" }, { id: "g-n", tipo: "ninos" }, { id: "g-b", tipo: "bebe" }];
    for (const ruta of ["freqs.carne.@ninos", "freqs.carne.@adultos", "freqs.carne.@bebes", "tecnica.horno.#comida", "tecnica.horno.#cena"]) {
      const fila = filaDeApunte(ruta, { valor: 1, origen: "texto" }, { grupos });
      expect(apunteDeFila(comoLaBase(fila, "x"), { grupos })?.[0], ruta).toBe(ruta);
    }
  });

  it("una fila que no es de la libreta (de una persona, con días, de un conjunto) no entra en ella", () => {
    const base = comoLaBase(filaDeApunte("freqs.pescado", { valor: 2, origen: "texto" }), "x");
    expect(apunteDeFila(base)).not.toBeNull();
    for (const otra of [{ persona_id: "p1" }, { dias: ["Lun"] }, { plan_id: "c1" }, { eje: "kcal" }]) {
      expect(apunteDeFila({ ...base, ...otra }), JSON.stringify(otra)).toBeNull();
    }
  });

  it("lo que la libreta pone en data es CLAVES_DE_LA_LIBRETA, y eso es lo que no va al documento", () => {
    const data = { members: [], reglas: [] };
    const puestas = new Set([...Object.keys(dataConLibreta(data, libretaDePrueba())), ...Object.keys(conTandaPedida(data, "tanda.arroz", 2))]);
    for (const k of Object.keys(data)) puestas.delete(k);
    for (const k of ["cookTime"]) puestas.delete(k); // conTandaPedida abre el finde para la tanda: es de la Rutina, no de la libreta
    expect([...puestas].sort()).toEqual([...CLAVES_DE_LA_LIBRETA].sort());
    expect(sinLibreta(dataConLibreta(data, libretaDePrueba()))).toEqual(data);
  });
});
