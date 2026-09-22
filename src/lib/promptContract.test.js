import { describe, it, expect } from "vitest";
import { SYSTEM_PROMPTS, PROMPT_ALLERGEN_IDS } from "../../api/_prompts.js";
import { EU_ALLERGENS } from "./allergens.js";
import { STEP_PARTS } from "./recipeSteps.js";
import { CAMPOS } from "./notepadFields.js";
import { AjusteSchema } from "./panelParser.js";
import {
  PANEL_EMITE_REGLAS,
  PROMESAS_DE_NO_SABER,
  CLAVES_NUEVAS_DEL_PANEL,
  ExtensionReglaSchema,
} from "./reglas.js";
import { APPLIANCE_LABELS } from "./applianceMethods.js";
import { CARB_TYPE_BY_BASE, MAIN_BASES, PROTEIN_GROUP_BY_MAIN_PROTEIN } from "../data/recipeSchema.js";

// The system prompts live server-side (api/_prompts.js) so /api/generate can't
// be driven as a general-purpose LLM — see the header there. Two things can
// silently rot as a result, and these tests pin both:
//
//  1. The allergen id list used to be interpolated from EU_ALLERGENS at build
//     time. It's now a literal string in api/_prompts.js, so adding an allergen
//     to EU_ALLERGENS would no longer reach the prompt and the model would
//     never emit the new id.
//  2. The client sends a `task` key instead of the prompt text. A typo, or a
//     prompt renamed on the server, would mean the request silently runs with
//     NO system prompt at all.

describe("server-owned system prompts", () => {
  it("the inlined allergen list still matches EU_ALLERGENS", () => {
    const expected = Object.keys(EU_ALLERGENS).join(", ");
    expect(PROMPT_ALLERGEN_IDS).toBe(expected);
  });

  it("embeds every allergen id in the recipe-structuring prompt", () => {
    for (const id of Object.keys(EU_ALLERGENS)) {
      expect(SYSTEM_PROMPTS["structure-recipe"]).toContain(id);
    }
  });

  // Fase 6: el prompt tiene que pedir "part" con los mismos 4 valores que
  // STEP_PARTS (recipeSteps.js) — si alguien añade un valor nuevo al enum ahí
  // sin tocar el prompt, el modelo seguirá sin poder usarlo nunca.
  it("pide los 4 valores de STEP_PARTS en el prompt de structure-recipe", () => {
    for (const part of STEP_PARTS) {
      expect(SYSTEM_PROMPTS["structure-recipe"]).toContain(`"${part}"`);
    }
  });

  it("defines a prompt for every task the client asks for", () => {
    // Keep in sync with the `task:` values sent from src/lib.
    const tasksUsedByClient = [
      "planner",
      "planner-compact",
      "steps",
      "school-menu",
      "suggest-ingredients",
      "structure-recipe",
    ];
    for (const task of tasksUsedByClient) {
      expect(Object.keys(SYSTEM_PROMPTS)).toContain(task);
      expect(SYSTEM_PROMPTS[task].length).toBeGreaterThan(50);
    }
  });

  it("planner-compact keeps every planner rule and only swaps the format sections", () => {
    const planner = SYSTEM_PROMPTS.planner;
    const compact = SYSTEM_PROMPTS["planner-compact"];
    const rules = planner.slice(0, planner.indexOf("FORMATO DE RESPUESTA"));
    expect(rules.length).toBeGreaterThan(1000);
    expect(compact.startsWith(rules)).toBe(true);
    expect(compact).toContain("FORMATO DEL CATÁLOGO");
    expect(compact).toContain('{"slots":{"lun_comida_1":"sopas_003"');
    expect(compact).not.toContain('"recipeId":"sopas_003"');
  });

  // ── Contratos de vocabulario (11 sep 2026) ────────────────────────────────
  // Los prompts enumeran en prosa listas que el código también conoce. Hasta
  // hoy solo los alérgenos y STEP_PARTS estaban atados; las demás derivaban:
  // el mismo día se encontraron TRES versiones de la lista de bases en este
  // fichero, "cuscús" con tilde en una y "cuscus" en otra, y un prompt que
  // describía el electrodoméstico con etiquetas ("Olla rápida") cuando el
  // cliente le manda el id ("olla_express"). Cada test de aquí abajo hace que
  // esa deriva rompa la suite en vez de descubrirse a mano meses después.

  it("el panel enumera exactamente el dominio de cada campo de CAMPOS", () => {
    // El bloque "Campos y sus valores permitidos" es una vista de
    // notepadFields.js#CAMPOS: mismo id, mismos valores, mismo orden.
    const enPanel = ["freqs", "base", "cocina", "tecnica", "salsa", "esfuerzo"];
    for (const id of enPanel) {
      const campo = CAMPOS.find((c) => c.id === id);
      expect(campo, `CAMPOS no tiene "${id}"`).toBeDefined();
      expect(Array.isArray(campo.dominio), `"${id}" no tiene dominio cerrado`).toBe(true);
      expect(SYSTEM_PROMPTS.panel).toContain(`- "${id}": ${campo.dominio.join(", ")}`);
    }
  });

  it("todo campo que el panel promete existe en CAMPOS", () => {
    // La dirección contraria: si el prompt anuncia un campo que el parser no
    // conoce, el modelo lo emitirá y se perderá en silencio.
    // Solo el párrafo pegado al encabezado: el prompt sigue con "CÓMO SE
    // CONTESTA", que describe el sobre de la respuesta ("propuestas"…) con la
    // misma sintaxis `- "x":` y NO son campos de la libreta.
    const bloque = (SYSTEM_PROMPTS.panel.split("Campos y sus valores permitidos")[1] ?? "").split("\n\n")[0];
    const ids = [...bloque.matchAll(/^- "([a-z_]+)":/gm)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(5);
    for (const id of ids) {
      expect(CAMPOS.some((c) => c.id === id), `el panel promete "${id}" y CAMPOS no lo tiene`).toBe(true);
    }
  });

  it("el planificador enumera las bases que tienen hidrato, y solo esas, en las dos reglas", () => {
    // No es MAIN_BASES a secas: `legumbre` es base (olla) pero su carbType es
    // null —la repetición de legumbre la vigila la regla 13, no la 9— y por
    // eso NO se le nombra al modelo como base de hidrato. La lista correcta es
    // la que sale de CARB_TYPE_BY_BASE, y aparece dos veces (regla del mismo
    // día y schoolCarbsToAvoid). Ambas tienen que ser idénticas: aquí es donde
    // convivían "cuscus" y "cuscús".
    const conHidrato = MAIN_BASES.filter((b) => CARB_TYPE_BY_BASE[b] != null);
    const literal = `(${conHidrato.join("/")})`;
    const veces = SYSTEM_PROMPTS.planner.split(literal).length - 1;
    expect(veces, `esperaba ${literal} dos veces en el prompt del planificador`).toBe(2);
    // Y la base sin hidrato no se cuela en ninguna de las dos.
    expect(SYSTEM_PROMPTS.planner).not.toMatch(/\([a-z/]*legumbre[a-z/]*\)/);
  });

  it("el mapeo de freqs a proteína es el mismo que PROTEIN_GROUP_BY_MAIN_PROTEIN", () => {
    // El planificador enumera en prosa qué mainProtein cuenta para cada tope
    // semanal ("carne: ... o mainProtein pollo/pavo/cerdo/ternera"). Eso es
    // exactamente la tabla PROTEIN_GROUP_BY_MAIN_PROTEIN (recipeSchema.js),
    // escrita a mano por tercera vez: la tabla estuvo copiada en aiPlanner,
    // fixedDishes y validateMenu, se unificó, y esta es la copia que queda
    // porque el prompt vive en el servidor y no puede importarla.
    //
    // Añadir un valor al enum (p. ej. `pato`) sin tocar el prompt haría que
    // el modelo no lo contara para el tope de carne: el menú se saltaría el
    // máximo sin que nada avisara. Esto lo convierte en un test en rojo.
    const porGrupo = {};
    for (const [proteina, grupo] of Object.entries(PROTEIN_GROUP_BY_MAIN_PROTEIN)) {
      (porGrupo[grupo] ??= []).push(proteina);
    }
    // Solo la parte de proteína: el grupo del tope ("carne") y la categoría
    // del catálogo ("carnes") no se escriben igual, y ese mapeo no sale de
    // esta tabla.
    for (const [grupo, proteinas] of Object.entries(porGrupo)) {
      const literal = `o mainProtein ${proteinas.join("/")}`;
      const linea = SYSTEM_PROMPTS.planner.split("\n").find((l) => l.trim().startsWith(`- ${grupo}:`));
      expect(linea, `el planificador no tiene línea para el tope "${grupo}"`).toBeDefined();
      expect(linea, `la línea de "${grupo}" no enumera "${literal}"`).toContain(literal);
    }
  });

  it("structure-recipe nombra los electrodomésticos por su id, el que manda el cliente", () => {
    // userRecipes.js manda `appliance: requiredAppliances[0]`, o sea el id
    // ("olla_express"), no la etiqueta ("Olla exprés"). Si el prompt describe
    // etiquetas, el modelo tiene que adivinar el mapeo.
    for (const id of Object.keys(APPLIANCE_LABELS)) {
      expect(SYSTEM_PROMPTS["structure-recipe"]).toContain(id);
    }
  });

  it("no prompt carries an unresolved template placeholder", () => {
    for (const [task, prompt] of Object.entries(SYSTEM_PROMPTS)) {
      expect(prompt, `${task} has an unresolved \${...}`).not.toMatch(/\$\{/);
    }
  });
});

// ── El contrato de la zona de reglas (11 sep 2026) ──────────────────────────
// El panel puede DECIR lo que quiera y solo puede HACER lo que pase por
// `valorValido`. La zona de reglas (src/lib/reglas.js) añade un eje nuevo
// —sujeto, ámbito y vigencia— que el parser todavía NO emite, y encenderlo es
// una decisión del dueño, no una refactorización.
//
// Lo peligroso de un interruptor así es quedarse a medias en cualquiera de las
// dos direcciones:
//   · bandera encendida y prompt sin actualizar → el modelo sigue contestando
//     "lo de que sea solo para tu hija no sé hacerlo" cuando ya sabe;
//   · prompt actualizado y bandera apagada → el modelo promete sujetos y
//     fechas, los emite, y el parser los tira en silencio. Que es exactamente
//     el fallo que la cabecera de notepadFields.js describe.
// Estos tests atan las dos direcciones a la MISMA constante.

describe("la zona de reglas y el prompt del panel", () => {
  it("mientras el panel no emita reglas, el prompt sigue prometiendo que no sabe", () => {
    if (PANEL_EMITE_REGLAS) return;
    for (const promesa of PROMESAS_DE_NO_SABER) {
      expect(
        SYSTEM_PROMPTS.panel,
        `el panel ya no promete «${promesa}» pero PANEL_EMITE_REGLAS sigue false`,
      ).toContain(promesa);
    }
  });

  it("T16 — y no documenta ninguna clave que el parser no sepa recoger, en NINGUNA parte", () => {
    if (PANEL_EMITE_REGLAS) return;
    // Antes esto solo miraba la línea `Cada ajuste es {…}`, y era un colador:
    // el prompt tiene además el ejemplo de JSON, el bloque de campos y la
    // lista de "lo que no sabes hacer". Una clave anunciada en cualquiera de
    // esos sitios hace que el modelo la emita, y `AjusteSchema` la tira en
    // silencio. Así que se busca ENTRECOMILLADA en el prompt entero, que es
    // como aparece cada vez que se documenta una clave de verdad.
    for (const clave of CLAVES_NUEVAS_DEL_PANEL) {
      expect(
        SYSTEM_PROMPTS.panel,
        `el prompt ya anuncia "${clave}" pero PANEL_EMITE_REGLAS sigue false`,
      ).not.toContain(`"${clave}"`);
    }
    // Y la línea de la forma del ajuste sigue existiendo y sigue limpia: si
    // alguien la renombra, este test deja de comprobar lo que cree.
    const forma = SYSTEM_PROMPTS.panel.match(/Cada ajuste es \{[^}]*\}/)?.[0] ?? "";
    expect(forma.length).toBeGreaterThan(10);
    for (const clave of CLAVES_NUEVAS_DEL_PANEL) {
      expect(forma).not.toContain(clave);
    }
  });

  it("la extensión propuesta no pisa ninguna clave que AjusteSchema ya use", () => {
    // `ambito` YA existe en AjusteSchema y significa otra cosa: el grupo
    // (todos/ninos/adultos/bebes), no el día ni la semana. Por eso la clave
    // nueva se llama `ambito_regla` — reutilizar el nombre habría hecho que
    // "para los niños" y "los miércoles" compitieran por el mismo campo.
    const yaHay = Object.keys(AjusteSchema.shape);
    expect(yaHay).toContain("ambito");
    for (const clave of CLAVES_NUEVAS_DEL_PANEL) {
      expect(yaHay, `"${clave}" ya existe en AjusteSchema con otro significado`).not.toContain(clave);
    }
    expect(Object.keys(ExtensionReglaSchema.shape).sort()).toEqual([...CLAVES_NUEVAS_DEL_PANEL].sort());
  });

  it("las tres claves nuevas son opcionales: un ajuste de hoy sigue valiendo", () => {
    // La propiedad que hace que activar esto NO sea un cambio con riesgo: la
    // extensión es puramente aditiva.
    expect(ExtensionReglaSchema.safeParse({}).success).toBe(true);
    expect(
      AjusteSchema.safeParse({ campo: "freqs", valor: "pescado", op: "menos", n: 1 }).success,
    ).toBe(true);
  });

  // ── Cuando el dueño encienda PANEL_EMITE_REGLAS ──────────────────────────
  // Este es el test que pasa a mandar, y el cambio que hay que hacerle al
  // prompt del panel (api/_prompts.js) para que pase. Se deja escrito y
  // APAGADO a propósito: encenderlo cambia lo que el modelo puede hacer con
  // una frase del usuario, y eso no se activa de rebote en un refactor.
  //
  // En "LO QUE PUEDES HACER", tres claves más:
  //   - "sujeto": {"tipo":"casa"|"grupo"|"miembro"|"invitado","ref":…,"nombre":…,"n":…}.
  //     SIEMPRE la pones. Si el usuario habla de una persona con nombre y no
  //     sabes su id, NO inventes uno: usa "pendiente" y no emitas el ajuste.
  //   - "ambito_regla": {"dias":["Mié"],"comidas":["Comida"],"semanas":["2026-09-07"]}.
  //     Los días con la abreviatura de tres letras; las semanas por su LUNES.
  //   - "vigencia": {"desde":"2026-09-11","hasta":"2026-09-30"}, en ISO.
  // Y en "LO QUE NO SABES HACER" desaparecen las dos primeras líneas (persona
  // con nombre, fechas y días) — que son justo las que pinea el primer test.
  //
  // it("el prompt documenta las tres claves nuevas", () => {
  //   if (!PANEL_EMITE_REGLAS) return;
  //   for (const clave of CLAVES_NUEVAS_DEL_PANEL) {
  //     expect(SYSTEM_PROMPTS.panel).toContain(`"${clave}"`);
  //   }
  //   for (const promesa of PROMESAS_DE_NO_SABER) {
  //     expect(SYSTEM_PROMPTS.panel).not.toContain(promesa);
  //   }
  //   // Y los cuatro sujetos, enumerados: el modelo no puede inventarse uno.
  //   for (const tipo of SUJETOS) expect(SYSTEM_PROMPTS.panel).toContain(`"${tipo}"`);
  // });
});
