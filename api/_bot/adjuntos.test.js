import { describe, it, expect, vi, afterEach } from "vitest";
import { deflateSync } from "node:zlib";

vi.mock("./telegram.js", () => ({ llamar: vi.fn(async () => ({ file_path: "f.pdf" })) }));
const { adjuntoDe, adjuntoDelAlta, paginasDePdf, porQueNoAdjunto, ERROR_ADJUNTO, MAX_PAGINAS_PDF } = await import("./adjuntos.js");

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
    // Lo que importa: no llega al modelo (sin base64), no se paga.
    expect(r.base64).toBeUndefined();
    expect(r).toEqual({ error: "paginas", paginas: 240 });
    expect(porQueNoAdjunto(r.error, r.paginas)).toBe(`Ese PDF es muy largo (240 páginas): leo hasta ${MAX_PAGINAS_PDF}. Mándame solo las que importan, o una foto de cada una.`);
  });

  it("uno corto se lee como siempre", async () => {
    conDescarga(pdf(3));
    const r = await adjuntoDe(unPdf);
    expect(r).toEqual({ tipo: "document", mediaType: "application/pdf", base64: pdf(3).toString("base64") });
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

  // Varios streams seguidos, como en un PDF de verdad: imágenes y varios object streams.
  const stream = (num, dicc, datos) => Buffer.concat([Buffer.from(`${num} 0 obj << ${dicc} >>\nstream\n`, "latin1"), datos, Buffer.from("\nendstream\nendobj\n", "latin1")]);
  const conPaginas = (n, desde) => deflateSync(Buffer.from(Array.from({ length: n }, (_, i) => `${desde + i} 0 obj << /Type /Page >> endobj`).join("\n"), "latin1"));
  const varios = (...partes) => Buffer.concat([Buffer.from("%PDF-1.5\n", "latin1"), ...partes, Buffer.from("%%EOF", "latin1")]);

  it("cuenta todos los object streams, también con una imagen entre medias (antes se saltaba uno de cada dos)", () => {
    const bytes = varios(
      stream(1, "/Type /ObjStm /Filter /FlateDecode", conPaginas(15, 10)),
      stream(2, "/Type /XObject /Subtype /Image /Filter /DCTDecode", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])),
      stream(3, "/Type /ObjStm /Filter /FlateDecode", conPaginas(15, 40)),
      stream(4, "/Type /ObjStm /Filter /FlateDecode", conPaginas(15, 70)),
    );
    expect(paginasDePdf(bytes)).toBe(45);
  });

  it("un stream Flate que no se puede abrir: no se sabe (null), no se da por bueno lo contado", () => {
    const bytes = varios(
      stream(1, "/Type /ObjStm /Filter /FlateDecode", conPaginas(5, 10)),
      stream(2, "/Type /ObjStm /Filter /FlateDecode", Buffer.from("esto no es zlib", "latin1")),
    );
    expect(paginasDePdf(bytes)).toBeNull();
  });
});

describe("lo que se le dice a la persona", () => {
  it("cada error del vocabulario tiene su frase, y uno desconocido la genérica", () => {
    const frases = Object.values(ERROR_ADJUNTO).map(porQueNoAdjunto);
    expect(new Set(frases.slice(0, 3)).size).toBe(3);
    expect(porQueNoAdjunto("otra cosa")).toMatch(/No he podido abrirla/);
  });
});

describe("en el alta, un adjunto que no se lee se dice (#958, C5)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("un PDF largo en el primer mensaje: el alta sigue con el pie y se dice por qué", async () => {
    conDescarga(pdf(240, { comprimido: true }));
    const alta = adjuntoDelAlta(await adjuntoDe(unPdf), " menú del cole ");
    expect(alta).toEqual({ adjunto: null, texto: "menú del cole", error: "paginas", aviso: porQueNoAdjunto("paginas", 240) });
  });

  it("si bajarlo falló (adjuntoDe lanzó y queda null), también se dice", () => {
    expect(adjuntoDelAlta(null, "")).toEqual({ adjunto: null, texto: null, error: "descarga", aviso: porQueNoAdjunto("descarga") });
  });

  it("uno que se lee va con su pie, o con «(te mando esta foto)» si no trae", () => {
    const a = { tipo: "image", mediaType: "image/jpeg", base64: "x" };
    expect(adjuntoDelAlta(a, "")).toEqual({ adjunto: a, texto: "(te mando esta foto)", aviso: null, error: null });
    expect(adjuntoDelAlta(a, "la cena").texto).toBe("la cena");
  });
});
