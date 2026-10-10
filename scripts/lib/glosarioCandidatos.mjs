/**
 * Candidatos a término del glosario (#481, fondo #479): la revisión periódica que
 * amplía el glosario sin esperar a que alguien lo pida.
 *
 * Cuenta, en la prosa de las zonas del glosario (la misma limpieza que el control:
 * sin código, rutas, citas «» ni secciones de historia), las palabras y los pares de
 * palabras que se repiten y que NO están como término ni como sinónimo. Cada uno sale
 * como una línea contable:
 *
 *   candidato: <x> apariciones: <n> ficheros: <k>
 *
 * Un agente juzga cada candidato (vocabulario JUICIOS, con un motivo de MOTIVOS_JUICIO y
 * el texto libre en «detalle») y deja el juicio en
 * `ops/glosario-candidatos.json`, el hueco declarado. Un candidato juzgado no vuelve a
 * salir. Si el mismo juicio y motivo se repiten en REPETICIONES_REGLA juicios o más, se propone
 * como regla (p. ej. ampliar PALABRAS_VACIAS), en vez de juzgarlo uno a uno.
 *
 * Es léxico y sin lematizar: dos palabras son la misma si comparten las RAIZ letras
 * del principio sin tildes («comprueba» es «comprobar»). Un candidato no es un fallo:
 * no bloquea nada; solo se cuenta y se juzga.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { comparar, ficherosDe, leerExcepciones, leerGlosario, medir, plano, prohibidosDe, prosaDeJson, prosaDeMarkdown, total } from "./glosario.mjs";

export const RUTA_JUICIOS = "ops/glosario-candidatos.json";

/** Qué se decide de un candidato. */
export const JUICIOS = {
  termino_nuevo: "Es una palabra de proceso con un significado propio: se añade al glosario",
  sinonimo: "Dice lo mismo que un término que ya existe (sinonimo_de); se escribe el término",
  nada: "No es una palabra de proceso o es de uso general: no entra",
};

/** Letras del principio con que se comparan dos palabras: como la heurística de la higiene. */
export const RAIZ = 5;
/** Una palabra suelta, con 5 letras o más (las cortas son casi todas gramaticales). */
export const MIN_LETRAS = 5;

/**
 * Umbral. Una palabra entra si sale `apariciones` veces o más, en `ficheros` ficheros
 * distintos o más y en `zonas` zonas distintas o más; un par, con los suyos. Por qué:
 *  - las zonas separan una palabra de proceso (la usan a la vez skills, agentes, reglas,
 *    comandos y CLAUDE.md) de la jerga de un servicio, que vive en una o dos skills;
 *  - los ficheros, que no la repita un solo texto largo;
 *  - medido el 10 oct 2026 sobre las 9 zonas (53 ficheros): con 8 ficheros, 20 apariciones
 *    y 4 zonas salían 156 palabras; con 10, 25 y 5, y sin las de uso general
 *    (PALABRAS_VACIAS) ni separar singular y plural, 85 palabras; los pares, con 5
 *    ficheros, 8 apariciones y 3 zonas, 10. Un par es más raro que una palabra suelta:
 *    su umbral es más bajo.
 * Además, la lista se corta en MAX_CANDIDATOS por tipo (los de más ficheros primero) y la
 * cabecera da el total: lo juzgado deja de salir y la siguiente pasada trae los siguientes.
 */
export const UMBRAL = { palabra: { apariciones: 25, ficheros: 10, zonas: 5 }, par: { apariciones: 8, ficheros: 5, zonas: 3 } };
/** Lo que un agente juzga bien en una pasada: 30 palabras y 15 pares. */
export const MAX_CANDIDATOS = { palabra: 30, par: 15 };

/**
 * Motivos cerrados de cada juicio (#481, revisión M3): se cuentan y agrupan; el porqué
 * concreto va en «detalle», el hueco de texto libre.
 */
export const MOTIVOS_JUICIO = {
  termino_nuevo: {
    significado_propio: "Nombra algo del proceso que ningún término cubre",
    dos_sentidos: "Ya se usa con dos significados y hay que fijar uno",
  },
  sinonimo: {
    mismo_significado: "Dice lo mismo que el término con otra palabra",
    nombre_largo: "Es el nombre largo o la forma explicada del término",
    variante_de_forma: "Es otra forma escrita del término (inglés, abreviatura, sin tilde)",
  },
  nada: {
    uso_general: "Palabra de uso general, sin un significado propio del proceso",
    nombre_propio: "Nombre de una persona, un producto o una herramienta",
    jerga_de_servicio: "Palabra de un servicio o de un dominio, no del proceso",
    gramatical: "Palabra gramatical o de relleno que se coló",
  },
};

/** Cuántos juicios con el mismo juicio y motivo hacen una regla propuesta. */
export const REPETICIONES_REGLA = 3;

/**
 * Palabras de uso general que nunca son término de proceso: gramaticales, verbos y
 * adverbios comunes, claves del frontmatter y nombres propios de personas y servicios.
 * Los sustantivos no van aquí de entrada: los juzga el agente. Crece con un juicio «nada»
 * que se repite (regla propuesta), no a ojo.
 */
export const PALABRAS_VACIAS = new Set(`
  antes aunque cada cuando cuanto desde donde durante entre hasta hacia mientras nunca otras otros porque sobre
  solo tambien tanto todas todos usted vuestra vuestro nuestra nuestro ademas despues luego entonces siempre
  ahora mismo misma mismos mismas cualquier ninguna ninguno ningun alguna alguno algunos algunas varias varios
  estos estas aquel aquella esto esta este eso esas esos ellos ellas otra otro tiene tienen tener hacer hace
  hacen puede pueden poder debe deben deber estar estan sera seria serian haber habia hubo sigue siguen seguir
  queda quedan quedar sale salen salir entra entran entrar lleva llevan llevar pone ponen poner dice dicen decir
  pasa pasan pasar vale valen falla fallan fallar mira miran mirar parte partes forma formas veces dentro fuera
  encima arriba abajo primero primera ultimo ultima nuevo nueva nuevos nuevas viejo vieja mayor menor mucho mucha
  muchos muchas poco pocos pocas igual bien junto junta propio propia propios propias cosas sobra hecho hecha
  hechos quien quienes nadie alguien menos salvo cuatro final verdad reales real comun
  cambiar cambia cambian cambio cambios escribe escriben escribir cuenta cuentan contar crear crea crean cierra
  cierran cerrar tocar toca tocan existe existen vuelve vuelven volver corre corren correr genera generan anade
  anaden anadir abrir abre abren devuelve devuelven repite repiten niega niegan negar busca buscan buscar
  necesita necesitan editar edita cumple cumplen cumplir borrar borra borran decidir decide nombra nombran lanza
  lanzan lanzar subir sube suben
  description metadata name pablo alvaro manu claude github supabase vercel hetzner tailscale telegram postgres
  password
`.trim().split(/\s+/));

const raiz = (w) => w.slice(0, RAIZ);
const palabras = (texto) => plano(texto).split(/[^a-zñ]+/).filter(Boolean);
/** Frases sin cruzar signos de puntuación (un par no salta de una frase a otra). */
const frases = (texto) => plano(texto).split(/[.,;:!?()[\]{}«»"'`|/\\\n—–-]+/);

/** Raíces de todo lo que ya está en el glosario: términos, sinónimos y nombres retirados (las palabras cortas, enteras: «caso»). */
export function raicesDelGlosario(g) {
  const r = new Set();
  for (const t of g.terminos) for (const x of [t.termino, ...prohibidosDe(t)]) for (const w of palabras(x)) if (w.length >= 3) r.add(raiz(w));
  return r;
}

/** Si una palabra ya está en el glosario: empieza por alguna de sus raíces («casos» por «caso»). */
const enGlosario = (w, raices) => { for (let n = Math.min(RAIZ, w.length); n >= 3; n--) if (raices.has(w.slice(0, n))) return true; return false; };

/** Los trozos de prosa de las zonas: [{ ruta, zona, texto }]. Una ruta en varias zonas cuenta una vez, en la primera. */
export function prosaDeZonas(raizRepo, g, { leer = (r) => readFileSync(join(raizRepo, r), "utf8"), ficheros = (p) => ficherosDe(raizRepo, p) } = {}) {
  const zonas = new Map();
  for (const [z, pats] of Object.entries(g.zonas)) for (const p of pats) for (const r of ficheros(p)) if (!zonas.has(r)) zonas.set(r, z);
  return [...zonas.keys()].sort().map((ruta) => {
    const texto = leer(ruta);
    return { ruta, zona: zonas.get(ruta), texto: ruta.endsWith(".json") ? prosaDeJson(texto).map((x) => x.texto).join("\n") : prosaDeMarkdown(texto) };
  });
}

const contenido = (w, minimo = MIN_LETRAS) => w.length >= minimo && !PALABRAS_VACIAS.has(w);

/**
 * Los candidatos: [{ candidato, apariciones, ficheros, tipo: "palabra"|"par" }], de más a menos.
 * Un par es «a b» (dos palabras de contenido seguidas) o «a de b», que es como el castellano
 * forma los compuestos («causa de escape», «carpeta de trabajo»). Sale si alguna de sus dos
 * palabras no está ya en el glosario.
 */
export function candidatos(trozos, g, { juicios = [], umbral = UMBRAL } = {}) {
  const yaGlosario = raicesDelGlosario(g);
  const juzgados = new Set(juicios.map((j) => plano(j.candidato)));
  const cuenta = new Map();
  const sumar = (clave, tipo, zona, ruta) => {
    if (!cuenta.has(clave)) cuenta.set(clave, { tipo, n: 0, rutas: new Set(), zonas: new Set() });
    const c = cuenta.get(clave);
    c.n += 1;
    c.rutas.add(ruta);
    c.zonas.add(zona);
  };
  const zonaPorRuta = new Map(trozos.map((x) => [x.ruta, x.zona ?? "-"]));
  const zonaDe = (r) => zonaPorRuta.get(r);
  for (const { ruta, texto } of trozos) {
    for (const frase of frases(texto)) {
      const ws = palabras(frase);
      for (let i = 0; i < ws.length; i++) {
        const w = ws[i];
        if (contenido(w) && !enGlosario(w, yaGlosario)) sumar(w, "palabra", zonaDe(ruta), ruta);
        const b = ws[i + 1];
        const c = ws[i + 2];
        const nuevoPar = (a, z) => contenido(a, 4) && contenido(z, 4) && !(enGlosario(a, yaGlosario) && enGlosario(z, yaGlosario));
        if (b && nuevoPar(w, b)) sumar(`${w} ${b}`, "par", zonaDe(ruta), ruta);
        if (b === "de" && c && nuevoPar(w, c)) sumar(`${w} de ${c}`, "par", zonaDe(ruta), ruta);
      }
    }
  }
  // El plural cuenta con su singular si este también sale («lineas» con «linea»).
  for (const [w, c] of [...cuenta]) {
    if (c.tipo !== "palabra") continue;
    const singular = [w.replace(/es$/, ""), w.replace(/s$/, "")].find((x) => x !== w && cuenta.get(x)?.tipo === "palabra");
    if (!singular) continue;
    const s = cuenta.get(singular);
    s.n += c.n;
    for (const r of c.rutas) s.rutas.add(r);
    for (const z of c.zonas) s.zonas.add(z);
    cuenta.delete(w);
  }
  const fuera = [];
  for (const [candidato, c] of cuenta) {
    const u = umbral[c.tipo];
    if (c.n >= u.apariciones && c.rutas.size >= u.ficheros && c.zonas.size >= u.zonas && !juzgados.has(candidato)) fuera.push({ candidato, apariciones: c.n, ficheros: c.rutas.size, zonas: c.zonas.size, tipo: c.tipo });
  }
  return fuera.sort((a, b) => b.ficheros - a.ficheros || b.apariciones - a.apariciones || a.candidato.localeCompare(b.candidato));
}

/** La lista para juzgar: como mucho MAX_CANDIDATOS de cada tipo, los de más ficheros primero. */
export function aJuzgar(lista, max = MAX_CANDIDATOS) {
  return ["palabra", "par"].flatMap((tipo) => lista.filter((c) => c.tipo === tipo).slice(0, max[tipo]));
}

/** La línea contable de un candidato. */
export const lineaCandidato = (c) => `candidato: ${c.candidato} apariciones: ${c.apariciones} ficheros: ${c.ficheros}`;

export function leerJuicios(raizRepo) {
  return JSON.parse(readFileSync(join(raizRepo, RUTA_JUICIOS), "utf8")).juicios ?? [];
}

export const CAMPOS_JUICIO = ["candidato", "juicio", "motivo", "detalle", "fecha"];
export const CAMPOS_JUICIO_OPCIONALES = ["sinonimo_de"];
/** El detalle es el hueco: una frase, no «no aplica». */
export const MIN_DETALLE = 15;

/** La forma de los juicios: vocabulario, motivo, fecha y, si es sinónimo, de qué término activo. */
export function problemasDeJuicios(juicios, g) {
  const p = [];
  const activos = new Set(g.terminos.filter((t) => t.estado !== "retirado").map((t) => t.termino));
  const vistos = new Set();
  for (const j of juicios) {
    const id = j.candidato ?? "(sin candidato)";
    for (const c of CAMPOS_JUICIO) if (!(c in j)) p.push(`${id}: falta ${c}`);
    for (const c of Object.keys(j)) if (![...CAMPOS_JUICIO, ...CAMPOS_JUICIO_OPCIONALES].includes(c)) p.push(`${id}: campo desconocido ${c}`);
    if (vistos.has(plano(id))) p.push(`${id}: juzgado dos veces`);
    vistos.add(plano(id));
    if (!(j.juicio in JUICIOS)) p.push(`${id}: juicio «${j.juicio}» fuera del vocabulario (${Object.keys(JUICIOS).join(", ")})`);
    else if (!(j.motivo in MOTIVOS_JUICIO[j.juicio])) p.push(`${id}: motivo «${j.motivo}» fuera del vocabulario de ${j.juicio} (${Object.keys(MOTIVOS_JUICIO[j.juicio]).join(", ")})`);
    if (String(j.detalle ?? "").trim().length < MIN_DETALLE) p.push(`${id}: el detalle tiene que tener ${MIN_DETALLE} caracteres o más`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(j.fecha ?? ""))) p.push(`${id}: fecha no es AAAA-MM-DD`);
    if (j.juicio === "sinonimo" && !activos.has(j.sinonimo_de)) p.push(`${id}: sinonimo_de «${j.sinonimo_de ?? ""}», que no es un término activo`);
    if (j.juicio !== "sinonimo" && "sinonimo_de" in j) p.push(`${id}: sinonimo_de solo va con el juicio sinonimo`);
  }
  return p;
}

/**
 * Lo que queda por hacer de los juicios: los «termino_nuevo» que aún no están en el
 * glosario, y las reglas propuestas (un mismo juicio y motivo REPETICIONES_REGLA veces o más).
 */
export function pendientesDeJuicios(juicios, g) {
  const nombres = new Set(g.terminos.flatMap((t) => [t.termino, ...prohibidosDe(t)]).map(plano));
  const sinTermino = juicios.filter((j) => j.juicio === "termino_nuevo" && !nombres.has(plano(j.candidato))).map((j) => j.candidato);
  const porMotivo = new Map();
  for (const j of juicios) {
    const clave = `${j.juicio}: ${j.motivo}`;
    if (!porMotivo.has(clave)) porMotivo.set(clave, []);
    porMotivo.get(clave).push(j.candidato);
  }
  const reglas = [...porMotivo].filter(([, cs]) => cs.length >= REPETICIONES_REGLA).map(([clave, cs]) => ({ juicio_y_motivo: clave, candidatos: cs }));
  return { sinTermino, reglas };
}

/**
 * La cifra del glosario para el informe semanal (scripts/cumplimiento.mjs): excepciones
 * que quedan y las que ya se pueden bajar, candidatos sin juzgar, juicios y reglas
 * propuestas. Sin red ni coste.
 */
export function estadoDelGlosario(raizRepo) {
  const g = leerGlosario(raizRepo);
  const exc = leerExcepciones(raizRepo);
  const juicios = leerJuicios(raizRepo);
  const todos = candidatos(prosaDeZonas(raizRepo, g), g, { juicios });
  const { bajadas } = comparar(medir(raizRepo, g).medida, exc);
  const { sinTermino, reglas } = pendientesDeJuicios(juicios, g);
  return {
    excepciones: total(exc),
    por_bajar: bajadas.length,
    candidatos_palabras: todos.filter((c) => c.tipo === "palabra").length,
    candidatos_pares: todos.filter((c) => c.tipo === "par").length,
    juzgados: juicios.length,
    termino_nuevo_sin_termino: sinTermino.length,
    reglas_propuestas: reglas.length,
  };
}

/** Una línea contable: `glosario excepciones: n por_bajar: m candidatos_palabras: …`. */
export const lineaDelGlosario = (e) => `glosario ${Object.entries(e).map(([k, v]) => `${k}: ${v}`).join(" ")}`;
