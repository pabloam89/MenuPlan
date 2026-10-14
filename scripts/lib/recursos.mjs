/**
 * Los recursos con dueño y caducidad (#581, normas C5, I2 e I9 de la auditoría de agentes):
 * `ops/recursos.json`. Hasta aquí las caducidades de claves, Apps, deploy keys, bóvedas,
 * proyectos y cuentas vivían en texto (ops/INVENTARIO.md y las skills) y nada las contaba.
 *
 * Una entrada por recurso, solo NOMBRES y FECHAS (el repo es público): nunca un valor, ni la
 * ruta de una bóveda privada más allá de lo que ya dice INVENTARIO.md.
 *   id, servicio, tipo, dueno    vocabularios cerrados de aquí
 *   proyecto                     de qué proyecto es (PROYECTOS, scripts/lib/zonasProyecto.mjs). Obligatorio, sin valor por defecto
 *                                (#748). Regla del recurso compartido: va al proyecto que lo paga o lo administra y, si sirve a
 *                                varios sin que ninguno lo administre (Hetzner), a `factoria`.
 *                                Desempate (#770): la cuenta de un servicio va al proyecto al que sirve (los proyectos no pagan: paga
 *                                Pablo); lo que vive dentro de ella (bóveda, clave, deploy key, servidor) va al proyecto al que sirve
 *                                en exclusiva, y a `factoria` si sirve a varios.
 *                                Hetzner: el servidor `HoMenu-Panel` aloja el panel (panel) y la copia nocturna de la base de MenuPlan
 *                                (homenu, #273), así que sirve a dos y va a `factoria`; la bóveda `HoMenu-Panel` guarda lo del servidor y la clave de las copias, igual: `factoria`
 *   creado                       AAAA-MM-DD de alta o de la última rotación, o `por-confirmar`
 *   caducidad                    AAAA-MM-DD, `sin-caducidad` o `por-confirmar`
 *   motivo                       por qué esa caducidad (en `sin-caducidad`, por qué no caduca)
 *   confirma                     quién debe confirmar lo `por-confirmar` (obligatorio si hay alguno)
 *   documentado_en               rutas que existen y hablan de él
 *   norma?                       id de una norma de ops/normas.json que lo exige
 *   rotacion_en_curso?           número del issue que lo está rotando (apaga el aviso del reloj)
 *
 * Lectores (ningún campo sin lector): `ops/recursos.test.js` (la forma) y la sección
 * «Caducidades» del informe semanal (`scripts/cumplimiento.mjs --informe`, workflow
 * `flujo-semanal.yml`, agrupada por `proyecto`), que es donde avisa el reloj (sin bloquear: un test con fecha pondría en rojo todos los PR). La caducidad de las SKILLS no se repite aquí: la calcula
 * `caducidades()` de `skills.mjs`, con su plazo de 90 días y su aviso de 14.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { AVISO_ANTES_DIAS, caducidades as caducidadesDeSkills } from "./skills.mjs";
import { MIEMBROS } from "./eventosVocabulario.mjs";
import { PROYECTOS } from "./zonasProyecto.mjs";

export const RUTA_RECURSOS = "ops/recursos.json";
export const DIA_MS = 24 * 60 * 60 * 1000;

/** Servicios (donde vive el recurso). */
export const SERVICIOS = {
  github: "GitHub: repo, Actions, Apps y deploy keys",
  vercel: "Vercel: equipo, proyecto y tokens",
  supabase: "Supabase: el proyecto de la base y sus roles",
  "1password": "1Password: cuenta, bóvedas y service accounts",
  anthropic: "Anthropic: claves de la API",
  telegram: "Telegram: los bots",
  hetzner: "Hetzner: cuenta y servidor del panel",
  tailscale: "Tailscale: la red privada",
  apple: "Apple: certificados y claves de TestFlight",
};

/** Tipos de recurso. */
export const TIPOS = {
  clave: "una clave o contraseña de un servicio",
  token: "un token de acceso con caducidad propia",
  app: "una App (GitHub App): la App en sí; su clave privada es una entrada de tipo clave",
  "deploy-key": "una deploy key del repo",
  boveda: "una bóveda de 1Password",
  "service-account": "una service account de 1Password",
  "proyecto-servicio": "un proyecto de un servicio (Vercel, Supabase); no es un proyecto de la factoría (campo `proyecto`)",
  servidor: "un servidor",
  cuenta: "una cuenta o un plan en un servicio",
};

export const POR_CONFIRMAR = "por-confirmar";

const TEXTO_DE_DUENO = {
  pablo: "Pablo (`pabloam89`)",
  alvaro: "Álvaro (`algbarc`)",
  // «ambos» sale de los miembros: sus nombres, sin el usuario entre paréntesis.
  ambos: `${MIEMBROS.map((m) => String({ pablo: "Pablo", alvaro: "Álvaro" }[m] ?? m)).join(" y ")} (Owners del equipo de Vercel)`,
  [POR_CONFIRMAR]: "sin confirmar quién es el dueño",
};
/** Dueños: los miembros (`MIEMBROS`, la lista de personas), `ambos` o `por-confirmar` (ver `confirma`). */
export const DUENOS = Object.fromEntries([...MIEMBROS, "ambos", POR_CONFIRMAR].map((d) => [d, TEXTO_DE_DUENO[d]]));
/** Quién puede confirmar lo `por-confirmar`: los dueños menos `por-confirmar` (miembros y `ambos`). */
export const CONFIRMAN = Object.keys(DUENOS).filter((d) => d !== POR_CONFIRMAR);
export const SIN_CAD = "sin-caducidad";

/** Estados de un recurso a una fecha (vocabulario cerrado del informe). */
export const ESTADOS = {
  vencida: "la caducidad ya pasó",
  proxima: `caduca en ${AVISO_ANTES_DIAS} días o menos`,
  en_rotacion: "vencida o próxima, con una rotación en curso (rotacion_en_curso)",
  vigente: "tiene fecha y le queda más del aviso",
  sin_caducidad: "no caduca (el motivo dice por qué)",
  por_confirmar: "la caducidad no se conoce; lo confirma `confirma`",
};

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const esFecha = (s) => typeof s === "string" && FECHA.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const CAMPOS = ["id", "servicio", "proyecto", "tipo", "dueno", "creado", "caducidad", "motivo", "documentado_en"];
const OPCIONALES = ["confirma", "norma", "rotacion_en_curso"];

export function leerRecursos(raiz) {
  return JSON.parse(readFileSync(join(raiz, RUTA_RECURSOS), "utf8"));
}

/** Días que faltan para una fecha (negativo = ya pasó), contando días de Madrid como el resto: UTC al día. */
export function diasHasta(fecha, hoy = new Date()) {
  const hoyDia = Date.parse(`${hoy.toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.round((Date.parse(`${fecha}T00:00:00Z`) - hoyDia) / DIA_MS);
}

/** { estado, dias } de un recurso a una fecha. `dias` es null si no hay fecha de caducidad. */
export function estadoDeRecurso(r, hoy = new Date()) {
  if (r.caducidad === SIN_CAD) return { estado: "sin_caducidad", dias: null };
  if (r.caducidad === POR_CONFIRMAR) return { estado: "por_confirmar", dias: null };
  const dias = diasHasta(r.caducidad, hoy);
  if (dias > AVISO_ANTES_DIAS) return { estado: "vigente", dias };
  if (Number.isInteger(r.rotacion_en_curso)) return { estado: "en_rotacion", dias };
  return { estado: dias < 0 ? "vencida" : "proxima", dias };
}

/** Errores de forma de UN recurso (lista vacía si está bien). `normas`: ids de ops/normas.json. */
export function problemasDeForma(r, { raiz, normas = null } = {}) {
  const id = r?.id ?? "(sin id)";
  const malos = [];
  for (const c of CAMPOS) if (!(c in r)) malos.push(`${id}: falta «${c}»`);
  for (const c of Object.keys(r)) if (!CAMPOS.includes(c) && !OPCIONALES.includes(c)) malos.push(`${id}: campo desconocido «${c}»`);
  if (typeof r.id !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(r.id)) malos.push(`${id}: el id va en minúsculas y con guiones`);
  for (const [campo, vocab] of [["servicio", SERVICIOS], ["tipo", TIPOS], ["dueno", DUENOS]]) {
    if (campo in r && !Object.hasOwn(vocab, r[campo])) malos.push(`${id}: ${campo} «${r[campo]}» no está en el vocabulario (${Object.keys(vocab).join(", ")})`);
  }
  if ("proyecto" in r && !PROYECTOS.includes(r.proyecto)) malos.push(`${id}: proyecto «${r.proyecto}» no es de ${PROYECTOS.join(", ")}`);
  if ("creado" in r && r.creado !== POR_CONFIRMAR && !esFecha(r.creado)) malos.push(`${id}: «creado» es AAAA-MM-DD o «${POR_CONFIRMAR}», no «${r.creado}»`);
  if ("caducidad" in r && ![POR_CONFIRMAR, SIN_CAD].includes(r.caducidad) && !esFecha(r.caducidad)) malos.push(`${id}: «caducidad» es AAAA-MM-DD, «${SIN_CAD}» o «${POR_CONFIRMAR}», no «${r.caducidad}»`);
  if (esFecha(r.creado) && esFecha(r.caducidad) && r.caducidad < r.creado) malos.push(`${id}: caduca (${r.caducidad}) antes de crearse (${r.creado})`);
  if ("motivo" in r && (typeof r.motivo !== "string" || r.motivo.trim().length < 15)) malos.push(`${id}: «motivo» es una frase (15 caracteres o más): por qué esa caducidad`);
  const sinConfirmar = [r.creado, r.caducidad, r.dueno].includes(POR_CONFIRMAR);
  if (sinConfirmar && !(typeof r.confirma === "string" && CONFIRMAN.includes(r.confirma))) malos.push(`${id}: tiene algo «${POR_CONFIRMAR}» y no dice quién lo confirma («confirma»: ${CONFIRMAN.join(", ")})`);
  if (!sinConfirmar && "confirma" in r) malos.push(`${id}: «confirma» sobra: no hay nada «${POR_CONFIRMAR}»`);
  if (!Array.isArray(r.documentado_en) || !r.documentado_en.length) malos.push(`${id}: «documentado_en» es una lista de rutas`);
  else for (const ruta of r.documentado_en) if (raiz && !existsSync(join(raiz, ruta))) malos.push(`${id}: documentado_en «${ruta}» no existe`);
  if ("norma" in r && normas && !normas.includes(r.norma)) malos.push(`${id}: la norma «${r.norma}» no está en ops/normas.json`);
  if ("rotacion_en_curso" in r) {
    if (!Number.isInteger(r.rotacion_en_curso) || r.rotacion_en_curso <= 0) malos.push(`${id}: «rotacion_en_curso» es el número del issue que rota el recurso`);
    if (!esFecha(r.caducidad)) malos.push(`${id}: «rotacion_en_curso» solo con fecha de caducidad`);
  }
  return malos;
}

/** Errores del conjunto: ids repetidos. */
export function problemasDeConjunto(recursos) {
  const vistos = new Set();
  const malos = [];
  for (const r of recursos) {
    if (vistos.has(r.id)) malos.push(`${r.id}: repetido`);
    vistos.add(r.id);
  }
  return malos;
}

/**
 * La regla del reloj: una caducidad vencida o a menos de AVISO_ANTES_DIAS sin rotación en curso es
 * un problema (la lista que usa quien avisa; ningún test la corre con la fecha de hoy); una rotación marcada con la caducidad aún lejos es una marca olvidada.
 */
export function problemasDeReloj(recursos, hoy = new Date()) {
  const malos = [];
  for (const r of recursos) {
    const { estado, dias } = estadoDeRecurso(r, hoy);
    if (estado === "vencida") malos.push(`${r.id}: caducó el ${r.caducidad} (hace ${-dias} días). Rótalo y pon la fecha nueva, o marca «rotacion_en_curso» con su issue`);
    if (estado === "proxima") malos.push(`${r.id}: caduca el ${r.caducidad} (en ${dias} días). Rótalo, o marca «rotacion_en_curso» con su issue`);
    if (Number.isInteger(r.rotacion_en_curso) && esFecha(r.caducidad) && diasHasta(r.caducidad, hoy) > AVISO_ANTES_DIAS) {
      malos.push(`${r.id}: marca una rotación en curso (#${r.rotacion_en_curso}) pero su caducidad (${r.caducidad}) está a más de ${AVISO_ANTES_DIAS} días: quita la marca`);
    }
  }
  return malos;
}

/**
 * Lo que mira el informe semanal: recursos por estado y skills a punto de caducar (reutiliza
 * `caducidades()` de skills.mjs; no recalcula el plazo de 90 días).
 * → { recursos: [{ ...recurso, estado, dias }], skills: [{ nombre, comprobado, dias, estado }] }
 */
export function caducidadesDelRepo(raiz, hoy = new Date()) {
  const recursos = leerRecursos(raiz).recursos.map((r) => ({ ...r, ...estadoDeRecurso(r, hoy) }));
  const skills = caducidadesDeSkills(raiz, hoy).filter((s) => s.estado !== "vigente");
  return { recursos, skills };
}
