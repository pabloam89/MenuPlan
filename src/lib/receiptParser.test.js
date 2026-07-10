import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { extractReceiptProducts } from "./receiptParser.js";

// This suite runs under vitest's default "node" environment (no jsdom), so
// `File`/`FileReader` aren't globally available. `File` ships with modern
// Node, but `FileReader` doesn't — stub a minimal one that reads a File's
// bytes into a base64 data URL, matching what receiptParser.js needs.
class FakeFileReader {
  readAsDataURL(file) {
    file
      .arrayBuffer()
      .then((buf) => {
        const base64 = Buffer.from(buf).toString("base64");
        this.result = `data:${file.type};base64,${base64}`;
        this.onload?.();
      })
      .catch((err) => this.onerror?.(err));
  }
}

function fakeReceiptFile() {
  return new File(["fake-image-bytes"], "ticket.jpg", { type: "image/jpeg" });
}

describe("extractReceiptProducts (Fase 5 — receipt parsing failure paths)", () => {
  const originalFetch = global.fetch;
  const originalFileReader = global.FileReader;

  beforeEach(() => {
    global.fetch = vi.fn();
    global.FileReader = FakeFileReader;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    global.FileReader = originalFileReader;
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
