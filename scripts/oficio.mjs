// oficio.mjs — consulta los catálogos de las skills de oficio (#338).
//
//   npm run tecnica -- <tipo_causa>   qué técnica de diagnóstico usar (ops/tecnicas.json)
//   npm run mecanismos                los mecanismos por escalón (ops/mecanismos.json)
//
// Solo lee: no toca red ni escribe nada. Un tipo de causa desconocido sale con
// código 2 y la lista buena; no se inventa una técnica.
import { textoMecanismos } from "./lib/mecanismos.mjs";
import { tecnicasPara, textoTecnicas } from "./lib/tecnicas.mjs";

const [orden, arg] = process.argv.slice(2);

if (orden === "tecnica") {
  try {
    console.log(textoTecnicas(tecnicasPara(arg)));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
} else if (orden === "mecanismos") {
  console.log(textoMecanismos());
} else {
  console.error("Uso: npm run tecnica -- <tipo_causa>  |  npm run mecanismos");
  process.exit(2);
}
