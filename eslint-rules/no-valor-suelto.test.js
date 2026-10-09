import { RuleTester } from "eslint";
import { describe, it } from "vitest";

import { noValorSuelto } from "./no-valor-suelto.js";

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const suelto = (tipo, valor) => ({ messageId: "suelto", data: { tipo, valor } });

describe("no-valor-suelto", () => {
  it("deja pasar la lista blanca y lo que ya va por variable", () => {
    tester.run("no-valor-suelto", noValorSuelto, {
      valid: [
        "const a = { padding: 0, margin: 0, gap: 0, marginLeft: -1, zIndex: 1 };",
        'const a = { borderRadius: "50%", width: "100%", boxShadow: "none" };',
        'const a = { background: "transparent", color: "currentColor", border: "inherit" };',
        'const a = { color: "var(--color-marca)", padding: "var(--esp-8)", borderRadius: "var(--radio-control)" };',
        'const a = { padding: "calc(80px + env(safe-area-inset-bottom, 0px))" };',
        "const a = <div style={{ flex: 1, opacity: 0.5, width: 24 }} />;",
        'const a = { transition: "none", animation: "none" };',
        "const a = { fontSize: 1 };",
        // Plantilla: lo que depende de la expresión no se marca.
        "const a = { padding: `${n}px` };",
        "const a = { padding: `calc(${n}px + 13px)` };",
        "const a = { boxShadow: `0 0 0 ${n}px red` };",
        // Un id con # que no es un color.
        'const a = "#abcdefg"; const b = "pedido &#39;";',
      ],
      invalid: [
        { code: 'const a = { color: "#2D5A3D" };', errors: [suelto("color", "#2d5a3d")] },
        { code: 'const GREEN = "#fff";', errors: [suelto("color", "#ffffff")] },
        { code: '<svg fill="#fff" />;', errors: [suelto("color", "#ffffff")] },
        {
          // Un degradado son tres colores, tres valores sueltos.
          code: 'const a = { background: "linear-gradient(135deg, #2d5a3d 0%, rgba(76, 186, 110, .5) 100%)" };',
          errors: [suelto("color", "#2d5a3d"), suelto("color", "rgba(76,186,110,.5)")],
        },
        { code: "const a = { fontSize: 13 };", errors: [suelto("tamano-letra", "13")] },
        { code: "const a = { fontWeight: 800 };", errors: [suelto("peso", "800")] },
        { code: "const a = { borderRadius: 16 };", errors: [suelto("radio", "16")] },
        { code: 'const a = { borderRadius: "20px 20px 0 0" };', errors: [suelto("radio", "20"), suelto("radio", "20")] },
        { code: "const a = { zIndex: 320 };", errors: [suelto("capa", "320")] },
        { code: 'const a = { padding: "14px 16px" };', errors: [suelto("espaciado", "14"), suelto("espaciado", "16")] },
        { code: "const a = { gap: 6, marginBottom: -12 };", errors: [suelto("espaciado", "6"), suelto("espaciado", "-12")] },
        { code: "const a = <div style={{ paddingTop: dense ? 8 : 12 }} />;", errors: [suelto("espaciado", "8"), suelto("espaciado", "12")] },
        {
          // La sombra entera cuenta una vez; sus colores no se cuentan aparte.
          code: 'const a = { boxShadow: "0 4px 18px rgba(45,90,61,.25)" };',
          errors: [suelto("sombra", "0 4px 18px rgba(45,90,61,.25)")],
        },
        {
          code: 'const a = { transition: "all .2s cubic-bezier(.4, 0, .2, 1)" };',
          errors: [suelto("movimiento", "cubic-bezier(.4,0,.2,1)"), suelto("movimiento", "0.2s")],
        },
        { code: "const a = `0 0 0 2px #0f766e`;", errors: [suelto("color", "#0f766e")] },
        // Normalización: el mismo valor se cuenta igual escrito de otra forma.
        { code: "const a = { transition: \"opacity 150ms\" };", errors: [suelto("movimiento", "0.15s")] },
        { code: "const a = { background: \"#FFF\" };", errors: [suelto("color", "#ffffff")] },
        // Plantilla con expresión: el trozo literal sí se mira.
        { code: "const a = { padding: `${n}px 13px` };", errors: [suelto("espaciado", "13")] },
        { code: "const a = { transition: `all ${t}s .3s` };", errors: [suelto("movimiento", "0.3s")] },
      ],
    });
  });
});
