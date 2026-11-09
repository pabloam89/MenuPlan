import { ShoppingCart } from "./icons.jsx";
import { WizardSheet } from "./ui.jsx";
import { RellenarMercadona } from "./ComprarMercadona.jsx";
import { TEXTO } from "./mercadonaEstilos.js";

/** Lo que dice la hoja mientras el relleno en Mercadona no está encendido. */
export const SIN_SERVICIO = "Rellenar tu lista en Mercadona aún no está encendido. Tu lista sigue aquí, en HoMenu.";

/**
 * La hoja de Comprar. La lista ya está vista y aprobada en la pantalla: aquí
 * no se repite. Solo va el paso siguiente (entrar la primera vez, rellenar las
 * demás, RellenarMercadona) o, sin el servicio, que aún no se puede.
 * `resumen` es lo de debajo del título, ya escrito («21 productos · 109,14 €»).
 */
export default function HojaComprar({ resumen, mercadona, onClose }) {
  return (
    <WizardSheet icon={ShoppingCart} title="Comprar en Mercadona" subtitle={resumen} onClose={onClose}>
      {mercadona.servicio ? <RellenarMercadona m={mercadona} /> : <p style={TEXTO}>{SIN_SERVICIO}</p>}
    </WizardSheet>
  );
}
