import { esEtapaBebe, esMenor, esNino, etapaDe, resolveMemberAge } from "./stages.js";
import { normalizeAllergenId } from "./allergensCore.js";
import * as ids from "./ids.js";

const GROUP_COLORS = ["#2d5a3d", "#c67030", "#5a7ea8", "#a85a7e", "#7e5aa8", "#5aa87e"];
const BABY_GROUP_LABEL = "Bebé";

/**
 * De qué es un grupo: 'familia' | 'adultos' | 'ninos' | 'bebe' | 'adhoc' (un
 * menú individual, como la dieta blanda). Lo que lo identifica es esto, no la
 * etiqueta: la etiqueta se enseña y puede cambiar.
 *
 * Los grupos guardados antes de oct 2026 no lo llevan: se deduce de la
 * etiqueta, aquí y solo aquí. Un grupo con etiqueta desconocida da null.
 */
const TIPO_POR_ETIQUETA = { Familia: "familia", Adultos: "adultos", "Niños": "ninos", [BABY_GROUP_LABEL]: "bebe" };
export function tipoDeGrupo(group) {
  if (!group) return null;
  if (group.tipo) return group.tipo;
  if (group.adHoc) return "adhoc";
  return TIPO_POR_ETIQUETA[group.label] ?? null;
}

const esDelBebe = (group) => tipoDeGrupo(group) === "bebe";

/** El mismo grupo con su tipo escrito, si se puede deducir y no lo llevaba. */
function conTipo(group) {
  const tipo = tipoDeGrupo(group);
  return tipo && group.tipo !== tipo ? { ...group, tipo } : group;
}

// Familia y Adultos hacen el mismo papel, el menú de los mayores: al pasar de
// «todos lo mismo» a menús separados (o al revés) uno hereda el id del otro.
const RELEVO = { familia: "adultos", adultos: "familia" };

/**
 * Lo que una persona le pide al filtro del menú: alergias (todas, si están
 * sin revisar: ver alergiasParaMenu en alergias.js), intolerancias, estados,
 * perfiles de salud y, de 3 a 11, el filtro del alcohol (buildGroupContext).
 */
function restriccionesDe(m) {
  return [
    ...(m.allergies ?? []).map((a) => `alergia:${normalizeAllergenId(a)}`),
    ...(m.alergiasRevisadas === false ? ["alergia:sin_revisar"] : []),
    ...(m.intolerances ?? []).map((x) => `intolerancia:${x}`),
    ...(m.dietaryStates ?? []).map((x) => `estado:${x}`),
    ...(m.healthProfiles ?? []).map((x) => `salud:${x}`),
    ...(esNino(m) ? ["nino"] : []),
  ];
}

/**
 * ¿Vale el plan del grupo viejo `v` para el nuevo `g`? Se hizo para los de
 * `v`: si llega alguien con una restricción que no tenía ninguno de ellos, el
 * plan no pasó por su filtro (Nina, alérgica al huevo, de Niños a Familia con
 * la tortilla de Adultos). Sin `members` no se sabe: solo vale si no llega nadie.
 */
function planValePara(g, v, members) {
  const antes = new Set(v.memberIds ?? []);
  const llegan = (g.memberIds ?? []).filter((id) => !antes.has(id));
  if (!llegan.length) return true;
  if (!Array.isArray(members)) return false;
  const porId = new Map(members.map((m) => [m.id, m]));
  const cubiertas = new Set([...antes].flatMap((id) => (porId.has(id) ? restriccionesDe(porId.get(id)) : [])));
  return llegan.every((id) => !porId.has(id) || restriccionesDe(porId.get(id)).every((r) => cubiertas.has(r)));
}

/**
 * Los grupos `nuevos` con los ids de los `viejos` que hacen su mismo papel.
 *
 * El plan, los *ByGroup, los ids de receta `${gid}__rid`, la compra y las
 * reglas van por id de grupo: rehacer los grupos con ids nuevos dejaba todo eso
 * huérfano. Se hereda por tipo (un id viejo, una sola vez): primero el mismo
 * tipo; luego Familia ↔ Adultos; un menú individual, por la persona
 * (`sourceMemberId`); un grupo sin tipo conocido, por la etiqueta. Lo que no
 * hereda nada se queda con su id nuevo. Los `sourceGroupId` que apuntaban a un
 * id nuevo pasan al heredado.
 *
 * Con el id va el plan: no se hereda si llega al grupo alguien con una
 * restricción que el grupo viejo no tenía (planValePara). Entonces id nuevo y
 * tablero vacío, como antes de heredar ids: más vale rehacer que servir un
 * plato sin pasar por su filtro.
 */
export function conservarIds(viejos, nuevos, members) {
  const candidatos = (viejos ?? []).filter((v) => v?.id);
  if (!candidatos.length || !Array.isArray(nuevos) || !nuevos.length) return nuevos;
  const usados = new Set(nuevos.map((g) => g.id).filter((id) => candidatos.some((v) => v.id === id)));
  const elegidos = nuevos.map((g) => (usados.has(g.id) ? g.id : null));
  const mismoPapel = (g, v) => {
    const tipo = tipoDeGrupo(g);
    if (tipo === "adhoc") return tipoDeGrupo(v) === "adhoc" && v.sourceMemberId === g.sourceMemberId;
    if (tipo == null) return tipoDeGrupo(v) == null && v.label === g.label;
    return tipoDeGrupo(v) === tipo;
  };
  const relevo = (g, v) => RELEVO[tipoDeGrupo(g)] != null && tipoDeGrupo(v) === RELEVO[tipoDeGrupo(g)];
  for (const casa of [mismoPapel, relevo]) {
    nuevos.forEach((g, i) => {
      if (elegidos[i]) return;
      const v = candidatos.find((x) => !usados.has(x.id) && casa(g, x) && planValePara(g, x, members));
      if (v) { usados.add(v.id); elegidos[i] = v.id; }
    });
  }
  const renombrado = new Map(nuevos.map((g, i) => [g.id, elegidos[i] ?? g.id]));
  return nuevos.map((g, i) => {
    const id = elegidos[i] ?? g.id;
    const origen = g.sourceGroupId != null ? renombrado.get(g.sourceGroupId) ?? g.sourceGroupId : g.sourceGroupId;
    return id === g.id && origen === g.sourceGroupId ? g : { ...g, id, ...(g.sourceGroupId != null ? { sourceGroupId: origen } : {}) };
  });
}

// Re-exported for backwards compatibility: `resolveMemberAge` lives in
// stages.js (the single source of truth for age math), but historically
// callers import it from groups.js.
export { resolveMemberAge };

/**
 * Which menu tier ("Adultos" / "Niños" / "Bebé") a member belongs to by
 * default, from etapaDe (stages.js): bebé → "baby"; niño y adolescente (3–17)
 * → "child", so a 15-year-old still defaults into "Niños"; adulto → "adult".
 * La edad manda sobre el papel: un «Amigo/a» de 40 o un «Hijo/a» de 25 van
 * con los mayores. Sin edad ni papel que lo diga ('desconocida', p. ej. un
 * «Amigo/a» sin edad), con los mayores, como cuando valía 30 años.
 */
const TIER_POR_ETAPA = { bebe: "baby", nino: "child", adolescente: "child", adulto: "adult", desconocida: "adult" };
export function tierForMember(member) {
  return TIER_POR_ETAPA[etapaDe(member).etapa];
}

export function splitMembersByStage(members) {
  const adults = [];
  const children = [];
  const babies = [];
  for (const m of members) {
    const tier = tierForMember(m);
    if (tier === "baby") babies.push(m);
    else if (tier === "child") children.push(m);
    else adults.push(m);
  }
  return { adults, children, babies };
}

export function memberIsBaby(member) {
  // etapaDe: bebé hasta cumplir 3, o sin edad con papel «Bebé»; «ya come como
  // un niño» (`notBaby`) lo saca siempre del menú del bebé.
  return esEtapaBebe(member);
}

export function hasBabyMember(members) {
  return members.some((m) => memberIsBaby(m));
}

/** True when someone belongs on the kids' menu (3–17, or a baby marked "ya
 * come como niño" via notBaby). Pure babies do NOT count — they already have a
 * dedicated baby pool. */
export function hasChildMember(members) {
  return splitMembersByStage(members).children.length > 0;
}

/** True when a member is younger than adult (baby, child or teen), i.e. the
 * household has someone a school/daycare menu could apply to. */
export function hasUnderageMember(members) {
  return members.some((m) => esMenor(m));
}

/** True when "Menús separados" is worth asking: there is at least one child
 * menu to diverge from adults. Adults+babies alone don't need the question —
 * babies already get their own pool under "same" (Familia + Bebé). */
export function canSplitMenus(members) {
  const { adults, children } = splitMembersByStage(members);
  return adults.length > 0 && children.length > 0;
}

/** True when this group's menu must use only baby recipes. */
export function isBabyMenuGroup(group, members) {
  if (esDelBebe(group)) return true;
  const groupMembers = membersOfGroup(group, members);
  return groupMembers.length > 0 && groupMembers.every((m) => memberIsBaby(m));
}

/** Groups a member may be assigned to in onboarding. */
export function groupsAvailableForMember(member, groups) {
  const isBaby = memberIsBaby(member);
  return groups.filter((g) =>
    isBaby ? esDelBebe(g) : !esDelBebe(g)
  );
}

export function canAssignMemberToGroup(member, group) {
  if (!group) return false;
  const isBaby = memberIsBaby(member);
  if (esDelBebe(group)) return isBaby;
  return !isBaby;
}

function buildSplitGroups({ adults, children, babies }) {
  const groups = [];
  let colorIdx = 0;
  if (adults.length > 0) {
    groups.push({
      id: ids.grupo.nuevo(),
      label: "Adultos",
      tipo: "adultos",
      memberIds: adults.map((m) => m.id),
      color: GROUP_COLORS[colorIdx++],
    });
  }
  if (children.length > 0) {
    groups.push({
      id: ids.grupo.nuevo(),
      label: "Niños",
      tipo: "ninos",
      memberIds: children.map((m) => m.id),
      color: GROUP_COLORS[colorIdx++],
    });
  }
  if (babies.length > 0) {
    groups.push({
      id: ids.grupo.nuevo(),
      label: "Bebé",
      tipo: "bebe",
      memberIds: babies.map((m) => m.id),
      color: GROUP_COLORS[colorIdx++],
    });
  }
  return groups;
}

/**
 * Build default groups from members: Adultos, Niños (3–11) and Bebé (0–2) when needed.
 */
export function defaultGroupsFromMembers(members) {
  const split = splitMembersByStage(members);
  const groups = buildSplitGroups(split);
  if (groups.length === 0 && members.length > 0) {
    groups.push({
      id: ids.grupo.nuevo(),
      label: "Familia",
      tipo: "familia",
      memberIds: members.map((m) => m.id),
      color: GROUP_COLORS[0],
    });
  }
  return groups;
}

const TIER_LABEL = { adult: "Adultos", child: "Niños", baby: BABY_GROUP_LABEL };
const TIPO_POR_TIER = { adult: "adultos", child: "ninos", baby: "bebe" };
const TIER_POR_TIPO = { adultos: "adult", ninos: "child", bebe: "baby" };
const tierDeGrupo = (group) => TIER_POR_TIPO[tipoDeGrupo(group)];

/**
 * Keeps the tier menus in sync with who actually lives in the house: drops a
 * tier nobody belongs to (no kids → no "Niños" menu at all), adds one back when
 * a tier gains its first member, and places anyone still unassigned into the
 * menu for their own tier, so opening the assignment sheet already shows a
 * sensible default instead of an empty grid.
 *
 * Only touches a tier-based split: ad-hoc individual menus are preserved, and a
 * single-"Familia" model is returned untouched.
 */
function isTierSplit(groups) {
  const tierGroups = groups.filter((g) => !g.adHoc);
  return tierGroups.length > 0 && tierGroups.every((g) => tierDeGrupo(g));
}

/** Same groups, same people on each, in the same order. */
function sameAssignment(a, b) {
  if (a.length !== b.length) return false;
  return a.every((g, i) => {
    const other = b[i];
    return (
      other &&
      g.id === other.id &&
      g.label === other.label &&
      g.memberIds.length === other.memberIds.length &&
      g.memberIds.every((id, j) => id === other.memberIds[j])
    );
  });
}

export function reconcileTierGroups(members, groups) {
  const list = groups ?? [];
  if (!isTierSplit(list)) return list;

  const split = splitMembersByStage(members);
  const byTier = { adult: split.adults, child: split.children, baby: split.babies };
  const alive = new Set(members.map((m) => m.id));

  const next = list
    .filter((g) => g.adHoc || byTier[tierDeGrupo(g)].length > 0)
    .map((g) => ({ ...g, memberIds: g.memberIds.filter((id) => alive.has(id)) }));

  for (const tier of ["adult", "child", "baby"]) {
    if (byTier[tier].length > 0 && !next.some((g) => tierDeGrupo(g) === tier)) {
      next.push({ id: ids.grupo.nuevo(), label: TIER_LABEL[tier], tipo: TIPO_POR_TIER[tier], memberIds: [], color: nextGroupColor(next) });
    }
  }

  // Computed after the pruning above, so someone whose only menu just
  // disappeared counts as unassigned and lands back in their own tier.
  const placed = new Set(next.flatMap((g) => g.memberIds));
  return next.map((g) => {
    const tier = g.adHoc ? undefined : tierDeGrupo(g);
    if (!tier) return g;
    const missing = byTier[tier].filter((m) => !placed.has(m.id)).map((m) => m.id);
    return missing.length > 0 ? { ...g, memberIds: [...g.memberIds, ...missing] } : g;
  });
}

/**
 * ¿Son los mismos menús, con la misma gente en cada uno?
 *
 * Existe porque `migrateGroupsForBabies` reconstruye siempre los objetos: en el
 * efecto que concilia la familia con los menús, comparar referencias dejaría el
 * estado girando en bucle aunque no se hubiera movido nadie. Compara lo que de
 * verdad importa —qué menús hay y quién come en cada uno—, no la identidad de
 * los objetos ni el orden dentro de cada lista de miembros.
 */
export function mismosGrupos(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((g, i) => {
    const o = b[i];
    if (!o || g.id !== o.id || g.label !== o.label) return false;
    if (g.memberIds.length !== o.memberIds.length) return false;
    const suyos = new Set(o.memberIds);
    return g.memberIds.every((id) => suyos.has(id));
  });
}

/**
 * Put every member on some menu after the roster changed.
 *
 * `reconcileTierGroups` only understands an Adultos/Niños/Bebé split and hands
 * back a single-"Familia" model untouched, so someone added to a household that
 * eats the same menu ended up on no menu at all: the planner, the avatar stacks
 * and the group pickers all kept showing the roster as it was before them.
 * Returns `groups` unchanged (same reference) when nobody moved, so callers can
 * skip a pointless state write.
 */
export function reconcileGroupsWithMembers(members, groups) {
  const list = groups ?? [];
  if (list.length === 0) return list;
  if (isTierSplit(list)) {
    const tiered = reconcileTierGroups(members, list);
    return sameAssignment(tiered, list) ? list : tiered;
  }

  // Non-tier layout — the single "Familia" menu, optionally beside "Bebé".
  const alive = new Set(members.map((m) => m.id));
  const pruned = list.map((g) => ({
    ...g,
    memberIds: g.memberIds.filter((id) => alive.has(id)),
  }));

  const placed = new Set(pruned.flatMap((g) => g.memberIds));
  const newcomers = members.filter((m) => !placed.has(m.id));
  if (newcomers.length === 0) {
    return sameAssignment(pruned, list) ? list : pruned;
  }

  // Babies keep their own menu when one exists; everyone else joins the
  // general one, which is whichever menu isn't the babies'.
  const babyGroup = pruned.find(esDelBebe);
  const general = pruned.find((g) => !esDelBebe(g)) ?? pruned[0];
  const babyIds = babyGroup
    ? newcomers.filter((m) => memberIsBaby(m)).map((m) => m.id)
    : [];
  const babySet = new Set(babyIds);
  const generalIds = newcomers.filter((m) => !babySet.has(m.id)).map((m) => m.id);

  const next = pruned.map((g) => {
    if (babyGroup && g.id === babyGroup.id && babyIds.length > 0) {
      return { ...g, memberIds: [...g.memberIds, ...babyIds] };
    }
    if (g.id === general.id && generalIds.length > 0) {
      return { ...g, memberIds: [...g.memberIds, ...generalIds] };
    }
    return g;
  });
  return sameAssignment(next, list) ? list : next;
}

export function nextGroupColor(existing) {
  const used = new Set(existing.map((g) => g.color));
  return GROUP_COLORS.find((c) => !used.has(c)) ?? GROUP_COLORS[existing.length % GROUP_COLORS.length];
}

// ── Ad-hoc individual menus ────────────────────────────────────────────────
// A short, single-person menu (e.g. "dieta blanda") that lives alongside the
// family menu as its own group, then auto-expires. It's a normal group object
// with extra bookkeeping fields (adHoc / sourceMemberId / sourceGroupId /
// reason / createdAt / days) so the whole existing pipeline — generation,
// hydration, rendering, persistence — treats it like any other menu group.

export const ADHOC_MENU_DAYS = 3;
const ADHOC_MENU_MS = ADHOC_MENU_DAYS * 24 * 60 * 60 * 1000;

export function isIndividualMenuGroup(group) {
  return Boolean(group?.adHoc);
}

export function individualMenuGroupFor(groups, memberId) {
  return (groups ?? []).find((g) => g.adHoc && g.sourceMemberId === memberId) ?? null;
}

// Fixed color (matches the "Dieta blanda" icon everywhere else: onboarding
// row, confirmation pop-up, scope picker) so an ad-hoc menu is always
// recognizable at a glance instead of picking up a rotating group color.
export const ADHOC_MENU_COLOR = "#7a8a3a";

// Labeled by *what* the menu is for, not *who* it's for — the person is
// already identifiable via their avatar in the "Personas" row, so the scope
// picker/badge only need to say "Dieta blanda", not repeat their name.
const ADHOC_REASON_LABEL = { dieta_blanda: "Dieta blanda" };
export function adhocReasonLabel(reason) {
  return ADHOC_REASON_LABEL[reason] ?? "Menú individual";
}

/** Create the ad-hoc group for one member, remembering their home group. */
export function createIndividualMenuGroup(member, sourceGroupId, reason) {
  return {
    id: ids.grupo.nuevo(),
    label: adhocReasonLabel(reason),
    memberIds: [member.id],
    color: ADHOC_MENU_COLOR,
    adHoc: true,
    tipo: "adhoc",
    sourceMemberId: member.id,
    sourceGroupId: sourceGroupId ?? null,
    reason,
    createdAt: Date.now(),
    days: ADHOC_MENU_DAYS,
  };
}

/**
 * Drop ad-hoc menus older than ADHOC_MENU_DAYS and put their member back into
 * the home group they came from (if it still exists).
 * @returns {{ groups: Array, expired: Array }}
 */
export function pruneExpiredIndividualMenus(groups, nowMs = Date.now()) {
  const all = groups ?? [];
  const expired = all.filter(
    (g) => g.adHoc && g.createdAt && nowMs - g.createdAt >= ADHOC_MENU_MS,
  );
  if (expired.length === 0) return { groups: all, expired: [] };

  const kept = all.filter((g) => !expired.includes(g));
  const restored = kept.map((g) => {
    const back = expired
      .filter((e) => e.sourceGroupId === g.id)
      .map((e) => e.sourceMemberId);
    if (back.length === 0) return g;
    return { ...g, memberIds: Array.from(new Set([...g.memberIds, ...back])) };
  });
  return { groups: restored, expired };
}

export function membersOfGroup(group, members) {
  const set = new Set(group.memberIds);
  return members.filter((m) => set.has(m.id));
}

/**
 * Build groups based on the chosen menu model.
 * - "same": one group "Familia" with everyone.
 * - "separate": Adultos / Niños / Bebé when several profiles coexist.
 *
 * `viejos`: los grupos que había. Cada grupo nuevo hereda el id del viejo que
 * hace su papel (`conservarIds`), así que rehacerlos no deja huérfano el menú
 * en curso. Sin viejos, ids nuevos.
 */
export function groupsFromModel(members, model, viejos = []) {
  return conservarIds(viejos, gruposDelModelo(members, model), members);
}

function gruposDelModelo(members, model) {
  if (members.length === 0) return [];
  const familia = (memberIds) => ({
    id: ids.grupo.nuevo(),
    label: "Familia",
    tipo: "familia",
    memberIds,
    color: GROUP_COLORS[0],
  });

  if (model === "same") {
    const babies = members.filter((m) => memberIsBaby(m));
    const rest = members.filter((m) => !memberIsBaby(m));
    if (babies.length > 0 && rest.length > 0) {
      return [
        familia(rest.map((m) => m.id)),
        {
          id: ids.grupo.nuevo(),
          label: BABY_GROUP_LABEL,
          tipo: "bebe",
          memberIds: babies.map((m) => m.id),
          color: GROUP_COLORS[2],
        },
      ];
    }
    return [familia(members.map((m) => m.id))];
  }

  const split = splitMembersByStage(members);
  const groups = buildSplitGroups(split);
  if (groups.length <= 1) return [familia(members.map((m) => m.id))];
  return groups;
}

/**
 * Keep babies only in Bebé and everyone else out of it (any menu model).
 * Escribe el `tipo` a los grupos que no lo llevaban, y el del bebé, si hay que
 * crearlo, hereda el id de uno de `viejos` (por defecto, los mismos `groups`).
 */
export function migrateGroupsForBabies(members, groups, _menuModel, viejos = groups) {
  if (!Array.isArray(groups) || groups.length === 0) return groups;

  const babyIds = new Set(members.filter((m) => memberIsBaby(m)).map((m) => m.id));
  if (babyIds.size === 0) {
    return groups
      .filter((g) => !esDelBebe(g))
      .map((g) => conTipo({
        ...g,
        memberIds: g.memberIds.filter((id) => !babyIds.has(id)),
      }))
      .filter((g) => g.memberIds.length > 0);
  }

  let babyGroup = groups.find(esDelBebe);
  const updated = groups
    .filter((g) => !esDelBebe(g))
    .map((g) => conTipo({
      ...g,
      memberIds: g.memberIds.filter((id) => !babyIds.has(id)),
    }))
    .filter((g) => g.memberIds.length > 0);

  if (!babyGroup) {
    babyGroup = {
      id: ids.grupo.nuevo(),
      label: BABY_GROUP_LABEL,
      tipo: "bebe",
      memberIds: [],
      color: nextGroupColor(updated),
    };
  }

  updated.push(conTipo({
    ...babyGroup,
    memberIds: Array.from(babyIds),
  }));
  return conservarIds(viejos, updated, members);
}

/**
 * Los grupos de la casa, para leer: los guardados o, si aún no hay, los que
 * saldrían del modelo. Si los generados van a quedar en algo que se guarda (un
 * plan, una compra), quien llama tiene que guardarlos también: sus ids son
 * nuevos y no existen en ninguna otra parte.
 */
export function gruposVigentes(data) {
  const guardados = data?.groups ?? [];
  if (guardados.length > 0) return guardados;
  return groupsFromModel(data?.members ?? [], data?.menuModel ?? "same");
}
