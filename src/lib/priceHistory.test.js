import { describe, it, expect } from "vitest";
import { ingredientDictionary, matchReceiptLine, stripQtyNoise, expandAbbreviations, toDisplayCase } from "./priceHistory.js";

describe("ingredientDictionary", () => {
  it("is built from the real recipe catalog, not the ~30-recipe legacy seed", () => {
    // Regression guard: this dictionary used to read RECIPES_BY_ID from
    // data/recipes.js (a tiny legacy seed catalog kept for old demo code)
    // instead of the real ~250-recipe catalog (data/recipeCatalog.js), so it
    // silently only "knew" about ~60 ingredients — not even "leche" — while
    // every other ingredient matcher in the app (normalizePantryInput.js)
    // correctly used the real catalog. That made receipt-line matching fail
    // for almost everything on a real ticket. See conversation 2026-07-23.
    const dict = ingredientDictionary();
    expect(dict.length).toBeGreaterThan(150);
    const ids = new Set(dict.map((d) => d.id));
    expect(ids.has("leche")).toBe(true);
  });
});

describe("matchReceiptLine", () => {
  it("matches common real ingredients missing from the legacy seed catalog", () => {
    expect(matchReceiptLine("KEFIR").ingredientId).toBe("kefir");
    expect(matchReceiptLine("LECHE").ingredientId).toBe("leche");
  });

  it("resolves fat-content abbreviations to the specific variant", () => {
    const m = matchReceiptLine("LECHE SEMI");
    expect(m.ingredientId).toBe("leche semidesnatada");
    expect(m.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("strips trailing quantity/unit noise before matching", () => {
    const m = matchReceiptLine("ARANDANO 500 GR");
    expect(m.ingredientId).toBe("arandanos");
  });

  it("recognises common meat cuts not used as a literal recipe ingredient", () => {
    const m = matchReceiptLine("CHULETA AGUJA");
    expect(m.ingredientId).toBe("chuleta de aguja de cerdo");
  });

  it("returns no match (not a crash) for genuinely unknown text", () => {
    const m = matchReceiptLine("XYZQ NONSENSE PRODUCT 123");
    expect(m.ingredientId).toBeNull();
    expect(m.confidence).toBe(0);
  });

  it("recognises ready-to-eat fridge desserts, not just recipe ingredients", () => {
    // "Natillas caseras" is a RECIPE (leche/huevo/azúcar) — the ready-made
    // supermarket cup is a different, un-cookable product that never showed
    // up as anyone's recipe ingredient, so it needs its own dictionary entry.
    expect(matchReceiptLine("NATILLA VAINILLA X 4").ingredientId).not.toBeNull();
    expect(matchReceiptLine("FLAN DE HUEVO").ingredientId).not.toBeNull();
  });

  it("finds a real ingredient even when brand noise pads out the line", () => {
    // Regression guard: tokenOverlap used to divide by max(lineTokens,
    // dictTokens), so a short dictionary word ("Espaguetis") got drowned out
    // whenever the ticket line carried extra brand/cut fragments the OCR
    // can't strip ("HACE." from "Hacendado", a bare "500g" glued on with no
    // space). Real line: "PASTA ESPAGUETI HACE. 500g" — should still resolve
    // to spaghetti instead of "no lo tenemos identificado". See conversation
    // 2026-07-23.
    const m = matchReceiptLine("PASTA ESPAGUETI HACE. 500g");
    expect(m.ingredientId).not.toBeNull();
    expect(m.name.toLowerCase()).toContain("espagueti");
  });

  it("prefers the specific cheese variant over the generic one", () => {
    const m = matchReceiptLine("QUESO SEMICURADO CORT. HACE. 300g");
    expect(m.ingredientId).toBe("queso semicurado");
  });

  it("expands 'VIRG. EXT.' to the actual olive-oil grade instead of leaving it as punctuation-glued abbreviations", () => {
    // "virg." never equalled "virgen" — the trailing dot alone broke the
    // fuzzy match (different length), on top of "virg"/"ext" not being
    // expanded at all. Real ticket line, previously "no identificado".
    const m = matchReceiptLine("ACEITE VIRG. EXT. LUPEROL 1L");
    expect(m.ingredientId).toBe("aceite de oliva virgen extra");
  });

  it("resolves the scoped staple-variety pass (arroz/sal/aceitunas/conservas)", () => {
    // Broader, deliberate pass over the ~10 staple categories that reliably
    // have a ticket-common sub-type (2026-07-23) — not every ingredient in
    // the catalog, just the ones with the same shape of gap as leche/queso.
    expect(matchReceiptLine("ARROZ BOMBA 1KG").ingredientId).toBe("arroz bomba");
    expect(matchReceiptLine("SAL FINA").ingredientId).toBe("sal fina");
    expect(matchReceiptLine("SARDINAS EN ACEITE DE OLIVA").ingredientId).toBe("sardinas en aceite de oliva");
    expect(matchReceiptLine("CABALLA EN TOMATE").ingredientId).toBe("caballa en tomate");
    expect(matchReceiptLine("ACEITUNAS RELLENAS DE ANCHOA").ingredientId).toBe("aceitunas rellenas de anchoa");
    expect(matchReceiptLine("CAFE MOLIDO").ingredientId).toBe("cafe molido");
  });

  it("does not let 'Sal' hijack lines that merely start with those 3 letters", () => {
    // Plain character `.includes()` used to treat "sal" as contained in
    // "salchichas" (a coincidental letter run-on, not a real word match) and
    // hand it a free 0.75-confidence "auto" match — collapsing sausages into
    // table salt whenever no better dictionary entry existed yet to beat it.
    expect(matchReceiptLine("SALCHICHAS FRESCAS DE POLLO").ingredientId).not.toBe("sal");
  });

  it("resolves a real Eroski ticket line ('SALSA SRIRACHA CONCENT.') instead of 'Sal'", () => {
    // Same "sal" ⊂ "salsa" letter-run-on false positive as the salchichas
    // case above, caught on a real (non-synthetic) receipt.
    const result = matchReceiptLine("SALSA SRIRACHA CONCENT. 200ML");
    expect(result.ingredientId).toBe("salsa sriracha");
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("recognises mochi as a real, nameable dessert instead of forcing free text", () => {
    // Not a false-positive fix like the others above — "MOCHIS SURTIDO BIO"
    // used to have zero dictionary entries to land on at all (confidence 0),
    // forcing the user into the free-text fallback for a perfectly common
    // ready-to-eat dessert.
    const result = matchReceiptLine("MOCHIS SURTIDO BIO");
    expect(result.ingredientId).toBe("mochi");
  });

  it("resolves flavoured fresh pasta to itself, not the base seasoning it's named after", () => {
    // "PASTA TINTA DE CALAMAR" (squid-ink pasta) used to match "Tinta de
    // calamar" — the actual squid-ink condiment used in arroz negro — a
    // completely different real product, just because "tinta"+"calamar"
    // fully overlapped with that shorter dictionary entry.
    const result = matchReceiptLine("PASTA TINTA DE CALAMAR 500G");
    expect(result.ingredientId).toBe("pasta con tinta de calamar");
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("gives two distinct rice varieties two distinct ids instead of collapsing both into generic 'Arroz'", () => {
    expect(matchReceiptLine("ARROZ BOMBA HACENDADO 1KG").ingredientId).toBe("arroz bomba");
    expect(matchReceiptLine("ARROZ INTEGRAL SOS 1KG").ingredientId).toBe("arroz integral");
  });

  it("resolves genuinely exotic items instead of a random near-miss", () => {
    expect(matchReceiptLine("PITAYA ROJA").ingredientId).toBe("pitaya");
    expect(matchReceiptLine("CARNE CIERVO FILETADA 300G").ingredientId).toBe("carne de ciervo");
  });

  it("does not confuse 'agua' (water) with 'aguja' (a beef cut) one edit away", () => {
    // Real ticket line: "AGUA MINERAL 1.5L (x6uds)" was matching "Aguja de
    // ternera" at confidence 0.4 — tokensNear's typo tolerance treated
    // "agua"/"aguja" (an insertion apart) the same as a genuine OCR misread.
    const m = matchReceiptLine("AGUA MINERAL 1.5L (x6uds)");
    expect(m.ingredientId).toBe("agua mineral");
  });

  it("tolerates a single OCR-misread letter in a long-enough word", () => {
    // "ATÚN" scanned as "ATON" (the accented Ú is a common OCR miss) — should
    // still land on a real canned-tuna variant, not fall through to "no
    // identificado" over one wrong letter.
    const m = matchReceiptLine("ATON CLARO OLIVA PK6");
    expect(m.ingredientId).not.toBeNull();
    expect(m.name.toLowerCase()).toContain("atún");
  });

});

describe("stripQtyNoise", () => {
  it("removes trailing weight/unit tokens", () => {
    expect(stripQtyNoise("ARANDANO 500 GR")).toBe("ARANDANO");
    expect(stripQtyNoise("LECHE 1L")).toBe("LECHE");
  });

  it("leaves plain names untouched", () => {
    expect(stripQtyNoise("Chuleta de aguja")).toBe("Chuleta de aguja");
  });

  it("removes a bare 'g' glued straight onto the number, no space and no 'r'", () => {
    // "500g" (no space, no "r") used to slip through untouched because the
    // unit alternation only covered "gr"/"grs"/"gramos".
    expect(stripQtyNoise("PASTA ESPAGUETI HACE. 500g")).toBe("PASTA ESPAGUETI HACE");
  });

  it("removes a pack-count glued straight onto a trailing unit word (no space)", () => {
    // "(x6uds)" has no word boundary between the digit and "uds", so neither
    // QTY_NOISE_RE nor the old PACK_CODE_RE could reach it.
    expect(stripQtyNoise("AGUA MINERAL 1.5L (x6uds)")).toBe("AGUA MINERAL");
  });

  it("drops leftover punctuation (trailing dots, empty parens, commas)", () => {
    // Not just noise for cosmetics — a token like "virg." never equals
    // "virgen" in the dictionary, so this punctuation was silently killing
    // otherwise-correct matches too (see matchReceiptLine tests below).
    expect(stripQtyNoise("ACEITE VIRG. EXT. LUPEROL 1L")).toBe("ACEITE VIRG EXT LUPEROL");
  });

  it("removes bare pack-count and pack-code suffixes with no leading digit", () => {
    // Unlike "500 GR" (digit-then-unit), these have the multiplier/code
    // first — "X 4" units, "PK6" a supermarket pack code — so they need
    // their own pattern, not just QTY_NOISE_RE.
    expect(stripQtyNoise("NATILLA VAINILLA X 4")).toBe("NATILLA VAINILLA");
    expect(stripQtyNoise("ATUN CLARO OLIVA PK6")).toBe("ATUN CLARO OLIVA");
  });
});

describe("toDisplayCase", () => {
  it("turns SHOUTY OCR text into a normal-looking name", () => {
    expect(toDisplayCase("PASTA ESPAGUETI HACE.")).toBe("Pasta Espagueti Hace");
  });

  it("keeps small connector words lowercase mid-name", () => {
    expect(toDisplayCase("CHULETA DE AGUJA")).toBe("Chuleta de Aguja");
  });

  it("leaves an already nicely-cased name untouched in meaning", () => {
    expect(toDisplayCase("Kéfir")).toBe("Kéfir");
  });
});

describe("expandAbbreviations", () => {
  it("expands common fat-content abbreviations", () => {
    expect(expandAbbreviations("leche semi")).toBe("leche semidesnatada");
    expect(expandAbbreviations("yogur desn")).toBe("yogur desnatada");
  });

  it("does not touch already-full words", () => {
    expect(expandAbbreviations("leche desnatada")).toBe("leche desnatada");
  });
});
