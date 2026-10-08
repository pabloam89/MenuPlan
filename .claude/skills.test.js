import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Todas las skills son runbooks con la misma forma (.claude/PLANTILLA-SKILL.md):
 * frontmatter mínimo, las siete secciones en orden, una tabla de operaciones con
 * lo que debe salir, y cada fallo con su fecha, su causa y su arreglo. Cambia el
 * proveedor; la estructura no. Y el catálogo no deriva: CLAUDE.md nombra a todas.
 */
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");
const DIR = join(AQUI, "skills");

const SECCIONES = [
  "Qué es y dónde",
  "Claves y accesos",
  "Operaciones habituales",
  "Lo que falló y por qué",
  "Qué requiere el OK de Pablo",
  "Coste y límites",
  "Fuentes y comprobación",
];
const CABECERA_OPERACIONES = "| Qué | Comando | Debe salir |";
const MAX_DESCRIPCION = 600;
// Un runbook se lee con prisa: si crece sin parar, nadie lo lee entero.
const MAX_LINEAS = 220;
// Patrones de secretos que no deben aparecer nunca en un runbook.
const SECRETOS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /eyJ[A-Za-z0-9_-]{20,}\./,
  /AKIA[0-9A-Z]{16}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /postgres(?:ql)?:\/\/[^\s:@/]+:[^\s@]{3,}@/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

const skills = readdirSync(DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

function leer(nombre) {
  const texto = readFileSync(join(DIR, nombre, "SKILL.md"), "utf8").replace(/\r\n/g, "\n");
  const m = texto.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { meta: null, cuerpo: texto, texto };
  const meta = Object.fromEntries(
    m[1].split("\n").map((l) => l.match(/^(\w+):\s*(.*)$/)).filter(Boolean).map((x) => [x[1], x[2].trim()]),
  );
  return { meta, cuerpo: m[2], texto };
}

/** El texto de una sección `## Título`, hasta la siguiente. */
function seccion(cuerpo, titulo) {
  const partes = cuerpo.split(/^## (.+)$/m);
  const i = partes.findIndex((p, n) => n % 2 === 1 && p.trim() === titulo);
  return i === -1 ? "" : partes[i + 1];
}

/** Las entradas `- ...` de una lista, cada una con sus líneas de continuación. */
function entradas(texto) {
  return texto.split(/^(?=- )/m).filter((e) => e.startsWith("- "));
}

it("hay skills", () => expect(skills.length).toBeGreaterThan(0));

describe.each(skills)("%s", (nombre) => {
  const { meta, cuerpo, texto } = leer(nombre);

  it("tiene frontmatter con solo name y description, y la descripción enruta", () => {
    expect(meta).not.toBeNull();
    expect(Object.keys(meta).sort()).toEqual(["description", "name"]);
    expect(meta.name).toBe(nombre);
    expect(meta.description).toMatch(/^Úsala /);
    expect(meta.description.length).toBeGreaterThan(80);
    expect(meta.description.length).toBeLessThanOrEqual(MAX_DESCRIPCION);
    expect(meta.description).toMatch(/No para:/);
  });

  it("tiene un título y las siete secciones, en orden, ninguna vacía", () => {
    expect(cuerpo).toMatch(/^# \S.*$/m);
    const titulos = [...cuerpo.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
    expect(titulos).toEqual(SECCIONES);
    for (const s of SECCIONES) expect(seccion(cuerpo, s).trim().length, s).toBeGreaterThan(30);
  });

  it("las operaciones son una tabla «Qué | Comando | Debe salir» con filas", () => {
    const op = seccion(cuerpo, "Operaciones habituales");
    expect(op).toContain(CABECERA_OPERACIONES);
    const filas = op.split("\n").filter((l) => l.startsWith("|") && !l.startsWith("|---") && l !== CABECERA_OPERACIONES);
    expect(filas.length).toBeGreaterThan(0);
    for (const f of filas) {
      // Una celda vacía en «Debe salir» es una operación sin comprobación.
      const celdas = f.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim());
      expect(celdas.length, f).toBe(3);
      expect(celdas.every((c) => c.length > 0), f).toBe(true);
    }
  });

  it("cada fallo lleva fecha, causa y arreglo", () => {
    const fallos = entradas(seccion(cuerpo, "Lo que falló y por qué"));
    expect(fallos.length).toBeGreaterThan(0);
    for (const f of fallos) {
      expect(f, f.slice(0, 60)).toMatch(/^- \*\*\d{4}-\d{2}(?:-\d{2})? · [^*]+\*\*/);
      expect(f, f.slice(0, 60)).toMatch(/Causa:/);
      expect(f, f.slice(0, 60)).toMatch(/Arreglo:/);
    }
  });

  it("lista lo que requiere el OK de Pablo", () => {
    expect(entradas(seccion(cuerpo, "Qué requiere el OK de Pablo")).length).toBeGreaterThan(0);
  });

  it("acaba con su comprobación, fechada o confesada", () => {
    const ultima = texto.trim().split("\n").pop();
    expect(ultima).toMatch(/^(Comprobado el \d{4}-\d{2}-\d{2}|Sin comprobar): \S/);
  });

  it("cabe en una lectura con prisa", () => {
    expect(texto.split("\n").length).toBeLessThanOrEqual(MAX_LINEAS);
  });

  it("no lleva ningún secreto", () => {
    for (const patron of SECRETOS) expect(texto, String(patron)).not.toMatch(patron);
  });

  it("los ficheros que cita existen", () => {
    // Un runbook que manda a un script que ya no existe hace perder el tiempo
    // justo cuando hay prisa.
    const rutas = [...texto.matchAll(/`((?:\.claude|\.github|ops|supabase|docs|specs|src|scripts|api)\/[\w./-]+\.(?:md|js|mjs|jsx|json|yml|sql))`/g)].map((m) => m[1]);
    expect(rutas.filter((r) => !existsSync(join(RAIZ, r)))).toEqual([]);
  });
});

it("la plantilla lista las mismas secciones que exige este test", () => {
  const plantilla = readFileSync(join(AQUI, "PLANTILLA-SKILL.md"), "utf8");
  const bloque = plantilla.match(/```markdown\n([\s\S]*?)\n```/)?.[1] ?? "";
  const titulos = [...bloque.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
  expect(titulos).toEqual(SECCIONES);
  expect(bloque).toContain(CABECERA_OPERACIONES);
});

it("CLAUDE.md nombra todas las skills", () => {
  const claude = readFileSync(join(RAIZ, "CLAUDE.md"), "utf8");
  for (const nombre of skills) expect(claude, `CLAUDE.md no nombra a ${nombre}`).toContain(`\`${nombre}\``);
});
