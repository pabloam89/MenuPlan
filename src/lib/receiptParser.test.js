import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { extractReceiptProducts } from "./receiptParser.js";

// Image prep (downscale + JPEG compress) relies on browser-only APIs
// (`createImageBitmap`, canvas) that don't exist in vitest's "node"
// environment. These tests exercise the *response parsing* path, not image
// encoding, so we stub imageFileToVisionPayload to hand receiptParser.js a
// ready-made base64 payload and go straight to the (mocked) fetch.
vi.mock("./visionImage.js", () => ({
  imageFileToVisionPayload: vi.fn(async () => ({ base64: "ZmFrZQ==", mediaType: "image/jpeg" })),
}));

function fakeReceiptFile() {
  return new File(["fake-image-bytes"], "ticket.jpg", { type: "image/jpeg" });
}

describe("extractReceiptProducts (Fase 5 — receipt parsing failure paths)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns product names on a well-formed response", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: '{"products":["Leche","Pan","Tomates"]}' }],
      }),
    });

    const products = await extractReceiptProducts(fakeReceiptFile());
    expect(products).toEqual(["Leche", "Pan", "Tomates"]);
  });

  it("tolerates prose wrapped around the JSON block", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          { type: "text", text: 'Aquí tienes el resultado:\n{"products":["Huevos"]}\n¡Listo!' },
        ],
      }),
    });

    const products = await extractReceiptProducts(fakeReceiptFile());
    expect(products).toEqual(["Huevos"]);
  });

  it("throws when the HTTP request itself fails, so the caller can show an error toast", async () => {
    global.fetch.mockResolvedValue({ ok: false });

    await expect(extractReceiptProducts(fakeReceiptFile())).rejects.toThrow();
  });

  it("throws when the network fetch rejects outright", async () => {
    global.fetch.mockRejectedValue(new Error("network down"));

    await expect(extractReceiptProducts(fakeReceiptFile())).rejects.toThrow();
  });

  it("throws when the model reply has no parseable JSON at all", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "No puedo leer el ticket, está borroso." }],
      }),
    });

    await expect(extractReceiptProducts(fakeReceiptFile())).rejects.toThrow();
  });

  it("falls back to an empty list — not an error, not fabricated data — when `products` isn't an array", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: '{"products":"Leche"}' }],
      }),
    });

    const products = await extractReceiptProducts(fakeReceiptFile());
    expect(products).toEqual([]);
  });

  it("falls back to an empty list when `products` key is missing entirely", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "{}" }],
      }),
    });

    const products = await extractReceiptProducts(fakeReceiptFile());
    expect(products).toEqual([]);
  });

  it("trims whitespace and drops empty/blank product names", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: '{"products":["  Leche  ", "", "   ", "Pan"]}' }],
      }),
    });

    const products = await extractReceiptProducts(fakeReceiptFile());
    expect(products).toEqual(["Leche", "Pan"]);
  });
});
