/**
 * Un fallo de la base al cancelar no es «no lo encuentro», y el aviso de la
 * víspera no se quita antes de saber que la hora nueva vale.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("./db.js", () => ({ select: vi.fn(async () => [{ id: 1 }]), insert: vi.fn(), update: vi.fn(), eq: (v) => `eq.${v}` }));
vi.mock("./casa.js", () => ({ cargarCasa: vi.fn() }));

const { update } = await import("./db.js");
const { cancelarRecordatorio } = await import("./recordatorios.js");
const { avisoVispera } = await import("./vispera.js");

describe("recordatorios cuando algo falla", () => {
  it("si la base falla al cancelar, dice que sigue pendiente", async () => {
    update.mockRejectedValueOnce(new Error("PATCH → 500"));
    expect(await cancelarRecordatorio("1", 5)).toMatch(/^NO CANCELADO/);
  });

  it("si de verdad no está, lo dice", async () => {
    update.mockResolvedValueOnce([]);
    expect(await cancelarRecordatorio("1", 5)).toMatch(/No encuentro/);
  });

  it("con una hora mal escrita no quita el aviso que había", async () => {
    update.mockClear();
    const texto = await avisoVispera({ chatId: "1" }, { activar: true, hora: "8 y media" });
    expect(texto).toMatch(/HH:MM/);
    expect(update).not.toHaveBeenCalled();
  });
});
