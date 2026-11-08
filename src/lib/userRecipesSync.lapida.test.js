import { describe, it, expect, vi, beforeEach } from "vitest";

// #355 (de #316): una receta propia borrada en un dispositivo reaparecía en
// los demás. La lápida vivía solo en el localStorage del que borraba; el otro
// dispositivo seguía teniéndola en local, no la veía en la nube y la volvía a
// subir como «solo local». Desde la 0094 la lápida está en la nube
// (user_recipe_deletions), la escribe borrar_receta_propia junto con el
// borrado, y cada dispositivo la lee al cargar.

// Una nube de mentira compartida por los dos dispositivos: filas de
// user_recipes, lápidas, y si la 0094 está aplicada o no (plan B).
const nube = { filas: new Map(), lapidas: new Set(), aplicada: true };
const llamadas = [];

const SIN_TABLA = { code: "PGRST205", message: "Could not find the table 'public.user_recipe_deletions' in the schema cache" };
const SIN_FUNCION = { code: "PGRST202", message: "Could not find the function public.borrar_receta_propia(p_receta) in the schema cache" };

vi.mock("./supabase.js", () => {
  const consulta = (tabla) => {
    const c = { tabla, op: null, filas: null, filtros: {} };
    llamadas.push(c);
    const resultado = () => {
      if (tabla === "user_recipe_deletions") {
        if (!nube.aplicada) return { data: null, error: SIN_TABLA };
        return { data: [...nube.lapidas].map((recipe_id) => ({ recipe_id })), error: null };
      }
      if (c.op === "delete") {
        nube.filas.delete(c.filtros.id);
        return { data: null, error: null };
      }
      return { data: [...nube.filas.values()], error: null };
    };
    const q = {
      select: () => { c.op ??= "select"; return q; },
      eq: (col, v) => { c.filtros[col] = v; return q; },
      order: () => q,
      limit: () => q,
      delete: () => { c.op = "delete"; return q; },
      upsert: async (filas) => {
        c.op = "upsert";
        c.filas = filas;
        for (const f of filas) nube.filas.set(f.id, f);
        return { error: null };
      },
      then: (ok, ko) => Promise.resolve(resultado()).then(ok, ko),
    };
    return q;
  };
  const rpc = async (nombre, args) => {
    llamadas.push({ rpc: nombre, args });
    if (!nube.aplicada) return { data: null, error: SIN_FUNCION };
    nube.lapidas.add(args.p_receta);
    const habia = nube.filas.delete(args.p_receta);
    return { data: habia, error: null };
  };
  return { supabase: { from: consulta, rpc, storage: { from: () => ({ remove: async () => ({ error: null }) }) } } };
});

vi.mock("./recipePhotos.js", () => ({
  uploadRecipePhoto: async (_u, _id, photo) => photo,
  deleteRecipePhoto: async () => {},
  isDataUrl: () => false,
}));

const {
  loadUserRecipes,
  loadRecetasBorradas,
  lapidasDeRecetas,
  recetasTrasCarga,
  subirRecetasSoloLocales,
  deleteUserRecipe,
} = await import("./userRecipesSync.js");
const { loadDeletedRecipeIds, reconcileDeletedRecipeIds } = await import("./deletedRecipeIds.js");

const subidas = () => llamadas.filter((c) => c.op === "upsert").flatMap((c) => c.filas.map((f) => f.id));

// Cada dispositivo tiene su localStorage; los dos comparten la nube.
const almacen = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
};
const movil = almacen();
const portatil = almacen();
const en = (dispositivo) => { globalThis.localStorage = dispositivo; };

/** Lo que hace App.jsx al cargar las recetas, con las mismas funciones. */
async function cargar(local) {
  const [carga, cargaLapidas] = await Promise.all([loadUserRecipes("u-1"), loadRecetasBorradas("u-1")]);
  const locales = carga.error ? loadDeletedRecipeIds() : reconcileDeletedRecipeIds(carga.data);
  const lapidas = lapidasDeRecetas(locales, cargaLapidas);
  const recetas = recetasTrasCarga(local, carga.data ?? [], lapidas);
  await subirRecetasSoloLocales({ userId: "u-1", local, carga, cargaLapidas, deletedIds: lapidas });
  return recetas.map((r) => r.id);
}

const lentejas = { id: "user_lentejas", name: "Lentejas" };
const tortilla = { id: "user_tortilla", name: "Tortilla" };
const fila = (r) => ({ ...r, owner_id: "u-1", created_at: "2026-10-01T00:00:00Z" });

beforeEach(() => {
  nube.filas = new Map([[lentejas.id, fila(lentejas)], [tortilla.id, fila(tortilla)]]);
  nube.lapidas = new Set();
  nube.aplicada = true;
  llamadas.length = 0;
  for (const d of [movil, portatil]) d.removeItem("menuplan.deletedRecipeIds.v1");
});

describe("borrar en un dispositivo y cargar en otro (#355)", () => {
  it("lo borrado en el móvil no reaparece en el portátil ni se vuelve a subir", async () => {
    en(movil);
    expect(await deleteUserRecipe("u-1", lentejas.id)).toBe(true);
    expect(nube.lapidas.has(lentejas.id)).toBe(true);
    expect(nube.filas.has(lentejas.id)).toBe(false);

    // El portátil aún las tiene las dos en local y no sabe nada del borrado.
    en(portatil);
    llamadas.length = 0;
    const vistas = await cargar([lentejas, tortilla]);
    expect(vistas).toEqual([tortilla.id]);
    expect(subidas()).not.toContain(lentejas.id);
    expect(nube.filas.has(lentejas.id)).toBe(false);

    // Y la siguiente carga del móvil tampoco la resucita.
    en(movil);
    expect(await cargar([tortilla])).toEqual([tortilla.id]);
  });

  it("si no se pudieron leer las lápidas, no sube nada como «solo local»", async () => {
    en(portatil);
    const carga = await loadUserRecipes("u-1");
    const n = await subirRecetasSoloLocales({
      userId: "u-1",
      local: [{ id: "user_nueva", name: "Nueva" }],
      carga,
      cargaLapidas: { data: null, error: { message: "503" } },
    });
    expect(n).toBe(0);
    expect(subidas()).toEqual([]);
  });
});

describe("plan B: la 0094 aún no está aplicada", () => {
  it("sin la tabla de lápidas, la carga no da error y todo va como antes", async () => {
    nube.aplicada = false;
    en(portatil);
    const cargaLapidas = await loadRecetasBorradas("u-1");
    expect(cargaLapidas.error).toBeNull();
    expect([...cargaLapidas.data]).toEqual([]);
    // Una creada sin red se sigue subiendo, como hoy.
    expect(await cargar([lentejas, tortilla, { id: "user_sin_red", name: "Sin red" }]))
      .toEqual([lentejas.id, tortilla.id, "user_sin_red"]);
    expect(subidas()).toEqual(["user_sin_red"]);
  });

  it("sin la función, borrar cae al DELETE de siempre y no falla", async () => {
    nube.aplicada = false;
    en(movil);
    expect(await deleteUserRecipe("u-1", lentejas.id)).toBe(true);
    expect(nube.filas.has(lentejas.id)).toBe(false);
    expect(llamadas.some((c) => c.op === "delete" && c.tabla === "user_recipes")).toBe(true);
  });

  it("un id viejo fuera de formato no pasa por la lápida: borrado de siempre", async () => {
    // El CHECK de la 0094 lo rechazaría y el borrado fallaría entero.
    const raro = { id: "user_Mayus_y_más", name: "Id de antes" };
    nube.filas.set(raro.id, fila(raro));
    en(movil);
    expect(await deleteUserRecipe("u-1", raro.id)).toBe(true);
    expect(llamadas.some((c) => c.rpc)).toBe(false);
    expect(nube.filas.has(raro.id)).toBe(false);
    expect(nube.lapidas.has(raro.id)).toBe(false);
  });

  it("un error de la función que no es «no existe» no se toma por plan B", async () => {
    en(movil);
    const { supabase } = await import("./supabase.js");
    const rpc = supabase.rpc;
    supabase.rpc = async () => ({ data: null, error: { code: "57014", message: "timeout" } });
    try {
      expect(await deleteUserRecipe("u-1", lentejas.id)).toBe(false);
      expect(nube.filas.has(lentejas.id)).toBe(true);
    } finally {
      supabase.rpc = rpc;
    }
  });
});
