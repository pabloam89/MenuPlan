import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./supabase.js", () => ({ supabase: {} }));
import { supabase } from "./supabase.js";
import { isDataUrl, uploadRecipePhoto } from "./recipePhotos.js";

// Un PNG de 1x1 de verdad, para ejercer la conversion a Blob.
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function mockStorage({ uploadError = null } = {}) {
  const calls = [];
  return {
    calls,
    storage: {
      from: (bucket) => ({
        upload: (path, blob, opts) => {
          calls.push({ bucket, path, type: blob?.type, size: blob?.size, opts });
          return Promise.resolve({ error: uploadError });
        },
        getPublicUrl: (path) => ({ data: { publicUrl: `https://cdn.test/${bucket}/${path}` } }),
      }),
    },
  };
}

beforeEach(() => {
  Object.keys(supabase).forEach((k) => delete supabase[k]);
});

describe("isDataUrl", () => {
  it("distingue una foto incrustada de una ya migrada", () => {
    expect(isDataUrl(PNG)).toBe(true);
    expect(isDataUrl("https://cdn.test/recipe-photos/u/r.png")).toBe(false);
    expect(isDataUrl(null)).toBe(false);
  });
});

describe("uploadRecipePhoto", () => {
  it("sube la imagen y devuelve su URL publica", async () => {
    const m = mockStorage();
    Object.assign(supabase, m);
    const url = await uploadRecipePhoto("user1", "rec1", PNG);
    expect(url).toBe("https://cdn.test/recipe-photos/user1/rec1.png");
    expect(m.calls).toHaveLength(1);
    expect(m.calls[0].bucket).toBe("recipe-photos");
  });

  it("la ruta empieza por el id del dueño — es lo que hace cumplir la politica del cubo", async () => {
    const m = mockStorage();
    Object.assign(supabase, m);
    await uploadRecipePhoto("user1", "rec1", PNG);
    expect(m.calls[0].path).toBe("user1/rec1.png");
  });

  it("sube un fichero binario de verdad, no el texto base64", async () => {
    const m = mockStorage();
    Object.assign(supabase, m);
    await uploadRecipePhoto("user1", "rec1", PNG);
    // El base64 ocupa un tercio mas que los bytes que representa: si subieramos
    // el texto, el tamaño seria mayor que el del data URL original.
    expect(m.calls[0].type).toBe("image/png");
    expect(m.calls[0].size).toBeLessThan(PNG.length);
  });

  it("una foto YA migrada no se vuelve a subir", async () => {
    const m = mockStorage();
    Object.assign(supabase, m);
    const url = "https://cdn.test/recipe-photos/user1/rec1.png";
    expect(await uploadRecipePhoto("user1", "rec1", url)).toBe(url);
    expect(m.calls).toHaveLength(0);
  });

  it("si la subida falla devuelve la foto TAL CUAL: perderla seria peor", async () => {
    const m = mockStorage({ uploadError: { message: "network" } });
    Object.assign(supabase, m);
    expect(await uploadRecipePhoto("user1", "rec1", PNG)).toBe(PNG);
  });

  it("sin sesion no toca nada", async () => {
    const m = mockStorage();
    Object.assign(supabase, m);
    expect(await uploadRecipePhoto(null, "rec1", PNG)).toBe(PNG);
    expect(m.calls).toHaveLength(0);
  });

  it("mismo id de receta = mismo fichero: regenerar la foto no deja huerfanos", async () => {
    const m = mockStorage();
    Object.assign(supabase, m);
    await uploadRecipePhoto("user1", "rec1", PNG);
    await uploadRecipePhoto("user1", "rec1", PNG);
    expect(m.calls[0].path).toBe(m.calls[1].path);
    expect(m.calls[1].opts.upsert).toBe(true);
  });
});
