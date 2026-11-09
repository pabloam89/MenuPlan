/**
 * El carro de Mercadona, sin navegador (trozo 19 de #1407). Su web escribe el carro ENTERO en cada cambio
 * (`PUT …/cart/` con `{ id, version, lines }`; `.claude/skills/mercadona/referencias/pedido.md`, «Carrito»), así que
 * añadir la lista es: leerlo, sumarle la lista aquí y escribirlo una sola vez con la `version` leída.
 * Lo que la persona ya tenía no se quita ni se cambia.
 */

/**
 * El carro con la lista sumada: el mismo producto suma su cantidad; lo nuevo va detrás, en el orden de la lista.
 * De cada línea que ya estaba se guarda todo lo que traía (también `sources`, que no sabemos qué lleva).
 * @param {{ id: string, version: number, lines: { product_id: string, quantity: number }[] }} carro el que se leyó
 * @param {{ merca_code: string, quantity: number }[]} productos los de la lista
 * @returns {{ id: string, version: number, lines: object[] }} lo que se escribe
 */
export function sumarAlCarro(carro, productos) {
  const lineas = (carro.lines ?? []).map((l) => ({ ...l }));
  const porProducto = new Map(lineas.map((l) => [String(l.product_id), l]));
  for (const p of productos) {
    const id = String(p.merca_code);
    const cuantas = Math.max(1, Math.round(Number(p.quantity) || 1));
    const ya = porProducto.get(id);
    if (ya) ya.quantity = (Number(ya.quantity) || 0) + cuantas;
    else {
      const nueva = { product_id: id, quantity: cuantas };
      lineas.push(nueva);
      porProducto.set(id, nueva);
    }
  }
  return { id: carro.id, version: carro.version, lines: lineas };
}

/**
 * Comprueba que lo escrito es lo pedido: cada línea que se mandó está con su cantidad. Devuelve lo que no cuadra
 * (`product_id`), vacío si todo está. Así un carro que Mercadona recorta (un producto agotado) se dice.
 */
export function faltanEnCarro(mandado, devuelto) {
  const hay = new Map((devuelto?.lines ?? []).map((l) => [String(l.product_id), Number(l.quantity)]));
  return mandado.lines.filter((l) => hay.get(String(l.product_id)) !== Number(l.quantity)).map((l) => String(l.product_id));
}

/** El total del carro en euros, del `summary.total` que devuelve Mercadona («87.40» o «87,40»). null si no se puede leer. */
export function totalDelCarro(carro) {
  const t = carro?.summary?.total;
  if (t === null || t === undefined || t === "") return null;
  const n = Number(String(t).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
