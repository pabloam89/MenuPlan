import { loadFont as loadSans } from "@remotion/google-fonts/DMSans";
import { loadFont as loadSerif } from "@remotion/google-fonts/PlayfairDisplay";

// Las mismas dos familias que carga la app (index.css). Cargadas por el paquete
// de Remotion y no por <link>, porque el render corre en un Chrome headless sin
// el <head> de index.html.
export const { fontFamily: SANS } = loadSans("normal", {
  weights: ["600", "700", "800", "900"],
  subsets: ["latin"],
});

export const { fontFamily: SERIF } = loadSerif("normal", {
  weights: ["700", "800"],
  subsets: ["latin"],
});
