import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Ningún `exception when others` se traga un error sin avisar (#181, fondo #177).
 *
 * ── Qué problema sujeta ───────────────────────────────────────────────────
 * `ensure_user_household` preparaba la casa dentro de un bloque con
 * `exception when others then` que solo insertaba una fila vacía. Uno de los
 * pasos fallaba siempre, el bloque se deshacía y nadie lo vio en semanas:
 * ninguna casa llegó a `active`. La 0090 lo arregló y dejó un `raise warning`.
 *
 * ── La regla ──────────────────────────────────────────────────────────────
 * Todo manejador `when others` de una migración lleva un `raise` (warning,
 * notice, exception o un `raise;` que relance). Si se traga el error a
 * propósito, lo dice al lado con un comentario `-- a propósito: <porqué>`
 * (en el manejador, o en la línea de antes del `exception`).
 *
 * ── Las antiguas ──────────────────────────────────────────────────────────
 * Una migración aplicada no se edita, así que las que ya lo tenían van en
 * HEREDADOS. La lista solo puede bajar: si una aparece y no está, falla; si
 * está y ya no aparece, falla también, para que se quite. Y no admite números
 * por encima de TOPE: una migración nueva no se puede apuntar aquí.
 *
 * Es un lector de texto, no un parser de PL/pgSQL. Los ejemplos de abajo
 * prueban que distingue lo que tiene que distinguir.
 */
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

/** Las que ya estaban el 8 oct 2026. Solo baja. */
const HEREDADOS = [
  // Primera versión del «prepara la casa»: se traga el fallo y deja la casa vacía.
  { migracion: "0018", funcion: "ensure_user_household" },
  // La misma función reescrita para los tres papeles; el mismo manejador mudo.
  { migracion: "0071", funcion: "ensure_user_household" },
  // La versión que rompió las altas (#144): la sustituye la 0090, que avisa.
  { migracion: "0087", funcion: "ensure_user_household" },
  // Convierte texto a fecha ISO o null; que falle el cast ES el caso esperado.
  { migracion: "0089", funcion: "_fecha_iso_o_null" },
];

/** El número más alto que puede estar en HEREDADOS. No se sube. */
const TOPE = 89;

/**
 * El SQL con comentarios y textos entre comillas simples cambiados por
 * espacios (misma longitud, mismos saltos de línea), en minúsculas. Los
 * cuerpos $$…$$ se quedan: ahí es donde vive el PL/pgSQL.
 */
export function enmascarar(sql) {
  const out = sql.split("");
  const n = sql.length;
  const borrar = (a, b) => {
    for (let k = a; k < b; k++) if (out[k] !== "\n") out[k] = " ";
  };
  let i = 0;
  while (i < n) {
    const c = sql[i];
    const d = sql[i + 1];
    if (c === "-" && d === "-") {
      let j = i;
      while (j < n && sql[j] !== "\n") j++;
      borrar(i, j);
      i = j;
      continue;
    }
    if (c === "/" && d === "*") {
      const j = sql.indexOf("*/", i + 2);
      const fin = j < 0 ? n : j + 2;
      borrar(i, fin);
      i = fin;
      continue;
    }
    if (c === "'") {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") { j += 2; continue; }
          break;
        }
        j++;
      }
      borrar(i, j + 1);
      i = j + 1;
      continue;
    }
    i++;
  }
  return out.join("").toLowerCase();
}

const RE_FUNCION = /create\s+(?:or\s+replace\s+)?function\s+((?:"[^"]+"|\w+)(?:\.(?:"[^"]+"|\w+))?)/g;
const RE_DO = /\bdo\s+\$/g;

/** La función (o el bloque `do`) en la que cae una posición. */
function funcionEn(codigo, pos) {
  let nombre = "?";
  let donde = -1;
  for (const m of codigo.matchAll(RE_FUNCION)) {
    if (m.index > pos) break;
    donde = m.index;
    nombre = m[1].replace(/"/g, "").replace(/^public\./, "");
  }
  for (const m of codigo.matchAll(RE_DO)) {
    if (m.index > pos) break;
    if (m.index > donde) { donde = m.index; nombre = "do"; }
  }
  return nombre;
}

/**
 * Dónde acaba un manejador que empieza en `desde`, y si lleva `raise`.
 * Acaba en el `end` que cierra su bloque o en el siguiente `when … then` del
 * mismo `exception`. Cuenta los `begin` y `case` anidados; `end if` y
 * `end loop` no cierran nada; `continue when` y `exit when` no son manejadores.
 */
function manejador(codigo, desde) {
  const re = /\b(begin|case|end|when|raise)\b/g;
  re.lastIndex = desde;
  let prof = 0;
  let avisa = false;
  let m;
  while ((m = re.exec(codigo))) {
    const w = m[1];
    if (w === "raise") avisa = true;
    else if (w === "begin" || w === "case") prof++;
    else if (w === "end") {
      const sig = /^\s*(\w+)/.exec(codigo.slice(re.lastIndex));
      if (sig && (sig[1] === "if" || sig[1] === "loop")) continue;
      if (sig && sig[1] === "case") re.lastIndex += sig[0].length;
      if (prof === 0) return { fin: m.index, avisa };
      prof--;
    } else if (w === "when" && prof === 0) {
      const antes = /(\w+)\s*$/.exec(codigo.slice(Math.max(0, m.index - 20), m.index));
      if (antes && (antes[1] === "continue" || antes[1] === "exit")) continue;
      return { fin: m.index, avisa };
    }
  }
  return { fin: codigo.length, avisa };
}

const RE_A_PROPOSITO = /--[ \t]*a[ \t]+prop[oó]sito:[ \t]*\S/i;

/** Los manejadores `when others` sin aviso de un SQL: [{ funcion, linea }]. */
export function mudos(sql) {
  const codigo = enmascarar(sql);
  const r = [];
  for (const m of codigo.matchAll(/\bwhen\s+others\s+then\b/g)) {
    const desde = m.index + m[0].length;
    const { fin, avisa } = manejador(codigo, desde);
    if (avisa) continue;
    // «Al lado»: desde la línea de antes del `exception` hasta el final del manejador.
    const exc = codigo.lastIndexOf("exception", m.index);
    const lineaExc = sql.lastIndexOf("\n", (exc < 0 ? m.index : exc) - 1);
    const inicio = lineaExc < 0 ? 0 : sql.lastIndexOf("\n", lineaExc - 1) + 1;
    if (RE_A_PROPOSITO.test(sql.slice(inicio, fin))) continue;
    r.push({ funcion: funcionEn(codigo, m.index), linea: sql.slice(0, m.index).split("\n").length });
  }
  return r;
}

const clave = (e) => `${e.migracion}:${e.funcion}`;

function encontrados() {
  const vistos = new Map();
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".sql")).sort()) {
    const migracion = f.slice(0, 4);
    for (const x of mudos(fs.readFileSync(path.join(DIR, f), "utf8"))) {
      const k = clave({ migracion, funcion: x.funcion });
      if (!vistos.has(k)) vistos.set(k, `${f}:${x.linea}`);
    }
  }
  return vistos;
}

describe("exception when others: ningún error tragado sin aviso", () => {
  const vistos = encontrados();
  const heredados = new Set(HEREDADOS.map(clave));

  it("ningún manejador mudo fuera de la lista de heredados", () => {
    const nuevos = [...vistos].filter(([k]) => !heredados.has(k)).map(([, donde]) => donde);
    // Si falla: pon un `raise warning '…: %', sqlerrm;` en el manejador, o un
    // comentario `-- a propósito: <porqué>` al lado si tragarlo es lo correcto.
    expect(nuevos).toEqual([]);
  });

  it("la lista solo baja: lo arreglado sale de HEREDADOS", () => {
    const sobran = HEREDADOS.map(clave).filter((k) => !vistos.has(k));
    expect(sobran).toEqual([]);
  });

  it("HEREDADOS no admite migraciones nuevas", () => {
    expect(HEREDADOS.length).toBeLessThanOrEqual(4);
    for (const e of HEREDADOS) expect(Number(e.migracion)).toBeLessThanOrEqual(TOPE);
  });
});

describe("el lector de manejadores", () => {
  const fn = (cuerpo) => `create or replace function public.f() returns void language plpgsql as $$\nbegin\n${cuerpo}\nend;\n$$;`;

  it("marca el que se lo traga sin decir nada", () => {
    expect(mudos(fn("  perform 1;\nexception when others then\n  return;"))).toEqual([{ funcion: "f", linea: 4 }]);
    expect(mudos(fn("  begin perform 1;\n  exception when others then null;\n  end;"))).toHaveLength(1);
  });

  it("acepta raise warning, notice, exception y raise;", () => {
    for (const r of ["raise warning 'x %', sqlerrm;", "raise notice 'x';", "raise exception 'x';", "raise;"]) {
      expect(mudos(fn(`  perform 1;\nexception when others then\n  ${r}`))).toEqual([]);
    }
  });

  it("acepta el comentario a propósito, en el manejador o justo encima", () => {
    expect(mudos(fn("  perform 1;\nexception when others then\n  -- a propósito: un cast que falla es null\n  return;"))).toEqual([]);
    expect(mudos(fn("  perform 1;\n-- a propósito: es lo esperado\nexception when others then\n  return;"))).toEqual([]);
    // Un comentario sin porqué no vale.
    expect(mudos(fn("  perform 1;\nexception when others then\n  -- a propósito:\n  return;"))).toHaveLength(1);
  });

  it("un raise en un comentario o en un texto no cuenta", () => {
    expect(mudos(fn("  perform 1;\nexception when others then\n  -- raise warning aquí\n  return;"))).toHaveLength(1);
    expect(mudos(fn("  perform 1;\nexception when others then\n  insert into t values ('raise');"))).toHaveLength(1);
  });

  it("el manejador acaba en su end, no en el de un if, un loop o un case", () => {
    const cuerpo = [
      "  begin",
      "    perform 1;",
      "  exception when others then",
      "    if true then null; end if;",
      "    perform case when true then 1 else 2 end;",
      "  end;",
      "  raise notice 'esto ya está fuera';",
    ].join("\n");
    expect(mudos(fn(cuerpo))).toHaveLength(1);
  });

  it("mira cada manejador del mismo exception por separado", () => {
    const cuerpo = "  perform 1;\nexception\n  when unique_violation then raise notice 'dup';\n  when others then return;";
    expect(mudos(fn(cuerpo))).toHaveLength(1);
    const al_reves = "  perform 1;\nexception\n  when others then return;\n  when unique_violation then raise notice 'dup';";
    expect(mudos(fn(al_reves))).toHaveLength(1);
  });

  it("otros when (duplicate_object) no son asunto de esta regla", () => {
    expect(mudos("do $$ begin create type t as enum ('a'); exception when duplicate_object then null; end $$;")).toEqual([]);
  });

  it("nombra el bloque do cuando no está en una función", () => {
    expect(mudos("do $$ begin perform 1; exception when others then null; end $$;")).toEqual([{ funcion: "do", linea: 1 }]);
  });

  it("en la 0087 encuentra el de ensure_user_household, y la 0090 ya avisa", () => {
    const leer = (pre) => fs.readFileSync(path.join(DIR, fs.readdirSync(DIR).find((f) => f.startsWith(pre))), "utf8");
    expect(mudos(leer("0087_")).map((x) => x.funcion)).toEqual(["ensure_user_household"]);
    expect(mudos(leer("0090_"))).toEqual([]);
  });
});
