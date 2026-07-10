import { describe, it, expect } from "vitest";
import { matchReceiptProducts } from "./shoppingListUtils.js";

function item(id, name, opts = {}) {
  return { id, name, have: false, atHome: false, fromPantry: false, adapted: false, ...opts };
}

describe("matchReceiptProducts (Fase 5 — receipt-to-list matching audit)", () => {
  describe("baseline behaviour", () => {
    it("matches an exact (case/accent-insensitive) product name", () => {
      const items = [item("1", "Tomates")];
      const matches = matchReceiptProducts(["TOMATES"], items);
      expect(matches).toEqual([{ id: "1", name: "Tomates", receiptLine: "TOMATES" }]);
    });

    it("matches a longer receipt description against a short generic item name", () => {
      const items = [item("1", "Leche")];
      const matches = matchReceiptProducts(["LECHE ENTERA PASCUAL 1L"], items);
      expect(matches.map((m) => m.id)).toEqual(["1"]);
    });

    it("ignores products already marked done/at home/from pantry", () => {
      const items = [item("1", "Leche", { have: true })];
      expect(matchReceiptProducts(["LECHE"], items)).toEqual([]);
    });

    it("does not double-match the same list item for two receipt lines", () => {
      const items = [item("1", "Tomates")];
      const matches = matchReceiptProducts(["TOMATES", "TOMATES"], items);
      expect(matches).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------
  // Point 2: false-positive risk for `adapted` (intolerance-renamed)
  // ingredients, e.g. "Leche" -> "Leche sin lactosa" (see
  // shoppingBuilder.js's `adapted` flag, added for the dietary-adaptation
  // feature). A generic receipt line must NOT be treated as proof that the
  // safety-relevant variant was actually bought.
  // -------------------------------------------------------------------
  describe("adapted (intolerance-renamed) items — false positive safety check", () => {
    it("does NOT match a generic receipt line ('LECHE') to an adapted-only list item ('Leche sin lactosa')", () => {
      // Only the adapted item is pending — nothing else could plausibly
      // absorb the receipt line either, so if the match rule is too loose
      // it fires straight onto the safety-relevant item.
      const items = [item("sl", "Leche sin lactosa", { adapted: true })];
      const matches = matchReceiptProducts(["LECHE"], items);
      expect(matches).toEqual([]);
    });

    it("does NOT match a mismatched specific receipt line ('LECHE ENTERA') to the adapted item", () => {
      const items = [item("sl", "Leche sin lactosa", { adapted: true })];
      const matches = matchReceiptProducts(["LECHE ENTERA"], items);
      expect(matches).toEqual([]);
    });

    it("when both 'Leche' and 'Leche sin lactosa' are on the list, a generic 'LECHE' receipt line matches the plain item, not the adapted one", () => {
      const items = [item("l", "Leche"), item("sl", "Leche sin lactosa", { adapted: true })];
      const matches = matchReceiptProducts(["LECHE"], items);
      expect(matches).toEqual([{ id: "l", name: "Leche", receiptLine: "LECHE" }]);
    });

    it("a receipt line that fully spells out the adapted name DOES match it, regardless of list order", () => {
      const inOrder = [item("l", "Leche"), item("sl", "Leche sin lactosa", { adapted: true })];
      const reversed = [item("sl", "Leche sin lactosa", { adapted: true }), item("l", "Leche")];

      for (const items of [inOrder, reversed]) {
        const matches = matchReceiptProducts(["LECHE SIN LACTOSA"], items);
        expect(matches).toEqual([{ id: "sl", name: "Leche sin lactosa", receiptLine: "LECHE SIN LACTOSA" }]);
      }
    });

    it("prefers the specific adapted match over a generic item even when the generic item is earlier in list order", () => {
      // Regression guard for the "first match wins by array order" bug:
      // a fully-specific receipt line must not get swallowed by a plainer
      // item that merely happens to be a substring of it.
      const items = [item("l", "Leche"), item("sl", "Leche sin lactosa", { adapted: true })];
      const matches = matchReceiptProducts(["LECHE SIN LACTOSA"], items);
      expect(matches.map((m) => m.id)).toEqual(["sl"]);
    });

    it("accepts a close abbreviation of the adapted name via token overlap ('LECHE SIN LACT')", () => {
      const items = [item("sl", "Leche sin lactosa", { adapted: true })];
      const matches = matchReceiptProducts(["LECHE SIN LACT"], items);
      expect(matches.map((m) => m.id)).toEqual(["sl"]);
    });
  });

  // -------------------------------------------------------------------
  // Point 3: inverse false-negative case — UX annoyance, not a safety bug.
  // -------------------------------------------------------------------
  describe("false negatives (minor UX, not safety) — known limitation", () => {
    it("a heavily abbreviated receipt line ('S/LACTOSA') does not auto-match, forcing a manual check", () => {
      const items = [item("sl", "Leche sin lactosa", { adapted: true })];
      const matches = matchReceiptProducts(["HACENDADO LECHE S/LACTOSA"], items);
      expect(matches).toEqual([]);
    });

    it("word-order differences do not prevent a match (token overlap handles reordering)", () => {
      const items = [item("sl", "Leche sin lactosa", { adapted: true })];
      const matches = matchReceiptProducts(["SIN LACTOSA LECHE SEMIDESNATADA"], items);
      expect(matches.map((m) => m.id)).toEqual(["sl"]);
    });
  });

  describe("short/empty receipt lines", () => {
    it("ignores receipt lines shorter than 3 normalized characters, even if identical to a list item", () => {
      const items = [item("1", "Té")];
      // normalizeName strips the accent -> "te" (2 chars) -> filtered out
      // before ever reaching the matching logic.
      expect(matchReceiptProducts(["Té"], items)).toEqual([]);
    });
  });
});
