import { describe, it, expect, vi, afterEach } from "vitest";
import handler, { buildShareHtml, isCrawler, escapeHtml } from "./share-recipe.js";

function mockRes() {
  const res = {
    headers: {},
    statusCode: 200,
    body: null,
    redirected: null,
    setHeader(k, v) { this.headers[k] = v; return this; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
    end() { return this; },
    redirect(code, url) { this.statusCode = code; this.redirected = url; return this; },
  };
  return res;
}

afterEach(() => vi.unstubAllGlobals());

describe("isCrawler", () => {
  it("reconoce a los robots de previsualización y no a los navegadores", () => {
    expect(isCrawler("WhatsApp/2.23.20.0 A")).toBe(true);
    expect(isCrawler("facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)")).toBe(true);
    expect(isCrawler("TelegramBot (like TwitterBot)")).toBe(true);
    expect(isCrawler("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1")).toBe(false);
    expect(isCrawler(undefined)).toBe(false);
  });
});

describe("buildShareHtml", () => {
  const base = {
    url: "https://homenu.app/r/user_1?t=abc",
    title: `Lentejas "de la abuela" <con chorizo>`,
    description: "Receta de Ana & Luis en HoMenu.",
    redirect: "/?r=user_1&t=abc",
  };

  it("escapa el nombre dentro de las etiquetas", () => {
    const html = buildShareHtml({ ...base, image: null });
    expect(html).toContain('og:title" content="Lentejas &quot;de la abuela&quot; &lt;con chorizo&gt;"');
    expect(html).toContain("Ana &amp; Luis");
    expect(html).not.toContain("<con chorizo>");
  });

  it("solo lleva og:image cuando hay foto", () => {
    expect(buildShareHtml({ ...base, image: null })).not.toContain("og:image");
    const withImg = buildShareHtml({ ...base, image: "https://homenu.app/api/share-recipe?id=user_1&img=1" });
    expect(withImg).toContain('og:image" content="https://homenu.app/api/share-recipe?id=user_1&amp;img=1"');
    expect(withImg).toContain("summary_large_image");
  });

  it("siempre redirige a la app por si una persona cae aquí", () => {
    const html = buildShareHtml({ ...base, image: null });
    expect(html).toContain('http-equiv="refresh" content="0;url=/?r=user_1&amp;t=abc"');
  });
});

describe("escapeHtml", () => {
  it("cubre las cinco entidades", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });
});

describe("handler", () => {
  it("rechaza ids con forma rara antes de tocar nada", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = mockRes();
    await handler({ method: "GET", query: { id: "../etc/passwd" }, headers: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a una persona la manda a la app con la llave intacta", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    const res = mockRes();
    await handler(
      {
        method: "GET",
        query: { id: "user_abc", t: "0123456789abcdef0123456789abcdef" },
        headers: { host: "homenu.app", "user-agent": "Mozilla/5.0 Safari" },
      },
      res,
    );
    expect(res.statusCode).toBe(302);
    expect(res.redirected).toBe("/?r=user_abc&t=0123456789abcdef0123456789abcdef");
  });

  it("descarta una llave con forma inválida en vez de propagarla", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    const res = mockRes();
    await handler(
      { method: "GET", query: { id: "user_abc", t: "<script>" }, headers: { host: "homenu.app", "user-agent": "Safari" } },
      res,
    );
    expect(res.redirected).toBe("/?r=user_abc");
  });

  it("a un robot le da HTML con las etiquetas aunque Supabase no conteste", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    const res = mockRes();
    await handler(
      { method: "GET", query: { id: "carnes_001" }, headers: { host: "homenu.app", "user-agent": "WhatsApp/2.0" } },
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toContain("text/html");
    expect(res.body).toContain('og:title" content="Una receta en HoMenu"');
    expect(res.body).toContain('og:url" content="https://homenu.app/r/carnes_001"');
  });
});
