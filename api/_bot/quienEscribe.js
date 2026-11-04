/**
 * Quién de la casa escribe (Pablo, 4 nov 2026: Lola le preguntaba a Pablo «¿Quién eres: Pablo, Cova o Nat?»).
 *
 * Lola sabe la CUENTA que escribe (papel.js), no la PERSONA de la casa. La unión cuenta → persona
 * (`accountMemberIdByUser`) solo se marcaba a mano en la app (Mi perfil, «¿Quién eres?»), y la ficha no decía a
 * Lola quién escribía. Aquí se resuelve, en este orden:
 *  1. la persona que la cuenta marcó (personaQueEscribe, en interprete.js, con personaDeLaCuenta de trato.js);
 *  2. si la cuenta no marcó nada, la única persona cuyo primer nombre es el de Telegram (findAccountMember);
 *  3. si no, no se sabe, y la ficha se lo dice a Lola para que lo pregunte una vez.
 * Lo deducido en el paso 2 se guarda (unirCuenta) para no depender de adivinar en cada turno.
 */
import { conMiembroDeCuenta, migrateHomeRole } from "../../src/lib/stages.js";
import { PAPEL } from "../../src/lib/papeles.js";
// La regla de quién es vive en interprete.js, con el «yo» de las herramientas: una sola para la ficha y para ellas.
import { personaQueEscribe, marcoLaCuenta } from "./interprete.js";
import { conCasa } from "./casa.js";

export { personaQueEscribe };

/** Pura. La línea de la ficha del turno con quién escribe. */
export function lineaDeQuienEscribe({ persona, deducida }) {
  if (!persona) {
    return "TE ESCRIBE: no sé quién de la casa es (su cuenta no está unida a ninguna persona). Si para algo hace falta saberlo, pregúntaselo una vez por su nombre y dile que lo puede dejar marcado en la app, en Mi perfil («¿Quién eres?»).";
  }
  const rol = persona.homeRole ? ` (${migrateHomeRole(persona.homeRole)})` : "";
  const como = deducida ? " Lo deduzco por su nombre de Telegram; si te dice que es otra persona, créele y dile que lo cambie en la app, en Mi perfil («¿Quién eres?»)." : "";
  return `TE ESCRIBE: ${persona.name}${rol}. Cuando diga «yo», «mi» o «me», es ${persona.name}; no le preguntes quién es.${como}`;
}

/** Quién queda unido por deducción: solo quien gestiona la casa (un lector no cambia la casa, ni esto). */
export const seUneSola = ({ deducida, papel }) => deducida && (papel === PAPEL.OWNER || papel === PAPEL.EDITOR);

/**
 * Guarda la unión cuenta → persona deducida. Relee la casa: si la cuenta ya marcó algo (o la persona ya no está),
 * no escribe. Sin foto para «deshaz»: no es un cambio que haya pedido. Devuelve lo de conCasa ({ ok, error? }).
 */
export function unirCuenta(householdId, userId, personaId) {
  // Sin cuenta, conMiembroDeCuenta escribiría el accountMemberId compartido, el de todos: eso nunca.
  if (!userId) return Promise.resolve({ ok: false, error: "sin cuenta" });
  return conCasa(householdId, (casa) => {
    const data = casa.state?.data ?? {};
    if (marcoLaCuenta(data, userId)) return null;
    if (!(data.members ?? []).some((m) => String(m.id) === String(personaId))) return null;
    return { state: { ...casa.state, data: conMiembroDeCuenta(data, userId, personaId) }, sinDeshacer: true };
  });
}
