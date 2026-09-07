/** Posiciones de un grid de N columnas, celdas cuadradas, sin hueco para
 * etiqueta (esta pieza no pinta el texto de cada tesela — ver ExplosionRecetas). */
export function gridLayout({ count, cols, gap, width, top = 0 }) {
  const tile = (width - gap * (cols - 1)) / cols;
  const rows = Math.ceil(count / cols);
  const height = rows * tile + (rows - 1) * gap;
  return {
    height,
    tiles: Array.from({ length: count }, (_, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      return { x: col * (tile + gap), y: top + row * (tile + gap), w: tile, h: tile };
    }),
  };
}

/** Centra un grid horizontalmente en `canvasWidth` y devuelve sus teselas ya
 * en coordenadas absolutas del lienzo. */
export function centeredGrid({ count, cols, gap, gridWidth, canvasWidth, top }) {
  const left = (canvasWidth - gridWidth) / 2;
  const { tiles, height } = gridLayout({ count, cols, gap, width: gridWidth, top });
  return { height, tiles: tiles.map((t) => ({ ...t, x: t.x + left })) };
}

/** Hash determinista (mismo valor en cada fotograma): nada de Math.random en
 * un render por fotogramas independientes, o cada frame saca un número
 * distinto y el vuelo tiembla. */
export function rand(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453123;
  return x - Math.floor(x);
}
