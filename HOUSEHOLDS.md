# MenuPlan — Hogares compartidos V1

Referencia única para implementación. V2 (co-owners, transferir propietario) fuera de alcance.

## Modelo mental

| Concepto | Qué es |
|----------|--------|
| **Cuenta (User)** | Login Google (`auth.users`). Perfil en **Hogares / Mi perfil**. Sin avatar de comensal. |
| **Hogar (Household)** | Espacio de planificación compartido: menú, compra, despensa, comensales, descartados, favoritas del hogar, preferencias. |
| **Comensales (`data.members`)** | Personas del menú (Pablo, niños…). **No** son logins. Datos del hogar. |

Un usuario puede estar en **hasta 3 hogares**: **1 propio (propietario)** + **hasta 2 como solo lectura**.

## Roles y límites

| | Por hogar | Por usuario |
|--|-----------|-------------|
| **Propietario** | Exactamente 1 | Exactamente 1 hogar propio (slot vitalicio) |
| **Solo lectura** | N (sin tope) | Máx. 2 hogares ajenos |

### Permisos

| Acción | Propietario | Solo lectura |
|--------|-------------|--------------|
| Menú, compra, despensa | Editar | Solo ver |
| Favoritas / descartados del hogar | Editar | Solo ver (datos del propietario) |
| Generar / regenerar menú | Sí | No |
| ❤️ / descartar en catálogo | Sí (hogar) | No |
| Invitar / expulsar | Sí (si `invite_ready`+) | No |
| Abandonar hogar | — | Sí |

## Datos por capa

### Del hogar (`household_id`)

- `household_state` — snapshot jsonb (members, groups, schedule, priceObs…)
- `user_pantry`, `user_menus*` — filas con `household_id`
- `household_recipe_discards` — descartados del menú del hogar
- `household_favorites` — favoritas para generación de menú del hogar

### Personales (`user_id` / `owner_id`)

- `user_recipes` — recetas creadas con Crear receta (`owner_id`)
- `recipe_votes` con `is_favorite = true` y sin `household_id` — **biblioteca personal** (pantalla Hogares)
- `user_profiles.active_household_id` — último hogar activo

## Recetas (nav inferior vs biblioteca personal)

### Nav **Recetas** (hogar activo)

Contexto del hogar. Viewer ve datos del **propietario**:

| Pestaña | Propietario | Solo lectura |
|---------|-------------|--------------|
| Favoritas | Edita | Ve las del hogar |
| Descartados | Edita | Ve los del hogar |
| Mis recetas | Las suyas para este hogar | Las del propietario (solo ver) |

### Pantalla **Hogares / Perfil** — “Tu biblioteca”

| Pestaña | Contenido |
|---------|-----------|
| Mis favoritas | Favoritas personales (Google) |
| Mis recetas | Recetas creadas por el usuario |

## Estados del hogar propio

```
dormant → (onboarding mínimo: nombre) → invite_ready → (onboarding completo) → active
```

| Estado | Dropdown header | Compartir enlace |
|--------|-----------------|------------------|
| `dormant` | Sí (aterrizar en onboarding mínimo) | No |
| `invite_ready` | Sí | Sí (token visible) |
| `active` | Sí | Sí |

Tras unirse por enlace ajeno: se crea hogar propio `dormant` + membership viewer en el invitado. Hogar propio puede quedar dormido.

## Invitaciones

- **Un enlace reutilizable** por hogar (`households.invite_token`), sin caducidad.
- Sin regenerar enlace en V1; control = **expulsar** viewers.
- Sin sesión: login → unir → aterrizar en hogar invitado.
- Token persistido en `user_profiles.pending_invite_token` hasta consumir.

## Borrados

| Evento | Efecto |
|--------|--------|
| Owner borra hogar | Cascade datos + viewers pierden acceso; recrear “Mi casa” vacío si era el único propio |
| Cuenta owner eliminada | Cascade delete hogar y memberships |

## Migración usuarios existentes (prod)

Al login, RPC `ensure_user_household()`:

1. Crea hogar “Mi casa” si no existe.
2. Copia `user_state` → `household_state`.
3. Etiqueta `household_id` en pantry, menus, discards.
4. Migra `recipe_votes.is_favorite` → `household_favorites`.
5. `setup_status = active` (ya completaron onboarding).
6. Genera `invite_token`.

## Sync y cache local

- **Sin realtime** en V1: recargar al abrir / al cambiar hogar.
- `localStorage`: cache por `household_id` (`menuplan.state.{householdId}`).
- Al cambiar hogar: swap de blob local + re-hidratación cloud.

## Schema (0017_households.sql)

```
households(id, name, owner_user_id, setup_status, invite_token, created_at, updated_at)
household_members(household_id, user_id, role, joined_at)
household_state(household_id, state, updated_at)
household_favorites(household_id, recipe_id, scope)
household_recipe_discards(household_id, recipe_id, is_permanent, cooldown_until)

user_profiles + active_household_id, pending_invite_token
user_pantry + household_id
user_menus / user_menu_weeks / user_menu_recipes + household_id
```

## Orden de implementación

1. `HOUSEHOLDS.md` (este doc)
2. `0017_households.sql`
3. `householdsSync.js` + `useHousehold()`
4. Migrar sync a `household_id`
5. `HouseholdsScreen` + dropdown + biblioteca personal
6. Permisos viewer en pantallas

## RPCs

| RPC | Uso |
|-----|-----|
| `ensure_user_household()` | Login / primera carga: migrar + devolver hogares |
| `join_household_by_token(token)` | Unirse por enlace |
| `leave_household(household_id)` | Viewer abandona |
| `remove_household_member(household_id, user_id)` | Owner expulsa |
| `set_active_household(household_id)` | Cambiar hogar activo |
| `activate_household_menu(menu_id)` | Menú activo scoped al hogar |
