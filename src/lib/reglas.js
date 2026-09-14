/**
 * La zona de REGLAS.
 *
 * Es el hueco que `notepadFields.js` se nombra a sí mismo en su cabecera: la
 * libreta sabe decir "menos pescado" y "más horno", pero no sabe decir "mi
 * hija no come pescado", "los miércoles come mi tío" ni "hasta que acabe el
 * tratamiento, sin picante". Todo eso necesita cuatro cosas que un eje de la
 * libreta no tiene: SUJETO (de quién hablamos), ÁMBITO (dónde aplica),
 * VIGENCIA (hasta cuándo) y SALVEDAD (la excepción).
 *
 * ── Lo que NO es ──────────────────────────────────────────────────────────
 * No es un segundo motor. Una regla no elige platos ni habla con el planner:
 * se PROYECTA sobre `data.*` —el mismo truco que ya usa la libreta— y lo que
 * el motor lee sigue siendo `data.schedule`, `data.members`, `data.excluidos`
 * y `data.sesgos`, exactamente como antes. `aiPlanner` sigue sin saber que
 * esto existe, y esa es la propiedad que hace que se pueda apagar entero
 * borrando una línea en la generación.
 *
 * ── Las cuatro decisiones ─────────────────────────────────────────────────
 *
 * 1. UN INVITADO ES UN MIEMBRO, no un sujeto aparte.
 *    "Los miércoles come mi tío" y "esta semana somos dos más el sábado" se
 *    materializan como personas en `data.members` con `invitado: true`, un
 *    horario que las pone `fuera` en todos los huecos menos los suyos, y un
 *    sitio en un menú. A partir de ahí TODO funciona solo: `eatersForSlot`
 *    los cuenta, `modeForGroupSlot` decide si se cocina, el `slot.eaters` del
 *    plan sale con ellos dentro y `buildShoppingList` escala la compra.
 *    Un "sujeto invitado" propio habría obligado a duplicar esos cuatro sitios
 *    y, sobre todo, a inventar un segundo camino para el número de comensales
 *    — que es justo donde ya hay un bug conocido (rehidratar por
 *    `RECIPES_BY_ID` pisa las cantidades de otros huecos con el mismo plato).
 *    Al salir de `schedule`, el escalado se calcula por hueco al generar y ese
 *    camino no se toca.
 *
 * 2. NO HAY EFECTO "comensales". "Somos dos más el sábado" NO es un número
 *    suelto: son dos personas en un hueco. Un efecto `comensales: +2` habría
 *    necesitado un campo nuevo que el motor no lee, y habría dejado la casa
 *    con dos comensales fantasma que no aparecen en ningún menú ni en ningún
 *    avatar. Con `presente` sobre un invitado anónimo sale gratis y se ve.
 *
 * 3. LA RECURRENCIA NO ES UNA VIGENCIA, ES UN ÁMBITO.
 *    El punto de partida traía `vigencia.recurrente`. Sobra: "los miércoles"
 *    ya se dice con `ambito.dias = ["Mié"]`, y un menú se planifica por
 *    semanas, así que una regla sin `hasta` SE REPITE por construcción. Con
 *    las dos formas convivirían "miércoles recurrente" y "miércoles a secas"
 *    significando lo mismo, y alguien tendría que decidir cuál gana.
 *    `vigencia` queda como lo que de verdad es: una ventana `[desde, hasta]`.
 *
 *    Sobre fechas: este módulo SÍ hace aritmética de fechas, pero no las
 *    DERIVA. Las de la semana que se está generando llegan resueltas de fuera
 *    —`computeWeekRange` / `weekMeta[w]`, que es quien sabe de offsets,
 *    `startDayIdx` y días sueltos marcados a mano— y aquí solo se reparten
 *    entre los siete días para poder recortar un `presente` por su vigencia.
 *    Los días se nombran con las etiquetas de `DAYS` y las semanas por su
 *    lunes en ISO, así que comparar semanas sigue siendo comparar cadenas.
 *
 * 4. LAS SEMANAS SE NOMBRAN POR SU LUNES, NUNCA POR OFFSET.
 *    `ambito.semanas: [0]` ("esta semana") es una bomba de relojería: dentro
 *    de siete días el 0 apunta a otra semana y la regla reaparece sola. Se
 *    guarda el lunes en ISO ("2026-09-07"), que no se mueve.
 *    OJO: el `startISO` que trae la generación NO es el lunes — es el primer
 *    día ACTIVO de la semana, que con `startDayIdx > 0` o con días sueltos
 *    marcados a mano cae en martes, jueves o donde sea. Por eso `tocaLaSemana`
 *    normaliza con `lunesDe()` antes de comparar, y por eso lo que se GUARDA
 *    sigue siendo el lunes: `startISO` depende de cuándo se generó, el lunes no.
 *
 * ── La promesa de la cabecera de la libreta ───────────────────────────────
 * «El usuario diría "para mi hija" y el sistema lo aplicaría a toda la casa
 * sin avisar.» Aquí eso no puede pasar, por tres barreras:
 *   a) `sujeto` es OBLIGATORIO y no tiene default. Una regla sin sujeto no
 *      es una regla: `normalizarRegla` la tira.
 *   b) Un sujeto `miembro` cuyo `ref` no resuelve NO se aplica y sale en
 *      `avisos` como `sujeto_desconocido`. Nunca cae a `casa`.
 *   c) Lo que no se sabe hacer se DICE. `proyectarReglas` devuelve `avisos`
 *      —`ambito_ignorado`, `salvedad_ignorada`, `no_soportado`,
 *      `sujeto_desconocido`— cada uno con su `clase`: `de_mas` (se aplicó más
 *      ancho de lo pedido) o `no_hecho` (no se aplicó). Es el mismo cubo del
 *      medio que el panel ya enseña en `pendiente`. Cumplir de más en silencio
 *      cuenta como incumplir.
 *
 * ── Ámbito vacío significa TODO, en los tres ejes ─────────────────────────
 * `{dias: ["Sáb"]}` sin `comidas` escribe el sábado ENTERO (comida y cena, y
 * lo que haya activo). No es un descuido: la regla la escribe quien dice "el
 * sábado viene mi hermano", y suponer "solo a comer" sería inventarse la
 * mitad de la frase. Lo mismo con `semanas` vacío (todas) y `dias` vacío
 * (los siete). Quien quiera acotar, acota.
 *
 * ── Lo que esta v1 deliberadamente no puede ───────────────────────────────
 * Una exclusión por MIEMBRO se proyecta a `member.dislikes`, y `aiPlanner`
 * los agrega POR GRUPO (`groupMembers.flatMap(m => m.dislikes)`). O sea: "mi
 * hija no come pescado" llega, pero alcanza también a sus hermanos si comparten
 * menú. No se puede arreglar sin tocar el motor, así que no se finge:
 * `necesitaMenuPropio()` detecta exactamente ese caso, la proyección emite un
 * `ambito_ignorado` NOMBRANDO a quién arrastra, y la UI puede ofrecer lo único
 * que hoy lo resuelve de verdad — un menú individual
 * (`createIndividualMenuGroup`, lib/groups.js), que ya existe y ya caduca solo.
 *
 * Un sesgo por día ("nada de fritos, salvo los viernes") tampoco cabe:
 * `data.sesgos` no tiene dimensión de día. Se aplica a toda la semana —más
 * estricto que lo pedido, nunca menos— y se avisa con `ambito_ignorado`.
 *
 * Y un invitado INFLA las raciones de desayuno, merienda y postre aunque su
 * horario diga que no está: `planExtraMealsForGroup` cuenta `members.length`
 * sin mirar el `schedule` (aiPlanner.js:1460). Es un bug PREVIO del motor —le
 * pasa igual a cualquier miembro que coma fuera— y no se arregla desde aquí;
 * queda escrito para que no se lea como un fallo de las reglas.
 *
 * ── Las alergias no pasan por aquí ────────────────────────────────────────
 * Ni de lejos. `efecto.excluir` proyecta a `dislikes`, que es SOFT y tiene
 * fallback para no vaciar el pool (filterRecipes.js). Una alergia es una
 * invariante dura y vive en `member.allergies`. Una regla no puede crear,
 * aflojar ni sustituir una alergia, y por eso "alergia" no es un tipo de
 * efecto: si lo fuera, alguien acabaría escribiendo una desde una frase.
 *
 * ── Dónde se guardan, y por qué no hay tabla ──────────────────────────────
 * En `data.reglas`, dentro del blob de `user_state`, como todo lo demás: así
 * funcionan en modo invitado (sin cuenta) desde el primer día y las persiste
 * el mismo `saveState` con debounce que ya existe, sin código nuevo.
 *
 * Hubo una migración escrita (`0051_user_rules.sql`) y se retiró antes de
 * ejecutarla. Dos motivos. El primero es que no tenía consumidor: el camino
 * primario es el blob, y una tabla sin quien la lea es una tabla que se queda
 * vieja. El segundo, más serio: su política de escritura solo validaba
 * `user_id`, así que cualquiera podía insertar una regla SUYA con el
 * `household_id` de OTRA familia y la política de lectura de hogar se la
 * servía a esa familia — una inyección (no una fuga), que además funcionaba
 * sin ser miembro de nada. Y escribir políticas contra el modelo de hogares
 * mientras tiene una brecha crítica abierta es construir encima de ella.
 *
 * Si algún día se escribe, lo que había que arreglar está cerrado: `with
 * check` con `and (household_id is null or public.is_household_owner(
 * household_id))`; `subject_kind`/`subject_ref` como columnas `generated
 * always as (sujeto->>'tipo' / sujeto->>'ref') stored` en vez de copias a
 * mano; una columna `version int default 1` espejo de `REGLAS_VERSION`; un
 * mapeador `aFila`/`deFila` con test de ida y vuelta (`vigencia.desde` ↔
 * `valid_from`, `hasta` ↔ `valid_to`); y decidir qué pasa con `creadaEn` —
 * que es un DÍA local y no el mismo concepto que un `created_at` del
 * servidor, así que o se documenta la diferencia o se tira uno de los dos.
 *
 * Y lo que sí valía la pena de aquella cabecera: el modelo se guarda como
 * jsonb y no normalizado en cinco tablas porque el consumidor no es Postgres,
 * es `proyectarReglas()` — que corre en el cliente, valida con zod y produce
 * un delta. No hay ni una consulta que necesite filtrar por "las reglas cuyo
 * ámbito incluye el miércoles", así que normalizar costaría joins y una
 * migración por cada clave nueva a cambio de cero consultas. El esquema de
 * verdad está en zod, versionado con el código que lo lee.
 */

import { z } from "zod";
import { DAYS, SLOT_VALUES, slotKey, getMeals, getDayMeals } from "./planner.js";
import { uid, membersOfGroup } from "./groups.js";
import { CAMPOS_POR_ID } from "./notepadFields.js";

export const REGLAS_VERSION = 1;

/** De quién habla la regla. Sin default: ver barrera (a) de la cabecera. */
export const SUJETOS = ["casa", "grupo", "miembro", "invitado"];

/** Qué hace la regla. Tres, y cada uno tiene ya un consumidor en el motor. */
export const EFECTOS = ["excluir", "presente", "sesgo"];

/** De dónde salió. Mismo vocabulario que la procedencia de la libreta. */
export const ORIGENES_REGLA = ["wizard", "panel", "texto", "manual"];

/** Los avisos: lo que se entendió y no se pudo hacer (o se hizo de más). */
export const MOTIVOS_AVISO = [
  // El sujeto no resuelve contra `data.members` / `data.groups`, o resuelve a
  // nadie (un menú vacío).
  "sujeto_desconocido",
  // Se aplicó, pero MÁS ancho de lo que pedía la regla: toda la semana en vez
  // de unos días, o a todo el menú de alguien en vez de solo a esa persona.
  // Nunca al revés: ensanchar una preferencia blanda no hace daño; estrecharla
  // en silencio sí.
  "ambito_ignorado",
  // La excepción ("salvo los viernes") no cabía en el eje del motor.
  "salvedad_ignorada",
  // No se aplicó nada.
  "no_soportado",
];

/**
 * Los avisos se leen distinto según si algo se hizo DE MÁS o NO SE HIZO, y la
 * UI los pinta en sitios distintos ("también le toca a Mateo" no es lo mismo
 * que "esto no sé hacerlo"). La tabla se exporta para que ese reparto no se
 * vuelva a escribir a mano en cada pantalla.
 */
export const CLASE_DE_AVISO = {
  sujeto_desconocido: "no_hecho",
  ambito_ignorado: "de_mas",
  salvedad_ignorada: "de_mas",
  no_soportado: "no_hecho",
};

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const iso = z.string().regex(ISO_RE);

const SujetoSchema = z.object({
  tipo: z.enum(["casa", "grupo", "miembro", "invitado"]),
  // `member.id` o `group.id`. Para un invitado lo genera la propia regla, así
  // que proyectar dos veces produce la MISMA persona y no dos.
  ref: z.string().min(1).optional(),
  // Solo para invitados: su nombre visible ("mi tío"). Para un miembro NO se
  // guarda el nombre — se resuelve por `ref`, que es lo que sobrevive a que
  // el usuario le cambie el nombre en su ficha.
  nombre: z.string().min(1).max(60).optional(),
  // Cuántos son. Solo invitados: "somos dos más el sábado" son dos personas.
  n: z.number().int().min(1).max(20).optional(),
  // En qué menú se sienta el invitado. Vacío = el primer menú que no sea de
  // bebés ni ad-hoc, que es donde se sienta una visita en una casa normal.
  grupoRef: z.string().min(1).optional(),
});

/** Dónde aplica. Todo opcional; lo que falta significa "siempre". */
const AmbitoSchema = z.object({
  dias: z.array(z.enum(["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"])).min(1).optional(),
  comidas: z.array(z.string().min(1)).min(1).optional(),
  // El LUNES de cada semana, en ISO. Ver decisión 4 de la cabecera.
  semanas: z.array(iso).min(1).optional(),
});

/**
 * Cuándo vale. `desde`/`hasta` en ISO, ambos inclusive. Se comparan como
 * cadenas: "YYYY-MM-DD" ordena igual alfabéticamente que cronológicamente.
 *
 * Una ventana al revés ("del 30 al 3") NO se acepta. Zod la dejaba pasar y
 * `reglaVigente` devolvía false para siempre: una regla que el usuario ve en
 * su lista, cree puesta, y no se aplica nunca sin que nadie se lo diga. Es
 * mejor que no llegue a existir.
 */
const VigenciaSchema = z
  .object({ desde: iso.optional(), hasta: iso.optional() })
  .superRefine((v, ctx) => {
    if (v.desde && v.hasta && v.desde > v.hasta) {
      ctx.addIssue({
        code: "custom",
        message: "la vigencia empieza después de acabar",
        path: ["hasta"],
      });
    }
  });

const EfectoSchema = z.object({
  tipo: z.enum(["excluir", "presente", "sesgo"]),
  valor: z.unknown(),
});

export const ReglaSchema = z.object({
  id: z.string().min(1),
  sujeto: SujetoSchema,
  ambito: AmbitoSchema.default({}),
  vigencia: VigenciaSchema.default({}),
  efecto: EfectoSchema,
  salvedad: AmbitoSchema.optional(),
  origen: z.enum(["wizard", "panel", "texto", "manual"]).default("manual"),
  // La frase literal que la causó, igual que la procedencia de la libreta: es
  // lo que se le enseña de vuelta al usuario para que pueda desmentirla.
  frase: z.string().max(500).optional(),
  // El DÍA local en que se creó. No es un `created_at` de servidor y no
  // pretende serlo: sirve para ordenar la lista y para "lo dijiste el 11 de
  // septiembre", no para resolver conflictos de sincronización.
  creadaEn: z.string().optional(),
});

// ── Construir y normalizar ─────────────────────────────────────────────────

/**
 * ¿Es coherente el efecto con su valor? Zod no lo puede saber solo: `valor`
 * es un `unknown` cuyo significado depende de `tipo`.
 */
function efectoValido(efecto) {
  if (efecto.tipo === "excluir") {
    return typeof efecto.valor === "string" && efecto.valor.trim().length > 0;
  }
  if (efecto.tipo === "presente") {
    return SLOT_VALUES.includes(efecto.valor);
  }
  if (efecto.tipo === "sesgo") {
    const v = efecto.valor;
    if (!v || typeof v !== "object") return false;
    const campo = CAMPOS_POR_ID[v.campo];
    // Solo ejes de sesgo: `freqs` es un máximo semanal y `excluidos` ya tiene
    // su propio tipo de efecto. Emitirlos por aquí serían dos caminos para lo
    // mismo, y el segundo siempre se queda viejo.
    if (!campo || campo.proyecta !== "sesgos") return false;
    if (!Array.isArray(campo.dominio) || !campo.dominio.includes(v.valor)) return false;
    return typeof v.peso === "number" && Number.isFinite(v.peso);
  }
  return false;
}

/**
 * Un sujeto sin lo que su tipo necesita no es un sujeto. Es la barrera (a):
 * aquí es donde "para mi hija" deja de poder degradarse a "para toda la casa".
 */
function sujetoValido(sujeto) {
  if (sujeto.tipo === "casa") return true;
  if (sujeto.tipo === "miembro" || sujeto.tipo === "grupo") return Boolean(sujeto.ref);
  // Un invitado sin nombre SÍ vale: "esta semana somos dos más" no trae uno, y
  // exigirlo obligaría a inventárselo o a perder la petición. El `ref` se
  // deriva del id de la regla justo debajo, así que identidad siempre tiene.
  if (sujeto.tipo === "invitado") return true;
  return false;
}

/** Valida una regla suelta. Devuelve la regla saneada, o null. */
export function normalizarRegla(raw) {
  const parsed = ReglaSchema.safeParse(raw);
  if (!parsed.success) return null;
  const regla = parsed.data;
  if (!sujetoValido(regla.sujeto)) return null;
  if (!efectoValido(regla.efecto)) return null;
  // Un invitado necesita un id estable para que proyectar dos veces no cree
  // dos personas. Se deriva del id de la regla, así que es determinista.
  if (regla.sujeto.tipo === "invitado" && !regla.sujeto.ref) {
    regla.sujeto = { ...regla.sujeto, ref: `inv_${regla.id}` };
  }
  return regla;
}

/**
 * Una lista de reglas saneada. Lo que no valida se TIRA, no se arregla: una
 * regla a medias es peor que ninguna, porque el usuario cree que está puesta.
 */
export function normalizarReglas(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizarRegla).filter(Boolean);
}

/** Una regla nueva, con su id y su fecha. */
export function nuevaRegla({ sujeto, efecto, ambito = {}, vigencia = {}, salvedad, origen = "manual", frase, hoy }) {
  const regla = {
    id: uid(),
    sujeto,
    ambito,
    vigencia,
    efecto,
    ...(salvedad ? { salvedad } : {}),
    origen,
    ...(frase ? { frase } : {}),
    creadaEn: hoy ?? isoLocal(new Date()),
  };
  return normalizarRegla(regla);
}

/**
 * La regla de "esta noche somos uno más", escrita desde un hueco concreto del
 * menú. Es el atajo que necesita el "+" de la tarjeta de un plato: la UI sabe
 * qué día y qué comida está tocando y poco más, y esto la libra de tener que
 * conocer la forma de una regla.
 *
 * ── Por qué esto NO es un campo "comensales: +1" ──────────────────────────
 * Porque un invitado es una PERSONA, no un número. En cuanto lo es, todo lo
 * demás funciona sin tocarlo: `eatersForSlot` lo cuenta, el plato escala sus
 * cantidades y `buildShoppingList` sube la compra. Un número suelto habría
 * necesitado un camino nuevo en los cuatro sitios — y habría dejado la casa
 * con comensales fantasma que no salen en ningún menú ni en ningún avatar.
 *
 * ── Lo que NO hace ────────────────────────────────────────────────────────
 * No persiste a nadie. Devuelve una REGLA; la persona solo existe dentro del
 * delta de una generación y se tira con ella (ver la invariante 1 de la
 * cabecera). Borrar el invitado es borrar su regla, y por eso la regla se
 * queda con un id que la UI puede guardar en la tarjeta.
 *
 * @param {{dia: string, comida: string, n?: number, nombre?: string,
 *          grupoRef?: string, semanaISO?: string, hoy?: string}} opts
 *   `dia` y `comida` en el vocabulario del menú ("Mié", "Cena"). `semanaISO`
 *   acota la regla a UNA semana — es el lunes de esa semana, y sin él la
 *   visita vendría todas las semanas, que casi nunca es lo que se quiere al
 *   pulsar un "+" en un hueco.
 * @returns {object} regla ya normalizada, lista para `data.reglas`.
 */
export function reglaDeInvitado({ dia, comida, n = 1, nombre, grupoRef, semanaISO, hoy }) {
  return nuevaRegla({
    sujeto: { tipo: "invitado", n, ...(nombre ? { nombre } : {}), ...(grupoRef ? { grupoRef } : {}) },
    ambito: {
      dias: [dia],
      comidas: [comida],
      ...(semanaISO ? { semanas: [lunesDe(semanaISO)] } : {}),
    },
    // `presente` lleva DÓNDE come, no un booleano: es el mismo vocabulario que
    // `schedule` (casa / tupper / fuera / cole). Un invitado come en casa — si
    // se lleva táper no es un invitado, es otra cosa.
    efecto: { tipo: "presente", valor: "casa" },
    origen: "manual",
    frase: nombre
      ? `${nombre} come en casa el ${dia} (${comida.toLowerCase()})`
      : n === 1
        ? `Un invitado más el ${dia} (${comida.toLowerCase()})`
        : `${n} invitados más el ${dia} (${comida.toLowerCase()})`,
    hoy,
  });
}

/**
 * Cuántos invitados tiene cada hueco, para pintarlo en la tarjeta del plato.
 *
 * Sale de las REGLAS, no de un campo en el hueco. Podría haberse guardado un
 * `slot.invitados` al añadirlos y habría sido más cómodo — y habría creado dos
 * verdades con vidas distintas: el menú se regenera y la regla no, así que a
 * la primera regeneración el número del hueco y el de la regla habrían dejado
 * de coincidir sin que nadie se enterara.
 *
 * Solo cuenta reglas de invitado con efecto `presente`: un `excluir` sobre un
 * invitado no añade a nadie a la mesa.
 *
 * @param {Array} reglas
 * @param {{semanaISO?: string, hoy?: string}} [opts]
 *   `semanaISO` es cualquier día de la semana que se está mirando; se normaliza
 *   a su lunes. Sin él no se filtra por semana.
 * @returns {Record<string, number>} clave `"<grupoRef|'*'>|<día>|<comida>"`
 */
export function invitadosPorHueco(reglas, { semanaISO, hoy } = {}) {
  const out = {};
  const lunes = semanaISO ? lunesDe(semanaISO) : null;
  for (const regla of normalizarReglas(reglas)) {
    if (regla.sujeto.tipo !== "invitado") continue;
    if (regla.efecto.tipo !== "presente") continue;
    if (hoy && !reglaVigente(regla, hoy)) continue;
    const semanas = regla.ambito?.semanas;
    if (lunes && semanas?.length && !semanas.some((w) => lunesDe(w) === lunes)) continue;
    const dias = regla.ambito?.dias ?? [];
    const comidas = regla.ambito?.comidas ?? [];
    // Sin día o sin comida la regla no apunta a un hueco concreto, y este mapa
    // es solo para pintar huecos: una visita "toda la semana" no lleva chapa.
    if (dias.length === 0 || comidas.length === 0) continue;
    const grupo = regla.sujeto.grupoRef ?? "*";
    for (const dia of dias) {
      for (const comida of comidas) {
        const clave = `${grupo}|${dia}|${comida}`;
        out[clave] = (out[clave] ?? 0) + (regla.sujeto.n ?? 1);
      }
    }
  }
  return out;
}

// ── Fechas ─────────────────────────────────────────────────────────────────

/**
 * La fecha de un `Date` LOCAL en ISO. No es `toISOString().slice(0,10)`: ese
 * pasa por UTC, y en España un 7 de septiembre a las 00:00 sale como el 6.
 * Un día de más o de menos en la caducidad de una regla es una regla que
 * desaparece la noche antes, así que aquí se formatea a mano.
 */
function isoLocal(d) {
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** El `hasta` de "durante N días desde hoy", sin librería de fechas. */
export function hastaEnDias(dias, hoyISO) {
  const base = hoyISO ? new Date(`${hoyISO}T00:00:00`) : new Date();
  base.setDate(base.getDate() + dias);
  return isoLocal(base);
}

/** El lunes de la semana de una fecha ISO, que es como se nombran las semanas. */
export function lunesDe(fechaISO) {
  const d = new Date(`${fechaISO}T00:00:00`);
  // getDay(): 0 domingo … 6 sábado. La semana empieza en lunes, como DAYS.
  const desplazamiento = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - desplazamiento);
  return isoLocal(d);
}

/**
 * La fecha de cada uno de los siete días de la semana que se está generando.
 *
 * `inicioISO` es el primer día ACTIVO, no el lunes, así que el ancla se saca
 * de la POSICIÓN de ese día en `DAYS` — no contando desde el principio de la
 * lista. Es la misma inversión que hace `getWeekDatesFromStartISO`, y es lo
 * que hace que funcione igual con una semana que empieza en jueves que con
 * una selección manual de días sueltos y no contiguos ("Mar" y "Jue").
 */
function fechasDeLaSemana(inicioISO, dias) {
  if (!inicioISO) return null;
  const lista = Array.isArray(dias) && dias.length > 0 ? dias : DAYS;
  const idx0 = Math.max(0, DAYS.indexOf(lista[0]));
  const [y, m, d] = inicioISO.split("-").map(Number);
  const lunes = new Date(y, m - 1, d);
  lunes.setDate(lunes.getDate() - idx0);
  const out = {};
  for (let i = 0; i < DAYS.length; i++) {
    const f = new Date(lunes);
    f.setDate(lunes.getDate() + i);
    out[DAYS[i]] = isoLocal(f);
  }
  return out;
}

// ── Vigencia y caducidad ───────────────────────────────────────────────────

/**
 * ¿Vale HOY esta regla? Es la pregunta de la lista de reglas y de la purga —
 * "¿esto sigue puesto?"—, no la de la generación. Para generar se usa
 * `reglaTocaLaVentana`, que pregunta por una semana entera.
 */
export function reglaVigente(regla, hoyISO) {
  const hoy = hoyISO ?? isoLocal(new Date());
  const { desde, hasta } = regla?.vigencia ?? {};
  if (desde && hoy < desde) return false;
  if (hasta && hoy > hasta) return false;
  return true;
}

/**
 * ¿Y vale para la SEMANA que se está generando?
 *
 * Es la pregunta correcta y `reglaVigente(regla, hoy)` era la equivocada: un
 * menú se genera para hasta cuatro semanas de golpe (`menuWeekOffsets`) y
 * todas se evaluaban contra el MISMO "hoy". Una regla "hasta el 12 de
 * septiembre" se aplicaba a las cuatro semanas, y una "desde el 24 de
 * diciembre" a ninguna — las dos en silencio.
 *
 * Devuelve "no" | "parcial" | "total":
 *   total    la ventana cubre la semana entera.
 *   parcial  la cubre a medias. Quien lo consuma decide: `presente` recorta
 *            por día (sabe de días); `excluir` y `sesgo` se aplican enteros
 *            y avisan, porque su eje de destino no tiene dimensión de día.
 *   no       no se solapan. Ni se aplica ni se avisa: no es un incumplimiento,
 *            es una regla de otro momento.
 *
 * Sin ventana cae a `reglaVigente(regla, hoy)`, para que llamar a esto sin
 * saber de qué semana hablamos siga siendo seguro.
 *
 * ── Con ventana NO se mira "hoy", y es deliberado ─────────────────────────
 * Una regla ya vencida puede seguir cubriendo los días YA PASADOS de la
 * semana que se está planificando, hasta que la poda se la lleve. Parece una
 * incoherencia con `podarReglasVencidas` y no lo es: son dos preguntas
 * distintas. La poda contesta "¿esto sigue puesto?" —y por eso mira hoy—;
 * esto contesta "¿cubre alguno de los días que estoy planificando?", que es
 * una propiedad del calendario, no del reloj.
 *
 * Cortar además por hoy tendría un precio peor que la rareza que evita: el
 * menú dependería del DÍA EN QUE SE PULSA EL BOTÓN. Regenerar el lunes y
 * regenerar el jueves la misma semana darían menús distintos sin que el
 * usuario hubiera cambiado nada, que es exactamente la clase de fallo que no
 * se puede explicar ni reproducir.
 *
 * Y en la práctica casi no aparece: la semana en curso se genera desde hoy
 * (`startDayIdx > 0`), así que su `inicioISO` ES hoy y un `hasta` de ayer da
 * "no" él solo. La discrepancia solo asoma regenerando la semana entera
 * desde el lunes — y ahí la respuesta correcta es justamente la de aquí.
 */
export function reglaTocaLaVentana(regla, ventana, hoyISO) {
  // Un solo nombre de contrato: `inicioISO` / `finISO`. Sin alias con `??`
  // para `startISO` / `endISO`: un alias es un contrato que se calla — quien
  // pasara `{startISO}` creyendo pasar otra cosa vería que "funciona" y nadie
  // se enteraría, que es la forma de fallo que este fichero existe para
  // prohibir. Quien venga de `weekMeta[w]` traduce en la llamada (ver el
  // JSDoc de `proyectarReglas`).
  const inicioISO = ventana?.inicioISO ?? null;
  const finISO = ventana?.finISO ?? null;
  if (!inicioISO || !finISO) return reglaVigente(regla, hoyISO) ? "total" : "no";

  const { desde, hasta } = regla?.vigencia ?? {};
  if (hasta && inicioISO > hasta) return "no";
  if (desde && finISO < desde) return "no";
  const recortaPorDelante = Boolean(desde && desde > inicioISO);
  const recortaPorDetrás = Boolean(hasta && hasta < finISO);
  return recortaPorDelante || recortaPorDetrás ? "parcial" : "total";
}

/**
 * Tira las reglas ya vencidas y dice cuáles eran.
 *
 * Misma forma que `pruneExpiredIndividualMenus` (lib/groups.js) a propósito:
 * es el patrón de "temporal que se limpia solo" que la app ya tiene escrito y
 * probado, y la UI que lo consume ya sabe leer un `{ lista, vencidas }`.
 *
 * Pregunta por HOY, no por una semana: purgar es una operación de la lista de
 * reglas, no de una generación. Solo se purga lo que YA PASÓ (`hasta` en el
 * pasado). Una regla que todavía no ha empezado (`desde` en el futuro) se
 * queda: no está vencida, está esperando, y borrarla sería tirar algo que el
 * usuario acaba de programar.
 *
 * @returns {{ reglas: Array, vencidas: Array }}
 */
export function podarReglasVencidas(reglas, hoyISO) {
  const hoy = hoyISO ?? isoLocal(new Date());
  const todas = reglas ?? [];
  const vencidas = todas.filter((r) => r?.vigencia?.hasta && hoy > r.vigencia.hasta);
  if (vencidas.length === 0) return { reglas: todas, vencidas: [] };
  return { reglas: todas.filter((r) => !vencidas.includes(r)), vencidas };
}

// ── Proyección ─────────────────────────────────────────────────────────────

/** Los huecos (día × comida) que toca un ámbito, ya restada la salvedad. */
function huecosDe(ambito, salvedad, comidasActivas, diasActivos) {
  const dias = (ambito?.dias ?? diasActivos).filter((d) => diasActivos.includes(d));
  const comidas = ambito?.comidas ?? comidasActivas;
  const fuera = new Set();
  if (salvedad) {
    for (const d of salvedad.dias ?? DAYS) {
      for (const c of salvedad.comidas ?? comidasActivas) fuera.add(`${d}|${c}`);
    }
  }
  const out = [];
  for (const d of dias) {
    for (const c of comidas) {
      if (!fuera.has(`${d}|${c}`)) out.push({ dia: d, comida: c });
    }
  }
  return out;
}

/**
 * ¿Aplica esta regla a la semana que se está generando?
 *
 * `ambito.semanas` guarda LUNES; `inicioISO` es el primer día activo, que no
 * tiene por qué serlo. Normalizar aquí es lo que hace que una semana que
 * empieza en jueves (`startDayIdx > 0`, o días sueltos marcados a mano) no
 * deje de reconocerse a sí misma.
 */
function tocaLaSemana(regla, inicioISO) {
  const semanas = regla?.ambito?.semanas;
  if (!semanas || semanas.length === 0) return true;
  if (!inicioISO) return null;   // null = "no se sabe", distinto de "no toca"
  return semanas.includes(lunesDe(inicioISO));
}

/** ¿El ámbito recorta algo que el eje de destino no sabe recortar? */
function ambitoRecorta(regla, comidasActivas) {
  const a = regla.ambito ?? {};
  const recortaDias = Array.isArray(a.dias) && a.dias.length < DAYS.length;
  const recortaComidas = Array.isArray(a.comidas) && a.comidas.length < comidasActivas.length;
  return recortaDias || recortaComidas;
}

/**
 * Los ids de las personas de un sujeto invitado. Uno solo se queda con el
 * `ref` tal cual; varios se numeran. Vive fuera de `crearInvitados` porque
 * quien los CREA y quien los BUSCA después tienen que calcularlos igual — y
 * cuando eran dos trozos de código separados no lo hacían: "somos dos más el
 * sábado" creaba `inv_x_1` e `inv_x_2` y luego buscaba `inv_x`, que no era
 * nadie, así que los invitados existían y no comían en ningún sitio.
 */
function idsDelInvitado(sujeto) {
  const cuantos = sujeto.n ?? 1;
  if (cuantos === 1) return [sujeto.ref];
  return Array.from({ length: cuantos }, (_, i) => `${sujeto.ref}_${i + 1}`);
}

/** El menú donde se sienta una visita: ni el de bebés ni uno ad-hoc. */
function grupoAnfitrion(groups, grupoRef) {
  const lista = groups ?? [];
  if (grupoRef) {
    const elegido = lista.find((g) => g.id === grupoRef);
    if (elegido) return elegido;
  }
  return lista.find((g) => !g.adHoc && g.label !== "Bebé") ?? lista[0] ?? null;
}

/**
 * Las reglas, convertidas en el delta sobre `data.*` que el motor ya entiende.
 *
 * @param {Array} reglas
 *   Reglas CRUDAS: se normalizan aquí dentro, así que da igual de dónde
 *   vengan. En producción, `weekData.reglas`.
 *
 * @param {object} data
 *   LA CASA YA RESUELTA PARA ESA SEMANA — es decir, el `weekData` de App.jsx,
 *   no el `data` global: `groups` ya reconstruidos, `schedule` = el
 *   `weekSchedule` de ESA semana (el override de `menuWeekOverrides[offset]`
 *   cuando lo hay, NUNCA `data.schedule` a secas), más `meals`, `extraMeals`,
 *   `members`, `excluidos`, `sesgos` y `cocinas`.
 *
 * @param {object} ctx
 *   `{ hoy: "YYYY-MM-DD", semana: { inicioISO, finISO, dias } }`. Esos tres
 *   nombres y no otros: `weekMeta[w]` los llama `startISO`, `endISO` y
 *   `activeDays`, y aceptar las dos formas con un `??` sería un contrato que
 *   se calla —quien pasara el objeto equivocado vería que "funciona"—, así
 *   que traduce el enganche, en una línea:
 *
 *     semana: { inicioISO: startISO, finISO: endISO, dias: activeDays }
 *
 *   (`weekMeta` no se toca: es de la generación, no de aquí.)
 *   OJO: `inicioISO` es el primer día ACTIVO, NO el lunes; quien compare
 *   semanas normaliza dentro (ver `tocaLaSemana`).
 *
 * @returns {{ delta: object, avisos: Array, aplicadas: string[] }}
 *   `delta` trae SOLO las claves que alguna regla ha tocado. Se consume UNA
 *   vez, al generar: `generateMenuWithAI({ ...weekData, ...delta }, …)`.
 *
 * ── El orden en App.jsx, y por qué las dos alternativas rompen ────────────
 * (Escrito aquí y no allí a propósito: App.jsx tiene trabajo sin commitear.)
 *
 *   1. weekData = { ...working, groups, schedule: weekSchedule, menuWeek,
 *                   schoolMenus }   ← SIN las banderas derivadas
 *   2. const { startISO, endISO, activeDays } = weekMeta[w];
 *      const { delta, avisos } = proyectarReglas(weekData.reglas, weekData,
 *        { hoy, semana: { inicioISO: startISO, finISO: endISO, dias: activeDays } })
 *   3. const conReglas = { ...weekData, ...delta }
 *   4. conReglas.kidDinnerMatchesAdultLunch =
 *        deriveKidDinnerMatchesAdultLunch(conReglas)
 *   5. generateMenuWithAI(conReglas, …)
 *
 * La derivación va DESPUÉS (paso 4) porque hoy se calcula sobre
 * `weekSchedule` (App.jsx:~1963) y un `presente` sobre un niño en Cena la
 * deja obsoleta: el flag diría "la cena del niño copia la comida del adulto"
 * para un niño que esa noche no está.
 *
 * Poner el delta ANTES de `groups`/`schedule` no vale: los literales del
 * objeto los pisan, y el invitado se queda sin grupo y sin horario — o sea,
 * un comensal fantasma que `eatersForSlot` no ve pero `members.length` sí.
 * Y aplicarlo DESPUÉS sobre `data.schedule` tampoco: pisa el override de
 * `menuWeekOverrides[offset]` y esa semana pierde su horario propio.
 *
 * ── Las siete invariantes ─────────────────────────────────────────────────
 *  1. PURA. No muta `data`, ni `reglas`, ni `ctx`. (Test con Object.freeze
 *     profundo.)
 *  2. IDEMPOTENTE. Proyectar sobre un `data` ya proyectado devuelve lo mismo:
 *     los ids de invitado son deterministas (`inv_<reglaId>`).
 *  3. EL DELTA NO SE PERSISTE JAMÁS. Ni `setData`, ni `saveUserState`, ni
 *     `menuWeekOverrides`, ni el archivo de menús. Vive una generación y
 *     muere. Si se persistiera, los invitados se volverían miembros de la
 *     casa y el `fuera` de la semana pasada congelaría el horario real.
 *  4. UNA SEMANA, UN DELTA. Solo se escribe sobre `ctx.semana.dias`.
 *  5. NADA MÁS ANCHO DE LO PEDIDO SIN AVISO, y nunca más estrecho.
 *  6. NINGUNA REGLA TOCA `member.allergies`.
 *  7. UN INVITADO SOLO EXISTE EN EL DELTA, con `invitado: true` y `reglaId`.
 */
export function proyectarReglas(reglas, data, ctx = {}) {
  const hoy = ctx.hoy ?? isoLocal(new Date());
  const semana = ctx.semana ?? null;
  // Un solo nombre por clave. Ver el @param ctx: quien venga de `weekMeta[w]`
  // traduce en la llamada, y así pasar el objeto equivocado falla en vez de
  // "funcionar" leyendo la semana entera por defecto.
  const inicioISO = semana?.inicioISO ?? null;
  const finISO = semana?.finISO ?? null;
  const diasActivos = semana?.dias ?? DAYS;
  const ventana = { inicioISO, finISO };
  const fechas = fechasDeLaSemana(inicioISO, diasActivos);

  // Las comidas que se PLANIFICAN (comida/cena) y las que se RENDERIZAN
  // (con desayuno, merienda y postre). El invitado se blanquea sobre las
  // segundas — si no, `modeForGroupSlot` lee `?? "casa"` en el desayuno y una
  // visita del miércoles a cenar acabaría haciendo que se cocine desayuno los
  // siete días. Sus huecos propios, en cambio, salen de las primeras: una
  // visita a cenar no se queda a desayunar.
  const comidasPlanificadas = getMeals(data);
  const todasLasComidas = getDayMeals(data);

  const lista = normalizarReglas(reglas);

  const avisos = [];
  const aplicadas = [];
  const aviso = (regla, motivo, detalle) =>
    avisos.push({ reglaId: regla.id, motivo, clase: CLASE_DE_AVISO[motivo], detalle });

  // Copias de trabajo. Solo se vuelcan al delta las que alguien haya tocado.
  const miembros = [...(data?.members ?? [])];
  const porId = new Map(miembros.map((m, i) => [m.id, i]));
  const grupos = (data?.groups ?? []).map((g) => ({ ...g, memberIds: [...(g.memberIds ?? [])] }));
  const schedule = { ...(data?.schedule ?? {}) };
  const excluidos = [...(data?.excluidos ?? [])];
  const sesgos = Object.fromEntries(
    Object.entries(data?.sesgos ?? {}).map(([k, v]) => [k, { ...v }]),
  );
  const cocinas = { ...(data?.cocinas ?? {}) };

  let tocaMiembros = false;
  let tocaGrupos = false;
  let tocaSchedule = false;
  let tocaExcluidos = false;
  let tocaSesgos = false;

  /** Añade un dislike a un miembro, sin duplicar y sin mutar el original. */
  const sumarDislike = (memberId, valor) => {
    const i = porId.get(memberId);
    if (i === undefined) return false;
    const m = miembros[i];
    const ya = m.dislikes ?? [];
    if (ya.includes(valor)) return true;
    miembros[i] = { ...m, dislikes: [...ya, valor] };
    tocaMiembros = true;
    return true;
  };

  /** Las personas a las que apunta un sujeto ya existente. */
  const personasDe = (sujeto) => {
    // Una regla sobre la casa habla de la CASA, no de quien viene de visita.
    // `miembros` ya trae dentro a los invitados que materializó la pasada 1,
    // así que devolverlo entero hacía que "el sábado comemos todos en casa"
    // sentara también al tío del miércoles — y lo contara en la compra.
    if (sujeto.tipo === "casa") return miembros.filter((m) => !m.invitado);
    if (sujeto.tipo === "invitado") {
      // Un invitado múltiple son N personas con ids derivados, así que el
      // `ref` del sujeto no es el id de nadie: hay que expandirlo. (La pasada
      // 1 las crea; aquí solo se resuelven.)
      const encontradas = idsDelInvitado(sujeto)
        .map((id) => porId.get(id))
        .filter((i) => i !== undefined)
        .map((i) => miembros[i]);
      return encontradas.length > 0 ? encontradas : null;
    }
    if (sujeto.tipo === "miembro") {
      const i = porId.get(sujeto.ref);
      return i === undefined ? null : [miembros[i]];
    }
    if (sujeto.tipo === "grupo") {
      const grupo = grupos.find((g) => g.id === sujeto.ref);
      return grupo ? membersOfGroup(grupo, miembros) : null;
    }
    return null;
  };

  /**
   * Materializa a los invitados de una regla. Ids deterministas derivados del
   * sujeto, así que proyectar la misma regla dos veces devuelve las MISMAS
   * personas y no las duplica.
   */
  const crearInvitados = (regla) => {
    const { sujeto } = regla;
    const cuantos = sujeto.n ?? 1;
    const ids = idsDelInvitado(sujeto);
    const anfitrion = grupoAnfitrion(grupos, sujeto.grupoRef);
    if (!anfitrion) return null;
    const creados = [];
    for (let i = 0; i < cuantos; i++) {
      const id = ids[i];
      if (porId.has(id)) {
        creados.push(miembros[porId.get(id)]);
        continue;
      }
      const nombre = sujeto.nombre
        ? cuantos === 1 ? sujeto.nombre : `${sujeto.nombre} ${i + 1}`
        : cuantos === 1 ? "Invitado" : `Invitado ${i + 1}`;
      const persona = {
        id,
        name: nombre,
        age: null,
        useBirthDate: false,
        birthDate: "",
        // Adulto por defecto: una visita sin edad no puede caer al menú de
        // bebés ni al de niños por accidente (ver tierForMember).
        homeRole: "Otro",
        stageDetail: "",
        allergies: [],
        dislikes: [],
        // La marca. Es lo que permite pintarlos distinto, no ofrecerles ficha
        // permanente y borrarlos con su regla.
        invitado: true,
        reglaId: regla.id,
      };
      miembros.push(persona);
      porId.set(id, miembros.length - 1);
      creados.push(persona);
      tocaMiembros = true;

      const g = grupos.find((x) => x.id === anfitrion.id);
      if (g && !g.memberIds.includes(id)) {
        g.memberIds.push(id);
        tocaGrupos = true;
      }

      // Fuera de casa en TODOS los huecos que se renderizan, no solo en los
      // que se planifican: una clave que falta la lee el motor como "casa".
      for (const dia of diasActivos) {
        for (const comida of todasLasComidas) {
          schedule[slotKey(id, dia, comida)] = "fuera";
          tocaSchedule = true;
        }
      }
    }
    return creados;
  };

  // ── Las reglas que entran, decididas una sola vez ────────────────────────
  const vivas = [];
  for (const regla of lista) {
    const cobertura = reglaTocaLaVentana(regla, ventana, hoy);
    if (cobertura === "no") continue;               // de otro momento: ni se avisa
    const semanaOk = tocaLaSemana(regla, inicioISO);
    if (semanaOk === false) continue;               // de otra semana: ni se avisa
    if (semanaOk === null) {
      // Acotada a semanas y no sabemos cuál es esta. NO se aplica —aplicar
      // "solo esta semana" a una semana desconocida es justo lo que esta capa
      // evita— pero sí se dice, porque aquí sí hay algo que el usuario pidió
      // y no ha ocurrido.
      aviso(regla, "no_soportado", "no se sabe a qué semana pertenece esta generación");
      continue;
    }
    vivas.push({ regla, cobertura });
  }

  // ── Pasada 1: materializar invitados ─────────────────────────────────────
  // Antes de aplicar ningún efecto, para que el orden del array de reglas deje
  // de importar: "el tío no come marisco" funcionaba solo si su `presente` iba
  // escrito antes en la lista, que es una dependencia que nadie puede ver.
  for (const { regla } of vivas) {
    if (regla.efecto.tipo !== "presente") continue;
    if (regla.sujeto.tipo !== "invitado") continue;
    if (!crearInvitados(regla)) {
      aviso(regla, "no_soportado", "no hay ningún menú donde sentar a la visita");
    }
  }

  // ── Pasada 2: aplicar efectos ────────────────────────────────────────────
  for (const { regla, cobertura } of vivas) {
    const { efecto, sujeto } = regla;

    // ── presente: quién está (o no) en qué huecos ─────────────────────────
    if (efecto.tipo === "presente") {
      const personas = personasDe(sujeto);
      if (!personas || personas.length === 0) {
        aviso(regla, "sujeto_desconocido");
        continue;
      }
      const huecosPedidos = huecosDe(regla.ambito, regla.salvedad, comidasPlanificadas, diasActivos);
      let huecos = huecosPedidos;
      // `presente` SÍ sabe de días, así que una vigencia que cubre media
      // semana se recorta de verdad en vez de ensancharse con un aviso.
      if (cobertura === "parcial" && fechas) {
        const { desde, hasta } = regla.vigencia ?? {};
        huecos = huecos.filter(({ dia }) => {
          const f = fechas[dia];
          if (!f) return true;
          if (desde && f < desde) return false;
          if (hasta && f > hasta) return false;
          return true;
        });
      }
      if (huecos.length === 0) {
        // Quedarse sin huecos significa dos cosas muy distintas, y callarse
        // las dos era tratar como iguales un no-evento y un incumplimiento.
        //
        //  · No había ninguno ya ANTES de filtrar por fechas: el ámbito pedía
        //    días que esta semana no se planifican ("los domingos" en una
        //    semana que acaba el viernes). Ahí callar es lo correcto — es el
        //    mismo silencio que el de una regla de otra semana.
        //  · Los había y se los comió la vigencia: el usuario pidió algo
        //    dentro de una ventana que SÍ toca esta semana, y no ha pasado
        //    nada. Eso se dice.
        if (huecosPedidos.length > 0) {
          aviso(regla, "no_soportado", "su vigencia no alcanza ningún día de los que se planifican");
        }
        continue;
      }
      for (const persona of personas) {
        for (const { dia, comida } of huecos) {
          schedule[slotKey(persona.id, dia, comida)] = efecto.valor;
          tocaSchedule = true;
        }
      }
      aplicadas.push(regla.id);
      continue;
    }

    // ── excluir: un ingrediente fuera, con el alcance del sujeto ──────────
    if (efecto.tipo === "excluir") {
      const valor = String(efecto.valor).trim().toLowerCase();
      // El eje de destino (`dislikes` / `data.excluidos`) es por semana, no por
      // día: si la regla pedía menos, se aplica de más y se dice.
      //
      // Y se mide contra TODAS las comidas, no solo contra las que planifica
      // el LLM. `planExtraMealsForGroup` construye sus dislikes con
      // `...(data.excluidos ?? [])` y `members.flatMap(m => m.dislikes)`
      // (aiPlanner.js:1472), así que una exclusión llega también al desayuno,
      // la merienda y el postre. En una casa con desayuno activo, una regla
      // que nombra "comida y cena" acaba aplicándose a cinco comidas: eso es
      // aplicar de más, y hay que decirlo. (El `sesgo` de abajo se mide
      // contra las planificadas porque a él le pasa lo contrario: esa misma
      // función llama a `filterOffMenuRecipes` SIN sesgos ni cocinas.)
      if (ambitoRecorta(regla, todasLasComidas)) {
        aviso(regla, "ambito_ignorado", "se aplica a toda la semana");
      }
      if (cobertura === "parcial") {
        aviso(regla, "ambito_ignorado", "la regla solo cubre parte de la semana; se aplica entera");
      }
      if (regla.salvedad) aviso(regla, "salvedad_ignorada", "se aplica también en la excepción");

      if (sujeto.tipo === "casa") {
        if (!excluidos.includes(valor)) {
          excluidos.push(valor);
          tocaExcluidos = true;
        }
        aplicadas.push(regla.id);
        continue;
      }
      const personas = personasDe(sujeto);
      if (!personas || personas.length === 0) {
        aviso(regla, "sujeto_desconocido");
        continue;
      }
      // El arrastre por grupo, dicho en voz alta. La regla SE APLICA —quitarle
      // el pescado a quien lo pidió es lo correcto—, pero deja de ser un
      // efecto secundario invisible.
      const arrastre = necesitaMenuPropio(regla, { members: miembros, groups: grupos });
      if (arrastre) {
        aviso(
          regla,
          "ambito_ignorado",
          `también le toca a ${arrastre.arrastra.map((m) => m.name).join(", ")}, que comparten menú`,
        );
      }
      for (const persona of personas) sumarDislike(persona.id, valor);
      aplicadas.push(regla.id);
      continue;
    }

    // ── sesgo: un eje de la libreta, pero con vigencia ───────────────────
    if (efecto.tipo === "sesgo") {
      // `data.sesgos` y `data.cocinas` son de la CASA entera: no tienen ni
      // dimensión de persona ni de día. Un sesgo por persona no se aplica —
      // aplicarlo a todos sería exactamente el fallo que esta capa evita.
      if (sujeto.tipo !== "casa") {
        aviso(regla, "no_soportado", "un sesgo solo se sabe aplicar a toda la casa");
        continue;
      }
      // Contra las comidas PLANIFICADAS, y aquí sí: un sesgo no sale de
      // comida y cena. `planExtraMealsForGroup` llama a
      // `filterOffMenuRecipes` sin sesgos ni cocinas, así que nombrar "comida
      // y cena" en una casa con desayuno no está pidiendo de menos — el
      // desayuno nunca iba a mirar el sesgo. Es la cara opuesta de la
      // asimetría que documenta la rama `excluir` de arriba.
      if (ambitoRecorta(regla, comidasPlanificadas)) {
        aviso(regla, "ambito_ignorado", "se aplica a toda la semana");
      }
      if (cobertura === "parcial") {
        aviso(regla, "ambito_ignorado", "la regla solo cubre parte de la semana; se aplica entera");
      }
      if (regla.salvedad) aviso(regla, "salvedad_ignorada", "se aplica también en la excepción");

      const { campo, valor, peso } = efecto.valor;
      (sesgos[campo] ??= {})[valor] = peso;
      tocaSesgos = true;
      // `cocina` tiene además su propia puerta en filterRecipes (`data.cocinas`),
      // igual que hace la proyección de la libreta en useWizardMenu#guardar.
      if (campo === "cocina") cocinas[valor] = peso;
      aplicadas.push(regla.id);
      continue;
    }
  }

  const delta = {};
  if (tocaMiembros) delta.members = miembros;
  if (tocaGrupos) delta.groups = grupos;
  if (tocaSchedule) delta.schedule = schedule;
  if (tocaExcluidos) delta.excluidos = excluidos;
  if (tocaSesgos) {
    delta.sesgos = sesgos;
    delta.cocinas = cocinas;
  }
  return { delta, avisos, aplicadas };
}

/**
 * Azúcar para tests y para llamadas sueltas: `data` con el delta ya encima.
 * En la generación de verdad NO se usa — ahí el orden importa (ver el bloque
 * "El orden en App.jsx" de arriba) y el delta se compone a mano.
 */
export function aplicarReglas(data, ctx = {}) {
  const { delta, avisos, aplicadas } = proyectarReglas(data?.reglas, data, ctx);
  return { data: { ...data, ...delta }, avisos, aplicadas };
}

// ── Lo que la UI necesita saber ────────────────────────────────────────────

/**
 * ¿Esta regla va a alcanzar a gente a la que no apuntaba?
 *
 * "Mi hija no come pescado" se proyecta a `member.dislikes`, y el motor los
 * agrega POR GRUPO: si su hermano come del mismo menú, se queda sin pescado
 * él también. Devolver esto es lo que permite que la proyección lo avise y
 * que la UI ofrezca la salida que ya existe (un menú individual), en vez de
 * cumplir de más callando.
 *
 * @returns {null | { miembro, grupo, arrastra: Array }}
 */
export function necesitaMenuPropio(regla, data) {
  if (regla?.efecto?.tipo !== "excluir") return null;
  if (regla?.sujeto?.tipo !== "miembro") return null;
  const miembro = (data?.members ?? []).find((m) => m.id === regla.sujeto.ref);
  if (!miembro) return null;
  const grupo = (data?.groups ?? []).find((g) => (g.memberIds ?? []).includes(miembro.id));
  if (!grupo) return null;
  const arrastra = membersOfGroup(grupo, data.members ?? []).filter((m) => m.id !== miembro.id);
  return arrastra.length === 0 ? null : { miembro, grupo, arrastra };
}

const ETIQUETA_EFECTO = {
  excluir: "sin",
  presente: "come",
  sesgo: "ajusta",
};

/**
 * La regla en cristiano, para el recibo de la UI. Se compone de los datos, no
 * de un texto guardado: así renombrar a alguien renombra su regla sola.
 */
export function describirRegla(regla, data) {
  if (!regla) return "";
  const quien = (() => {
    const s = regla.sujeto;
    if (s.tipo === "casa") return "En casa";
    if (s.tipo === "invitado") return s.n > 1 ? `${s.n} invitados` : (s.nombre ?? "Un invitado");
    if (s.tipo === "grupo") {
      return (data?.groups ?? []).find((g) => g.id === s.ref)?.label ?? "Un menú";
    }
    const m = (data?.members ?? []).find((x) => x.id === s.ref);
    return m?.name || "Alguien";
  })();

  const que = (() => {
    if (regla.efecto.tipo === "excluir") return `${ETIQUETA_EFECTO.excluir} ${regla.efecto.valor}`;
    if (regla.efecto.tipo === "presente") return `${ETIQUETA_EFECTO.presente} ${regla.efecto.valor === "casa" ? "en casa" : regla.efecto.valor}`;
    const { campo, valor, peso } = regla.efecto.valor;
    return `${peso >= 0 ? "más" : "menos"} ${valor} (${campo})`;
  })();

  const donde = (() => {
    const partes = [];
    if (regla.ambito?.dias) partes.push(`los ${regla.ambito.dias.join(", ")}`);
    if (regla.ambito?.comidas) partes.push(`en ${regla.ambito.comidas.join(" y ").toLowerCase()}`);
    if (regla.ambito?.semanas) partes.push(regla.ambito.semanas.length === 1 ? "solo esa semana" : "solo esas semanas");
    return partes.join(" ");
  })();

  const cuando = regla.vigencia?.hasta ? `hasta el ${regla.vigencia.hasta}` : "";
  const salvo = regla.salvedad?.dias ? `salvo los ${regla.salvedad.dias.join(", ")}` : "";

  return [quien, que, donde, salvo, cuando].filter(Boolean).join(" ");
}

// ── El contrato del panel, para cuando el dueño lo active ──────────────────

/**
 * La extensión MÍNIMA de `AjusteSchema` (lib/panelParser.js) que haría falta
 * para que el panel pudiera EMITIR reglas en vez de solo ajustes de libreta.
 *
 * Vive aquí y no allí a propósito: `panelParser.js` tiene trabajo sin
 * commitear, y sobre todo activar esto es una decisión de producto, no una
 * refactorización. Mientras `PANEL_EMITE_REGLAS` sea false el prompt del panel
 * sigue prometiendo que NO sabe hacer nada con nombres ni fechas, y el test de
 * `promptContract.test.js` ata las dos cosas en las dos direcciones: si alguien
 * activa la bandera sin tocar el prompt (o al revés), la suite rompe.
 *
 * Son tres claves nuevas, todas opcionales, y ninguna cambia el significado de
 * las que ya hay: un ajuste sin ellas se comporta exactamente igual que hoy.
 */
export const PANEL_EMITE_REGLAS = false;

export const ExtensionReglaSchema = z.object({
  sujeto: SujetoSchema.optional(),
  ambito_regla: AmbitoSchema.optional(),
  vigencia: VigenciaSchema.optional(),
});

/** Las claves que el prompt tendría que documentar si se activara. */
export const CLAVES_NUEVAS_DEL_PANEL = ["sujeto", "ambito_regla", "vigencia"];

/**
 * Las frases del prompt que prometen que el panel NO sabe hacer esto. Mientras
 * la bandera esté apagada tienen que seguir ahí, palabra por palabra.
 */
export const PROMESAS_DE_NO_SABER = [
  "Nada de una persona con nombre",
  "Nada con fechas ni días",
];
