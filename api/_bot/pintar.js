/**
 * pintarMenu: UNA pieza que pinta cualquier trozo del menú, con filtros. La
 * usan la vía rápida (rapido.js, turno.js) y Lola (entregar() pone la lista
 * debajo de su frase), así que el modelo nunca escribe la lista de platos: era
 * lo lento y lo que a veces salía mal.
 *
 *   pintarMenu(casa, { dias, comidas, platos, grupo, destacar })
 *
 *   dias      fechas ISO (pueden caer en dos semanas del menú: casa.semanas)
 *   comidas   ids del catálogo (src/lib/comidas.js); sin ellas, las que planifica la casa
 *   platos    "primero" | "principal"; sin ellos, el principal y el primero si lo hay
 *   grupo     para quién (un grupo de menú: «el bebé», «los peques», «Leo»); sin
 *             él, toda la casa, con los grupos en cursiva solo si comen distinto
 *   destacar  [{ fecha, comida }]: lo que se acaba de poner o pedir. Va en
 *             negrita y con ✨ detrás («🍽️ Lentejas + <b>Salmón al horno</b> ✨»):
 *             se ve sin tener que leer, y la negrita sola no basta porque el
 *             día ya va en negrita.
 *
 * Formato: cada día en negrita, sin 📆 («<b>Sábado 4 de octubre</b>»), y debajo
 * una línea por comida con su icono del catálogo. Fotos solo si es un día.
 *
 * Sin el motor (~2 s en frío): los nombres salen de las recetas guardadas con
 * el menú (state.aiRecipes) y las fotos del manifiesto de imágenes.
 */

import fs from "node:fs";
import { comida as delCatalogo, comidasDeLaCasa, iconoDe } from "../../src/lib/comidas.js";
import { diaDeFecha, sumarDias } from "./cuando.js";
import { grupos as gruposDeLaCasa, grupoPara, quienesDe, cambiosDe, normal } from "./menu.js";

const DIA_LARGO = { Lun: "lunes", Mar: "martes", "Mié": "miércoles", Jue: "jueves", Vie: "viernes", "Sáb": "sábado", Dom: "domingo" };
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
// Telegram corta a 4096; con margen para la frase de Lola encima.
const MAX_CARACTERES = 3500;
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const mayus = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

let manifiesto = null;
function fotoDe(receta) {
  if (!receta) return null;
  if (receta.photo && /^https?:/.test(receta.photo)) return receta.photo;
  if (!manifiesto) {
    try { manifiesto = JSON.parse(fs.readFileSync(new URL("../../src/assets/dishes/dishImages.json", import.meta.url), "utf8")); } catch { manifiesto = {}; }
  }
  const id = String(receta.baseRecipeId ?? receta.linkedCatalogId ?? receta.id ?? "").split("__").pop();
  return manifiesto[id] ?? null;
}

/**
 * Lo que se pinta debajo tras generar un menú: la semana generada, con lo que
 * pidieron destacado. `out` es el de generarMenu (desde, hasta, colocados
 * «Jue-Comida»).
 */
export function filtrosTrasGenerar(out) {
  if (!out?.desde || !out?.hasta) return null;
  const dias = [];
  for (let d = out.desde; d <= out.hasta && dias.length < 14; d = sumarDias(d, 1)) dias.push(d);
  const destacar = (out.colocados ?? []).map((clave) => {
    const [dia, comida] = String(clave).split("-");
    const fecha = dias.find((f) => diaDeFecha(f) === dia);
    return fecha ? { fecha, comida } : null;
  }).filter(Boolean);
  return { dias, destacar };
}

/** Tras cambiar un plato: ese día, con el hueco cambiado destacado. */
export function filtrosTrasCambiar(out) {
  if (!out?.cambiado || !out?.fecha) return null;
  return { dias: [out.fecha], destacar: [{ fecha: out.fecha, comida: out.franja }] };
}

/** Quita el HTML: lo pintado, en texto, para que Lola razone con ello (sin copiarlo). */
export const sinEtiquetas = (t) => String(t ?? "").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** «Sábado 4 de octubre» */
export function tituloDia(fecha) {
  return `${mayus(DIA_LARGO[diaDeFecha(fecha)])} ${Number(fecha.slice(8, 10))} de ${MESES[Number(fecha.slice(5, 7)) - 1]}`;
}

function recetasDe(state) {
  const porId = new Map();
  for (const r of [...(state?.aiRecipes ?? []), ...(state?.data?.userRecipes ?? [])]) {
    if (!r?.id) continue;
    porId.set(r.id, r);
    if (!porId.has(String(r.id).split("__").pop())) porId.set(String(r.id).split("__").pop(), r);
  }
  return (id) => (id ? porId.get(id) ?? porId.get(String(id).split("__").pop()) ?? null : null);
}

/**
 * @returns {{ texto: string, fotos: {url: string, pie: string}[], conMenu: number, sinMenu: string[], noPlanificadas: string[], recortado: boolean } }
 *   conMenu: cuántos días tenían algo; sinMenu: los que no; noPlanificadas: comidas
 *   pedidas que la casa no planifica.
 */
export function pintarMenu(casa, { dias = [], comidas = null, platos = null, grupo = null, destacar = [] } = {}) {
  const data = casa?.state?.data ?? {};
  const deLaCasa = comidasDeLaCasa(data);
  const pedidas = comidas?.length ? comidas : deLaCasa;
  const noPlanificadas = pedidas.filter((c) => !deLaCasa.includes(c));
  const aPintar = pedidas.filter((c) => deLaCasa.includes(c));
  const receta = recetasDe(casa?.state);
  const miembros = data.members ?? [];
  const destacado = (fecha, c) => destacar.some((d) => (d.fecha ?? fecha) === fecha && d.comida === c);
  const lineasAvisos = noPlanificadas.map((c) => {
    const cat = delCatalogo(c);
    return cat?.tipo === "futuro"
      ? `${iconoDe(c)} Los ${cat.plural} todavía no los preparo.`
      : `${iconoDe(c)} No te planifico ${cat?.plural ?? String(c).toLowerCase()}. ¿Quieres que los añada?`;
  });

  const bloques = [];
  const fotos = [];
  const sinMenu = [];
  let conMenu = 0;
  // Si todo lo pedido es algo que la casa no planifica, basta con decirlo.
  for (const fecha of aPintar.length ? dias : []) {
    const semana = (casa?.semanas ?? []).find((w) => w.weekStart <= fecha && fecha <= w.weekEnd) ?? null;
    const plan = semana?.plan;
    const dia = diaDeFecha(fecha);
    if (!plan) { sinMenu.push(fecha); bloques.push(`<b>${tituloDia(fecha)}</b>\nNo hay menú para este día.`); continue; }
    // Los grupos de menú de esa semana (o el que han pedido).
    const todos = gruposDeLaCasa({ ...casa, semana }).filter((g) => plan[g.id]);
    const elegido = grupo ? todos.find((g) => normal(g.label) === normal(grupo)) ?? grupoPara(todos, miembros, grupo) : null;
    const gs = elegido ? [elegido] : todos;
    const lineas = [];
    for (const c of aPintar) {
      const porGrupo = gs.map((g) => {
        const h = plan[g.id]?.[`${dia}-${c}`];
        if (!h) return null;
        const ids = (platos?.length ? platos : ["primero", "principal"])
          .map((p) => (p === "primero" ? h.firstRecipeId : h.recipeId)).filter(Boolean);
        const nombres = ids.map((id) => {
          const r = receta(id);
          const nombre = r?.name ?? null;
          if (!nombre) return null;
          if (dias.length === 1 && fotos.length < 10) {
            const url = fotoDe(r);
            if (url && !fotos.some((f) => f.url === url)) fotos.push({ url, pie: nombre });
          }
          const cambios = cambiosDe(r);
          return `${esc(nombre)}${cambios ? ` <i>(${esc(cambios)})</i>` : ""}`;
        }).filter(Boolean);
        if (!nombres.length) return null;
        return { g, texto: nombres.join(" + ") };
      }).filter(Boolean);
      if (!porGrupo.length) continue;
      const marca = (t) => (destacado(fecha, c) ? `<b>${t}</b> ✨` : t);
      const iguales = new Set(porGrupo.map((x) => x.texto)).size === 1;
      if (iguales || elegido) lineas.push(`${iconoDe(c)} ${marca(porGrupo[0].texto)}`);
      else for (const x of porGrupo) lineas.push(`${iconoDe(c)} <i>${esc(quienesDe(x.g, miembros) ?? x.g.label)}:</i> ${marca(x.texto)}`);
    }
    if (!lineas.length) { sinMenu.push(fecha); bloques.push(`<b>${tituloDia(fecha)}</b>\nNada planificado.`); continue; }
    conMenu++;
    bloques.push(`<b>${tituloDia(fecha)}</b>\n${lineas.join("\n")}`);
  }

  // Recorte por días: lo que no cabe, al botón de la app.
  let recortado = false;
  const cuerpo = [];
  let largo = lineasAvisos.join("\n").length;
  for (const b of bloques) {
    if (largo + b.length + 2 > MAX_CARACTERES) { recortado = true; break; }
    cuerpo.push(b);
    largo += b.length + 2;
  }
  const partes = [...(lineasAvisos.length ? [lineasAvisos.join("\n")] : []), ...cuerpo];
  if (recortado) partes.push(`<i>…y ${bloques.length - cuerpo.length} día${bloques.length - cuerpo.length > 1 ? "s" : ""} más: míralos en la app con el botón.</i>`);
  return { texto: partes.join("\n\n"), fotos, conMenu, sinMenu, noPlanificadas, recortado };
}
