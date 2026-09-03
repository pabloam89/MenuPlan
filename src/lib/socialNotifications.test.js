import { describe, it, expect } from "vitest";
import { buildNotifications, countUnread } from "./socialNotifications.js";

// La bandeja se DERIVA de las tablas reales (sin tabla de notificaciones):
// estos tests fijan las reglas finas de esa derivación, que son las que
// deciden si la campana da la brasa o no.

const iso = (h) => new Date(Date.now() - h * 3600_000).toISOString();

describe("buildNotifications", () => {
  it("junta las fuentes y ordena de nueva a vieja", () => {
    const items = buildNotifications({
      requests: [{ follower_id: "a", created_at: iso(5) }],
      comments: [{ id: "c1", author_id: "b", target_type: "recipe", target_id: "r1", body: "rico", created_at: iso(1) }],
      accepted: [{ followee_id: "c", responded_at: iso(3) }],
    });
    expect(items.map((i) => i.kind)).toEqual(["comment", "accepted", "request"]);
  });

  it("un seguidor que aceptaste TU no genera aviso (responded_at presente)", () => {
    const items = buildNotifications({
      followers: [
        { follower_id: "insta", created_at: iso(1), responded_at: null },
        { follower_id: "aceptado", created_at: iso(2), responded_at: iso(2) },
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0].actorId).toBe("insta");
  });

  it("tus propios comentarios en tu contenido no son noticia", () => {
    const items = buildNotifications({
      meId: "yo",
      comments: [
        { id: "c1", author_id: "yo", created_at: iso(1), target_type: "recipe", target_id: "r1", body: "nota mia" },
        { id: "c2", author_id: "otra", created_at: iso(2), target_type: "recipe", target_id: "r1", body: "rico" },
      ],
    });
    expect(items.map((i) => i.key)).toEqual(["com_c2"]);
  });

  it("una respuesta a ti en TU contenido no sale dos veces", () => {
    const reply = { id: "c9", author_id: "otra", parent_id: "c1", created_at: iso(1), target_type: "recipe", target_id: "r1", body: "si" };
    const items = buildNotifications({
      meId: "yo",
      comments: [reply], // llega por "comentaron lo tuyo"…
      replies: [reply],  // …y por "respondieron a tu comentario"
    });
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("comment");
  });

  it("una mencion dentro de un comentario que ya te llego no avisa dos veces", () => {
    const c = { id: "c1", author_id: "otra", created_at: iso(1), target_type: "recipe", target_id: "r1", body: "oye @yo mira esto" };
    const items = buildNotifications({ meId: "yo", comments: [c], mentions: [c] });
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("comment");
  });

  it("una mencion en contenido ajeno si genera aviso propio", () => {
    const items = buildNotifications({
      meId: "yo",
      mentions: [{ id: "c9", author_id: "otra", created_at: iso(1), target_type: "recipe", target_id: "rX", body: "@yo esto te va" }],
    });
    expect(items.map((i) => i.kind)).toEqual(["mention"]);
  });

  it("descarta items sin fecha en vez de romper el orden", () => {
    const items = buildNotifications({
      requests: [{ follower_id: "a", created_at: null }, { follower_id: "b", created_at: iso(1) }],
    });
    expect(items.map((i) => i.actorId)).toEqual(["b"]);
  });
});

describe("countUnread", () => {
  const items = [{ at: iso(1) }, { at: iso(10) }, { at: iso(30) }];

  it("cuenta solo lo posterior a la marca de agua", () => {
    expect(countUnread(items, iso(5))).toBe(1);
  });

  it("sin marca (primera vez), todo es nuevo", () => {
    expect(countUnread(items, null)).toBe(3);
  });

  it("marca en ahora deja el contador a cero", () => {
    expect(countUnread(items, new Date().toISOString())).toBe(0);
  });
});

describe("aviso de menú publicado", () => {
  it("avisa del menú de otra persona", () => {
    const items = buildNotifications({
      menus: [{ id: "m1", owner_id: "otro", created_at: "2026-09-03T10:00:00Z" }],
      meId: "yo",
    });
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("menu");
    expect(items[0].actorId).toBe("otro");
    expect(items[0].targetId).toBe("m1");
  });

  it("no te avisa de tu propio menú", () => {
    // Enterarte de que has publicado tú no es una noticia.
    const items = buildNotifications({
      menus: [{ id: "m1", owner_id: "yo", created_at: "2026-09-03T10:00:00Z" }],
      meId: "yo",
    });
    expect(items).toHaveLength(0);
  });

  it("no inventa avisos cuando no hay menús", () => {
    expect(buildNotifications({ meId: "yo" })).toHaveLength(0);
  });
});
