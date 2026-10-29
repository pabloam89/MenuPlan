import { describe, it, expect, vi, afterEach } from "vitest";
import { deflateSync } from "node:zlib";

vi.mock("./telegram.js", () => ({ llamar: vi.fn(async () => ({ file_path: "f.pdf" })) }));
const { adjuntoDe, paginasDePdf, porQueNoAdjunto, ERROR_ADJUNTO, MAX_PAGINAS_PDF } = await import("./adjuntos.js");

// Un PDF mínimo con n páginas, a la vista o dentro de un «object stream» comprimido.
function pdf(n, { comprimido = false } = {}) {
  const paginas = Array.from({ length: n }, (_, i) => `${i + 3} 0 obj << /Type /Page /Parent 2 0 R >> endobj`).join("\n");
  const arbol = `2 0 obj << /Type /Pages /Count ${n} >> endobj`;
  if (!comprimido) return Buffer.from(`%PDF-1.4\n${arbol}\n${paginas}\n%%EOF`, "latin1");
  const dentro = deflateSync(Buffer.from(`${arbol}\n${paginas}`, "latin1"));
  return Buffer.concat([
    Buffer.from("%PDF-1.5\n1 0 obj << /Type /ObjStm /Filter /FlateDecode >>\nstream\n", "latin1"),
    dentro,
    Buffer.from("\nendstream\nendobj\n%%EOF", "latin1"),
  ]);
}

// Telegram de mentira: getFile (mock de arriba) y la descarga, que devuelve `bytes`.
const conDescarga = (bytes) => vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(bytes));
const unPdf = { document: { file_id: "d", mime_type: "application/pdf", file_size: 1000 } };

describe("un PDF largo no se lee entero (#958: se cobra por página)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("con más de MAX_PAGINAS_PDF páginas: no se lee, y se dice cuántas lee", async () => {
    conDescarga(pdf(240, { comprimido: true }));
    const r = await adjuntoDe(unPdf);
    expect(r).toEqual({ error: ERROR_ADJUNTO.PAGINAS, paginas: 240 });
    expect(r.base64).toBeUndefined();
    expect(porQueNoAdjunto(r.error)).toContain(`${MAX_PAGINAS_PDF} páginas`);
  });

  it("uno corto se lee como siempre, con sus páginas apuntadas", async () => {
    conDescarga(pdf(3));
    const r = await adjuntoDe(unPdf);
    expect(r).toMatchObject({ tipo: "document", mediaType: "application/pdf", paginas: 3 });
    expect(r.base64.length).toBeGreaterThan(0);
  });

  it("una foto no cuenta páginas", async () => {
    conDescarga(Buffer.from("jpeg"));
    const r = await adjuntoDe({ photo: [{ file_id: "p", file_size: 4 }] });
    expect(r).toEqual({ tipo: "image", mediaType: "image/jpeg", base64: Buffer.from("jpeg").toString("base64") });
  });
});

describe("cuántas páginas tiene un PDF", () => {
  it("a la vista, sin contar el árbol de páginas", () => {
    expect(paginasDePdf(pdf(3))).toBe(3);
  });
  it("dentro de un object stream comprimido (PDF 1.5+)", () => {
    expect(paginasDePdf(pdf(240, { comprimido: true }))).toBe(240);
  });
  it("sin ninguna página reconocible, null", () => {
    expect(paginasDePdf(Buffer.from("no es un pdf"))).toBeNull();
  });
});

describe("lo que se le dice a la persona", () => {
  it("cada error del vocabulario tiene su frase, y uno desconocido la genérica", () => {
    const frases = Object.values(ERROR_ADJUNTO).map(porQueNoAdjunto);
    expect(new Set(frases.slice(0, 3)).size).toBe(3);
    expect(porQueNoAdjunto("otra cosa")).toMatch(/No he podido abrirla/);
  });
});
