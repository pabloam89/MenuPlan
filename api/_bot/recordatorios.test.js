import { describe, it, expect } from "vitest";
import { madridAUtc } from "./recordatorios.js";

describe("madridAUtc", () => {
  it("en verano España va a UTC+2", () => {
    expect(madridAUtc("2026-07-05T19:00").toISOString()).toBe("2026-07-05T17:00:00.000Z");
  });
  it("en invierno, a UTC+1", () => {
    expect(madridAUtc("2026-12-06T19:00").toISOString()).toBe("2026-12-06T18:00:00.000Z");
  });
  it("el día del cambio de hora de octubre, por la tarde ya es invierno", () => {
    expect(madridAUtc("2026-10-25T19:00").toISOString()).toBe("2026-10-25T18:00:00.000Z");
  });
  it("lo que no es una fecha, null", () => {
    expect(madridAUtc("el domingo")).toBeNull();
  });
});
