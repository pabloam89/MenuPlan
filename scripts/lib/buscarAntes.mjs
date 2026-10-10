/**
 * buscarAntes.mjs — buscar lo ya apuntado ANTES de investigar (#384, fondo #334;
 * es la mitad de lectura que proponía #320).
 *
 * Por qué: el 9 oct 2026 una auditoría de cinco jueces presentó como nuevo lo
 * que ya estaba en issues (#320) y una sesión trató la rama `ccr-…` de la
 * carpeta principal como un misterio cuando otra conversación ya la había
 * investigado y arreglado (#348). Pedir «busca antes» en un texto no basta
 * (CLAUDE.md, «Cuando algo falla»): lo hace el sistema y se lo pone delante a
 * la sesión.
 *
 * Tres piezas, una sola fuente para `npm run buscar`, el hook
 * `.claude/hooks/buscar-antes.mjs` y el arranque:
 *
 *  1. El ÍNDICE: un JSON local (fuera del repo, en la carpeta temporal) con
 *     número, estado, etiquetas, título, resumen, rutas/ramas/mensajes citados,
 *     quién lo lleva y encargos colgados de cada issue, y los PR recientes. Lo
 *     escribe `npm run issues -- --indexar` (y el arranque, con los issues que
 *     ya había leído: ninguna llamada de más). Buscar es leerlo: sin red.
 *  2. La BÚSQUEDA: coincidencia de palabras con peso (una palabra rara pesa más
 *     que una que está en todos los issues) y doble peso para lo citado a
 *     propósito (un fichero, una rama, un texto entre comillas inversas).
 *  3. Las SEÑALES de que algo no encaja, en vocabulario cerrado (SENALES) para
 *     poder contarlas, y la consulta que sale de cada una.
 *
 * Todo es puro salvo `leerIndice`/`escribirIndice`/`ramaDeLaPrincipal`.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { ficherosNombrados, porGrupo, raices } from "./issues.mjs";

/** Versión del formato: si cambia, un índice viejo se descarta y se avisa. */
export const VERSION_INDICE = 1;

/** Horas a partir de las cuales el índice se dice «viejo» (se usa igual, pero se avisa). */
export const HORAS_INDICE_VIEJO = 24;

/** Dónde vive el índice y las marcas de «ya avisado»; `MENUPLAN_BUSCAR_DIR` lo cambia (tests). */
export const dirBuscar = () => process.env.MENUPLAN_BUSCAR_DIR || join(tmpdir(), "menuplan-buscar");
export const rutaIndice = () => join(dirBuscar(), "indice.json");

// ── Qué se guarda de cada issue ──────────────────────────────────────────────

const nombres = (labels) => (labels ?? []).map((l) => l?.name ?? l);

/** Resumen de un cuerpo: sin comentarios HTML ni código, en una línea, tope de 300. */
export function resumirCuerpo(body, tope = 300) {
  return String(body ?? "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#+\s*/gm, "")
    .replace(/[*_>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, tope);
}

const RAMA = /\b(?:ops|bot|datos|ux|fix|feat|motor|rescate|dependabot|claude)\/[\w.\-/]*[\w]|\bccr-[\w-]*\w/gi;

/**
 * Lo que un texto cita a propósito, en minúsculas: ficheros por su nombre,
 * ramas, y lo que va entre comillas inversas (3 a 80 caracteres). Es lo que
 * pesa doble al buscar: quien lo escribió quería que se encontrara.
 */
export function claves(texto) {
  const t = String(texto ?? "");
  const out = new Set(ficherosNombrados(t));
  for (const m of t.matchAll(RAMA)) out.add(m[0].toLowerCase());
  for (const m of t.matchAll(/`([^`\n]{3,80})`/g)) out.add(m[1].trim().toLowerCase().replace(/[.,;:]+$/, ""));
  return [...out].filter(Boolean).slice(0, 40);
}

/** Las palabras con peso de un texto: raíces de 5 letras y, enteras, las claves. */
function terminos(texto, clavesDe = claves(texto)) {
  return { palabras: raices(texto), claves: new Set(clavesDe) };
}

/** Una ficha del índice a partir de un issue ya leído (`todos()` de scripts/issues.mjs). */
export function fichaDeIssue(i) {
  const g = porGrupo(nombres(i.labels));
  const cuerpo = String(i.body ?? "");
  const k = claves(`${i.title}\n${cuerpo}`);
  const resumen = resumirCuerpo(cuerpo);
  return {
    clase: "issue",
    numero: i.number,
    estado: String(i.state).toUpperCase() === "CLOSED" ? "cerrado" : "abierto",
    etiquetas: nombres(i.labels),
    tipo: [...g.tipo][0] ?? null,
    titulo: i.title,
    resumen,
    claves: k,
    palabras: [...raices(`${i.title} ${resumen} ${k.join(" ")}`)],
    lleva: (i.marcas ?? []).map((m) => ({ rama: m.rama, carpeta: m.carpeta })),
    asignados: i.asignados ?? [],
    padre: i.padre ? { numero: i.padre.number, estado: String(i.padre.state).toUpperCase() === "CLOSED" ? "cerrado" : "abierto", tipo: i.padre.tipo ?? null } : null,
    hijos: (i.hijos ?? []).map((h) => ({ numero: h.number, estado: String(h.state).toUpperCase() === "CLOSED" ? "cerrado" : "abierto", tipo: h.tipo ?? null })),
    prs: (i.prs ?? []).map((p) => p.number),
  };
}

/** Una ficha de un PR reciente (consulta `CONSULTA_PR_INDICE`). */
export function fichaDePr(p) {
  const cuerpo = String(p.body ?? "");
  const k = claves(`${p.title}\n${p.headRefName ?? ""}\n${cuerpo}`);
  const resumen = resumirCuerpo(cuerpo, 200);
  return {
    clase: "pr",
    numero: p.number,
    estado: p.mergedAt ? "fusionado" : String(p.state).toUpperCase() === "OPEN" ? "abierto" : "cerrado",
    titulo: p.title,
    rama: p.headRefName ?? null,
    resumen,
    claves: k,
    palabras: [...raices(`${p.title} ${resumen} ${k.join(" ")}`)],
    cierra: [...cuerpo.matchAll(/\b(?:closes|fixes|resolves)\s+#(\d+)/gi)].map((m) => Number(m[1])),
  };
}

/** Los PR recientes, una sola consulta. */
export const CONSULTA_PR_INDICE = `query {
  repository(owner: "pabloam89", name: "MenuPlan") {
    pullRequests(first: 60, orderBy: { field: UPDATED_AT, direction: DESC }) {
      nodes { number title state headRefName mergedAt body }
    }
  }
}`;

/** El índice entero. `prs` son los nodos de la consulta anterior (o [] si no se pudieron leer). */
export function construirIndice(issues, prs = [], ahora = new Date()) {
  return {
    version: VERSION_INDICE,
    generado: ahora.toISOString(),
    fichas: [...issues.map(fichaDeIssue), ...prs.map(fichaDePr)],
  };
}

// ── Leer y escribir ──────────────────────────────────────────────────────────

/** Escribe el índice sin dejar un fichero a medias (otra sesión puede estar leyéndolo). */
export function escribirIndice(indice, ruta = rutaIndice()) {
  mkdirSync(dirname(ruta), { recursive: true });
  const tmp = `${ruta}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(indice));
  renameSync(tmp, ruta);
}

/**
 * El índice y su edad en horas, o { indice: null, motivo } si no hay uno que
 * valga. El motivo es vocabulario cerrado: `ausente`, `ilegible`, `version`.
 */
export function leerIndice(ruta = rutaIndice(), ahora = Date.now()) {
  if (!existsSync(ruta)) return { indice: null, motivo: "ausente" };
  try {
    const indice = JSON.parse(readFileSync(ruta, "utf8"));
    if (indice?.version !== VERSION_INDICE || !Array.isArray(indice.fichas)) return { indice: null, motivo: "version" };
    const desde = Date.parse(indice.generado);
    const horas = Number.isFinite(desde) ? (ahora - desde) / 3_600_000 : (ahora - statSync(ruta).mtimeMs) / 3_600_000;
    return { indice, horas, viejo: horas > HORAS_INDICE_VIEJO };
  } catch {
    // a propósito: no es un error que pare nada; se devuelve el motivo y quien llama lo dice
    return { indice: null, motivo: "ilegible" };
  }
}

/** «hace 3 h», «hace 20 min», «hace 2 días». */
export function hace(horas) {
  if (horas < 1) return `hace ${Math.max(1, Math.round(horas * 60))} min`;
  if (horas < 48) return `hace ${Math.round(horas)} h`;
  return `hace ${Math.round(horas / 24)} días`;
}

/** Una línea sobre el estado del índice, o null si está bien. Para el arranque. */
export function avisoDeIndice(lectura) {
  if (!lectura.indice) {
    const por = { ausente: "no existe", ilegible: "no se puede leer", version: "es de otra versión" }[lectura.motivo] ?? "no vale";
    return `Índice de issues para buscar: ${por}. Créalo con \`npm run issues -- --indexar\`: sin él, el aviso automático de «esto ya está apuntado» no funciona.`;
  }
  if (lectura.viejo) return `Índice de issues para buscar: es de ${hace(lectura.horas)}; refréscalo con \`npm run issues -- --indexar\` (GitHub no contestó al abrir).`;
  return null;
}

// ── Buscar ───────────────────────────────────────────────────────────────────

/** Peso de cada término: ln(1 + N/df). Lo que sale en todas partes pesa poco. */
function pesos(fichas) {
  const df = new Map();
  for (const f of fichas) for (const t of new Set([...f.palabras, ...f.claves.map((c) => `k:${c}`)])) df.set(t, (df.get(t) ?? 0) + 1);
  const N = Math.max(1, fichas.length);
  return (t) => Math.log(1 + N / (df.get(t) ?? 1));
}

/**
 * Las fichas que se parecen a un texto, de más a menos:
 * [{ ficha, parecido (0 a 1), compartidos, claveCompartida }].
 * parecido = peso de lo que comparten / peso de las 5 palabras más raras de la
 * consulta; lo citado a propósito (claves) pesa doble. Una consulta larga no
 * diluye: se mide contra sus 5 términos más pesados, no contra todos.
 */
export function buscar(indice, consulta, { max = 5, minimo = 0 } = {}) {
  const fichas = indice?.fichas ?? [];
  const q = terminos(consulta);
  if (!fichas.length || (!q.palabras.size && !q.claves.size)) return [];
  const peso = pesos(fichas);
  // El término de la consulta, con su peso: palabras como p:raíz y claves como k:clave.
  const terminosQ = [
    ...[...q.palabras].map((t) => ({ t, w: peso(t), clave: false })),
    ...[...q.claves].map((c) => ({ t: `k:${c}`, w: 2 * peso(`k:${c}`), clave: true })),
  ];
  const techo = terminosQ.map((x) => x.w).sort((a, b) => b - a).slice(0, 5).reduce((a, b) => a + b, 0) || 1;
  return fichas
    .map((f) => {
      const suyas = new Set(f.palabras);
      const suyasK = new Set(f.claves.map((c) => `k:${c}`));
      const comunes = terminosQ.filter((x) => (x.clave ? suyasK.has(x.t) : suyas.has(x.t)));
      const suma = comunes.reduce((a, x) => a + x.w, 0);
      return {
        ficha: f,
        parecido: Math.min(1, Math.round((suma / techo) * 100) / 100),
        compartidos: comunes.length,
        claveCompartida: comunes.some((x) => x.clave),
      };
    })
    .filter((r) => r.compartidos > 0 && r.parecido >= minimo)
    .sort((a, b) => b.parecido - a.parecido || (a.ficha.estado === "abierto" ? -1 : 1) - (b.ficha.estado === "abierto" ? -1 : 1) || b.ficha.numero - a.ficha.numero)
    .slice(0, max);
}

const lista = (ns) => ns.map((n) => `#${n}`).join(" ");

/** El plan de un issue: encargos (y casos) colgados, hechos y pendientes. */
export function planDe(f) {
  const hijos = f.hijos ?? [];
  return {
    pendientes: hijos.filter((h) => h.estado === "abierto").map((h) => h.numero),
    hechos: hijos.filter((h) => h.estado === "cerrado").map((h) => h.numero),
  };
}

/** Una línea por resultado: «#348 abierto · encargo: título — lo lleva …; plan: …». */
export function lineaDeResultado(r) {
  const f = r.ficha;
  if (f.clase === "pr") {
    return `PR #${f.numero} (${f.estado}${f.rama ? `, rama ${f.rama}` : ""}${f.cierra?.length ? `, cierra ${lista(f.cierra)}` : ""}): ${f.titulo}`;
  }
  const partes = [`${f.estado}${f.tipo ? `, ${f.tipo}` : ""}`];
  if (f.lleva.length) partes.push(`lo lleva ${f.lleva.map((l) => l.rama).join(", ")}`);
  else if (f.asignados.length) partes.push(`asignado a ${f.asignados.join(", ")}`);
  if (f.padre) partes.push(`cuelga de #${f.padre.numero} (${f.padre.estado})`);
  const plan = planDe(f);
  if (plan.pendientes.length || plan.hechos.length) {
    partes.push(`plan: ${plan.pendientes.length ? `pendientes ${lista(plan.pendientes)}` : "nada pendiente"}${plan.hechos.length ? `, hechos ${lista(plan.hechos)}` : ""}`);
  }
  if (f.prs?.length) partes.push(`PR ${lista(f.prs)}`);
  return `#${f.numero} (${partes.join("; ")}): ${f.titulo.replace(/^\[[^\]]+\]\s*/, "")}`;
}

// ── Las señales de que algo no encaja ────────────────────────────────────────

/** Vocabulario cerrado de señales (se cuentan; ver `.claude/hooks/buscar-antes.mjs`). */
export const SENALES = {
  "rama-principal": "La carpeta principal está en una rama que no es staging",
  "agente-no-existe": "Un agente que no carga («Agent type … not found»)",
  "denegacion-guardia": "La guardia ha negado una orden",
  "test-rojo": "Un test ajeno falla (no el que acabas de lanzar por su nombre)",
  error: "Una excepción o un error con nombre",
  "no-encontrado": "Algo no se encuentra (comando, módulo, ruta)",
  "salida-no-cero": "Un comando acaba con código distinto de 0 sin una causa conocida",
};

/**
 * Señales que SIEMPRE hablan, aunque no haya nada apuntado («no lo des por un
 * misterio»): son raras y casi siempre son un fallo del sistema. Las demás
 * (tests rojos, errores de un comando) son el pan de cada día del trabajo —
 * CLAUDE.md pide ver fallar un test nuevo—, así que solo hablan cuando hay algo
 * apuntado que decir.
 */
export const SENALES_QUE_SIEMPRE_HABLAN = new Set(["rama-principal", "agente-no-existe", "denegacion-guardia"]);

/** Herramientas cuya salida es de un comando; en las demás solo cuentan los fallos de la herramienta. */
const DE_COMANDO = new Set(["Bash", "PowerShell"]);
const DE_AGENTE = new Set(["Agent", "Task", "Skill"]);

/** Órdenes cuyo código 1 es una respuesta («no hay coincidencias»), no un fallo. */
const CODIGO_1_NORMAL = /^\s*(?:(?:cd\s+\S+\s*(?:&&|;)\s*)?(?:grep|egrep|rg|diff|test|\[|findstr|cmp|git\s+(?:diff|grep)|git\s+merge-base\s+--is-ancestor|select-string|sls)\b)/i;

const ERROR_CON_NOMBRE = /^\s*(?:(?:Uncaught\s+)?(?:Type|Reference|Syntax|Range|Eval|URI)?Error|AssertionError|Traceback \(most recent call last\)|fatal:|error:|panic:|Unhandled|npm error|npm ERR!)\b/im;
const PILA = /^\s+at\s+\S+\s+\(.+:\d+:\d+\)\s*$|^\s+at\s+\S+:\d+:\d+\s*$/m;
const TEST_ROJO = /^\s*(?:FAIL|×|✗)\s+\S+|^\s*Tests?\s+(?:Files\s+)?\d+\s+failed|^\s*\d+ failed\b/im;
const NO_ENCONTRADO = /\bnot found\b|No such file or directory|is not recognized as|Cannot find (?:module|package)|ENOENT|MODULE_NOT_FOUND|no se encuentra|no existe/i;

const recorta = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const nombreFichero = (s) => String(s).replace(/^.*[\\/]/, "");
const unicos = (xs) => [...new Set(xs)];

/**
 * Lo que dice una herramienta, como texto: la salida de un comando
 * (`stdout` + `stderr`), el `error` de un fallo, o el contenido de texto. Sin
 * parar en el formato exacto: Claude Code ha cambiado la forma de
 * `tool_response` entre versiones.
 */
export function textoDe(entrada) {
  const partes = [];
  const r = entrada?.tool_response;
  if (typeof r === "string") partes.push(r);
  else if (r && typeof r === "object") {
    for (const k of ["stdout", "stderr", "output", "error", "message"]) if (typeof r[k] === "string") partes.push(r[k]);
    if (Array.isArray(r.content)) for (const c of r.content) if (typeof c?.text === "string") partes.push(c.text);
  }
  if (typeof entrada?.error === "string") partes.push(entrada.error);
  return partes.join("\n");
}

/** ¿Es un fallo de la herramienta (PostToolUseFailure o `error`) y no una salida normal? */
export const esFallo = (entrada) => /Failure/i.test(String(entrada?.hook_event_name ?? "")) || typeof entrada?.error === "string"
  || entrada?.tool_response?.is_error === true || entrada?.tool_response?.isError === true;

/** El código de salida si el texto lo dice («Exit code 2»), o null. */
export function codigoDe(texto) {
  const m = /^Exit code (\d+)/m.exec(String(texto ?? ""));
  return m ? Number(m[1]) : null;
}

/** Los ficheros de un texto, sin los comunes, tope de 6. */
const ficheros = (texto) => [...ficherosNombrados(texto)].slice(0, 6);

/** La orden de la herramienta (`tool_input.command`), o ''. */
const ordenDe = (entrada) => String(entrada?.tool_input?.command ?? "");

/** El script que lanza una orden (`node scripts/x.mjs` → `x.mjs`), para añadirlo a la consulta. */
function scriptDe(orden) {
  const m = /\b(?:node|npx|vitest)\s+(?:run\s+)?(?:[\w./\\-]*[\\/])?([\w.-]+\.(?:mjs|js|cjs))/i.exec(orden) ?? /\bnpm run (\S+)/.exec(orden);
  return m ? m[1] : "";
}

/**
 * Las señales de una llamada a una herramienta: [{ tipo, clave, consulta, extracto }].
 * `clave` identifica la señal para no repetirla en la sesión; `consulta` es lo
 * que se busca en el índice; `extracto` es la frase corta que se enseña.
 *
 * Reglas para no cansar (medido contra transcripciones reales, ver el informe de #384):
 *  - Una salida con éxito de un comando solo cuenta si trae un fallo inequívoco
 *    (test rojo, error con nombre y pila, denegación de la guardia).
 *  - En Read/Grep/Glob no se mira el texto: es contenido de ficheros.
 *  - En agentes y skills solo cuenta el fallo de la herramienta y «Agent type … not found».
 *  - «No encontrado» solo en comandos y agentes, y solo si falló.
 */
export function detectarSenales(entrada) {
  const tool = String(entrada?.tool_name ?? "");
  const texto = textoDe(entrada);
  const fallo = esFallo(entrada);
  const out = [];
  const orden = ordenDe(entrada);

  // 1) Un agente que no carga: dice su nombre.
  const agente = /Agent type '([^']+)' not found/i.exec(texto);
  if (agente && (DE_AGENTE.has(tool) || fallo)) {
    out.push({ tipo: "agente-no-existe", clave: `agente:${agente[1].toLowerCase()}`, consulta: `Agent type ${agente[1]} not found: los agentes dejaron de cargarse, carpeta principal en otra rama sin .claude/agents`, extracto: `Agent type '${agente[1]}' not found` });
  }

  if (DE_COMANDO.has(tool) || fallo) {
    // 2) La guardia niega: el motivo va tras «[guardia]».
    const g = /\[guardia\]\s*([^\n]{10,500})/i.exec(texto);
    if (g) {
      out.push({ tipo: "denegacion-guardia", clave: `guardia:${recorta(g[1], 70).toLowerCase()}`, consulta: `${recorta(g[1], 400)} ${recorta(orden, 120)}`, extracto: `guardia: ${recorta(g[1], 110)}` });
    }
  }

  const leeComando = DE_COMANDO.has(tool);
  const leeFallo = fallo && (leeComando || DE_AGENTE.has(tool) || tool === "");
  if (leeComando || leeFallo) {
    // 3) Un test rojo: el fichero y el nombre del test.
    if (TEST_ROJO.test(texto) && (fallo || leeComando)) {
      const rojos = [...texto.matchAll(/^\s*(?:FAIL|×|✗)\s+(.+)$/gim)].map((m) => m[1].trim()).slice(0, 4);
      const fichs = unicos(rojos.flatMap((r) => ficheros(r))).slice(0, 4);
      // Un test rojo es «ajeno» si no lo lanzaste por su nombre: el que estás escribiendo o arreglando falla a propósito.
      const ajenos = fichs.filter((f) => !orden.toLowerCase().includes(f.toLowerCase()));
      if ((rojos.length || fallo) && (ajenos.length || !fichs.length)) {
        out.push({
          tipo: "test-rojo",
          clave: `test:${(fichs.join(",") || recorta(rojos[0], 60)).toLowerCase()}`,
          consulta: `test rojo ${rojos.map((r) => recorta(r, 140)).join(" ")} ${scriptDe(orden)}`,
          extracto: `test rojo${fichs.length ? ` en ${fichs.join(", ")}` : ""}`,
        });
      }
    }
    // 4) Un error con nombre. Si salió con éxito, solo con pila o con «Error:» al empezar línea Y un test/script fallido ya no cubierto.
    const err = ERROR_CON_NOMBRE.exec(texto);
    const conPila = PILA.test(texto);
    if (err && (fallo || conPila) && !out.some((s) => s.tipo === "test-rojo")) {
      const linea = recorta(texto.slice(err.index).split("\n").find((l) => l.trim()) ?? err[0], 200);
      const fichs = ficheros(texto).slice(0, 3);
      out.push({
        tipo: "error",
        clave: `error:${linea.toLowerCase().replace(/\d+/g, "#").replace(/[a-z]:[\\/][^\s:]+/gi, "<ruta>").slice(0, 70)}`,
        consulta: `${linea} ${fichs.join(" ")} ${scriptDe(orden)}`,
        extracto: `error: ${recorta(linea, 110)}`,
      });
    }
    // 5) No se encuentra algo (solo si falló; no con éxito).
    if (fallo && NO_ENCONTRADO.test(texto) && !out.some((s) => ["agente-no-existe", "test-rojo", "error"].includes(s.tipo))) {
      const linea = recorta(texto.split("\n").find((l) => NO_ENCONTRADO.test(l)) ?? "", 200);
      out.push({
        tipo: "no-encontrado",
        clave: `no-encontrado:${linea.toLowerCase().replace(/\d+/g, "#").slice(0, 70)}`,
        consulta: `${linea} ${scriptDe(orden)}`,
        extracto: `no encontrado: ${recorta(linea, 110)}`,
      });
    }
    // 6) Código de salida distinto de 0 sin causa conocida: con salida que lo explique y que no sea «sin coincidencias».
    const codigo = codigoDe(texto);
    if (leeComando && fallo && codigo && !out.length) {
      const util = texto.replace(/^Exit code \d+\s*/m, "").trim();
      const normal = codigo === 1 && CODIGO_1_NORMAL.test(orden);
      if (util && !normal) {
        out.push({
          tipo: "salida-no-cero",
          clave: `salida:${scriptDe(orden) || recorta(orden, 40).toLowerCase()}:${codigo}`,
          consulta: `${recorta(util, 300)} ${scriptDe(orden)}`,
          extracto: `salió con código ${codigo}: ${recorta(util, 100)}`,
        });
      }
    }
  }
  return out;
}

/**
 * La señal de la carpeta principal fuera de staging (#348). `rama` es la que
 * tiene ahora; null si no es la carpeta principal o no se sabe.
 */
export function senalDeRamaPrincipal(rama) {
  if (!rama || rama === "staging") return null;
  return {
    tipo: "rama-principal",
    clave: `rama:${rama.toLowerCase()}`,
    consulta: `carpeta principal rama ${rama} ${rama}`,
    extracto: `la carpeta principal está en la rama ${rama}, no en staging`,
  };
}

/**
 * La rama de la carpeta principal, mirando solo ficheros (sin lanzar git: va
 * en cada llamada). Sube desde `cwd` hasta un `.git`; si es una carpeta es la
 * principal (en un worktree `.git` es un fichero) y se lee su HEAD. Devuelve
 * { principal: bool, rama } ; rama '(suelta)' si HEAD apunta a un commit.
 */
export function ramaDeLaPrincipal(cwd) {
  let dir = String(cwd ?? "");
  for (let i = 0; dir && i < 12; i++) {
    const git = join(dir, ".git");
    if (existsSync(git)) {
      if (!statSync(git).isDirectory()) return { principal: false, rama: null };
      const head = readFileSync(join(git, "HEAD"), "utf8").trim();
      const m = /^ref:\s*refs\/heads\/(.+)$/.exec(head);
      return { principal: true, rama: m ? m[1] : "(suelta)" };
    }
    const padre = dirname(dir);
    if (padre === dir) break;
    dir = padre;
  }
  return { principal: false, rama: null };
}

// ── Qué se le dice a la sesión ───────────────────────────────────────────────

/**
 * Los resultados que merecen aparecer en un aviso automático: más estricto que
 * `buscar` a secas para no cansar. Hace falta una clave compartida (fichero,
 * rama, texto citado) con parecido razonable, o muchas palabras raras en común.
 */
export function relevantes(resultados) {
  return resultados.filter((r) => (r.claveCompartida && r.parecido >= 0.3) || (r.compartidos >= 3 && r.parecido >= 0.55));
}

/** El texto que recibe la sesión para una señal. */
export function textoDeAviso(senal, resultados, lectura) {
  const cabeza = `[buscar-antes] Algo no encaja (${senal.extracto}).`;
  const edad = lectura?.horas != null ? ` (índice ${hace(lectura.horas)}, ${lectura.indice.fichas.length} fichas)` : "";
  const hay = relevantes(resultados).slice(0, 3);
  if (hay.length) {
    return `${cabeza} ESTO YA ESTÁ APUNTADO${edad}: ${hay.map(lineaDeResultado).join(" | ")}. `
      + "Léelo antes de investigar (`gh issue view <n>`); si lo tuyo es otro caso del mismo fondo, cuélgalo (`npm run issues -- --nuevo … --padre <fondo>`). "
      + "Si no tiene que ver, ignóralo: este aviso no se repite en la sesión.";
  }
  return `${cabeza} No hay nada apuntado que se parezca${edad}. Antes de darlo por nuevo, busca con otras palabras: \`npm run buscar -- "<síntoma>"\`. `
    + "Si es nuevo, regístralo con `npm run issues -- --nuevo …`; no lo des por un misterio. Este aviso no se repite en la sesión.";
}

// ── `--crear-igual` con motivo (pieza 5) ─────────────────────────────────────

/** Caracteres que tiene que tener el motivo: «son falsos» no es un motivo. */
export const MIN_MOTIVO_CREAR_IGUAL = 15;

/**
 * El motivo que acompaña a `--crear-igual "<motivo>"`: { dado: false } si el
 * flag no está, { dado: true, motivo } si vale, { dado: true, error } si falta
 * o es demasiado corto.
 */
export function motivoCrearIgual(args) {
  const i = args.indexOf("--crear-igual");
  if (i < 0) return { dado: false };
  const m = args[i + 1];
  if (!m || m.startsWith("--")) return { dado: true, error: '--crear-igual necesita su motivo: --crear-igual "por qué los parecidos no lo son"' };
  if (m.trim().length < MIN_MOTIVO_CREAR_IGUAL) return { dado: true, error: `El motivo de --crear-igual es muy corto (${MIN_MOTIVO_CREAR_IGUAL} caracteres o más): di por qué cada parecido no es lo mismo.` };
  return { dado: true, motivo: m.trim() };
}

/** La línea que se añade al cuerpo del issue creado saltándose parecidos. */
export function lineaParecidosIgnorados(numeros, motivo) {
  return `Parecidos ignorados: ${numeros.length ? numeros.map((n) => `#${n}`).join(", ") : "ninguno"} — ${String(motivo).replace(/\s+/g, " ")}`;
}

/** Cuántos issues se crearon saltándose parecidos (llevan la línea anterior). */
export function contarParecidosIgnorados(issues) {
  return issues.filter((i) => /^Parecidos ignorados:/m.test(String(i.body ?? ""))).length;
}
