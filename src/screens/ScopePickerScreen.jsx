import { useMemo, useState } from "react";
import { CalendarDays, ShoppingCart, MapPin, GraduationCap, Baby, Salad, UtensilsCrossed, Coffee, Package, ChefHat, CookingPot, Timer, Check, LayoutGrid, Rows3 } from "lucide-react";
import { OnboardingShell } from "./Onboarding.jsx";
import { hasChildMember } from "../lib/groups.js";
import { householdHasSchoolMenu } from "../lib/schoolMenu.js";

const GREEN = "#2d5a3d";
// Teal, no el verde de marca: mismo tono que ya usan las tarjetas de
// Onboarding (CARD_ACCENT_TEAL) para "esto lo has elegido tú" — distinguir
// "marcado para ajustar" del verde que ya es el color base de toda la app.
const SELECTED = "#0f766e";


/**
 * Los temas del asistente, con el valor que usaríamos si no tocas nada.
 * `onlyKids` marca los que solo aplican con niños en casa — por eso la
 * rejilla pasa de 5 filas a 6 en cuanto hay un peque.
 *
 * El valor por defecto va DENTRO de la tarjeta a propósito, en vez de la
 * lista de sub-temas que incluye: la pregunta que responde esta pantalla es
 * "¿esto me vale?", y para eso «Lun a Vie» decide, «incluye 3 ajustes» no.
 *
 * `steps` son los índices de `onbScreens` (App.jsx) que se abren si marcas la
 * tarjeta. El mapa vive aquí, junto a la pregunta que representa, para que no
 * se desincronice de las tarjetas al tocar una de las dos.
 */
const TOPICS = [
  // ── Cuándo y cuánto ──────────────────────────────────────────────────────
  {
    id: "semana", group: "Cuándo y cuánto",
    Icon: CalendarDays,
    title: "¿Para qué días quieres el menú?",
    img: () => "/avatares/cards/aun_no_menu_generado.jpg",
    value: (d) => weekLabel(d),
    steps: [5],
  },
  {
    id: "compra", group: "Cuándo y cuánto",
    Icon: ShoppingCart,
    title: "¿Cuánto quieres gastarte en la compra?",
    img: (d) => (d.hasBudget ? "/budget-cards/yes-prices.jpg" : "/budget-cards/no-prices.jpg"),
    value: (d) => (d.hasBudget ? `${d.budget ?? 80} € por semana` : "No miro el presupuesto"),
    steps: [6],
  },

  // ── Quién come qué ───────────────────────────────────────────────────────
  {
    id: "horario", group: "Quién come qué",
    Icon: MapPin,
    title: "¿Qué días coméis en casa?",
    img: () => "/avatares/cards/comidas.jpg",
    value: (d, kids) => scheduleLabel(d, kids),
    steps: [7],
  },
  {
    id: "cole", group: "Quién come qué",
    Icon: GraduationCap,
    title: "¿Tienes el menú del cole de tus hijos?",
    img: () => "/avatares/cards/ninos_cenan_mediodia.jpg",
    // Sin menú subido no es un hueco a rellenar: el generador ya planifica su
    // comida aparte (ver scheduleLabel), así que no hace falta cuadrar nada.
    // Con uno subido sí hay algo que contar: la tarjeta era un texto fijo y
    // seguía diciendo "no hace falta" después de cargarlo.
    value: (d) => (householdHasSchoolMenu(d.schoolMenus)
      ? "Menú del comedor cargado"
      : "No hace falta calcular el menú con el de mis hijos"),
    onlyKids: true,
    steps: [4],
  },
  {
    id: "ninos", group: "Quién come qué",
    Icon: Baby,
    title: "¿Comen tus hijos igual que vosotros?",
    img: (d) => (d.menuModel === "separate"
      ? "/avatares/cards/distinto_menu_ninos.png"
      : "/avatares/cards/mismo_menu_ninos.png"),
    value: (d) => (d.menuModel === "separate" ? "Tienen su propio menú" : "Cenan lo mismo que nosotros"),
    onlyKids: true,
    // 3 (modelo de menú) casi siempre está oculto cuando hay niños — se deriva
    // de 8 (¿cómo comen los niños?). Se listan los dos y que decida App.jsx.
    steps: [3, 8],
  },

  // ── Cómo coméis ──────────────────────────────────────────────────────────
  {
    id: "estilo", group: "Cómo coméis",
    Icon: Salad,
    title: "¿Qué estilo de comida preferís?",
    img: () => "/avatares/cards/cook_salud_sano.jpg",
    value: (d) => (d.goals?.length ? `${d.goals.length} objetivos` : "Equilibrado: de todo, sin repetir"),
    steps: [9],
  },
  {
    id: "estructura", group: "Cómo coméis",
    Icon: UtensilsCrossed,
    title: "¿Cuántos platos por comida?",
    img: (d) => (d.mealStructure === "1_plato"
      ? "/avatares/cards/estructura_plato_combinado.png"
      : "/avatares/cards/estructura_primero_segundo.png"),
    value: (d) => (d.mealStructure === "1_plato" ? "Plato combinado" : "Primero y segundo"),
    steps: [10],
  },
  {
    id: "extras", group: "Cómo coméis",
    Icon: Coffee,
    title: "¿Queréis desayunos?",
    img: (d) => DESAYUNO_ART[d.extraMeals?.desayuno] ?? "/avatares/cards/desayuno_variado.jpg",
    value: (d) => extrasLabel(d),
    // Ojo: el ON/OFF del desayuno sigue viviendo en "¿Dónde coméis?" (7); aquí
    // solo se afina la variedad (10) y merienda/postre (11).
    steps: [10, 11],
  },

  // ── Cómo cocináis ────────────────────────────────────────────────────────
  {
    id: "despensa", group: "Cómo cocináis",
    Icon: Package,
    title: "¿Queréis usar lo que hay en casa?",
    // Ojo con el valor: pantryMode es "strict"|"only"|"prefer"|"off", nunca
    // "ignore" — comparando contra eso la tarjeta decía "Aprovechamos lo que
    // hay" siempre, también con la despensa apagada, que es el default.
    img: (d) => (d.pantryMode === "off"
      ? "/avatares/cards/despensa_sin.jpg"
      : "/avatares/cards/despensa_usar.jpg"),
    value: (d) => (d.pantryMode === "off" ? "No contamos con lo que haya en casa" : "Aprovechamos lo que hay"),
    steps: [12],
  },
  {
    id: "cocina", group: "Cómo cocináis",
    Icon: ChefHat,
    title: "¿Cuánto os gusta cocinar?",
    img: (d) => COCINA_ART[d.cookLevel] ?? "/avatares/cards/cook_nivel_normal.png",
    value: (d) => cookLevelLabel(d.cookLevel),
    steps: [13],
  },
  {
    id: "electros", group: "Cómo cocináis",
    Icon: CookingPot,
    title: "¿Qué tenéis en la cocina?",
    // La ilustración sigue al primer aparato marcado: si tienes Thermomix,
    // la tarjeta enseña la Thermomix, no un horno genérico.
    img: (d) => ELECTRO_ART[(d.kitchenTools ?? [])[0]] ?? "/avatares/cards/electrodomesticos/horno.webp",
    value: (d) => appliancesLabel(d),
    steps: [14],
  },
  {
    id: "tiempos", group: "Cómo cocináis",
    Icon: Timer,
    title: "¿Cuánto tiempo tenéis para cocinar?",
    // Ojo con el null: `null <= 20` es true, así que sin dato caería en
    // "con prisa" sin que nadie lo haya dicho.
    img: (d) => {
      const min = cookTimeMinutes(d);
      return min !== null && min <= 20
        ? "/avatares/cards/cook_con_prisa.png"
        : "/avatares/cards/cook_con_tiempo.png";
    },
    value: (d) => cookTimeLabel(d),
    steps: [15],
  },
];

/**
 * Pasos de `onbScreens` que abre cada tarjeta. Lo consume App.jsx para decidir
 * qué se ve después del picker; sin nada marcado, no se ve ninguno.
 */
export const SCOPE_TOPIC_STEPS = Object.fromEntries(TOPICS.map((t) => [t.id, t.steps]));

// El orden en que se pintan los grupos.
const GROUPS = ["Cuándo y cuánto", "Quién come qué", "Cómo coméis", "Cómo cocináis"];

// Arte reusado tal cual de las opciones del asistente (Onboarding.jsx), para
// que la tarjeta enseñe la MISMA ilustración que verías al editar ese paso —
// y que cambie cuando cambie el valor, en vez de ser un adorno fijo.
const COCINA_ART = {
  basic: "/avatares/cards/cook_nivel_basico.png",
  normal: "/avatares/cards/cook_nivel_normal.png",
  pro: "/avatares/cards/cook_nivel_pro.png",
};
const DESAYUNO_ART = {
  variado: "/avatares/cards/desayuno_variado.jpg",
  findes: "/avatares/cards/desayuno_lunes_viernes.jpg",
  igual: "/avatares/cards/desayuno_igual.jpg",
};
const ELECTRO_ART = {
  Airfryer: "/avatares/cards/electrodomesticos/airfryer.webp",
  Horno: "/avatares/cards/electrodomesticos/horno.webp",
  Microondas: "/avatares/cards/electrodomesticos/microondas.webp",
  "Olla rápida": "/avatares/cards/electrodomesticos/olla_rapida.webp",
  Thermomix: "/avatares/cards/electrodomesticos/thermomix.webp",
  Vaporera: "/avatares/cards/electrodomesticos/vaporera.webp",
};

// El icono de cada fila: el mismo objeto en 3D sobre su propio color
// (scripts/make_scope_picker_icons.py). En la rejilla el tema se reconoce por
// la ilustración de la tarjeta; en filas no había ilustración, y doce lucide
// monocromos del mismo verde se leían todos igual. Con un color por tema la
// fila se encuentra sin llegar a leer el título.
const ROW_ICON = {
  semana: "/avatares/cards/scope_picker/semana.webp",
  compra: "/avatares/cards/scope_picker/compra.webp",
  horario: "/avatares/cards/scope_picker/horario.webp",
  cole: "/avatares/cards/scope_picker/cole.webp",
  ninos: "/avatares/cards/scope_picker/ninos.webp",
  estilo: "/avatares/cards/scope_picker/estilo.webp",
  estructura: "/avatares/cards/scope_picker/estructura.webp",
  extras: "/avatares/cards/scope_picker/extras.webp",
  despensa: "/avatares/cards/scope_picker/despensa.webp",
  cocina: "/avatares/cards/scope_picker/cocina.webp",
  tiempos: "/avatares/cards/scope_picker/tiempos.webp",
  // El único sin render propio: la Thermomix del juego de aparatos, que ya
  // está en el mismo estilo, pesa poco y comparte caché con el paso 14.
  electros: "/avatares/cards/electrodomesticos/thermomix.webp",
};

// Con 3 o menos caben los nombres; a partir de ahí, el número. Sin nada
// marcado, el mismo supuesto que enseña el paso del asistente: lo básico.
function appliancesLabel(d) {
  const on = d.kitchenTools ?? [];
  if (on.length === 0) return "Fuegos y sartenes";
  if (on.length <= 3) return on.join(" · ");
  return `${on.length} aparatos`;
}

function extrasLabel(d) {
  const on = ["desayuno", "merienda", "postre"].filter((k) => (d.extraMeals?.[k] ?? "off") !== "off");
  if (on.length === 0) return "Sin desayunos ni postres";
  return on.map((k) => (k === "desayuno" ? "Desayuno" : k === "merienda" ? "Merienda" : "Postre")).join(" · ");
}

function weekLabel(d) {
  const n = d.menuWeekOffsets?.length ?? 1;
  return n > 1 ? `${n} semanas` : "Para esta semana";
}

// De septiembre a julio hay cole o, si no, campamento — los niños comen
// fuera casi todo el año. Agosto es el único mes que se puede dar por
// "todos en casa" sin preguntar. (Antes cortaba en junio, pero eso ignoraba
// los campamentos de julio.)
function isSchoolSeason(date = new Date()) {
  const m = date.getMonth() + 1;
  return m !== 8;
}

function scheduleLabel(d, kids) {
  const days = Object.keys(d.schedule ?? {}).length;
  if (days > 0) return `${days} días ajustados`;
  return kids && isSchoolSeason()
    ? "Comemos todos en casa, salvo los niños en el cole"
    : "Comemos todos en casa";
}

// Nivel + matiz, en dos líneas: el nivel solo ("Normal") no dice nada, y el
// matiz solo ("Sin complicarnos") no dice cuál de los tres es. El salto es
// explícito (con white-space: pre-line en la franja) porque el ancho de la
// tarjeta cambia con el grid fluido y no se puede confiar en que parta ahí.
function cookLevelLabel(level) {
  if (level === "basic") return "Básico,\nlo más fácil posible";
  if (level === "pro") return "Nos encanta,\ndadnos guerra";
  return "Normal,\nsin complicarnos";
}

// cookTime.weekday es { Comida, Cena }, no un número: mostramos la comida,
// que es la que marca el tono ("tengo X minutos entre semana").
function cookTimeMinutes(d) {
  const v = d.cookTime?.weekday?.Comida ?? d.cookTime?.weekday?.Cena;
  return typeof v === "number" ? v : null;
}

function cookTimeLabel(d) {
  const v = cookTimeMinutes(d);
  return v ? `${v} min entre semana` : "Sin prisa";
}

/**
 * "¿Qué quieres ajustar de tu menú?" — primer paso del asistente. Enseña de
 * una vez todo lo que decidiríamos por ti y deja marcar solo lo que quieras
 * tocar; lo que no marques se queda con el valor que se ve en la tarjeta.
 *
 * Sustituye a la vieja pregunta Sencillo/Avanzado (OnboardingMode): era la
 * misma decisión — "¿hasta dónde me quiero meter?" — pero en binario y a
 * ciegas, sin enseñar qué preguntas te ahorrabas.
 *
 * Va dentro de OnboardingShell (no con BottomNav) para heredar la cabecera del
 * resto de pasos: Atrás, puntos de progreso, Salir, y el CTA pegado abajo.
 */
export function ScopePickerScreen({ data, onBack, onReset, onContinue, initialPicked = [] }) {
  const kids = hasChildMember(data.members ?? []);
  const topics = useMemo(() => TOPICS.filter((t) => !t.onlyKids || kids), [kids]);
  // Se siembra con lo elegido la vez anterior: volver atrás desde un paso del
  // asistente no debe borrar la selección que trajo hasta aquí.
  const [picked, setPicked] = useState(() => new Set(initialPicked));
  // Pista de "esto se toca": la primera tarjeta se levanta y vuelve a su sitio
  // un par de veces al entrar. Es un one-shot — al primer toque se apaga y no
  // vuelve, ni siquiera si desmarcas todo: ya has entendido el mecanismo.
  const [nudge, setNudge] = useState(() => initialPicked.length === 0);
  const firstTopicId = topics[0]?.id;
  // EXPERIMENTO A/B (2026-09-01): comparar el grid de cards ilustradas de
  // siempre contra una batería de filas compactas (icono + pregunta/valor,
  // sin imagen) — mismo picked/toggle/CTA por debajo, solo cambia cómo se
  // pinta cada tema. Quitar el toggle y quedarse con el modo ganador en
  // cuanto decidamos cuál es.
  const [mode, setMode] = useState("cards");

  const toggle = (id) => {
    setNudge(false);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const n = picked.size;
  // Sin nada marcado el botón de ajustar no puede quedarse muerto: pasa a ser
  // "Ajusta todo" y mete el asistente entero. `topics` ya viene filtrado por
  // si hay niños, así que no cuela pasos que no aplican.
  const go = () => onContinue?.(n > 0 ? [...picked] : topics.map((t) => t.id));

  return (
    <OnboardingShell
      title="¿Qué quieres ajustar de tu menú?"
      subtitle="Marca los campos que quieras que revisemos. En los que no nos digas nada, asumiremos lo que ves debajo de la pregunta."
      onBack={onBack}
      onReset={onReset}
      // Aquí el asistente aún no ha empezado: no hay nada que abandonar, solo
      // se vuelve por donde has venido. De ahí un chevron de "atrás" y no el
      // "Salir" del resto de pasos — que además deja sitio al título.
      resetAsChevron
      // Título arriba, en la fila del botón: esta pantalla es la portada del
      // asistente, no un paso suyo, y no lleva barra de progreso que ocupe
      // ese hueco.
      inlineTitle
      // Doble CTA: la vía rápida (generar ya, sin contestar nada) siempre está
      // ahí en secundario, y el principal es meterse a ajustar — todo si no
      // has marcado nada, o solo lo marcado si sí.
      onNext={go}
      onFinish={() => onContinue?.([])}
      nextLabel={n > 0 ? `Ajustar ${n} ${n === 1 ? "paso" : "pasos"}` : "Ajusta todo"}
      finishLabel="Genera el menú ya"
    >
      {/* Toggle del experimento — ver comentario junto a `mode` más arriba. */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <div style={{ display: "flex", background: "#eef3ef", borderRadius: 10, padding: 2, gap: 2 }}>
          {[
            { id: "cards", label: "Cards", Icon: LayoutGrid },
            { id: "rows", label: "Filas", Icon: Rows3 },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setMode(opt.id)}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "6px 10px", borderRadius: 8, border: "none",
                background: mode === opt.id ? "#fff" : "transparent",
                boxShadow: mode === opt.id ? "0 1px 4px rgba(20,47,29,.18)" : "none",
                color: mode === opt.id ? GREEN : "#7a9485",
                fontSize: 11.5, fontWeight: 800, fontFamily: "inherit", cursor: "pointer",
              }}
            >
              <opt.Icon size={13} strokeWidth={2.6} />
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {GROUPS.map((groupName) => {
        const inGroup = topics.filter((t) => t.group === groupName);
        if (inGroup.length === 0) return null;
        if (mode === "rows") {
          return (
            <section key={groupName} style={{ marginBottom: 18 }}>
              <h2 style={groupTitle}>{groupName}</h2>
              <div style={rowList}>
                {inGroup.map(({ id, title, value }, i) => {
                  const on = picked.has(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggle(id)}
                      aria-pressed={on}
                      className={nudge && id === firstTopicId ? "mp-nudge" : undefined}
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        width: "100%", padding: "12px 14px", border: "none",
                        borderTop: i === 0 ? "none" : "1px solid #eef2ef",
                        background: on ? `${SELECTED}0f` : "transparent",
                        cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                      }}
                    >
                      {/* Marcado ya no puede pintar el icono de blanco como
                          hacía el lucide, así que lo dice el aro de fuera. */}
                      <span
                        style={{
                          flexShrink: 0, width: 34, height: 34, borderRadius: 10,
                          overflow: "hidden", background: "#f4f7f5",
                          boxShadow: on ? `0 0 0 2px ${SELECTED}` : "none",
                        }}
                      >
                        <img
                          src={ROW_ICON[id]}
                          alt=""
                          loading="lazy"
                          style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 13, fontWeight: 800, color: "#142f1d", lineHeight: 1.25 }}>
                          {title}
                        </span>
                        <span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: "#7a9485", lineHeight: 1.3, marginTop: 1 }}>
                          {value(data, kids).replace("\n", " ")}
                        </span>
                      </span>
                      <span
                        style={{
                          flexShrink: 0, width: 21, height: 21, borderRadius: "50%",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          border: `2px solid ${on ? SELECTED : "#d7e4dc"}`,
                          background: on ? SELECTED : "transparent",
                        }}
                      >
                        {on && <Check size={12} color="#fff" strokeWidth={3.2} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        }
        return (
          <section key={groupName} style={{ marginBottom: 18 }}>
            <h2 style={groupTitle}>{groupName}</h2>
            <div style={grid}>
              {inGroup.map(({ id, img, Icon, title, value, accent }) => {
                const on = picked.has(id);
                const tone = accent ?? GREEN;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggle(id)}
                    aria-pressed={on}
                    className={nudge && id === firstTopicId ? "mp-nudge" : undefined}
                    style={{
                      position: "relative", display: "flex", flexDirection: "column",
                      padding: 0, borderRadius: 16, overflow: "hidden", cursor: "pointer",
                      fontFamily: "inherit", textAlign: "left", minWidth: 0,
                      border: `2px solid ${on ? SELECTED : "#e0eae3"}`,
                      background: on ? SELECTED : "#fff",
                      boxShadow: on ? `0 4px 14px ${SELECTED}33` : "0 2px 8px rgba(20,47,29,.05)",
                      // Microinteracción: se hunde un pelo al pulsar y sube al
                      // soltar con una curva con rebote. Sin librería.
                      transform: on ? "translateY(-2px)" : "none",
                      transition: "transform .22s cubic-bezier(.34,1.56,.64,1), background .15s ease, border-color .15s ease, box-shadow .2s ease",
                    }}
                    onPointerDown={(e) => { e.currentTarget.style.transform = "scale(.96)"; }}
                    onPointerUp={(e) => { e.currentTarget.style.transform = ""; }}
                    onPointerLeave={(e) => { e.currentTarget.style.transform = ""; }}
                  >
                    {/* La pregunta va sobre la ilustración, con su icono; la
                        respuesta en la franja de abajo. Así la tarjeta se lee de
                        un vistazo: arriba qué se decide, abajo qué haríamos. */}
                    <span style={{ position: "relative", display: "block", width: "100%" }}>
                      <img
                        src={img(data)}
                        alt=""
                        loading="lazy"
                        style={{ display: "block", width: "100%", aspectRatio: "1 / 1", objectFit: "cover", background: "#f4f7f5" }}
                      />
                      {/* Degradado desde abajo, donde vive la pregunta. Arriba
                          tapaba la cara de los personajes de las ilustraciones. */}
                      <span
                        style={{
                          position: "absolute", inset: 0,
                          background: "linear-gradient(to top, rgba(20,47,29,.88) 0%, rgba(20,47,29,.45) 45%, rgba(20,47,29,.05) 100%)",
                        }}
                      />
                      {/* Icono en la misma línea que la pregunta, delante: la
                          primera línea del texto arranca a su lado y las
                          siguientes fluyen debajo. */}
                      {/* Sin text-wrap:balance a propósito: reparte el texto entre
                          líneas y empujaba palabras clave («presupuesto») a la
                          segunda. Llenando la primera línea entran antes. */}
                      <span style={{ position: "absolute", left: 10, right: 10, bottom: 9, color: "#fff", fontSize: 12.5, fontWeight: 800, lineHeight: 1.3 }}>
                        <Icon size={14} strokeWidth={2.6} style={{ verticalAlign: "-2px", marginRight: 5 }} />
                        {title}
                      </span>
                    </span>
                    <span
                      style={{
                        // flex:1 para que la franja llegue hasta abajo: la
                        // rejilla estira todas las tarjetas de una fila a la
                        // misma altura, y con la respuesta en una sola línea
                        // quedaba un hueco blanco bajo la franja.
                        display: "block", flex: 1, padding: "9px 11px 10px",
                        fontSize: 11.5, fontWeight: 800, lineHeight: 1.3,
                        whiteSpace: "pre-line",
                        color: on ? "#fff" : tone,
                        background: on ? "transparent" : `${tone}12`,
                        borderTop: on ? "1px solid rgba(255,255,255,.25)" : `1px solid ${tone}22`,
                      }}
                    >
                      {value(data, kids)}
                    </span>
                    {on && (
                      <span style={checkBadge}><Check size={11} color={SELECTED} strokeWidth={3.2} /></span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </OnboardingShell>
  );
}

const groupTitle = {
  margin: "0 0 9px", fontSize: 11, fontWeight: 900, color: "#7a9485",
  letterSpacing: ".6px", textTransform: "uppercase",
};

// auto-fill en vez de 2 columnas fijas: en móvil salen 2, y en pantallas
// anchas se rellena solo con 3 o 4 sin tocar nada.
const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
  gap: 10,
};

// Lista tipo ajustes: un solo bloque blanco redondeado con filas separadas
// por una línea fina, en vez de una tarjeta suelta por tema.
const rowList = {
  background: "#fff", borderRadius: 14, overflow: "hidden",
  border: "1px solid #e0eae3", boxShadow: "0 2px 8px rgba(20,47,29,.05)",
};

const checkBadge = {
  position: "absolute", top: 9, right: 9,
  width: 19, height: 19, borderRadius: "50%", background: "#fff",
  display: "flex", alignItems: "center", justifyContent: "center",
  boxShadow: "0 1px 3px rgba(0,0,0,.2)",
};
