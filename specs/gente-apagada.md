# Gente apagada

**Desde el 7 oct 2026.** La parte social de la app (Gente) está apagada mientras HoMenu funciona como frontal de Lola. Gente incluye perfiles, seguir, publicar menús y recetas, me gusta y comentarios. **No se ha borrado nada**: todo sigue en el código y en la base de datos, solo deja de verse.

## El interruptor

`src/lib/frontalBot.js`:

```js
export const FRONTAL_BOT = true;
export const GENTE_ACTIVA = !FRONTAL_BOT;
```

Todo lo social que se oculta pregunta por `GENTE_ACTIVA` y lleva al lado un comentario con la etiqueta **`[GENTE-APAGADA]`**. Para encontrarlo todo:

```sh
grep -rn "GENTE-APAGADA" src
```

**Para volver a encenderlo:** que `GENTE_ACTIVA` valga `true`. Eso devuelve todo lo de la lista de abajo tal cual estaba. La pestaña «Gente» de la barra inferior va aparte: sale cuando `FRONTAL_BOT` es `false` (`NAV_FRONTAL` en `src/components/ui.jsx`). Si se quiere Gente pero sin dejar de ser frontal de Lola, hay que añadir `"feed"` a `NAV_FRONTAL`.

Si se añade algo social nuevo mientras Gente siga apagada, hay que colgarlo de `GENTE_ACTIVA` y ponerle la etiqueta. Si no, se cuela.

## Qué se oculta

| Dónde lo ve el usuario | Qué deja de verse | Fichero |
|---|---|---|
| Barra inferior | La pestaña «Gente» y su punto de novedades. Ya estaba así antes, va con `FRONTAL_BOT` | `components/ui.jsx` |
| Enlace de perfil `?u=usuario` | Ya no abre el perfil en Gente: el enlace se ignora | `App.jsx` |
| Enlace de receta `?r=` cerrada | Antes decía «Conéctate para verla» y abría el perfil del autor. Ahora dice «es una receta privada» y se queda donde está | `App.jsx` (`openLinkedRecipe`) |
| Ficha del plato | El recuadro del autor (cara, nombre, «hace 9 min») con 👍/👎 de la comunidad. Tocar al autor ya no abre su perfil | `screens/Menu.jsx` (`DishDetail`) |
| Ficha del plato | El hilo de comentarios del final | `screens/Menu.jsx` (`DishDetail`) |
| Recetas → Mis recetas | Las chapitas 👍 N / 💬 N sobre las fotos de lo publicado, y la consulta que las trae | `screens/CatalogBrowserSheet.jsx` |
| Biblioteca y catálogo en lista | Autor y 👍/👎 a la derecha de cada fila (`RecipeProvenance` devuelve `null`) | `components/RecipeProvenance.jsx` |
| Crear receta → «Así se verá tu receta» | El autor y los contadores 👍 👎 🍲 💬 a cero de la tarjeta | `screens/RecipePlanner.jsx` |
| Menú que llega por enlace | El ⋮ con «Reportar menú» y «Bloquear», los contadores de cada plato y los comentarios del menú. Quien lo manda se sigue viendo, pero ya no es un botón al perfil | `screens/FeedScreen.jsx` (`MenuPeek`, `SharedDishTile`) |
| «?» de Recetas | La frase «y las que te traes de Gente» | `components/HomeCoachTour.jsx` |
| Por detrás, sin verse | No se crea el perfil social al iniciar sesión, así que quien entra ahora no aparece en «Encontrar gente». Tampoco se cargan las notificaciones ni los menús publicados | `App.jsx` |

Antes de este cambio ya estaban ocultos con `FRONTAL_BOT` / `GUIAS_ACTIVAS`: la baldosa y la opción «Publicar en Gente» del menú (y con ellas la hoja de publicar), el tour de Gente y el «?» del Menú. La hoja «¿Publicas esta receta?» del creador de recetas se quitó el 6 oct 2026 (PR #73).

## Qué se queda, porque no es Gente

- Compartir el menú o una receta por WhatsApp, o con el compartir del sistema, y el enlace privado del menú.
- Abrir un enlace `?r=` de una receta que sí se puede ver.
- Guardar en tu recetario los platos de un menú que te han mandado.
- Los favoritos (♥ y la chapa «Favorita») y la chapa «Tuya».

## Lo que NO hace este interruptor

- **No borra perfiles.** Quien ya tenía perfil social sigue existiendo en la base y se le puede encontrar desde una versión con Gente encendida.
- **No retira lo publicado.** Los menús y recetas que alguien publicó siguen publicados en la base.
- **No toca el servidor.** Las tablas y las RPC sociales siguen ahí. Solo deja de llamarlas la app.
- **`FeedScreen` sigue montable:** ya no hay ningún camino que lleve a ella, pero el código está entero.
