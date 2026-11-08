// Qué pasa al abrir la app. La portada (el vídeo) solo existe para pedir que se
// entre: con sesión, o con una familia ya guardada aquí, se pasa de largo.
export const PORTADA = Object.freeze({
  ESPERAR: "esperar", // aún no se sabe: ni portada ni pantalla
  VER: "portada",
  INICIO: "inicio",
  ALTA: "alta",
});

export function decidirPortada({ cargando, conSesion, nubeLista, hayFamilia, hayDestino, pidioEntrar, saliendo, conLlave }) {
  // Borrando la cuenta la sesión sigue viva un momento: no se entra con ella.
  if (conSesion && saliendo) return PORTADA.ESPERAR;
  // Con la familia en este dispositivo, Inicio al instante: la nube la pone al
  // día por detrás. Un enlace o una llave de Lola pueden ser de otra cuenta.
  if (hayFamilia && !hayDestino && !pidioEntrar && !conLlave) return PORTADA.INICIO;
  if (cargando) return PORTADA.ESPERAR;
  // Un enlace de Lola: con sesión lo resuelve su efecto; sin ella, hay que entrar.
  if (hayDestino) return conSesion ? PORTADA.ESPERAR : PORTADA.VER;
  if (pidioEntrar && !conSesion) return PORTADA.VER;
  if (hayFamilia) return PORTADA.INICIO;
  if (!conSesion) return PORTADA.VER;
  // Sin red, la familia puede estar en la nube: el alta no se abre a ciegas.
  return nubeLista ? PORTADA.ALTA : PORTADA.INICIO;
}
