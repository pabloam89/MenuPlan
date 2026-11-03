import { useMemo, useState } from "react";
import { CAMINO, CAMINOS, TEMA, TEMAS } from "../lib/caminos.js";
import { Check } from "../components/icons.jsx";
import { OnboardingShell } from "./Onboarding.jsx";
import { hasChildMember } from "../lib/groups.js";

// Teal, no el verde de marca: es el color del CTA de OnboardingShell, así que
// la tarjeta elegida y el botón que la ejecuta hablan el mismo idioma.
const SELECTED = "#0f766e";

/**
 * Los temas del asistente. `steps` son los índices de `onbScreens` (App.jsx)
 * que se abren si el modo elegido incluye el tema; el mapa vive aquí, junto a
 * la pregunta que representa, para que no se desincronice.
 *
 * `onlyKids` marca los que solo aplican con niños en casa.
 */
// Los temas salen de la lista común (src/lib/caminos.js), que lee también
// Lola. Aquí solo se añade lo propio de la pantalla: qué pasos abre cada uno.
const PASOS_DE_TEMA = {
  [TEMA.SEMANA]: [5],
  [TEMA.COMPRA]: [6],
  [TEMA.HORARIO]: [7],
  [TEMA.COLE]: [4],
  // 3 (modelo de menú) casi siempre está oculto cuando hay niños — se deriva
  // de 8 (¿cómo comen los niños?). Se listan los dos y que decida App.jsx.
  [TEMA.NINOS]: [3, 8],
  [TEMA.ESTILO]: [9],
  [TEMA.ESTRUCTURA]: [10],
  // Ojo: el ON/OFF del desayuno sigue viviendo en "¿Dónde coméis?" (7); aquí
  // solo se afina la variedad (10) y merienda/postre (11).
  [TEMA.EXTRAS]: [10, 11],
  // Lo que hay en casa (12) y cuánto pesa al armar el menú (13): la segunda no
  // se entiende sin haber visto la primera.
  [TEMA.DESPENSA]: [12, 13],
  [TEMA.COCINA]: [14],
  [TEMA.ELECTROS]: [15],
  [TEMA.TIEMPOS]: [16],
  // Batch cooking es tema propio y no un trozo de "tiempos": aquella es cuánto
  // rato tienes un martes, y ésta qué dejas hecho el día que te pones.
  [TEMA.BATCH]: [17],
};

const TOPICS = TEMAS.map((t) => ({
  id: t.id,
  title: t.titulo,
  steps: PASOS_DE_TEMA[t.id],
  onlyKids: Boolean(t.soloNinos),
}));

/**
 * Pasos de `onbScreens` que abre cada tema. Lo consume App.jsx para decidir
 * qué se ve después del picker; sin nada elegido, no se ve ninguno.
 */
export const SCOPE_TOPIC_STEPS = Object.fromEntries(TOPICS.map((t) => [t.id, t.steps]));

const IMG = (slug) => `/avatares/cards/wizard_picker/${slug}.webp`;

/**
 * Los tres modos. `topics` son los temas que abre cada uno — de ahí sale tanto
 * el routing como el "N preguntas" de la tarjeta, así que el número nunca
 * miente aunque cambien los temas.
 *
 * `expert` no es "cuántos pasos ves" sino cómo se comportan: con él apagado,
 * "¿Dónde coméis?" no pregunta por desayunos, el editor de tiempos es el
 * simple y `resolveModeData` (App.jsx) descarta las cenas rápidas que vengan
 * del asistente. Por eso lo declara cada modo en vez de deducirse de si has
 * marcado algo: "Lo básico" abre tres pasos y aun así quiere los defaults
 * simplificados.
 *
 * Etiqueta por tiempo y no por nivel: "sencillo/avanzado" pedía juzgar tu
 * propia implicación sin haber visto nada de la app todavía; el tiempo es
 * concreto y no juzga. (Aprendizaje del picker anterior, 2026-08-29.)
 */
// Lo que ve la tarjeta de cada camino: la imagen y su encuadre. El resto
// (título, tiempo, temas) sale de la lista común.
const PRESENTACION = {
  // La ilustración es 4:5 y la tarjeta la recorta a cuadrado, así que cada
  // una dice qué franja conserva: aquí el personaje manda y está centrado.
  [CAMINO.BASICO]: { img: IMG("nivel_basico"), focus: "center 45%" },
  // Baja el encuadre: las dos sartenes humeando son la mitad del mensaje.
  [CAMINO.MEDIO]: { img: IMG("nivel_medio"), focus: "center 60%" },
  // Sube para no decapitar el gorro, que es lo que la distingue.
  [CAMINO.AVANZADO]: { img: IMG("nivel_avanzado"), focus: "center 40%" },
};

const MODES = CAMINOS.map((c) => ({
  id: c.id,
  ...PRESENTACION[c.id],
  time: c.minutos === 1 ? "1 minuto" : `${c.minutos} minutos`,
  title: c.titulo,
  subtitle: c.resumen,
  topics: [...c.temas],
  expert: c.experto,
}));

/**
 * "¿Qué quieres ajustar de tu menú?" — primer paso del asistente. Tres modos,
 * una tarjeta vertical cada uno, y lo que no entra en el modo elegido se queda
 * con el valor por defecto sin preguntarte.
 *
 * Sustituye a la rejilla de 12 temas marcables (2026-09-01 – 2026-09-04): daba
 * el control más fino posible, pero pedía leer y decidir doce veces antes de
 * empezar. Y antes de aquella, al binario Sencillo/Avanzado (OnboardingMode,
 * aún en Onboarding.jsx): misma pregunta, pero sin enseñar qué te ahorrabas.
 * El modo intermedio es lo que faltaba en los dos.
 *
 * Va dentro de OnboardingShell (no con BottomNav) para heredar la cabecera del
 * resto de pasos: Atrás, puntos de progreso, Salir, y el CTA pegado abajo.
 */
export function ScopePickerScreen({ data, onBack, onReset, onContinue, initialPicked = [] }) {
  const kids = hasChildMember(data.members ?? []);
  const allowed = useMemo(
    () => new Set(TOPICS.filter((t) => !t.onlyKids || kids).map((t) => t.id)),
    [kids],
  );
  const modes = useMemo(
    () =>
      MODES.map((m) => {
        const topics = m.topics.filter((id) => allowed.has(id));
        return {
          ...m,
          topics,
          count: topics.length,
        };
      }),
    [allowed],
  );

  // Se siembra con lo elegido la vez anterior: volver atrás desde un paso del
  // asistente no debe perder el modo que trajo hasta aquí. Se reconoce por el
  // conjunto exacto de temas, que es lo único que App.jsx guarda.
  const [picked, setPicked] = useState(() => {
    const prev = new Set(initialPicked);
    if (prev.size === 0) return null;
    const match = modes.find(
      (m) => m.topics.length === prev.size && m.topics.every((id) => prev.has(id)),
    );
    return match?.id ?? null;
  });

  const chosen = modes.find((m) => m.id === picked) ?? null;

  return (
    <OnboardingShell
      title="¿Qué quieres ajustar?"
      subtitle="Elige cuánto quieres contarnos. Lo que no nos digas, lo decidimos nosotros por ti."
      onBack={onBack}
      // Aquí el asistente aún no ha empezado: no hay nada que abandonar, solo
      // se vuelve por donde has venido. De ahí un chevron de "atrás" y no el
      // "Salir" del resto de pasos — que además deja sitio al título.
      onReset={onReset}
      resetAsChevron
      // Doble CTA: la vía rápida (generar ya, sin contestar nada) siempre está
      // ahí en secundario, y el principal arranca el modo elegido.
      onNext={() => chosen && onContinue?.(chosen.topics, chosen.expert)}
      onFinish={() => onContinue?.([], false)}
      nextDisabled={!chosen}
      nextLabel={chosen ? "Empezar" : "Elige uno"}
      finishLabel="Genera el menú ya"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {modes.map((m) => {
          const on = picked === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setPicked(m.id)}
              aria-pressed={on}
              style={{
                position: "relative",
                display: "block",
                width: "100%",
                padding: 0,
                borderRadius: 16,
                overflow: "hidden",
                cursor: "pointer",
                fontFamily: "inherit",
                textAlign: "left",
                background: "#fff",
                border: `2px solid ${on ? SELECTED : "#e0eae3"}`,
                boxShadow: on
                  ? `0 6px 18px ${SELECTED}2e`
                  : "0 1px 3px rgba(20,47,29,.05)",
                transform: on ? "translateY(-2px)" : "none",
                transition:
                  "transform .2s cubic-bezier(.25,.46,.45,.94), border-color .15s ease, box-shadow .2s ease",
              }}
              onPointerDown={(e) => { e.currentTarget.style.transform = "scale(.97)"; }}
              onPointerUp={(e) => { e.currentTarget.style.transform = ""; }}
              onPointerLeave={(e) => { e.currentTarget.style.transform = ""; }}
            >
              {/* La ilustración es vertical (4:5) y la tarjeta la recorta a
                  cuadrado: tres tarjetas a 4:5 completas son tres pantallas de
                  scroll antes de poder comparar. Cada modo elige su franja con
                  `focus` para no perder lo que cuenta su nivel. */}
              <span style={{ position: "relative", display: "block", width: "100%" }}>
                <img
                  src={m.img}
                  alt=""
                  loading="lazy"
                  style={{
                    display: "block",
                    width: "100%",
                    aspectRatio: "1 / 1",
                    objectFit: "cover",
                    objectPosition: m.focus,
                    background: "#f4f7f5",
                  }}
                />
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    inset: 0,
                    // Llega hasta media imagen porque ahora sostiene título y
                    // subtítulo (antes vivían en una franja blanca debajo),
                    // pero cae rápido para no tapar la encimera, que es donde
                    // se ve el nivel: una sartén, dos, o la cocina entera.
                    background:
                      "linear-gradient(to top, rgba(20,47,29,.94) 0%, rgba(20,47,29,.55) 22%, rgba(20,47,29,0) 58%)",
                  }}
                />
                {/* Las dos cifras que comparas entre tarjetas, una en cada
                    esquina de arriba: cuánto te cuesta y cuánto te preguntamos.
                    En píldora blanca porque el degradado solo cubre la mitad
                    de abajo y arriba la cocina es clara y con detalle. */}
                <span style={{ ...pill, left: 11 }}>{m.time}</span>
                <span style={{ ...pill, right: 11 }}>
                  {m.count} {m.count === 1 ? "pregunta" : "preguntas"}
                </span>
                <span style={{ position: "absolute", left: 14, right: 46, bottom: 12, color: "#fff" }}>
                  <span style={{ display: "block", fontSize: 21, fontWeight: 900, letterSpacing: "-.4px", lineHeight: 1.1 }}>
                    {m.title}
                  </span>
                  <span style={{ display: "block", fontSize: 11.5, fontWeight: 600, lineHeight: 1.35, marginTop: 3, opacity: 0.92 }}>
                    {m.subtitle}
                  </span>
                </span>
                {/* Abajo a la derecha, no arriba: esa esquina la ocupa ya la
                    píldora de "N preguntas". Queda enfrente del título. */}
                {on && (
                  <span
                    style={{
                      position: "absolute",
                      bottom: 11,
                      right: 11,
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      background: SELECTED,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 2px 6px rgba(0,0,0,.25)",
                    }}
                  >
                    <Check size={14} color="#fff" strokeWidth={3.2} />
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </OnboardingShell>
  );
}

// Las dos cifras de la esquina de arriba. Blanca casi opaca en vez de
// translúcida: van sobre la cocina, que es clara pero con detalle, y a 10px
// el texto se pierde en cuanto se transparenta.
const pill = {
  position: "absolute",
  top: 11,
  padding: "4px 9px",
  borderRadius: 999,
  background: "rgba(255,255,255,.94)",
  color: "#142f1d",
  fontSize: 10,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: ".6px",
  lineHeight: 1,
  boxShadow: "0 2px 6px rgba(20,47,29,.18)",
};
