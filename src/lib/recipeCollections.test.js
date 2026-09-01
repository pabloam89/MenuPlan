import { describe, it, expect } from "vitest";
import {
  addToCollections,
  removeFromCollection,
  setRecipeCollections,
  collectionsOf,
  collectionRecipeIds,
  collectionCounts,
  mergeCollections,
  mergeFolders,
  purgeFolder,
  allFolders,
  isBuiltInCollection,
  newFolderId,
} from "./recipeCollections.js";

describe("addToCollections", () => {
  it("files a recipe into several folders at once", () => {
    const map = addToCollections({}, "carnes_001", ["hijos", "cena_rapida"]);
    expect(collectionsOf(map, "carnes_001").sort()).toEqual(["cena_rapida", "hijos"]);
  });

  it("does not duplicate when the same swipe happens twice", () => {
    let map = addToCollections({}, "carnes_001", ["hijos"]);
    map = addToCollections(map, "carnes_001", ["hijos"]);
    expect(collectionsOf(map, "carnes_001")).toEqual(["hijos"]);
  });

  it("accepts a user-created folder id, not just the four built-in ones", () => {
    const custom = newFolderId();
    const map = addToCollections({}, "carnes_001", [custom]);
    expect(collectionsOf(map, "carnes_001")).toEqual([custom]);
  });

  it("leaves the map untouched for an empty or missing input", () => {
    expect(addToCollections({}, "carnes_001", [])).toEqual({});
    expect(addToCollections({}, null, ["hijos"])).toEqual({});
  });
});

describe("removeFromCollection / setRecipeCollections", () => {
  it("drops the recipe key entirely once its last folder is removed", () => {
    const map = addToCollections({}, "carnes_001", ["hijos"]);
    expect(removeFromCollection(map, "carnes_001", "hijos")).toEqual({});
  });

  it("keeps the other folders a recipe belongs to", () => {
    const map = addToCollections({}, "carnes_001", ["hijos", "dia_a_dia"]);
    expect(collectionsOf(removeFromCollection(map, "carnes_001", "hijos"), "carnes_001")).toEqual(["dia_a_dia"]);
  });

  it("replaces the whole set when the picker saves, including clearing it", () => {
    const map = addToCollections({}, "carnes_001", ["hijos", "dia_a_dia"]);
    expect(collectionsOf(setRecipeCollections(map, "carnes_001", ["cena_rapida"]), "carnes_001")).toEqual(["cena_rapida"]);
    expect(setRecipeCollections(map, "carnes_001", [])).toEqual({});
  });
});

describe("collectionRecipeIds / collectionCounts", () => {
  it("lists the recipes filed in one folder", () => {
    let map = addToCollections({}, "a", ["hijos"]);
    map = addToCollections(map, "b", ["hijos", "dia_a_dia"]);
    map = addToCollections(map, "c", ["dia_a_dia"]);
    expect([...collectionRecipeIds(map, "hijos")].sort()).toEqual(["a", "b"]);
  });

  it("counts the built-in folders plus the user's own", () => {
    const custom = { id: "fld_1", name: "Cumpleaños" };
    let map = addToCollections({}, "a", ["hijos"]);
    map = addToCollections(map, "b", ["fld_1"]);
    expect(collectionCounts(map, [custom])).toEqual({
      dia_a_dia: 0,
      ocasion_especial: 0,
      cena_rapida: 0,
      hijos: 1,
      fld_1: 1,
    });
  });
});

describe("allFolders / isBuiltInCollection", () => {
  it("puts the four fixed folders first and flags them as not editable", () => {
    const folders = allFolders([{ id: "fld_1", name: "Cumpleaños" }]);
    expect(folders.slice(0, 4).every((f) => f.builtIn)).toBe(true);
    expect(folders[4]).toEqual({ id: "fld_1", label: "Cumpleaños", builtIn: false });
  });

  it("recognises a built-in id apart from a user one", () => {
    expect(isBuiltInCollection("cena_rapida")).toBe(true);
    expect(isBuiltInCollection("fld_1")).toBe(false);
  });
});

describe("purgeFolder", () => {
  it("removes every membership of a deleted folder and keeps the rest", () => {
    let map = addToCollections({}, "a", ["fld_1", "hijos"]);
    map = addToCollections(map, "b", ["fld_1"]);
    const next = purgeFolder(map, "fld_1");
    expect(collectionsOf(next, "a")).toEqual(["hijos"]);
    expect(next.b).toBeUndefined();
  });
});

describe("mergeCollections / mergeFolders", () => {
  it("keeps a local membership the server has not seen yet", () => {
    // Filing something away is additive: a fresh login must never silently
    // drop a swipe made offline, the way a "remote wins" merge would.
    const local = addToCollections({}, "solo_local", ["hijos"]);
    const merged = mergeCollections(local, { otra: ["dia_a_dia"] });
    expect(collectionsOf(merged, "solo_local")).toEqual(["hijos"]);
    expect(collectionsOf(merged, "otra")).toEqual(["dia_a_dia"]);
  });

  it("unions both sides for a recipe present in each, without duplicating", () => {
    const local = addToCollections({}, "a", ["hijos"]);
    expect(collectionsOf(mergeCollections(local, { a: ["hijos", "cena_rapida"] }), "a").sort())
      .toEqual(["cena_rapida", "hijos"]);
  });

  it("keeps a folder renamed locally over the server's older name", () => {
    const merged = mergeFolders([{ id: "fld_1", name: "Cumpleaños" }], [{ id: "fld_1", name: "Sin nombre" }]);
    expect(merged).toEqual([{ id: "fld_1", name: "Cumpleaños" }]);
  });

  it("keeps folders that exist on only one side", () => {
    const merged = mergeFolders([{ id: "a", name: "A" }], [{ id: "b", name: "B" }]);
    expect(merged.map((f) => f.id).sort()).toEqual(["a", "b"]);
  });
});
