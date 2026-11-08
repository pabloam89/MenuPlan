// #932: la misma foto llegó 4 veces en 15 minutos. Lo que el chat acaba de
// recibir no se vuelve a mandar.
import { describe, it, expect } from "vitest";
import { fotosVistas, fotosSinRepetir, VENTANA_FOTOS_MS } from "./fotosVistas.js";

const JUDIAS = "https://x/judias.jpg";
const BOWL = "https://x/bowl.jpg";
const ahora = Date.parse("2026-10-25T06:39:40Z");
const mensaje = (minutos, fotos = [JUDIAS, BOWL]) => ({ created_at: new Date(ahora - minutos * 60_000).toISOString(), content: { fotos } });

describe("fotosVistas: lo que el bot mandó hace poco", () => {
  it("el caso real: elegir las judías 14 minutos después del álbum", () => {
    expect(fotosVistas(mensaje(14), ahora)).toEqual([JUDIAS, BOWL]);
  });
  it("pasada la ventana, o sin fotos guardadas, nada", () => {
    expect(fotosVistas(mensaje(VENTANA_FOTOS_MS / 60_000 + 1), ahora)).toEqual([]);
    expect(fotosVistas({ created_at: new Date(ahora).toISOString(), content: {} }, ahora)).toEqual([]);
    expect(fotosVistas(null, ahora)).toEqual([]);
  });
});

describe("fotosSinRepetir", () => {
  it("el mismo álbum otra vez: no sale ninguna", () => {
    expect(fotosSinRepetir([{ url: JUDIAS }, { url: BOWL }], [JUDIAS, BOWL])).toEqual([]);
  });
  it("solo salen las nuevas", () => {
    expect(fotosSinRepetir([{ url: JUDIAS }, { url: "https://x/pasta.jpg" }], [JUDIAS])).toEqual([{ url: "https://x/pasta.jpg" }]);
  });
});
