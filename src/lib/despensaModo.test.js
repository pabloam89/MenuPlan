import { describe, it, expect } from "vitest";
import { usaDespensa } from "./despensaModo.js";

describe("usaDespensa: la despensa cuenta salvo en «off»", () => {
  it("off es no; cualquier otro modo, y también sin modo (casas viejas), es sí", () => {
    expect(usaDespensa("off")).toBe(false);
    for (const modo of ["prefer", "only", "strict"]) expect(usaDespensa(modo), modo).toBe(true);
    expect(usaDespensa(undefined)).toBe(true);
  });
});
