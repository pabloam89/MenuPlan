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
 * Todo manejador cuya condición lleve `others` (también `… or others`) tiene,
 * en el nivel de arriba del manejador, un `raise` que llegue al log de
 * Supabase, que guarda de warning para arriba: `raise warning`, `raise
 * exception`, `raise;`, `raise '…'` sin nivel, `raise sqlstate …` o `raise
 * using …`. Un `raise notice` (o debug, log, info) no vale: repetiría #177 con
 * el test en verde. Tampoco vale uno dentro de un `if`, `case`, `loop` o
 * bloque anidado, porque no siempre se ejecuta. Si se traga el error a
 * propósito, lo dice al lado con `-- a propósito: <porqué>`: dentro del
 * manejador o en las líneas de solo comentario justo encima de su `when` (o
 * del `exception`, si es el primero). El de un manejador hermano no vale.
 *
 * ── Las antiguas ──────────────────────────────────────────────────────────
 * Una migración aplicada no se edita, así que las que ya lo tenían van en
 * HEREDADOS. La lista solo puede bajar: si una aparece y no está, falla; si
 * está y ya no aparece, falla también, para que se quite. Y no admite números
 * por encima de TOPE: una migración nueva no se puede apuntar aquí.
 *
 * Es un lector de texto, no un parser de PL/pgSQL. Los ejemplos de abajo
 * prueban que distingue lo que tiene que distinguir.
 *
 * ── Límites conocidos (decididos, no se vigilan) ──────────────────────────
 * - Los manejadores de una condición concreta sin `others` (`when
 *   unique_violation then null`) quedan fuera: tragarse un error que se ha
 *   nombrado ya es una decisión escrita.
 * - Un `exit <etiqueta> when` o un `continue <etiqueta> when` en el nivel de
 *   arriba del manejador se lee como el siguiente manejador; y un `merge` con
 *   sus `when matched then` dentro de un manejador, igual. Ninguna migración
 *   los usa ahí; si aparecen, el lector corta el manejador antes de tiempo.
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
 * El SQL en minúsculas, con la misma longitud y los mismos saltos de línea,
 * y lo que no es código cambiado por espacios: comentarios, el interior de
 * los textos '…' (las comillas se quedan, para que se vea `raise '…'`), con
 * `\'` dentro de E'…', y los textos $tag$…$tag$ que no son el cuerpo de una
 * función o de un `do` (`comment on … is $c$…$c$`). Los cuerpos se quedan:
 * ahí es donde vive el PL/pgSQL.
 */
export function enmascarar(sql) {
  const out = sql.split("");
  const n = sql.length;
  const borrar = (a, b) => {
    for (let k = a; k < b; k++) if (out[k] !== "\n") out[k] = " ";
  };
  let cuerpo = null; // la etiqueta $…$ del cuerpo en el que estamos
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
      const escapes = /[eE]/.test(sql[i - 1] ?? "") && !/\w/.test(sql[i - 2] ?? "");
      let j = i + 1;
      while (j < n) {
        if (escapes && sql[j] === "\\") { j += 2; continue; }
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") { j += 2; continue; }
          break;
        }
        j++;
      }
      borrar(i + 1, j);
      i = j + 1;
      continue;
    }
    if (c === "$") {
      const m = /^\$([A-Za-z_]\w*)?\$/.exec(sql.slice(i, i + 64));
      if (m) {
        const tag = m[0];
        if (cuerpo === tag) { cuerpo = null; i += tag.length; continue; }
        const antes = out.slice(Math.max(0, i - 40), i).join("");
        if (cuerpo === null && /\b(as|do|plpgsql)\s*$/i.test(antes)) {
          cuerpo = tag;
          i += tag.length;
          continue;
        }
        const j = sql.indexOf(tag, i + tag.length);
        const fin = j < 0 ? n : j + tag.length;
        borrar(i, fin);
        i = fin;
        continue;
      }
    }
    i++;
  }
  return out.join("").toLowerCase();
}

const RE_FUNCION = /create\s+(?:or\s+replace\s+)?function\s+((?:"[^"]+"|\w+)(?:\.(?:"[^"]+"|\w+))?)/g;
const RE_DO = /\bdo\s+(?:language\s+\w+\s+)?\$/g;

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

/** La palabra (o el `;`) de antes de una posición. */
const anterior = (codigo, pos) => /(\w+|;)\s*$/.exec(codigo.slice(Math.max(0, pos - 40), pos))?.[1] ?? null;
/** La palabra (o el signo) de después de una posición. */
const siguiente = (codigo, pos) => /^\s*(\w+|\S)/.exec(codigo.slice(pos, pos + 80));

/** Tras qué palabras un `if` empieza una sentencia (y no es un `drop … if exists`). */
const ABRE_SENTENCIA = new Set([";", "then", "else", "loop", "begin"]);

/**
 * Un `raise` que deja rastro en el log de Supabase, que guarda de warning para
 * arriba: `warning`, `exception`, `raise;` (relanza), sin nivel (es exception),
 * `sqlstate …` y `using …`. Notice, debug, log e info no llegan.
 */
const RAISE_QUE_AVISA = new Set(["warning", "exception", "sqlstate", "using", ";", "'"]);

/**
 * Los manejadores del bloque `exception` que empieza en `pos`:
 * [{ when, fin, cond, avisa }]. Cada uno va de su `when` al siguiente `when`
 * del mismo nivel o al `end` del bloque. Solo cuenta el `raise` del nivel de
 * arriba del manejador: uno dentro de un `if`, `case`, `loop` o bloque anidado
 * no siempre se ejecuta.
 */
function manejadores(codigo, pos) {
  const re = /\b(begin|case|if|loop|end|when|raise)\b/g;
  re.lastIndex = pos + "exception".length;
  const r = [];
  let cur = null;
  let prof = 0;
  let m;
  while ((m = re.exec(codigo))) {
    const w = m[1];
    if (w === "when" && prof === 0) {
      const a = anterior(codigo, m.index);
      if (a === "continue" || a === "exit") continue;
      const then = /\bthen\b/g;
      then.lastIndex = m.index;
      const t = then.exec(codigo);
      if (!t) break;
      if (cur) { cur.fin = m.index; r.push(cur); }
      cur = { when: m.index, cond: codigo.slice(m.index + 4, t.index), avisa: false };
      re.lastIndex = t.index + 4;
    } else if (w === "end") {
      const sig = siguiente(codigo, re.lastIndex);
      if (sig && ["if", "loop", "case"].includes(sig[1])) re.lastIndex += sig[0].length;
      if (prof === 0) break;
      prof--;
    } else if (w === "begin" || w === "case" || w === "loop") {
      prof++;
    } else if (w === "if") {
      if (ABRE_SENTENCIA.has(anterior(codigo, m.index))) prof++;
    } else if (w === "raise" && prof === 0 && cur) {
      const sig = siguiente(codigo, re.lastIndex);
      if (sig && RAISE_QUE_AVISA.has(sig[1])) cur.avisa = true;
    }
  }
  if (cur) { cur.fin = m ? m.index : codigo.length; r.push(cur); }
  return r;
}

const RE_A_PROPOSITO = /--[ \t]*a[ \t]+prop[oó]sito:[ \t]*\S/i;
const soloComentario = (linea) => /^\s*(--.*)?$/.test(linea);

/**
 * ¿Lleva el manejador su `-- a propósito: <porqué>` al lado? Vale dentro del
 * manejador (de su `when` a su final, sin los comentarios del final, que ya
 * son del siguiente) o en las líneas de solo comentario justo encima de su
 * `when`; para el primero, también encima del `exception`. El de un manejador
 * hermano no vale.
 */
function aProposito(sql, h, desde) {
  const propio = sql.slice(h.when, h.fin).split("\n");
  while (propio.length > 1 && soloComentario(propio[propio.length - 1])) propio.pop();
  if (RE_A_PROPOSITO.test(propio.join("\n"))) return true;
  const inicioLinea = sql.lastIndexOf("\n", desde - 1) + 1;
  if (sql.slice(inicioLinea, desde).trim() !== "") return false;
  const encima = sql.slice(0, inicioLinea).split("\n");
  encima.pop();
  while (encima.length && soloComentario(encima[encima.length - 1])) {
    if (RE_A_PROPOSITO.test(encima.pop())) return true;
  }
  return false;
}

/** Los manejadores con `others` sin aviso de un SQL: [{ funcion, linea }]. */
export function mudos(sql) {
  const codigo = enmascarar(sql);
  const r = [];
  for (const e of codigo.matchAll(/\bexception\b/g)) {
    if (anterior(codigo, e.index) === "raise") continue;
    if (!/^\s+when\b/.test(codigo.slice(e.index + 9, e.index + 40))) continue;
    manejadores(codigo, e.index).forEach((h, k) => {
      if (!/\bothers\b/.test(h.cond) || h.avisa) return;
      // El primero puede llevar el comentario encima del `exception`.
      if (aProposito(sql, h, h.when) || (k === 0 && aProposito(sql, { when: e.index, fin: h.fin }, e.index))) return;
      r.push({ funcion: funcionEn(codigo, h.when), linea: sql.slice(0, h.when).split("\n").length });
    });
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

  it("acepta raise warning, exception, raise;, sin nivel, sqlstate y using", () => {
    const buenos = [
      "raise warning 'x %', sqlerrm;",
      "raise exception 'x';",
      "raise;",
      "raise 'x %', sqlerrm;",
      "raise sqlstate '22012';",
      "raise using message = 'x';",
    ];
    for (const r of buenos) {
      expect(mudos(fn(`  perform 1;\nexception when others then\n  ${r}`))).toEqual([]);
    }
  });

  it("notice, debug, log e info no son aviso: Supabase solo guarda de warning para arriba", () => {
    for (const nivel of ["notice", "debug", "log", "info"]) {
      expect(mudos(fn(`  perform 1;\nexception when others then\n  raise ${nivel} 'x %', sqlerrm;`))).toHaveLength(1);
    }
  });

  it("others junto a otra condición con or también cuenta", () => {
    expect(mudos(fn("  perform 1;\nexception when sqlstate '23505' or others then null;"))).toHaveLength(1);
    expect(mudos(fn("  perform 1;\nexception when others or unique_violation then null;"))).toHaveLength(1);
  });

  it("el raise del manejador de un bloque anidado no vale para el de fuera", () => {
    const cuerpo = [
      "  perform 1;",
      "exception when others then",
      "  begin",
      "    perform 2;",
      "  exception when others then",
      "    raise warning 'dentro: %', sqlerrm;",
      "  end;",
    ].join("\n");
    expect(mudos(fn(cuerpo))).toEqual([{ funcion: "f", linea: 4 }]);
  });

  it("el raise tiene que estar arriba del manejador, no dentro de un if, un case o un loop", () => {
    const dentro = [
      "if sqlstate = 'x' then raise warning 'y'; end if;",
      "case when true then raise warning 'y'; end case;",
      "loop raise warning 'y'; exit; end loop;",
      "for i in 1..2 loop raise warning 'y'; end loop;",
    ];
    for (const d of dentro) {
      expect(mudos(fn(`  perform 1;\nexception when others then\n  ${d}`))).toHaveLength(1);
    }
    // Arriba, después de un if, sí vale.
    expect(mudos(fn("  perform 1;\nexception when others then\n  if true then null; end if;\n  raise warning 'y';"))).toEqual([]);
  });

  it("los textos $tag$…$tag$ y E'…' no tapan ni inventan código", () => {
    const malo = fn("  perform 1;\nexception when others then null;");
    expect(mudos(`comment on function public.f() is $c$it's$c$;\n${malo}`)).toHaveLength(1);
    expect(mudos(`select E'it\\'s';\n${malo}`)).toHaveLength(1);
    expect(mudos("comment on function public.f() is $c$begin exception when others then null; end$c$;")).toEqual([]);
  });

  it("do language plpgsql $$ también es un bloque do", () => {
    expect(mudos("do language plpgsql $$ begin perform 1; exception when others then null; end $$;"))
      .toEqual([{ funcion: "do", linea: 1 }]);
  });

  it("el a propósito de un manejador hermano no vale para el others de después", () => {
    const cuerpo = [
      "  perform 1;",
      "exception",
      "  when unique_violation then",
      "    -- a propósito: el duplicado ya está",
      "    null;",
      "  when others then",
      "    null;",
    ].join("\n");
    expect(mudos(fn(cuerpo))).toHaveLength(1);
    const primero = "  perform 1;\nexception when unique_violation then null; -- a propósito: dup\n  when others then null;";
    expect(mudos(fn(primero))).toHaveLength(1);
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
