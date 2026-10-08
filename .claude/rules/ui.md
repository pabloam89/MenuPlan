---
paths:
  - "src/**/*.jsx"
  - "src/index.css"
---

# Pantallas y componentes

- **Lee `DESIGN_SYSTEM.md` antes de tocar un `.jsx`.** No es opcional: la
  columna de 420 px, el verde de acción, la jerarquía por peso y no por
  tamaño, los radios y las transiciones están ahí.
- **Iconos solo de Nucleo**, desde `src/components/icons.jsx` (se regenera
  con `npm run build:icons`). Nunca lucide.
- **Cambios mínimos.** Mete el cambio en las pantallas y los componentes que
  ya existen; no inventes pantallas ni componentes nuevos sin que se pidan.
- **Sin textos que nadie pidió**: ni subtítulos explicativos, ni toasts, ni
  texto de ayuda. Un badge es un icono y dos palabras.
- **Ante una duda de diseño, enseña el sitio exacto y pregunta.** No rellenes
  el hueco por tu cuenta.
- **En material visual (vídeo, capturas, maquetas), la UI es la real.** Antes
  de dibujar una pantalla, lee el componente de verdad
  (`src/components/DishActionBar.jsx`, el `DeckTile` de `src/screens/Menu.jsx`,
  la balda, las ilustraciones de `public/ingredients`) y copia sus números;
  las `@keyframes` de `src/index.css` se transcriben, no se sustituyen.
- Un cambio visible lo prueba el juez `qa` en el navegador antes del PR.
