// Los colores de la Mini App. Dentro de Telegram salen de `WebApp.themeParams`
// (así el modo oscuro de Telegram es oscuro aquí también); fuera, o si Telegram
// no manda alguno, los de la marca. Telegram no garantiza contraste —el gris
// de pista del tema oscuro se queda en ~4:1 sobre su fondo—, así que los
// colores de texto y de borde se oscurecen o aclaran hasta llegar al mínimo.

export const CLARO = {
  fondo: "#f5f9f6",
  tarjeta: "#ffffff",
  tinta: "#14301d",
  suave: "#5f7468", // también el texto tachado: 5:1 sobre blanco
  acento: "#2d5a3d", // texto y bordes de acento, sobre la tarjeta
  relleno: "#2d5a3d", // fondo de lo que va relleno de acento (HOY, casilla, botón)
  sobreAcento: "#ffffff", // texto sobre `relleno`
  borde: "#6f8a78", // casilla sin marcar: 3,8:1 sobre blanco
  linea: "#e0eae3",
  pista: "#f0f5f2", // el carril de las pestañas: `suave` encima da 4,55:1
};

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function rgb(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = h.replace(/./g, "$&$&");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

const aHex = (c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

/** `a` llevado hacia `b` en proporción `t` (0 = a, 1 = b). */
export function mezclar(a, b, t) {
  const [x, y] = [rgb(a), rgb(b)];
  return aHex(x.map((v, i) => v + (y[i] - v) * t));
}

function luminancia(hex) {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contraste WCAG entre dos colores. */
export function contraste(a, b) {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** `color`, o lo mínimo más oscuro/claro que llega a `min` sobre `fondo`. */
export function asegurar(color, fondo, min) {
  if (contraste(color, fondo) >= min) return color;
  const extremo = luminancia(fondo) < 0.4 ? "#ffffff" : "#000000";
  for (let t = 0.05; t < 1; t += 0.05) {
    const c = mezclar(color, extremo, t);
    if (contraste(c, fondo) >= min) return c;
  }
  return extremo;
}

/** Los colores para unos `themeParams` de Telegram (o ninguno). */
export function temaDe(tp = {}) {
  const t = (k) => (typeof tp?.[k] === "string" && HEX.test(tp[k]) ? tp[k] : null);
  if (!t("bg_color") && !t("secondary_bg_color")) return CLARO;
  const tarjeta = t("bg_color") ?? CLARO.tarjeta;
  const fondo = t("secondary_bg_color") ?? mezclar(tarjeta, t("text_color") ?? CLARO.tinta, 0.04);
  const tinta = asegurar(t("text_color") ?? CLARO.tinta, tarjeta, 7);
  const pista = mezclar(tarjeta, tinta, 0.1);
  // El gris del tema tiene que valer en tarjeta, en fondo y en la pista de las pestañas.
  const suave = [tarjeta, fondo, pista].reduce((c, f) => asegurar(c, f, 4.5), t("hint_color") ?? CLARO.suave);
  // El acento es el verde de HoMenu, no el azul del botón de Telegram (lo
  // pidió Pablo, 30 sep 2026): del tema se toman fondos, texto y grises.
  const boton = CLARO.acento;
  const sobreAcento = CLARO.sobreAcento;
  // En tema oscuro el verde no llega a 4,5:1 como texto sobre el fondo: como
  // texto se aclara (acento) y como relleno se queda oscuro (relleno), para
  // que el blanco de encima se lea.
  return {
    fondo,
    tarjeta,
    tinta,
    suave,
    acento: asegurar(boton, tarjeta, 4.5),
    relleno: asegurar(boton, sobreAcento, 4.5),
    sobreAcento,
    borde: asegurar(suave, tarjeta, 3),
    linea: mezclar(tarjeta, tinta, 0.12),
    pista,
  };
}
