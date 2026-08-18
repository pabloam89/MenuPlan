import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./supabase.js", () => ({ supabase: {} }));
import { supabase } from "./supabase.js";
import { addPantryItems } from "./pantry.js";

const UNDEFINED_COLUMN = "42703";

function makeQuery(result, log, table) {
  const q = {
    select: (...a) => (log.push({ table, op: "select", args: a }), q),
    eq: (...a) => (log.push({ table, op: "eq", args: a }), q),
    in: (...a) => (log.push({ table, op: "in", args: a }), q),
    insert: (...a) => (log.push({ table, op: "insert", args: a }), q),
    update: (...a) => (log.push({ table, op: "update", args: a }), q),
    order: (...a) => (log.push({ table, op: "order", args: a }), q),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return q;
}

function mockClient(queue) {
  const log = [];
  const remaining = { ...queue };
  const from = (table) => {
    const list = remaining[table];
    const result = Array.isArray(list) && list.length ? list.shift() : { data: null, error: null };
    return makeQuery(result, log, table);
  };
  return { from, log };
}

beforeEach(() => {
  Object.keys(supabase).forEach((k) => delete supabase[k]);
});

describe("addPantryItems insert degradation", () => {
  it("retries without location when 0015 is missing but keeps frozen (0014)", async () => {
    const insertedRow = {
      id: "row-1",
      ingredient_name: "Arroz",
      ingredient_normalized: "arroz",
      qty: 500,
      unit: "g",
      source: "manual",
      created_at: "2026-01-01T00:00:00Z",
      frozen: true,
      item_type: "ingredient",
      portions: null,
      recipe_ref: null,
      cooked_at: null,
    };

    const client = mockClient({
      user_pantry: [
        // lookup — no existing row
        { data: [], error: null },
        // insert with location — column missing
        { data: null, error: { code: UNDEFINED_COLUMN, message: 'column "location" does not exist' } },
        // insert without location — ok
        { data: [insertedRow], error: null },
      ],
    });
    Object.assign(supabase, client);

    const rows = await addPantryItems("user-1", [
      {
        name: "Arroz",
        normalized: "arroz",
        qty: 500,
        unit: "g",
        location: "congelador",
        frozen: true,
        source: "manual",
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].frozen).toBe(true);
    expect(rows[0].qty).toBe(500);
    expect(rows[0].location).toBeNull();

    const inserts = client.log.filter((e) => e.op === "insert");
    expect(inserts).toHaveLength(2);
    expect(inserts[0].args[0][0]).toHaveProperty("location", "congelador");
    expect(inserts[1].args[0][0]).not.toHaveProperty("location");
    expect(inserts[1].args[0][0].frozen).toBe(true);
  });

  it("persists cooked-dish portions and frozen when location column is missing", async () => {
    const insertedRow = {
      id: "dish-1",
      ingredient_name: "Lentejas",
      ingredient_normalized: "legumbres_001",
      qty: 4,
      unit: "racion",
      source: "manual",
      created_at: "2026-01-01T00:00:00Z",
      frozen: true,
      item_type: "cooked_dish",
      portions: 4,
      recipe_ref: "legumbres_001",
      cooked_at: "2026-01-05T00:00:00Z",
    };

    const client = mockClient({
      user_pantry: [
        { data: null, error: { code: UNDEFINED_COLUMN, message: 'column "location" does not exist' } },
        { data: [insertedRow], error: null },
      ],
    });
    Object.assign(supabase, client);

    const rows = await addPantryItems("user-1", [
      {
        name: "Lentejas",
        normalized: "legumbres_001",
        itemType: "cooked_dish",
        portions: 4,
        recipeRef: "legumbres_001",
        frozen: true,
        cookedAt: "2026-01-05T00:00:00Z",
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].portions).toBe(4);
    expect(rows[0].frozen).toBe(true);
    expect(rows[0].itemType).toBe("cooked_dish");
  });
});
