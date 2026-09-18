import { RuleTester } from "eslint";
import { describe, it } from "vitest";

import { noTdzInBody } from "./no-tdz-in-body.js";

const tester = new RuleTester({
  languageOptions: { ecmaVersion: "latest", sourceType: "module" },
});

describe("no-tdz-in-body", () => {
  it("distingue el callback que corre ya del que se guarda para luego", () => {
    tester.run("no-tdz-in-body", noTdzInBody, {
      valid: [
        // Se guarda para ejecutarse mucho despues: seguro.
        "function C(){ const alPulsar = () => leer(); const leer = () => 1; return [alPulsar, leer]; }",
        // Constantes de estilo al final del fichero, que es el patron de la app.
        "function C(){ return fila; } const fila = { margin: 0 };",
        // Declarada antes: lo normal.
        "function C(xs){ const leer = (x) => x; return xs.map((x) => leer(x)); }",
      ],
      invalid: [
        {
          // El fallo que tumbo la pantalla de tandas: reduce llama a su callback
          // antes de que termine la linea.
          code: "function C(xs){ const total = xs.reduce((s, x) => s + leer(x), 0); const leer = (x) => x; return [total, leer]; }",
          errors: [{ messageId: "tdz" }],
        },
        {
          code: "function C(xs){ const n = xs.map((x) => leer(x)); const leer = (x) => x; return [n, leer]; }",
          errors: [{ messageId: "tdz" }],
        },
        {
          // Invocada al vuelo: tampoco protege.
          code: "function C(){ const n = (() => leer())(); const leer = () => 1; return [n, leer]; }",
          errors: [{ messageId: "tdz" }],
        },
        {
          // El caso que ya cazaba: sin funcion ninguna de por medio.
          code: "function C(){ const dep = [x]; const x = 1; return [dep, x]; }",
          errors: [{ messageId: "tdz" }],
        },
      ],
    });
  });
});
