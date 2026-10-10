---
paths:
  - "src/**/*.jsx"
  - "src/index.css"
---

# Pantallas y componentes

- **Lee `DESIGN_SYSTEM.md` antes de tocar un `.jsx`.** No es opcional: el
  criterio (columna, jerarquía por peso, voz, accesibilidad) está ahí.
- **Los valores salen de los tokens** (`src/design/tokens.js`; en CSS,
  `var(--…)` de `src/design/tokens.css`), por **rol**, no por hex ni por
  número. No copies aquí ni en tu pantalla los valores: se leen en el módulo.
  Estado, decisiones abiertas y orden de migración: `docs/diseno/ESTADO.md`.
- **Valores sueltos: la lista solo baja.** La regla `local/no-valor-suelto`
  (aviso) los cuenta contra `lint-tokens-base.json`. Mientras una pantalla no
  esté migrada, lo que **añadas o cambies** va por token; lo antiguo se
  migra en el PR de su pantalla (una por PR, no de paso). Si falta un token,
  se añade al sistema con su porqué.
- **Iconos solo de Nucleo**, desde `src/components/icons.jsx` (se regenera
  con `npm run build:icons`). Nunca lucide.
- **Cambios mínimos.** Mete el cambio en las pantallas y los componentes que
  ya existen; no inventes pantallas ni componentes nuevos sin que se pidan.
  Los que sí están pedidos son los de #239 (`Button`, `Card`, `Field`, `Sheet`,
  `HeaderPantalla`, `ListRow`, `Skeleton`, `Spinner`; ver ESTADO.md,
  «Componentes»).
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
