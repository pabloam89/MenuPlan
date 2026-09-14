# Ilustraciones de los pasos de cocina

Los dibujos que el **modo cocina** (`src/screens/CookMode.jsx`) pone junto a cada
paso. Uno por *familia de acción*, no uno por receta ni uno por paso.

## De dónde sale esta lista

No está inventada: sale de contar el **primer verbo de los 11.897 pasos** del
catálogo (`src/data/recipes/*.json`). Son **203 verbos distintos**, pero muchos
son la misma acción a ojos de un dibujo — picar, laminar y rallar son un
cuchillo cortando. Agrupados quedan **21 familias que cubren el 96,3%** de los
pasos.

El mapa vive en `src/lib/stepAction.js` y `stepAction.test.js` vigila que la
cobertura no baje del 90% si una pasada del enriquecedor cambia el estilo de
los pasos.

El 3,7% restante (101 verbos de cola, casi todos con 1-3 apariciones) no lleva
ilustración a propósito: la tarjeta cae al icono del `kind`, que es mejor que un
dibujo que no toca.

## Cómo se meten

1. Generar en Midjourney con el prompt de abajo, tal cual.
2. Guardar como `public/avatares/cards/pasos/<familia>.png` — el nombre exacto
   de la primera columna, en minúscula y sin acentos.
3. Recortar el fondo: `node scripts/cutout-illustrations.mjs`.
   Midjourney no devuelve blanco puro sino un crema (239,235,234) y el PNG sale
   sin alfa. En la tarjeta el dibujo va sobre un fondo tintado del color del
   paso, así que sin recortar se ve el recuadro crema metido a la fuerza.
4. Ya está. **No hay que tocar código**: `stepActionImage()` ya pide esa ruta y
   solo cae al icono si el fichero no existe.

`horno` **no hace falta generarlo**: reutiliza
`/avatares/cards/electrodomesticos/horno.webp`, que ya existe. Si algún día se
dibuja uno propio, basta con borrar su línea de `REUSED_ART` en `stepAction.js`.

## Estilo de la casa

Pixar / Disney 3D cartoon, fondo blanco limpio, sujeto único centrado, vista de
tres cuartos. Seed fijo **2151241667** — el mismo de las 479 ilustraciones de
ingredientes y las 30 de categorías, que es lo que hace que todo parezca de la
misma mano.

Parámetros: `--ar 1:1 --style raw --s 250 --seed 2151241667 --v 7`

Las cinco que llevan manos (`anadir`, `sazonar`, `formar`, `cascar`, `exprimir`)
conviene sacarlas seguidas y en la misma sesión, para que el estilo de mano no
cambie entre ellas. El resto llevan `no people` a propósito.

## Las 20 a generar

Ordenadas por cuántos pasos del catálogo cubre cada una. Con las tres primeras
ya se cubre el 40% de lo que se ve cocinando.

| # | Fichero | Pasos | % | Verbos que agrupa |
|---|---|---|---|---|
| 1 | `anadir.png` | 1.931 | 16,2% | añadir · verter · incorporar · distribuir · introducir · agregar · echar |
| 2 | `cortar.png` | 1.675 | 14,1% | cortar · picar · laminar · rallar · desmenuzar · trocear · desmigar · dividir · partir · filetear |
| 3 | `servir.png` | 1.152 | 9,7% | servir · colocar · repartir · disponer · desmoldar · emplatar |
| 4 | `calentar.png` | 831 | 7,0% | calentar · fundir · templar · recalentar · derretir |
| 5 | `retirar.png` | 765 | 6,4% | retirar · reservar · sacar · apartar |
| 6 | `sarten.png` | 714 | 6,0% | sofreír · freír · dorar · saltear · tostar · marcar · cuajar · pochar · rehogar |
| 7 | `mezclar.png` | 684 | 5,7% | mezclar · triturar · batir · remover · disolver · machacar · aplastar · amasar · montar |
| 8 | `escurrir.png` | 636 | 5,3% | escurrir · lavar · limpiar · secar · colar · frotar · enjuagar · aclarar |
| 9 | `hervir.png` | 624 | 5,2% | cocer · llevar · escaldar · hervir |
| 10 | `pelar.png` | 512 | 4,3% | pelar |
| 11 | `sazonar.png` | 454 | 3,8% | salpimentar · espolvorear · aliñar · rociar · regar · salar · sazonar |
| — | *(horno)* | 371 | 3,1% | hornear · precalentar · gratinar · asar — **ya existe** |
| 12 | `tapar.png` | 225 | 1,9% | cubrir · tapar · envolver · cerrar |
| 13 | `reposar.png` | 196 | 1,6% | dejar · reposar · refrigerar · sumergir · enfriar · marinar · macerar · desalar |
| 14 | `untar.png` | 156 | 1,3% | extender · untar · pincelar · napar · pintar · forrar · engrasar |
| 15 | `voltear.png` | 149 | 1,3% | dar · devolver · volver · voltear · girar |
| 16 | `fuego.png` | 126 | 1,1% | bajar · reducir · subir |
| 17 | `formar.png` | 96 | 0,8% | formar · rellenar · doblar · enrollar · estirar |
| 18 | `cascar.png` | 74 | 0,6% | cascar · separar |
| 19 | `exprimir.png` | 58 | 0,5% | exprimir |
| 20 | `rebozar.png` | 27 | 0,2% | enharinar · rebozar · empanar |

---

## Los prompts

### 1 · `anadir.png`

```
Pixar Disney style 3D cartoon illustration of a hand tipping a small white ceramic bowl of chopped vegetables into a wide green cooking pot, a few pieces caught mid-air falling, three-quarter view, clean white background, soft global illumination, warm key light from upper left, rounded chunky shapes, smooth matte surfaces, subtle subsurface scattering, cheerful and friendly, centered single subject, no text --ar 1:1 --style raw --s 250 --seed 2151241667 --v 7
```

### 2 · `cortar.png`

```
Pixar Disney style 3D cartoon illustration of a chef knife slicing a purple onion into rings on a light wooden cutting board, two neat slices already cut beside it, three-quarter view, clean white background, soft global illumination, warm key light from upper left, rounded chunky shapes, smooth matte surfaces, subtle subsurface scattering, cheerful and friendly, centered single subject, no text --ar 1:1 --style raw --s 250 --seed 2151241667 --v 7
```

### 3 · `servir.png`

```
Pixar Disney style 3D cartoon illustration of a finished dish on a round white ceramic plate garnished with a sprig of parsley, a fork resting beside the plate, three-quarter view, clean white background, soft global illumination, warm key light from upper left, rounded chunky shapes, smooth matte surfaces, subtle subsurface scattering, cheerful and friendly, centered single subject, no text --ar 1:1 --style raw --s 250 --seed 2151241667 --v 7
```

### 4 · `calentar.png`

```
Pixar Disney style 3D cartoon illustration of an empty shallow frying pan on a stovetop with soft wavy heat lines rising above it and one glossy drop of olive oil in the centre, three-quarter view, clean white background, soft global illumination, warm key light from upper left, rounded chunky shapes, smooth matte surfaces, subtle subsurface scattering, cheerful and friendly, centered single subject, no text --ar 1:1 --style raw --s 250 --seed 2151241667 --v 7
```

### 5 · `retirar.png`

```
Pixar Disney style 3D cartoon illustration of a wooden spatula lifting a golden browned piece of food out of a frying pan toward a waiting white plate, the piece held mid-air, three-quarter view, clean white background, soft global illumination, warm key light from upper left, rounded chunky shapes, smooth matte surfaces, subtle subsurface scattering, cheerful and friendly, centered single subject, no text --ar 1:1 --style raw --s 250 --seed 2151241667 --v 7
```

### 6 · `sarten.png`

```
Pixar Disney style 3D cartoon illustration of diced vegetables sizzling in a black frying pan with light steam curls and tiny oil sparkles above them, three-quarter view, clean white background, soft global illumination, warm key light from upper left, rounded chunky shapes, smooth matte surfaces, subtle subsurface scattering, cheerful and friendly, centered single subject, no text --ar 1:1 --style raw --s 250 --seed 2151241667 --v 7
```

### 7 · `mezclar.png`

```
Pixar Disney style 3D cartoon illustration of a metal balloon whisk stirring a creamy pale yellow mixture inside a white ceramic mixing bowl, a visible swirl in the batter, three-quarter view, clean white background, soft global illumination, warm key light from upper left, rounded chunky shapes, smooth matte surfaces, subtle subsurface scattering, cheerful and friendly, centered single subject, no text --ar 1:1 --style raw --s 250 --seed 2151241667 --v 7
```

### 8 · `escurrir.png`

```
Pixar Disney style 3D cartoon illustration of a metal colander draining cooked pasta with water droplets falling through the holes and light steam rising, three-quarter view, clean white background, soft global illumination, warm key light from upper left, rounded chunky shapes, smooth matte surfaces, subtle subsurface scattering, cheerful and friendly, centered single subject, no text --ar 1:1 --style raw --s 250 --seed 2151241667 --v 7
```

### 9 · `hervir.png`

```
Pixar Disney style 3D cartoon illustration of a green cooking pot full of bubbling water with rolling round bubbles and steam curls rising above the rim, three-quarter view, clean white background, soft global illumination, warm key light from upper left, rounded chunky shapes, smooth matte surfaces, subtle subsurface scattering, cheerful and friendly, centered single subject, no text --ar 1:1 --style raw --s 250 --seed 2151241667 --v 7
```

### 10 · `pelar.png`

```
Pixar Disney style 3D cartoon illustration of a vegetable peeler taking the skin off a potato with one long curled peel falling below, three-quarter view, clean white background, soft global illumination, warm key light from upper left, rounded chunky shapes, smooth matte surfaces, subtle subsurface scattering, cheerful and friendly, centered single subject, no text --ar 1:1 --style raw --s 250 --seed 2151241667 --v 7
```

### 11 · `sazonar.png`

```
Pixar Disney style 3D cartoon illustration of a pinch of salt falling from two fingers over a finished dish, individual grains caught mid-air, a small wooden pepper mill standing beside it, three-quarter view, clean white background, soft global illumination, warm key light from upper left, rounded chunky shapes, smooth matte surfaces, subtle subsurface scattering, cheerful and friendly, centered single subject, no text --ar 1:1 --style raw --s 250 --seed 2151241667 --v 7
```

### 12 · `tapar.png`

```
Pixar Disney style 3D cartoon illustration of a glass lid being lowered onto a green cooking pot with a single wisp of steam escaping at the rim, three-quarter view, clean white background, soft global illumination, warm key light from upper left, rounded chunky shapes, smooth matte surfaces, subtle subsurface scattering, cheerful and friendly, centered single subject, no text --ar 1:1 --style raw --s 250 --seed 2151241667 --v 7
```

### 13 · `reposar.png`

```
Pixar Disney style 3D cartoon illustration of a white ceramic bowl covered with a folded cloth resting beside a small round retro kitchen timer, calm and completely still, no steam, three-quarter view, clean white background, soft global illumination, warm key light from upper left, rounded chunky shapes, smooth matte surfaces, subtle subsurface scattering, cheerful and friendly, centered single subject, no text --ar 1:1 --style raw --s 250 --seed 2151241667 --v 7
```

### 14 · `untar.png`

```
Pixar Disney style 3D cartoon illustration of a silicone pastry brush spreading golden olive oil across a metal baking tray leaving a glossy stroke behind it, three-quarter view, clean white background, soft global illumination, warm key light from upper left, rounded chunky shapes, smooth matte surfaces, subtle subsurface scattering, cheerful and friendly, centered single subject, no text --ar 1:1 --style raw --s 250 --seed 2151241667 --v 7
```

### 15 · `voltear.png`

```
Pixar Disney style 3D cartoon illustration of a spatula flipping a golden breaded fillet in a frying pan, the fillet caught mid-turn in the air with a curved motion trail beneath it, three-quarter view, clean white background, soft global illumination, warm key light from upper left, rounded chunky shapes, smooth matte surfaces, subtle subsurface scattering, cheerful and friendly, centered single subject, no text --ar 1:1 --style raw --s 250 --seed 2151241667 --v 7
```

### 16 · `fuego.png`

```
Pixar Disney style 3D cartoon illustration of a stovetop control knob being turned down, with three small flame icons beside it where only the smallest one is lit and the other two are dimmed grey, three-quarter view, clean white background, soft global illumination, warm key light from upper left, rounded chunky shapes, smooth matte surfaces, subtle subsurface scattering, cheerful and friendly, centered single subject, no text --ar 1:1 --style raw --s 250 --seed 2151241667 --v 7
```

### 17 · `formar.png`

```
Pixar Disney style 3D cartoon illustration of two hands rolling a round meatball above a tray where three finished meatballs already rest in a row, three-quarter view, clean white background, soft global illumination, warm key light from upper left, rounded chunky shapes, smooth matte surfaces, subtle subsurface scattering, cheerful and friendly, centered single subject, no text --ar 1:1 --style raw --s 250 --seed 2151241667 --v 7
```

### 18 · `cascar.png`

```
Pixar Disney style 3D cartoon illustration of an egg being cracked on the rim of a white ceramic bowl with the golden yolk falling in and two half shells held above, three-quarter view, clean white background, soft global illumination, warm key light from upper left, rounded chunky shapes, smooth matte surfaces, subtle subsurface scattering, cheerful and friendly, centered single subject, no text --ar 1:1 --style raw --s 250 --seed 2151241667 --v 7
```

### 19 · `exprimir.png`

```
Pixar Disney style 3D cartoon illustration of half a lemon being squeezed above a small glass bowl with juice streaming down in a thin line, the other lemon half resting beside it, three-quarter view, clean white background, soft global illumination, warm key light from upper left, rounded chunky shapes, smooth matte surfaces, subtle subsurface scattering, cheerful and friendly, centered single subject, no text --ar 1:1 --style raw --s 250 --seed 2151241667 --v 7
```

### 20 · `rebozar.png`

```
Pixar Disney style 3D cartoon illustration of a white fish fillet being coated in a shallow plate of flour with a light dust cloud rising around it, three-quarter view, clean white background, soft global illumination, warm key light from upper left, rounded chunky shapes, smooth matte surfaces, subtle subsurface scattering, cheerful and friendly, centered single subject, no text --ar 1:1 --style raw --s 250 --seed 2151241667 --v 7
```

---

## Si algún día se quiere subir del 96,3%

Los candidatos que más rendirían, de los 101 verbos que hoy quedan fuera:

- **`probar`** — rectificar 12 · comprobar 11 · probar 7 · revisar 3 · ajustar 3
  · medir 1 = **37 pasos**. "Prueba y rectifica de sal" es un gesto de cocina
  con entidad propia.
- **`abrir` y `destapar`** dentro de `tapar` = **13 pasos**. Es el mismo objeto,
  el gesto contrario.

El resto son colas de una y dos apariciones (flambear, chamuscar, asustar,
remeter…) donde el icono del `kind` cumple mejor que un dibujo forzado.
