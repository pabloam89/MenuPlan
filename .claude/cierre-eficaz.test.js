// El cierre eficaz de un fondo (programa #652): la skill, la tarea del analista y las remisiones
// cuentan lo mismo. Vigila que nadie quite una pieza del camino «observar → evaluar → cerrar»:
// quien evalúa no cierra, el veredicto es de vocabulario cerrado y sin cifra de partida no se evalúa.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const leer = (r) => readFileSync(join(RAIZ, r), "utf8");
const VEREDICTOS = ["eficaz", "insuficiente", "no-evaluable"];

describe("cierre eficaz de un fondo", () => {
  const skill = existsSync(join(RAIZ, ".claude/skills/cierre-eficaz/SKILL.md")) ? leer(".claude/skills/cierre-eficaz/SKILL.md") : "";

  it("la skill existe, nombra los tres veredictos y a quien cierra", () => {
    expect(skill, "falta .claude/skills/cierre-eficaz/SKILL.md").not.toBe("");
    for (const v of VEREDICTOS) expect(skill, `la skill no nombra el veredicto ${v}`).toContain(`\`${v}\``);
    expect(skill).toMatch(/no cierra/i);
    expect(skill).toContain("plan-de-arreglo");
    expect(skill).toContain("fondos");
  });

  // Lo que debe llevar la skill, como lista de faltas (vacía = bien); así una copia rota se ve fallar.
  const faltas = (t) => {
    const f = [];
    const fila = t.split("\n").find((l) => l.startsWith("| `no-evaluable` |"));
    if (!fila) f.push("falta la fila `no-evaluable` de la tabla de puntuación");
    else if (!/cifra de partida/.test(fila) || !/plan-de-arreglo/.test(fila)) f.push("la fila no-evaluable no dice cifra de partida y plan-de-arreglo");
    if (!t.includes("La cifra que sale es")) f.push("falta la frase «La cifra que sale es…»");
    const traza = t.split("\n").filter((l) => l.includes("cierre-eficaz: veredicto="));
    if (traza.length < 2) f.push("la línea de rastro debe estar en la puntuación y en el paso de rastro");
    for (const l of traza) if (!/veredicto=<v> antes=<n> despues=<m> comando=<c>/.test(l)) f.push(`línea de rastro con otra forma: ${l.trim().slice(0, 60)}`);
    return f;
  };

  it("sin cifra de partida el veredicto es no-evaluable (fila exacta) y la línea de rastro tiene una sola forma", () => {
    expect(faltas(skill)).toEqual([]);
  });

  it("visto fallar: sin la frase «La cifra que sale es», o con eficaz en la fila no-evaluable", () => {
    expect(faltas(skill.replace("La cifra que sale es", "Sale"))).not.toEqual([]);
    expect(faltas(skill.replace("| `no-evaluable` |", "| `eficaz` |"))).not.toEqual([]);
    expect(faltas(skill.replace("antes=<n> despues=<m> comando=<c>", "antes: <n>"))).not.toEqual([]);
  });

  it("el analista tiene la tarea evaluar-la-eficacia, con la skill cargada y su juez en traspasa_a", () => {
    const est = JSON.parse(leer("ops/estandares-agentes.json")).agentes.analista;
    const tarea = est.tareas.find((t) => t.id === "evaluar-la-eficacia");
    expect(tarea, "falta la tarea evaluar-la-eficacia del analista").toBeTruthy();
    expect(tarea.normas ?? []).toContain("quien-construye-no-juzga");
    const md = leer(".claude/agents/analista.md");
    expect(md).toMatch(/^skills: \[[^\]]*cierre-eficaz/m);
    expect(md).toMatch(/^traspasa_a: \[[^\]]*revisor/m);
    expect(md).toContain("evaluar-la-eficacia");
  });

  it("/orquestar lanza al analista al vencer la ventana y causa-raiz solo remite", () => {
    const orq = leer(".claude/commands/orquestar.md");
    expect(orq).toMatch(/cierre-eficaz/);
    expect(orq).toMatch(/evaluar-la-eficacia/);
    const cr = leer(".claude/skills/causa-raiz/SKILL.md");
    const lineas = cr.split("\n").filter((l) => l.includes("cierre-eficaz"));
    expect(lineas.length, "causa-raiz debe remitir a cierre-eficaz en una sola línea").toBe(1);
  });
});
