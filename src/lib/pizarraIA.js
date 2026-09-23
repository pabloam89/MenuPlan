/**
 * La burbuja de la pizarra: una frase → cambios en el tablero, al momento.
 *
 * ── El modelo entiende, el tablero ejecuta ────────────────────────────────
 * El modelo NO elige recetas ni escribe el menú. Traduce lo que dices a un
 * puñado de operaciones que la pizarra ya sabe hacer —poner, cambiar,
 * rellenar, vaciar, mover— y aquí se ejecutan con `pickCatalogReplacement`,
 * el mismo camino que el `+`, el ✨ y "Rellenar". Por eso lo que cae en el
 * hueco respeta alergias, rol del hueco, tiempo y lo ya puesto esta semana,
 * diga lo que diga el modelo: él solo apunta, no coloca.
 *
 * Así es rápido (una llamada corta al modelo barato, sin reintentos de
 * formato) y no puede romper nada que un toque a mano no rompería.
 *
 * ── Lo que no se entiende, se dice ────────────────────────────────────────
 * Una operación con un día o una comida que no existen, o un plato que ese
 * hueco no admite, no se inventa ni se fuerza: vuelve en `noHechos` para que
 * la burbuja lo cuente.
 */

import { familiasDe } from "./menuRecuento.js";

export const OPS = ["poner", "cambiar", "rellenar", "vaciar", "mover"];
export const FAMILIAS = ["carne", "pescado", "legumbres", "huevos", "pasta_arroz", "verdura"];
const MAX_OPS = 21;

const NOMBRE_DIA = {
  Lun: "lunes", Mar: "martes", "Mié": "miércoles", Jue: "jueves",
  Vie: "viernes", "Sáb": "sábado", Dom: "domingo",
};

/** Minúsculas y sin tildes: "Lentejas estofadas" y "lentejas" se tienen que encontrar. */
export function normalizar(t) {
  return String(t ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PALABRAS_VACIAS = new Set(["de", "del", "la", "el", "los", "las", "con", "y", "a", "al", "en", "un", "una", "unos", "unas"]);
const palabras = (t) => normalizar(t).split(" ").filter((w) => w && !PALABRAS_VACIAS.has(w));

/**
 * Cuánto se parece un nombre de receta a lo pedido: la fracción de palabras
 * pedidas que aparecen en el nombre (con plural/singular laxo). 0 = nada.
 */
export function parecido(nombre, pedido) {
  const quiero = palabras(pedido);
  if (quiero.length === 0) return 0;
  const tiene = palabras(nombre);
  const casa = (q) => tiene.some((w) => w === q || w.startsWith(q) || q.startsWith(w) && w.length >= 4);
  const aciertos = quiero.filter(casa).length;
  return aciertos / quiero.length;
}

/** El resumen del tablero que ve el modelo: una línea por hueco. */
export function contextoDelTablero({ plan, dias, comidas, nombreDe }) {
  const lineas = [];
  for (const d of dias) {
    for (const c of comidas) {
      const s = plan?.[`${d}-${c}`];
      if (!s) continue;
      const primero = s.firstRecipeId ? nombreDe(s.firstRecipeId) : null;
      const principal = s.recipeId ? nombreDe(s.recipeId) : null;
      const txt = s.dosPlatos
        ? `1º ${primero ?? "(vacío)"} · 2º ${principal ?? "(vacío)"}`
        : principal ?? "(vacío)";
      lineas.push(`${d} ${c}: ${txt}`);
    }
  }
  return [
    `DÍAS: ${dias.join(", ")}`,
    `COMIDAS: ${comidas.join(", ")}`,
    "TABLERO:",
    ...lineas,
  ].join("\n");
}

const lista = (v) => (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]);

function limpiarPista(p) {
  if (!p || typeof p !== "object") return null;
  const out = {};
  const m = Number(p.maxMinutos);
  if (Number.isFinite(m) && m > 0) out.maxMinutos = Math.min(240, Math.round(m));
  if (FAMILIAS.includes(p.familia)) out.familia = p.familia;
  if (typeof p.texto === "string" && p.texto.trim()) out.texto = p.texto.trim().slice(0, 60);
  return Object.keys(out).length ? out : null;
}

/**
 * La respuesta del modelo, saneada. Nada de lo que devuelva pasa sin mirar:
 * operación conocida, días y comidas del tablero, textos acotados.
 */
export function validarOrden(json, { dias, comidas }) {
  const reply = typeof json?.reply === "string" ? json.reply.trim().slice(0, 240) : "";
  const ops = [];
  const diaOk = (d) => dias.includes(d);
  const comidaOk = (c) => comidas.includes(c);
  for (const raw of Array.isArray(json?.ops) ? json.ops.slice(0, MAX_OPS) : []) {
    const op = raw?.op;
    if (!OPS.includes(op)) continue;
    if (op === "mover") {
      const de = raw.de ?? {};
      const a = raw.a ?? {};
      if (diaOk(de.dia) && comidaOk(de.comida) && diaOk(a.dia) && comidaOk(a.comida)) {
        ops.push({ op, de: { dia: de.dia, comida: de.comida }, a: { dia: a.dia, comida: a.comida } });
      }
      continue;
    }
    const diasOp = lista(raw.dia).filter(diaOk);
    const comidasOp = lista(raw.comida).filter(comidaOk);
    // Un día o comida escritos pero que no existen invalidan la operación:
    // "rellena el octavo día" no puede acabar rellenando la semana entera.
    if (lista(raw.dia).length && !diasOp.length) continue;
    if (lista(raw.comida).length && !comidasOp.length) continue;
    const curso = raw.curso === "first" ? "first" : "main";
    const pista = limpiarPista(raw.pista);
    if (op === "poner") {
      const plato = typeof raw.plato === "string" ? raw.plato.trim().slice(0, 80) : "";
      if (!plato || diasOp.length === 0 || comidasOp.length === 0) continue;
      ops.push({ op, dias: diasOp, comidas: comidasOp, plato, curso });
    } else if (op === "cambiar") {
      if (diasOp.length === 0 || comidasOp.length === 0) continue;
      ops.push({ op, dias: diasOp, comidas: comidasOp, curso, pista });
    } else {
      ops.push({ op, dias: diasOp, comidas: comidasOp, curso, pista });
    }
  }
  return { reply, ops };
}

function pasaPista(r, pista) {
  if (!pista) return true;
  if (pista.maxMinutos && Number(r.time) > pista.maxMinutos) return false;
  if (pista.familia && !familiasDe(r).has(pista.familia)) return false;
  if (pista.texto && parecido(r.name, pista.texto) < 0.5) return false;
  return true;
}

const etiqueta = (dia, comida) => `${NOMBRE_DIA[dia] ?? dia} ${String(comida).toLowerCase()}`;

/**
 * Ejecuta las operaciones sobre una COPIA del plan, hueco a hueco y sobre el
 * plan que va creciendo (como `handleFillSlots`): lo que cae en uno ya cuenta
 * para el siguiente.
 *
 * @param {Array} ops    las de `validarOrden`
 * @param {object} ctx
 * @param {object} ctx.data  los datos de la casa (grupos, miembros…)
 * @param {object} ctx.plan  el menuPlan vivo
 * @param {string[]} ctx.dias
 * @param {string[]} ctx.comidas
 * @param {Function} ctx.pick  `pickCatalogReplacement`
 * @returns {{ trabajo: object, nuevas: object[], hechos: number, noHechos: string[], tocados: string[] }}
 */
export function aplicarOrden(ops, { data, plan, dias, comidas, pick }) {
  const trabajo = {};
  for (const gid of Object.keys(plan ?? {})) {
    if (gid === "_warnings") continue;
    trabajo[gid] = {};
    for (const k of Object.keys(plan[gid] ?? {})) trabajo[gid][k] = { ...plan[gid][k] };
  }
  const grupos = Object.keys(trabajo);
  const nuevas = [];
  const noHechos = [];
  const tocados = new Set();
  let hechos = 0;

  const colocar = (gid, day, meal, course, receta) => {
    const r = pick(data, trabajo, { groupId: gid, day, meal, course, forcedRecipe: receta });
    if (!r) return false;
    nuevas.push(r.frontendRecipe);
    trabajo[gid][`${day}-${meal}`] = {
      ...trabajo[gid][`${day}-${meal}`],
      ...(course === "first" ? { firstRecipeId: r.recipeId } : { recipeId: r.recipeId }),
      cleared: false,
      warnings: [],
    };
    tocados.add(`${day}-${meal}`);
    return true;
  };

  const candidatosDe = (gid, day, meal, course, n = 400) =>
    pick(data, trabajo, { groupId: gid, day, meal, course, candidatos: n })?.candidatos ?? [];

  /** El mejor candidato para un hueco con una pista, o el primero si la pista lo vacía. */
  const elegir = (gid, day, meal, course, pista) => {
    const todos = candidatosDe(gid, day, meal, course, pista ? 400 : 25);
    if (todos.length === 0) return { receta: null, relajada: false };
    const conPista = todos.filter((r) => pasaPista(r, pista));
    return conPista.length ? { receta: conPista[0], relajada: false } : { receta: todos[0], relajada: Boolean(pista) };
  };

  const huecosDe = (op) => {
    const ds = op.dias.length ? op.dias : dias;
    const cs = op.comidas.length ? op.comidas : comidas;
    const out = [];
    for (const d of ds) for (const c of cs) out.push([d, c]);
    return out;
  };

  for (const op of ops) {
    if (op.op === "mover") {
      const kDe = `${op.de.dia}-${op.de.comida}`;
      const kA = `${op.a.dia}-${op.a.comida}`;
      let alguno = false;
      for (const gid of grupos) {
        const sDe = trabajo[gid][kDe];
        const sA = trabajo[gid][kA];
        if (!sDe?.recipeId || !sA) continue;
        // Mueve si el destino está libre e intercambia si no, como el arrastre.
        // `eaters` y `mode` son del hueco y se quedan donde están.
        const rDe = sDe.recipeId;
        const rA = sA.recipeId ?? null;
        trabajo[gid][kA] = { ...sA, recipeId: rDe, cleared: false, warnings: [] };
        trabajo[gid][kDe] = { ...sDe, recipeId: rA, cleared: !rA && !sDe.firstRecipeId, warnings: [] };
        alguno = true;
      }
      if (alguno) { hechos++; tocados.add(kDe); tocados.add(kA); } else noHechos.push(`No había nada que mover el ${etiqueta(op.de.dia, op.de.comida)}`);
      continue;
    }

    for (const [day, meal] of huecosDe(op)) {
      const key = `${day}-${meal}`;
      for (const gid of grupos) {
        const slot = trabajo[gid][key];
        if (!slot) continue;
        const course = op.curso === "first" && slot.dosPlatos ? "first" : "main";

        if (op.op === "vaciar") {
          const lleno = slot.recipeId || slot.firstRecipeId;
          if (!lleno) continue;
          trabajo[gid][key] = { ...slot, recipeId: null, firstRecipeId: null, cleared: true, warnings: [] };
          tocados.add(key);
          hechos++;
          continue;
        }

        if (op.op === "rellenar") {
          const cursos = [];
          if (slot.dosPlatos && !slot.firstRecipeId) cursos.push("first");
          if (!slot.recipeId) cursos.push("main");
          for (const c of cursos) {
            const { receta } = elegir(gid, day, meal, c, op.pista);
            if (receta && colocar(gid, day, meal, c, receta)) hechos++;
          }
          continue;
        }

        if (op.op === "cambiar") {
          const { receta, relajada } = elegir(gid, day, meal, course, op.pista);
          if (receta && colocar(gid, day, meal, course, receta)) {
            hechos++;
            if (relajada) noHechos.push(`Para el ${etiqueta(day, meal)} no había nada así; he puesto otra cosa`);
          } else {
            noHechos.push(`No encontré otro plato para el ${etiqueta(day, meal)}`);
          }
          continue;
        }

        if (op.op === "poner") {
          const cands = candidatosDe(gid, day, meal, course);
          let mejor = null;
          let nota = 0;
          for (const r of cands) {
            const p = parecido(r.name, op.plato);
            if (p > nota) { nota = p; mejor = r; }
          }
          if (mejor && nota >= 0.5 && colocar(gid, day, meal, course, mejor)) {
            hechos++;
          } else {
            noHechos.push(`«${op.plato}» no encaja en el ${etiqueta(day, meal)}`);
          }
        }
      }
    }
  }

  return { trabajo, nuevas, hechos, noHechos: [...new Set(noHechos)], tocados: [...tocados] };
}


/**
 * La llamada al modelo. Barato y corto: la tarea es traducir a un JSON
 * pequeño, no pensar un menú. El `system` lo pone el servidor (task "pizarra").
 */
export async function interpretarOrden(frase, contexto, { signal } = {}) {
  const [{ callModel, extractJson }, { FAST_MODEL }] = await Promise.all([
    import("./aiPlanner.js"),
    import("./aiModels.js"),
  ]);
  const texto = await callModel({
    model: FAST_MODEL,
    max_tokens: 700,
    task: "pizarra",
    messages: [{ role: "user", content: `${contexto}\n\nFRASE: ${frase}` }],
  }, signal);
  return extractJson(texto);
}
