/**
 * Pintado del paso a paso enriquecido (`stepsRich`). Compartido entre el
 * detalle del menú (Menu.jsx) y el asistente de recetas (RecipePlanner.jsx)
 * para que ambos resuelvan los marcadores igual. El formato y la lógica pura
 * viven en src/lib/recipeSteps.js.
 */

import {
  buildStepDisplay,
  formatStepMinutes,
  STEP_PART_META,
} from "../lib/recipeSteps.js";
// La resolución de {{marcadores}} se comparte con el modo cocina, así que vive
// en su propio módulo — ver stepText.jsx.
import { renderStepText } from "./stepText.jsx";

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
