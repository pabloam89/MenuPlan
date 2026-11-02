/**
 * La Rutina con ámbito (plan fichas con estado, trozo 13): los datos que van por hueco (quién come dónde, cómo es
 * cada hueco, qué días de cada semana, la estructura de cada grupo) entre los sobres por hueco de ficha_casa
 * (0114-0116) y la forma en que la app, Lola y el motor los leen hoy en data (mapas con claves «persona|día|comida»,
 * «día|comida», lunes ISO o id de grupo).
 *
 * Una sola regla de clave para todos: la persona (si el campo es de persona) y las dimensiones de su ámbito, en el
 * orden de DIMENSIONES_AMBITO, unidas por «|» (es la de slotKey, planner.js, en schedule). Así un campo nuevo con
 * ámbito entra solo, sin una función por campo.
 *
 * Leer: rutinaDeFichas da, de los elementos de ficha_casa, el mapa de cada campo con ámbito, con lo dicho en cada
 * hueco; lo que nadie ha dicho no sale (vale lo de siempre: «casa», hueco normal, los días por defecto).
 * Escribir: datosDeCambio da, de un mapa antes y después, los datos de la operación de cada hueco que cambia;
 * quitar un hueco es escribirlo vacío (valor null), que al leer tampoco sale.
 *
 * Con la 0116 aplicada (2 nov 2026), cada elemento dice su ámbito: uno sin «ambito» lanza, como lo que no cuadra (un
 * ámbito que no es el del campo, una clave rota): un horario mal leído no es un horario vacío. Pura: sin Supabase ni import.meta, la usan la app y el servidor.
 */
import { REGISTRO_CAMPOS } from "./registroCampos.js";
import { CLAVE_DE_DIMENSION, DatoInvalido, datoValido } from "./escribirDato.js";

/** Los campos del registro con ámbito, cada uno con sus dimensiones (registro_campo.ambito). */
export const CAMPOS_CON_AMBITO = Object.freeze(Object.fromEntries(
  Object.entries(REGISTRO_CAMPOS).filter(([, c]) => c.ambito.length > 0).map(([id, c]) => [id, c.ambito]),
));

const SEPARADOR = "|";
const esDePersona = (campo) => REGISTRO_CAMPOS[campo].por === "persona";

/** Pura. La clave en el mapa de data de un hueco de `campo`: su persona (si es de persona) y su ámbito, en orden. */
export function claveEnData(campo, { persona_id = null, ...ambito }) {
  const dims = CAMPOS_CON_AMBITO[campo];
  if (!dims) throw new Error(`rutina: «${campo}» no tiene ámbito en el registro`);
  const partes = [...(esDePersona(campo) ? [persona_id] : []), ...dims.map((d) => ambito[CLAVE_DE_DIMENSION[d]])];
  if (partes.some((p) => p == null || String(p) === "" || String(p).includes(SEPARADOR))) {
    throw new Error(`rutina: el hueco de «${campo}» no tiene ${esDePersona(campo) ? "persona y " : ""}${dims.join(", ")}`);
  }
  return partes.join(SEPARADOR);
}

/** Pura. El hueco ({persona_id?, grupo_id?, semana?, dia?, comida?}) de una clave del mapa de data de `campo`. */
export function huecoDeClave(campo, clave) {
  const dims = CAMPOS_CON_AMBITO[campo];
  if (!dims) throw new Error(`rutina: «${campo}» no tiene ámbito en el registro`);
  const partes = String(clave).split(SEPARADOR);
  const persona = esDePersona(campo) ? [partes.shift()] : [];
  if (partes.length !== dims.length || [...persona, ...partes].some((p) => !p)) {
    throw new DatoInvalido(`«${campo}»: la clave «${clave}» no es ${esDePersona(campo) ? "persona|" : ""}${dims.join("|")}`);
  }
  return { ...(persona.length ? { persona_id: persona[0] } : {}), ...Object.fromEntries(dims.map((d, i) => [CLAVE_DE_DIMENSION[d], partes[i]])) };
}

/**
 * Pura. De los elementos de ficha_casa (los de «fichas», de una o varias fichas), el mapa de data de cada campo
 * con ámbito que la ficha trae con su ámbito: `{ schedule: { "p1|Lun|Comida": "fuera" }, … }`. Solo lo dicho
 * (con sobre y valor); la base (ambito null) dice que el campo está, aunque nadie haya dicho nada (mapa vacío).
 * Lanza si el ámbito de un elemento no es el de su campo.
 */
export function rutinaDeFichas(elementos) {
  if (!Array.isArray(elementos)) throw new Error("rutina: los elementos de ficha_casa no son una lista");
  const mapas = {};
  for (const e of elementos) {
    const dims = CAMPOS_CON_AMBITO[e?.campo];
    if (!dims) continue;
    if (!Object.hasOwn(e, "ambito")) throw new Error(`rutina: «${e.campo}» llega sin ámbito (ficha_casa de antes de la 0116)`);
    mapas[e.campo] ??= {};
    if (e.ambito === null) continue;
    const claves = Object.keys(e.ambito).sort();
    const esperadas = dims.map((d) => CLAVE_DE_DIMENSION[d]).sort();
    if (claves.join() !== esperadas.join()) {
      throw new Error(`rutina: «${e.campo}» va por ${dims.join(", ")} y ficha_casa da un ámbito con ${claves.join(", ") || "nada"}`);
    }
    if (e.origen == null || e.valor == null) continue;
    mapas[e.campo][claveEnData(e.campo, { persona_id: e.sujeto?.id ?? null, ...e.ambito })] = e.valor;
  }
  return mapas;
}

/**
 * Pura. Los datos de la operación (escribirDato.js, datoValido) de cada hueco de `campo` que cambia entre dos mapas
 * de data, en el orden de sus claves. Un hueco que se quita va vacío (valor null). Lanza DatoInvalido si una clave
 * o un valor no cuadran con el registro.
 *
 * `familia` ({ personas, grupos }: los ids que quedan en la casa tras el cambio), si se da: quitar el hueco de una
 * persona o un grupo que ya no está no se escribe, porque su sobre se fue con ella (on delete cascade, 0097 y
 * 0114) y escribirlo pediría una persona que la base ya no tiene. Un hueco con valor de alguien que no está sí
 * sale, y la base lo rechaza: no se tira en silencio.
 */
export function datosDeCambio(campo, antes = {}, despues = {}, { origen, familia = null }) {
  if (!CAMPOS_CON_AMBITO[campo]) throw new DatoInvalido(`«${campo}» no tiene ámbito en el registro`);
  const claves = [...new Set([...Object.keys(antes ?? {}), ...Object.keys(despues ?? {})])].sort();
  const sigue = (d) => (d.persona_id == null || familia.personas.includes(d.persona_id)) && (d.grupo_id == null || familia.grupos.includes(d.grupo_id));
  return claves
    .filter((k) => JSON.stringify(antes?.[k] ?? null) !== JSON.stringify(despues?.[k] ?? null))
    .map((k) => datoValido({ campo, ...huecoDeClave(campo, k), valor: despues?.[k] ?? null, origen }))
    .filter((d) => !familia || d.valor !== null || sigue(d));
}

/** Pura. Los ids que quedan en la casa para datosDeCambio, de members y groups de data (los que no son lista, ninguno). */
export const familiaDeData = (data) => ({
  personas: (Array.isArray(data?.members) ? data.members : []).map((m) => String(m.id)),
  grupos: (Array.isArray(data?.groups) ? data.groups : []).map((g) => String(g.id)),
});
