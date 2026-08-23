# Dominio: Lista de la compra

## 1. Contrato funcional

**Qué hace.** No es una entidad persistida independiente: es una **vista derivada**, recalculada en cliente a partir de `menuPlan` (ya generado, ver `menu-generation.md`) + catálogo de recetas + despensa del usuario. `buildShoppingList(menuPlan, groups, meals, pantryIngredients)` (`src/lib/shoppingBuilder.js:149`) es la función pura central; todo lo demás (`shoppingListUtils.js`) son helpers de presentación (agrupar por receta, formatear cantidades).

**Entrada → Salida**:
```
buildShoppingList(menuPlan, groups, meals, pantryIngredients)
  → { byCategory: [{cat, items[]}], pantryItems: [...], byDay: [{day, items[]}], total: number }
```

**Pipeline, en orden**:
1. Recorre `menuPlan[groupId][día-comida]` para cada grupo/día/comida activa, resolviendo `firstRecipeId`/`recipeId` contra el catálogo bundleado (`RECIPES_BY_ID`).
2. Escala cada ingrediente por `eaters / recipe.servings` (`scaleIngredient`, `shoppingBuilder.js:56`) — unidades cualitativas ("al gusto", "pizca") no se escalan, quedan sin cantidad.
3. Agrega por `normalizeIngredientKey(name, unit)` a través de toda la semana.
4. **Descuenta despensa**: `matchesPantry()` compara por solapamiento de palabras normalizadas (no por cantidad — invariante explícita en el comentario: *"no partial-amount tracking, per the feature spec, deliberately out of scope"*). Un ingrediente `adapted` (sustitución dietética, p. ej. "Leche sin lactosa") usa una regla más estricta (subconjunto de palabras) para que una despensa con leche normal no descuente por error la variante adaptada.
5. **Ajuste a formato de compra** (`snapToPackSize`, `shoppingBuilder.js:100`): redondea a packs reales de supermercado vía una tabla de 20 reglas regex hardcodeadas (huevos→6, leche→1L, cebolla→150g/ud...). Cualquier ingrediente `ud` sin regla específica se redondea igualmente hacia arriba (no se puede comprar "0.25 cebolla").

**Invariante**: `total` excluye explícitamente los ítems que ya están en despensa (`pantryItems`) — el coste mostrado es "lo que falta por comprar", no "lo que cuesta el menú".

## 2. Modelo de datos

**No existe tabla propia.** El estado interactivo (qué se ha marcado como comprado/"ya en casa"/añadido a mano) vive dentro de `user_menu_weeks.shopping` (jsonb, default `{"items": []}`, ver `menu-generation.md`) — la lista en sí (`byCategory`/`byDay`/`total`) se recalcula siempre en cliente y **no se persiste**, solo el estado de check-off.

**Doble persistencia con prioridades documentadas**: además de `user_menu_weeks`, existe una copia en `user_state.state` (jsonb genérico de toda la app). El comentario en `menusSync.js:274-284` es explícito: *"el user_state blob sigue siendo la copia de refuerzo (belt-and-suspenders)"* — es decir, hay dos copias de la misma información, sincronizadas por separado, sin una única fuente de verdad declarada más allá de "cloud gana sobre local al hidratar" (`App.jsx`, comentario referenciado desde `menusSync.js:276`).

**Escritura**: `queueSaveMenuWeek()` (`menusSync.js:287`) hace debounce de 1200ms por `(user, menu, week)`, tolerando taps repetidos (marcar varios ítems seguidos) sin machacar la API. Es **fire-and-forget**: un fallo de red solo produce `console.warn` — el usuario no ve ningún error si el check-off no llegó a guardarse.

## 3. Dependencias externas

Ninguna directa. `buildShoppingList` es una función pura sin `fetch`/`supabase` — toda su entrada llega ya resuelta por quien la llama (`Shopping.jsx`). El único borde con red es el guardado del estado de check-off descrito arriba (Supabase, sin IA de por medio).

## 4. Puntos de acoplamiento

- **Depende por completo del catálogo bundleado** (`RECIPES_BY_ID`, mismo origen que `recipe-catalog.md`) — si un `recipeId` referenciado en un `menuPlan` histórico ya no existe en el catálogo actual (receta eliminada/renombrada entre versiones), `buildShoppingList` simplemente lo omite (`if (!recipe) continue`, `shoppingBuilder.js:166`) sin avisar — un menú antiguo puede perder ítems de la lista de la compra silenciosamente tras una actualización del catálogo.
- **Depende de `pantry.js`** (`src/lib/pantry.js`) para la lista de despensa normalizada que alimenta el descuento — un cambio en cómo se normaliza un nombre de ingrediente en `pantry.js` sin el mismo cambio en `ingredientCategories.js`/`normalizePantryInput.js` puede hacer que ítems que deberían descontarse no lo hagan (o al revés).
- **Tabla `PACK_SIZES` hardcodeada** (`shoppingBuilder.js:71-98`) — cualquier ingrediente nuevo del catálogo que se compre típicamente en un formato de pack específico (p. ej. un queso nuevo, una verdura nueva) no tendrá redondeo hasta que alguien añada su regex a mano.
- **`user_state` vs `user_menu_weeks`**: cualquier código que lea el estado de la compra tiene que saber cuál de las dos copias es la vigente — un cambio futuro que solo escriba en una de las dos rompe la sincronización entre dispositivos de forma sutil (funciona en el dispositivo que escribió, no en el que lee de la otra copia).

## 5. Deuda técnica visible

1. **Doble persistencia sin fuente única de verdad declarada** (`user_state` + `user_menu_weeks.shopping`) — descrita como intencionada en un comentario, pero es exactamente el patrón que causó el bug de borrado de cuenta de esta sesión (datos en dos sitios que pueden divergir).
2. **Fallos de guardado invisibles para el usuario** (`console.warn` únicamente) — un check-off que no llega a guardarse por un fallo de red no se reintenta ni se notifica.
3. **Tabla de packs de supermercado hardcodeada** con 20 reglas regex — no escala con el catálogo sin mantenimiento manual continuo.
4. **Sin manejo de cantidades parciales en despensa**, documentado como decisión de producto, no bug — pero vale la pena verificarlo con negocio dado que puede sorprender al usuario ("tengo un huevo, dice que no me falta comprar huevos" cuando la receta necesita 6).
5. **Ítems de menús históricos con receta eliminada del catálogo se omiten en silencio** de la lista de la compra recalculada.
