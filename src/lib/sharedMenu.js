import { DAYS } from "./planner.js";
import { stageForAge, resolveMemberAge, memberIllustratedAvatarSrc } from "./stages.js";

/**
 * Construye la proyección de un menú para publicarlo (contrato v1, definido en
 * supabase/migrations/0027_social_feed.sql).
 *
 * ── Lo que se comparte y lo que NO ─────────────────────────────────────────
 * Sale: qué se come cada día, en qué comida, y los avatares de quién come.
 * NO sale, nunca: la lista de la compra, el presupuesto, los precios, en qué
 * días coméis fuera de casa, las alergias, ni el nombre o la edad de nadie.
 *
 * Eso no es una decisión de esta función: es la razón de que esta función
 * exista. El menú vivo lleva todo eso en la misma estructura, así que
 * compartirlo tal cual publicaría cuándo tu casa está vacía y quién es menor.
 * Aquí se copia campo a campo lo que sí se comparte, en vez de quitar lo que
 * no — así, si mañana el menú gana un campo nuevo, no se filtra solo.
 *
 * Es pura y recibe los resolutores por parámetro para poder probarla sin
 * arrastrar el catálogo entero.
 *
 * @param {Object}   opts
 * @param {Object}   opts.menuPlan   menuPlan[groupId]["Lun-Comida"] = { recipeId, firstRecipeId }
 * @param {Object[]} opts.groups     [{ id, memberIds }]
 * @param {Object[]} opts.members    los miembros del hogar (solo se usan avatar y edad)
 * @param {string[]} opts.meals      ["Comida", "Cena"]
 * @param {Function} opts.dishName   (recipeId) => string | null
 * @param {Function} opts.isReadable (recipeId) => boolean — false si es una receta propia en privado
 */
export function buildSharedMenuPayload({
  menuPlan = {},
  groups = [],
  members = [],
  meals = ["Comida", "Cena"],
  weekStart = null,
  // Compartir puede ser la semana entera o solo un dia ("solo hoy"): se pasa
  // la lista de dias a incluir. null = todos. El filtro vive AQUI y no en
  // quien publica, para que un dia filtrado nunca arrastre los demas por un
  // descuido del llamante — lo que no entra en el payload no puede salir.
  onlyDays = null,
  dishName = () => null,
  isReadable = () => true,
}) {
  const byId = Object.fromEntries(members.map((m) => [m.id, m]));
  const wanted = onlyDays ? new Set(onlyDays) : null;

  const days = DAYS.filter((d) => !wanted || wanted.has(d)).map((day) => {
    const entries = [];
    for (const meal of meals) {
      const key = `${day}-${meal}`;
      for (const group of groups) {
        const slot = menuPlan[group.id]?.[key];
        if (!slot) continue;

        // Primero y segundo son dos platos del mismo hueco, en ese orden.
        const dishes = [slot.firstRecipeId, slot.recipeId]
          .filter(Boolean)
          .map((raw) => {
            // El id puede venir prefijado por el grupo ("<groupId>__<id>").
            const id = String(raw).split("__").pop();
            const name = dishName(id);
            if (!name) return null;
            return {
              recipeId: id,
              name,
              source: String(id).startsWith("user_") ? "user" : "catalog",
              // El nombre del plato se ve siempre; la receta solo se abre si
              // quien la escribió la tiene en público o de amigos.
              readable: Boolean(isReadable(id)),
            };
          })
          .filter(Boolean);

        if (dishes.length === 0) continue;

        entries.push({
          slot: meal,
          dishes,
          // Solo ids: los nombres y las edades se quedan en casa. Se cruzan
          // contra `members` de abajo, que ya viene anonimizado.
          eaters: (group.memberIds ?? []).filter((id) => byId[id]),
        });
      }
    }
    return entries.length > 0 ? { day, meals: entries } : null;
  }).filter(Boolean);

  return {
    v: 1,
    weeks: [{ weekStart, days }],
    // Dibujo y rol, nada más. El rol distingue adulto de niño para dar
    // contexto ("menú para dos adultos y un peque") sin decir quién es quién
    // ni qué edad tiene — que de un menor es justo lo que no se publica.
    //
    // El dibujo es el AVATAR ILUSTRADO, no la foto: aquí se mandaba `photo`,
    // que casi nadie tiene, así que al otro lado salían iniciales sueltas —
    // y el avatar cartoon, que sí tiene todo el mundo, se quedaba en casa.
    // Además la ilustración es justo lo que se puede publicar de un menor:
    // una foto real de un niño no sale de aquí ni queriendo.
    members: membersUsedIn(days, members).map((m) => ({
      id: m.id,
      avatar: memberIllustratedAvatarSrc(m),
      role: isChild(m) ? "nino" : "adulto",
    })),
  };
}

/** Solo los que aparecen comiendo algo: el resto no pinta en el menú. */
function membersUsedIn(days, members) {
  const used = new Set();
  for (const d of days) for (const m of d.meals) for (const id of m.eaters ?? []) used.add(id);
  return members.filter((m) => used.has(m.id));
}

function isChild(member) {
  const stage = stageForAge(resolveMemberAge(member)).id;
  return stage === "infantil" || stage === "primaria" || stage === "bebe";
}

/**
 * Título por defecto de un menú publicado. Vacío a propósito cuando no hay
 * nada que decir: la tarjeta ya enseña el rango de fechas, y "Mi menú" no
 * añade información.
 */
export function defaultMenuTitle(data) {
  const n = data?.menuWeekOffsets?.length ?? 1;
  return n > 1 ? `${n} semanas` : null;
}
