# Modelo de datos de la casa: fuentes de verdad

Estado: propuesta para revisión. Decide quién manda sobre cada dato y en qué orden
se migra. No cambia código por sí solo.

## Principios

1. **Una fuente por dato.** Si un dato existe en dos sitios, uno manda y el otro es
   un espejo transitorio con fecha de caducidad (el paso que lo elimina).
2. **Tabla si tiene identidad, referencias o reglas que la base debe cumplir.**
   **JSON si es un atributo de la casa o un bloque que se lee y se escribe entero.**
3. **Escritura por cambio.** Un cambio toca solo las filas afectadas, dentro de una
   transacción. El bloqueo por `bot_rev` sobre el JSON se mantiene mientras haya
   JSON que escribir.
4. **Ninguna copia puede vaciar una casa.** Las listas ausentes o vacías se rechazan
   (guardas de la 0082).
5. **Borrado de personas en cascada.** Al borrar una persona, se borran sus alergias,
   estados, pertenencias y tareas de estado. Es lo que pide el borrado de datos.

## Fuentes decididas

| Dato | Fuente | Espejo / JSON | Motivo |
|---|---|---|---|
| Personas (`persona`) | **Tabla** | `data.members` hasta el paso 3 | Identidad y referencias desde tareas, horario, grupos |
| Alergias, intolerancias, estados, perfiles | **Tabla** (`persona_*`) | `members[].allergies` etc. hasta el paso 3 | Reglas que la base debe cumplir; consultas por alérgeno |
| Grupos y pertenencia (`grupo`, `grupo_persona`) | **Tabla** | `data.groups` hasta el paso 3 | Referencias a personas |
| Horario (quién come dónde) | **Tabla** (propuesta, paso 4) | `data.schedule` | Relación persona × día × comida |
| Reglas de invitados | **Tabla** (propuesta, paso 4) | `data.reglas` | Vigencia y caducidad propias |
| Plan semanal y compra | **Tabla** `user_menu_weeks` | `state.menuPlan` y `state.shopping` (duplicados, a eliminar) | Ya en tabla; la semana viva sale de ahí |
| Menú activo | **Tabla** `user_menus.is_active` | `activeMenuId` (derivado, a eliminar) | Índice único ya existe |
| Dueño de la casa | **Tabla** `households.owner_user_id` | fila `household_members` con rol owner (derivada) | Una sola fuente; la membresía se deriva |
| Recetas propias | **Tabla** `user_recipes` | `data.userRecipes` (espejo, a eliminar) | El espejo duplica y puede desincronizarse |
| Catálogo de recetas | **Bundle del repo** | tabla `recipes` (espejo) | El motor lee del bundle; la base es copia |
| Ingredientes y alimentos | **Bundle del repo** | tablas `ingredients` y relacionadas (espejo) | Mismo caso que el catálogo |
| Despensa | **Tabla** `user_pantry` | — | Filas con reglas y escritores distintos |
| Cole (`schoolMenus`) | **JSON** | — | Bloque semanal que se reemplaza entero |
| Tandas | **JSON** | — | Contadores y platos pedidos, bloque |
| Electrodomésticos, comidas, cocina | **JSON** | — | Atributos de la casa |
| Cuaderno de gustos (`notepad`) | **JSON** por ahora | — | Candidato a tabla por vigencias; decidir con datos |
| Gustos por persona (`dislikes`) | **JSON** hasta normalizar | — | Hay que pasar a ingrediente o receta antes |
| Tareas y recordatorios | **Tablas** | — | Ciclo de vida propio |
| Deshacer | **Tabla** `bot_deshacer` con foto JSON | — | La foto se restaura entera |

## Orden de migración

1. **Sincronización por escritura.** El bot escribe en el JSON y en las tablas dentro
   de la misma transacción (`bot_save_casa` llama a `persona_sincronizar_casa`).
   La app sigue escribiendo el JSON; un disparador sobre `household_state` mantiene
   las tablas al día. Requisito previo para cualquier lectura desde tablas.
2. **Lectura de personas desde tablas** en el bot (ficha, tareas, restricciones). El
   JSON sigue escrito como espejo.
3. **Lectura y escritura de personas desde la app.** La app pasa a escribir tablas.
   Se deja de escribir `members`, `groups` y las alergias en el JSON.
4. **Horario y reglas de invitados** a tablas.
5. **Eliminar duplicados:** `state.menuPlan`, `state.shopping`, `activeMenuId`,
   `data.userRecipes`.
6. **FK de tareas a persona** (migración 0083), tras la sincronización del paso 1.

## Invariantes que deben cumplirse

- Una persona aparece una vez por casa (PK `household_id, id`).
- Una alergia pertenece a una persona de la misma casa (FK compuesta).
- Un grupo solo contiene personas de su casa (FK compuestas).
- Un menú activo por casa (índice único).
- Una tarea de estado (alergias, etapa) se cierra cuando su persona desaparece o su
  dato queda resuelto.
- Ninguna sincronización vacía una casa con filas.

## Lo que no está decidido

- Si las alergias personalizadas de la casa (`customAllergies`) son valores fijos o
  texto libre. Hace falta ver los datos reales.
- Si el cuaderno de gustos merece tabla.
- Cuándo se normalizan los gustos a ingrediente o receta.
- Política de ids estables para recetas, sin la que no hay clave externa posible.
- Si borrar un menú debe revocar sus enlaces compartidos.
