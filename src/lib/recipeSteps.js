/**
 * Formato `stepsRich` — lógica pura, sin React.
 *
 * Un paso enriquecido es `{ text, minutes, kind, during? }` (ver StepRichSchema
 * en src/data/recipeSchema.js). Este módulo es la fuente de verdad compartida
 * entre los tres sitios que tocan el formato, para que no diverjan:
 *   · scripts/enrich-recipe-steps.mjs → hornea los pasos del catálogo
 *   · src/lib/userRecipes.js          → recetas creadas por el usuario
 *   · src/components/RecipeSteps.jsx  → pintado (Menu y RecipePlanner)
 *
 * El `text` puede llevar marcadores que la UI resuelve al pintar:
 *   {{Ingrediente}}          → cantidad en lenguaje de cocina, ya escalada
 *   {{Ingrediente|modo}}     → modo ∈ chorrito | abundante | gusto | pizca
 *   {{@Sartén}} / {{@Plancha}} → utensilio, con fallback si el usuario no lo tiene
 */

// Debe coincidir con STEP_KINDS en src/data/recipeSchema.js.
export const STEP_KINDS = [
  "prep", "activo", "paralelo", "pasivo", "espera", "opcional", "emplatado",
];

/**
 * Etiqueta y color por tipo de paso.
 *
 * El eje que ordena la taxonomía es "¿tiene que estar el cocinero delante?":
 * pasivo y espera no consumen atención y por eso se descuentan del tiempo
 * activo. La diferencia entre ambos es si hay cocción en marcha (pasivo: el
 * horno trabaja solo) o no la hay (espera: reposar, enfriar, marinar).
 */
export const STEP_KIND_META = {
  prep: { label: "Preparación", color: "#7f9e57" },
  activo: { label: "A continuación", color: "#2d5a3d" },
  paralelo: { label: "Mientras tanto", color: "#c9a24a" },
  pasivo: { label: "Sin vigilar", color: "#6b8cae" },
  espera: { label: "Reposo", color: "#a48bbf" },
  opcional: { label: "Opcional", color: "#9aa79d" },
  emplatado: { label: "Emplatado", color: "#b5734a" },
};

/** Los tipos que NO piden atención: su tiempo no cuenta como tiempo activo. */
export const HANDS_OFF_KINDS = new Set(["pasivo", "espera"]);

export function formatStepMinutes(m) {
  const n = Number(m);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 60) return `~${n} min`;
  const h = Math.floor(n / 60);
  const r = n % 60;
  return r ? `~${h} h ${r} min` : `~${h} h`;
}

/** Minutos que el cocinero está de verdad en la cocina (excluye pasivo/espera). */
export function activeMinutes(rich) {
  if (!Array.isArray(rich)) return 0;
  return rich.reduce((acc, s) => {
    if (HANDS_OFF_KINDS.has(s?.kind)) return acc;
    const n = Number(s?.minutes);
    return Number.isFinite(n) && n > 0 ? acc + n : acc;
  }, 0);
}

export function isValidRichSteps(steps) {
  return Array.isArray(steps)
    && steps.length > 0
    && steps.every((s) => s && typeof s.text === "string" && s.text.trim().length > 0);
}

/**
 * Normaliza lo que devuelve un LLM (o lo que llega de la nube) al formato
 * `stepsRich`. Descarta pasos sin texto, redondea minutos y limita `kind` a la
 * taxonomía. `during` solo sobrevive en pasos paralelos y apuntando hacia
 * atrás: buildStepDisplay ignora los paralelos sin padre válido, así que un
 * `during` roto dejaría un "Mientras tanto" colgando de nada — mejor degradarlo
 * a "activo". Sin tope de pasos: una receta compleja lleva los que necesite.
 */
export function normalizeRichSteps(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const s of raw) {
    // Tolerante con modelos que devuelven un array de strings en vez de objetos.
    const text = String((typeof s === "string" ? s : s?.text) ?? "").trim();
    if (!text) continue;

    const step = { text };
    const mins = Number(s?.minutes);
    if (Number.isFinite(mins) && mins > 0) step.minutes = Math.max(1, Math.round(mins));
    if (STEP_KINDS.includes(s?.kind)) step.kind = s.kind;

    if (step.kind === "paralelo") {
      const during = Number(s?.during);
      if (Number.isInteger(during) && during >= 0 && during < out.length) {
        step.during = during;
      } else {
        step.kind = "activo";
      }
    }
    out.push(step);
  }
  return out;
}

/**
 * Quita los marcadores dejando solo el nombre: "Picar {{Ajo}}." → "Picar ajo.".
 * Los `steps` planos son el fallback y se pintan tal cual, sin pasar por el
 * resolutor, así que ahí las llaves no pueden quedar a la vista.
 */
export function stripStepMarkers(text) {
  return String(text ?? "").replace(/\{\{([^}]+)\}\}/g, (_, raw) => {
    const inner = String(raw).trim();
    const name = inner.startsWith("@") ? inner.slice(1) : inner.split("|")[0];
    return name.trim().toLowerCase();
  });
}

/** `stepsRich` → `steps` planos, que siguen siendo la fuente de verdad/fallback. */
export function richToPlainSteps(rich) {
  return (rich ?? []).map((s) => stripStepMarkers(s?.text ?? ""));
}

/**
 * Borra un paso arreglando los `during` que quedan colgando: los que apuntaban
 * al paso borrado pierden su ancla (pasan a "activo") y los que apuntaban más
 * atrás en el array se desplazan una posición. Sin esto, borrar un paso haría
 * que los paralelos se colgaran del paso equivocado.
 */
export function removeRichStep(rich, idx) {
  return (rich ?? [])
    .filter((_, i) => i !== idx)
    .map((s) => {
      if (!Number.isInteger(s?.during)) return s;
      if (s.during === idx) {
        const { during, ...rest } = s;
        return { ...rest, kind: "activo" };
      }
      return s.during > idx ? { ...s, during: s.during - 1 } : s;
    });
}

/**
 * Ordena los pasos para pintarlos: si un paso tiene hijos en paralelo, el padre
 * pasa a "Na" y los hijos a "Nb", "Nc"… Los paralelos se sacan de la numeración
 * principal y se reinsertan justo detrás de su padre.
 */
export function buildStepDisplay(rich) {
  const parallelByParent = new Map();
  rich.forEach((s, i) => {
    if (s.kind === "paralelo" && Number.isInteger(s.during) && s.during >= 0 && s.during < i) {
      if (!parallelByParent.has(s.during)) parallelByParent.set(s.during, []);
      parallelByParent.get(s.during).push(i);
    }
  });

  const display = [];
  let mainNum = 0;

  for (let i = 0; i < rich.length; i++) {
    const s = rich[i];
    if (s.kind === "paralelo" && Number.isInteger(s.during)) continue;

    mainNum += 1;
    const parallels = parallelByParent.get(i) ?? [];
    const meta = STEP_KIND_META[s.kind] ?? STEP_KIND_META.activo;

    if (parallels.length > 0) {
      display.push({ step: s, index: i, label: `${mainNum}a`, meta, isParallel: false });
      parallels.forEach((ci, subIdx) => {
        display.push({
          step: rich[ci],
          index: ci,
          label: `${mainNum}${String.fromCharCode(98 + subIdx)}`,
          meta,
          isParallel: true,
        });
      });
    } else {
      display.push({ step: s, index: i, label: String(mainNum), meta, isParallel: false });
    }
  }
  return display;
}
