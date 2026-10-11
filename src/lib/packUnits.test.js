import { describe, it, expect } from "vitest";
import {
  wantsPackFields,
  defaultPackFor,
  stockFromPack,
} from "./packUnits.js";

describe("packUnits", () => {
  it("detects legumes and conservas as pack products", () => {
    expect(wantsPackFields("Lentejas")).toBe(true);
    expect(wantsPackFields("Garbanzos de bote")).toBe(true);
    expect(wantsPackFields("Tomate")).toBe(false);
  });

  it("defaults legumes to bolsa 500 g or bote 570 g", () => {
    expect(defaultPackFor("Lentejas")).toEqual({ kind: "bolsa", sizeQty: 500, sizeUnit: "g" });
    expect(defaultPackFor("Lentejas cocidas")).toEqual({ kind: "bote", sizeQty: 570, sizeUnit: "g" });
  });

  it("converts pack to canonical stock qty", () => {
    const out = stockFromPack({ count: 2, kind: "bote", sizeQty: 570, sizeUnit: "g" });
    expect(out.qty).toBe(1140);
    expect(out.unit).toBe("g");
    expect(out.pack.count).toBe(2);
  });
});
