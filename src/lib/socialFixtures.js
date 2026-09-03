/**
 * Datos de mentira para diseñar el Feed.
 *
 * Solo en `npm run dev` y solo cuando la consulta real no ha devuelto nada
 * (porque la migración 0027 aún no está aplicada, o porque todavía no sigues a
 * nadie). En producción no se cargan nunca: el guard es `import.meta.env.DEV`,
 * que Vite reemplaza por `false` al compilar y el minificador elimina el
 * módulo entero del bundle.
 *
 * Las tarjetas que salen de aquí se pintan con el aviso "datos de prueba" para
 * que nadie los confunda con gente real.
 *
 * Los menús siguen el contrato v1 del payload (ver 0027_social_feed.sql):
 * platos por día y avatares anónimos. Ni compra, ni presupuesto, ni horarios,
 * ni nombres — si un fixture llevara eso, estaría enseñando en pantalla un
 * dato que la app promete no compartir.
 */

export const FIXTURES_ENABLED = import.meta.env.DEV;

const day = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

// Lunes de esta semana, para que el menú caiga dentro del rango "vigente".
function weekBounds() {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // 0 = lunes
  const start = new Date(now);
  start.setDate(now.getDate() - dow);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

export const FIXTURE_PROFILES = {
  fx_marta: { user_id: "fx_marta", username: "marta.cocina", display_name: "Marta", avatar_url: null, visibility: "public" },
  fx_javi: { user_id: "fx_javi", username: "javidcasa", display_name: "Javi", avatar_url: null, visibility: "public" },
  fx_ana: { user_id: "fx_ana", username: "ana_ru", display_name: "Ana y Rubén", avatar_url: null, visibility: "followers" },
  fx_pau: { user_id: "fx_pau", username: "paulita", display_name: "Paula", avatar_url: null, visibility: "public" },
};

function menu(id, ownerId, title, days, members) {
  const { start, end } = weekBounds();
  return {
    id,
    owner_id: ownerId,
    menu_id: `m_${id}`,
    title,
    week_start: start,
    week_end: end,
    visibility: "public",
    copy_count: 0,
    created_at: day(id === "fx_menu_1" ? 0 : 2),
    payload: { v: 1, weeks: [{ weekStart: start, days }], members },
    __fixture: true,
  };
}

const D = (name, meals) => ({ day: name, meals });
const M = (slot, dishes, eaters) => ({ slot, dishes, eaters });

// Los platos llevan `recipeId` de catalogo REAL: asi la vista del menu resuelve
// la foto igual que en tu propia semana, en vez de ensenar huecos grises. Un
// plato con readable:false simula la receta propia que su dueno tiene en
// privado — se ve el nombre y no se abre.
const dish = (recipeId, name, readable = true) => ({ recipeId, name, source: "catalog", readable });

const ADULTOS = ["a1", "a2"];
const FAMILIA = ["a1", "a2", "n1"];

export const FIXTURE_MENUS = [
  menu("fx_menu_1", "fx_marta", null, [
    D("Lun", [
      M("Comida", [dish("legumbres_001", "Lentejas con verduras")], FAMILIA),
      M("Cena", [dish("sopas_cremas_001", "Crema de calabacin"), dish("huevos_002", "Tortilla francesa")], ADULTOS),
    ]),
    D("Mar", [
      M("Comida", [dish("pescados_002", "Salmon al horno con patatas")], ADULTOS),
      M("Cena", [dish("ensaladas_verduras_001", "Ensalada mixta")], FAMILIA),
    ]),
    D("Mié", [
      M("Comida", [dish("carnes_001", "Pollo al horno con patatas")], FAMILIA),
      M("Cena", [dish("sopas_cremas_003", "Crema de calabaza")], ADULTOS),
    ]),
    D("Jue", [
      M("Comida", [dish(null, "Guiso de ternera de la abuela", false)], ADULTOS),
      M("Cena", [dish("sopas_cremas_002", "Sopa de fideos")], FAMILIA),
    ]),
    D("Vie", [
      M("Comida", [dish("pasta_arroces_002", "Espaguetis a la bolonesa")], FAMILIA),
      M("Cena", [dish("cenas_rapidas_001", "Sandwich mixto")], FAMILIA),
    ]),
    D("Sáb", [
      M("Comida", [dish("pasta_arroces_004", "Arroz al horno")], FAMILIA),
      M("Cena", [dish("cenas_rapidas_002", "Tosta de tomate con jamon")], ADULTOS),
    ]),
    D("Dom", [
      M("Comida", [dish("carnes_003", "Albondigas en salsa de tomate")], FAMILIA),
      M("Cena", [dish("huevos_001", "Tortilla de patatas")], FAMILIA),
    ]),
  ], [
    // Con `avatar: null` la fila de comensales eran tres circulos grises con
    // una letra: el demo no ensenaba el aspecto real de un menu compartido,
    // que lleva el avatar ILUSTRADO de cada uno (nunca su foto — ver
    // buildSharedMenuPayload). Rutas del dibujo a tamaño completo, igual que
    // las que publica la app; quien las pinta ya pide el recorte pequeño.
    { id: "a1", avatar: "/avatares/mama/mama_2.png", role: "adulto" },
    { id: "a2", avatar: "/avatares/papa/papa_2.png", role: "adulto" },
    { id: "n1", avatar: "/avatares/hijo/hijo_4.png", role: "nino" },
  ]),

  menu("fx_menu_2", "fx_ana", "Semana sin horno", [
    D("Lun", [
      M("Comida", [dish("cenas_rapidas_003", "Ensalada de quinoa, feta y granada")], ADULTOS),
      M("Cena", [dish("sopas_cremas_004", "Gazpacho andaluz"), dish("huevos_001", "Tortilla de patatas")], ADULTOS),
    ]),
    D("Mar", [
      M("Comida", [dish("legumbres_003", "Garbanzos con espinacas")], ADULTOS),
      M("Cena", [dish("cenas_rapidas_002", "Tosta de tomate con jamon")], ADULTOS),
    ]),
    D("Mié", [
      M("Comida", [dish("pasta_arroces_001", "Macarrones con tomate")], ADULTOS),
      M("Cena", [dish("sopas_cremas_001", "Crema de calabacin")], ADULTOS),
    ]),
    D("Jue", [
      M("Comida", [dish("pescados_004", "Sardinas a la plancha")], ADULTOS),
      M("Cena", [dish("ensaladas_verduras_001", "Ensalada mixta")], ADULTOS),
    ]),
    D("Vie", [
      M("Comida", [dish("ensaladas_verduras_002", "Pisto manchego")], ADULTOS),
      M("Cena", [dish("huevos_002", "Tortilla francesa")], ADULTOS),
    ]),
  ], [
    { id: "a1", avatar: "/avatares/mama/mama_5.png", role: "adulto" },
    { id: "a2", avatar: "/avatares/papa/papa_7.png", role: "adulto" },
  ]),
];

export const FIXTURE_RECIPES = [
  { id: "fx_r1", owner_id: "fx_javi", name: "Tacos de cochinita rápida", category: "carnes", type: "principal", time_minutes: 35, difficulty: "normal", photo: null, visibility: "public", created_at: day(0), __fixture: true },
  { id: "fx_r2", owner_id: "fx_marta", name: "Bizcocho de yogur de la abuela", category: "postres", type: "postre", time_minutes: 50, difficulty: "facil", photo: null, visibility: "public", created_at: day(1), __fixture: true },
  { id: "fx_r3", owner_id: "fx_pau", name: "Curry de garbanzos y espinacas", category: "legumbres", type: "principal", time_minutes: 25, difficulty: "facil", photo: null, visibility: "public", created_at: day(1), __fixture: true },
  { id: "fx_r4", owner_id: "fx_javi", name: "Salmón en papillote con puerro", category: "pescados", type: "principal", time_minutes: 20, difficulty: "facil", photo: null, visibility: "public", created_at: day(3), __fixture: true },
  { id: "fx_r5", owner_id: "fx_ana", name: "Berenjenas rellenas de carne", category: "verduras", type: "principal", time_minutes: 55, difficulty: "normal", photo: null, visibility: "public", created_at: day(4), __fixture: true },
];

/** Los items del feed, en la misma forma que devuelve loadFeed(). */
export function fixtureFeed() {
  return [
    ...FIXTURE_RECIPES.map((r) => ({ kind: "recipe", id: r.id, ownerId: r.owner_id, createdAt: r.created_at, recipe: r, fixture: true })),
    ...FIXTURE_MENUS.map((m) => ({ kind: "menu", id: m.id, ownerId: m.owner_id, createdAt: m.created_at, menu: m, fixture: true })),
  ].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/** Números de mentira para la franja de stats, estables por receta. */
export const FIXTURE_STATS = {
  fx_r1: { likes: 24, dislikes: 1, used: 11 },
  fx_r2: { likes: 61, dislikes: 3, used: 38 },
  fx_r3: { likes: 12, dislikes: 0, used: 4 },
  fx_r4: { likes: 33, dislikes: 2, used: 19 },
  fx_r5: { likes: 8, dislikes: 5, used: 2 },
};

/** Solicitudes de seguimiento pendientes, para poder ver el cajon de perfil. */
export const FIXTURE_REQUESTS = [
  { follower_id: "fx_javi", created_at: day(0) },
  { follower_id: "fx_pau", created_at: day(2) },
];

/** Lo que "te han comentado". */
export const FIXTURE_COMMENTS = [
  { id: "fx_c1", target_type: "recipe", target_id: "fx_r2", author_id: "fx_marta", body: "La hice el domingo y volo. Le puse la mitad de azucar y perfecta.", created_at: day(0) },
  { id: "fx_c2", target_type: "menu", target_id: "fx_menu_1", author_id: "fx_pau", body: "Te copio la semana entera, que llevo dos dias sin saber que hacer de cena.", created_at: day(1) },
  { id: "fx_c3", target_type: "recipe", target_id: "fx_r4", author_id: "fx_ana", body: "Con puerro no lo habia probado nunca. Muy bueno.", created_at: day(3) },
];

/** Solicitudes que has enviado tu y siguen pendientes. */
export const FIXTURE_SENT = [
  { followee_id: "fx_ana", created_at: day(1), status: "pending" },
];

/** Tus recetas publicadas, con sus numeros. */
export const FIXTURE_MY_RECIPES = [
  { id: "fx_my1", name: "Lasana de calabacin", photo: null, visibility: "public", created_at: day(6), likes: 41, dislikes: 2, used: 27, comments: 5 },
  { id: "fx_my2", name: "Crema de puerros de mi madre", photo: null, visibility: "friends", created_at: day(12), likes: 18, dislikes: 0, used: 9, comments: 2 },
  { id: "fx_my3", name: "Pollo al limon con arroz", photo: null, visibility: "public", created_at: day(20), likes: 7, dislikes: 4, used: 3, comments: 0 },
];

/** Hilos de comentarios por id de destino, para poder ver la UI. */
export const FIXTURE_THREADS = {
  fx_r1: [
    { id: "fx_t1", author_id: "fx_marta", body: "Que buena pinta. La cochinita en olla rapida sale igual?", created_at: day(0) },
    { id: "fx_t2", author_id: "fx_pau", body: "Hecha ayer. Un pelin picante para los ninos, pero nos encanto.", created_at: day(0) },
  ],
  fx_r3: [
    { id: "fx_t3", author_id: "fx_javi", body: "Le puse leche de coco en vez de nata y quedo brutal.", created_at: day(1) },
  ],
  fx_menu_1: [
    { id: "fx_t4", author_id: "fx_ana", body: "Me llevo el jueves y el viernes enteros, gracias!", created_at: day(0) },
  ],
};

/**
 * Bandeja de notificaciones de mentira, ya en la forma normalizada que
 * produce buildNotifications (socialNotifications.js). Cubre los cinco tipos
 * para que el panel se pueda diseñar entero sin datos reales.
 */
export const FIXTURE_NOTIFICATIONS = [
  { key: "fx_n1", kind: "request", actorId: "fx_javi", at: day(0) },
  { key: "fx_n2", kind: "comment", actorId: "fx_marta", at: day(0), targetType: "recipe", targetId: "fx_r2", body: "La hice el domingo y volo. Le puse la mitad de azucar y perfecta." },
  { key: "fx_n3", kind: "reply", actorId: "fx_pau", at: day(1), targetType: "recipe", targetId: "fx_r2", body: "A mi tambien me paso, con menos azucar gana." },
  { key: "fx_n4", kind: "accepted", actorId: "fx_ana", at: day(2) },
  { key: "fx_n5", kind: "follower", actorId: "fx_pau", at: day(3) },
];

/**
 * Sugerencias de mentira, ya con la forma que devuelve suggested_profiles:
 * perfil + por que se sugiere (cuantos conocidos en comun y el nombre de uno).
 */
export const FIXTURE_SUGGESTED = [
  { ...FIXTURE_PROFILES.fx_pau, mutuals: 3, via_ids: ["fx_marta", "fx_ana", "fx_javi"] },
  { ...FIXTURE_PROFILES.fx_javi, mutuals: 1, via_ids: ["fx_ana"] },
];

