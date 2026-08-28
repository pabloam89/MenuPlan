/**
 * Pintado del paso a paso enriquecido (`stepsRich`). Compartido entre el
 * detalle del menú (Menu.jsx) y el asistente de recetas (RecipePlanner.jsx)
 * para que ambos resuelvan los marcadores igual. El formato y la lógica pura
 * viven en src/lib/recipeSteps.js.
 */

import { isQualitativeUnit } from "../lib/ingredientCategories.js";
import { kitchenHint } from "../lib/kitchenUnits.js";
import { buildStepDisplay, formatQty, formatStepMinutes, STEP_PART_META } from "../lib/recipeSteps.js";

function findIngredientForMarker(marker, ingredients) {
  if (!ingredients?.length) return null;
  const key = marker.trim().toLowerCase();
  return (
    ingredients.find((i) => i.name.toLowerCase() === key)
    ?? ingredients.find((i) => i.name.toLowerCase().includes(key) || key.includes(i.name.toLowerCase()))
  );
}

function parseQtyMarker(raw) {
  const [name, mode] = raw.split("|").map((s) => s.trim());
  return { name, mode: mode || "auto" };
}

/** Pluralización básica es-ES para piezas ("huevo"→"huevos", "limón"→"limones"). */
function pluralizeEs(word, n) {
  if (n === 1) return word;
  if (/[aeiouáéíóú]$/i.test(word)) return `${word}s`;
  if (/ón$/i.test(word)) return word.replace(/ón$/i, "ones");
  if (/z$/i.test(word)) return word.replace(/z$/i, "ces");
  return `${word}es`;
}

/** Cantidad en lenguaje de cocina para el text del paso (dientes, al gusto, chorrito…). */
function formatStepIngredient(ing, mode = "auto") {
  const qty = ing.qtyScaled ?? ing.qty;
  const name = ing.name.charAt(0).toLowerCase() + ing.name.slice(1);
  const hint = ing.hint ?? kitchenHint(ing.name, qty, ing.unit);

  if (mode === "chorrito") return "un chorrito de aceite de oliva";
  if (mode === "abundante") return "abundante aceite de oliva";
  if (mode === "gusto") return `${name} al gusto`;
  if (mode === "pizca") return `una pizca de ${name}`;

  if (isQualitativeUnit(ing.unit)) return name;

  // Piezas contables ("ud"): "1 huevo", "2 limones" — sin "N ud de …".
  if (ing.unit === "ud") {
    const n = Math.max(1, Math.round(qty));
    return `${n} ${pluralizeEs(name, n)}`;
  }

  if (hint === "al gusto") return `${name} al gusto`;
  if (hint === "pizca") return `una pizca de ${name}`;

  if (hint?.startsWith("≈ ")) {
    const part = hint.slice(2); // p. ej. "2 pechugas"
    // Evita redundancias tipo "2 pechugas de pechuga de pollo": si el nombre
    // empieza por el sustantivo de la pieza, se suelta ese sustantivo.
    const pieceNoun = part.replace(/^[\d.,/\s½¼⅓⅔¾⅛]+/, "").trim();
    const nounSingular = pieceNoun.replace(/s$/, "");
    if (nounSingular && name.startsWith(nounSingular)) {
      const rest = name.slice(nounSingular.length).replace(/^s?\s*/, "").trim();
      return rest ? `${part} ${rest}` : part;
    }
    return `${part} de ${name}`;
  }

  // Aceite en cantidades pequeñas (pintar, aliñar): chorrito antes que cucharadas.
  if (ing.unit === "ml" && /aceite/.test(ing.name.toLowerCase()) && qty <= 25) {
    return "un chorrito de aceite de oliva";
  }

  const label = ing.label ?? formatQty(qty, ing.unit);
  return `${label} de ${name}`;
}

function userHasKitchenTool(name, kitchenTools) {
  const key = name.trim().toLowerCase();
  return (kitchenTools ?? []).some((t) => String(t).trim().toLowerCase() === key);
}

/** Utensilios opcionales: si no están en kitchenTools, cae al fallback (p. ej. plancha → sartén). */
function resolveCookwareMarker(name, kitchenTools) {
  const key = name.trim().toLowerCase();
  if (key === "plancha") {
    return userHasKitchenTool("Plancha", kitchenTools) ? "la plancha" : "la sartén";
  }
  if (key === "sartén" || key === "sarten") return "la sartén";
  return name.trim();
}

/** Sustituye {{@Plancha}} (utensilio), {{Ingrediente}} o {{Ingrediente|modo}}. */
function renderStepText(text, ingredients, kitchenTools = []) {
  if (!text) return text;
  if (!text.includes("{{")) return text;

  const parts = [];
  const re = /\{\{([^}]+)\}\}/g;
  let last = 0;
  let m;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const raw = m[1].trim();
    if (raw.startsWith("@")) {
      parts.push(resolveCookwareMarker(raw.slice(1), kitchenTools));
    } else {
      const { name, mode } = parseQtyMarker(raw);
      const ing = findIngredientForMarker(name, ingredients);
      if (ing) {
        parts.push(
          <strong key={`q-${k++}`} style={{ fontWeight: 800, color: "#142f1d" }}>
            {formatStepIngredient(ing, mode)}
          </strong>,
        );
      } else {
        parts.push(name);
      }
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 1 && typeof parts[0] === "string" ? parts[0] : parts;
}

function Chip({ color, background, children }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "2px 8px", borderRadius: 999,
      background, color,
      fontSize: 10.5, fontWeight: 800,
    }}>
      {children}
    </span>
  );
}

/**
 * Paso a paso. Si `rich` (stepsRich) está presente, pinta un stepper con nº de
 * paso, badge de tiempo y etiqueta de tipo. Si no, cae a la lista numerada de
 * siempre con `plain` (string[]).
 * `ingredients`: lista escalada para resolver {{marcadores}} de cantidad en el text.
 * `kitchenTools`: electrodomésticos/utensilios del usuario (p. ej. Plancha custom).
 */
export function RecipeStepList({ rich = null, plain = [], ingredients = null, kitchenTools = [] }) {
  const hasRich = Array.isArray(rich)
    && rich.length > 0
    && rich.every((s) => s && typeof s.text === "string" && s.text.length > 0);

  if (!hasRich) {
    return (
      <ol style={{ margin: 0, paddingLeft: 18, color: "#526057", fontSize: 13, lineHeight: 1.6 }}>
        {plain.map((step, i) => (
          <li key={`${i}-${step.slice(0, 24)}`} style={{ marginBottom: 6 }}>{step}</li>
        ))}
      </ol>
    );
  }

  return (
    <div>
      <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {buildStepDisplay(rich).map((d, di, arr) => {
          const { step: s, label, meta, isParallel } = d;
          const mins = formatStepMinutes(s.minutes);
          const isLast = di === arr.length - 1;
          // Cabecera de sección cuando `part` cambia respecto al paso anterior
          // (eje aparte de `kind`): agrupa visualmente qué pasos son de cada
          // componente del plato (principal/guarnición/salsa/combinado) para
          // poder cocinarlos por separado. Sin `part` no cambia nada de hoy.
          const partMeta = s.part ? STEP_PART_META[s.part] : null;
          const prevPart = arr[di - 1]?.step?.part ?? null;
          const showPartHeader = partMeta && s.part !== prevPart;
          return (
            <li key={`${d.index}-${(s.text ?? "").slice(0, 24)}`}>
              {showPartHeader && (
                <div
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    margin: di === 0 ? "0 0 10px" : "16px 0 10px",
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 900, color: partMeta.color, whiteSpace: "nowrap" }}>
                    {partMeta.label}
                  </span>
                  <div style={{ flex: 1, borderTop: `1.5px dashed ${partMeta.color}44` }} />
                </div>
              )}
              <div
                style={{ display: "flex", gap: 11, marginBottom: isLast ? 0 : 12 }}
              >
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                <span style={{
                  minWidth: 24, height: 24, padding: "0 4px", borderRadius: 999, flexShrink: 0,
                  background: meta.color, color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: label.length > 1 ? 10 : 12, fontWeight: 900, lineHeight: 1,
                }}>
                  {label}
                </span>
                {!isLast && (
                  <span style={{ flex: 1, width: 2, background: "#e3ede6", marginTop: 3, borderRadius: 2 }} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0, paddingBottom: 2 }}>
                <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, marginBottom: 4 }}>
                  <Chip color={meta.color} background={`${meta.color}1a`}>
                    {isParallel ? "En paralelo" : meta.label}
                  </Chip>
                  {mins && <Chip color="#5a7066" background="#f4f7f4">{mins}</Chip>}
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.55, color: "#48564e" }}>
                  {renderStepText(s.text, ingredients, kitchenTools)}
                </div>
              </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
