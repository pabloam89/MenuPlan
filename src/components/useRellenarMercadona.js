import { useEffect, useState } from "react";
import { PEDIDO_MINIMO_MERCADONA, enlaceDeLista, faltaParaMinimo } from "../lib/mercadonaList.js";
import { formatEuro } from "../lib/priceHistory.js";
import {
  CADA_MS, ESPERA_MAX_MS, FALLOS_MAX, PASO_COMPRAR, TELEFONO, cambiarHasta, elegirHora, eligiendoHora, encargoEnMarcha, enviarTelefono, leerEstado, pedirLista, quitarCuenta, TEXTO_NO_ENCARGADO, textoDeEncargo,
} from "../lib/mercadonaApp.js";
import { llegaHastaDe } from "../lib/mercadonaLlegaHasta.js";
import { telefonoDe, textoParaSellar } from "../lib/mercadonaTelefono.js";
import { sellar } from "../lib/mercadonaSello.js";
import { NO_ENCARGADO, ESTADO_CUENTA_MERCADONA, ESTADO_ENCARGO_MERCADONA } from "../lib/vocabularios.js";
import { TEXTO_NO_ELEGIDA } from "../lib/mercadonaHoraEntrega.js";

/**
 * Cómo va rellenar la lista en Mercadona de una casa. Vive en la pantalla y no en la hoja: el botón de comprar lo pide
 * sin abrirla y lo sigue aunque se cierre. Sin `casa`, no pregunta nada.
 */
export function useRellenarMercadona(casa, lista) {
  const [estado, setEstado] = useState(null);
  const [aviso, setAviso] = useState(null);
  // El servidor puede tardar más que la espera de aquí: pasada, se dice y se deja mirar otra vez.
  const [sinNoticias, setSinNoticias] = useState(false);
  // La lista que se pidió aquí: si luego se quita algo, el enlace ya no es el de esta lista.
  const [pedida, setPedida] = useState(null);
  const huella = lista ? JSON.stringify(lista) : null;
  const encargo = estado?.encargo;
  const esperando = encargoEnMarcha(encargo);

  useEffect(() => {
    if (!casa) return undefined;
    let vivo = true;
    leerEstado(casa).then((r) => vivo && setEstado(r));
    return () => {
      vivo = false;
    };
  }, [casa]);

  useEffect(() => {
    if (!casa || !esperando || sinNoticias) return undefined;
    const hasta = Date.now() + ESPERA_MAX_MS;
    let fallos = 0;
    const t = setInterval(async () => {
      const r = await leerEstado(casa);
      fallos = r.ok ? 0 : fallos + 1;
      if (r.ok) setEstado(r);
      if (fallos >= FALLOS_MAX || Date.now() > hasta) setSinNoticias(true);
    }, CADA_MS);
    return () => clearInterval(t);
  }, [casa, esperando, sinNoticias]);

  /** Encola la lista. Devuelve false si la cuenta ya no vale y hay que conectarla otra vez. */
  const rellenar = async () => {
    setAviso(null);
    setPedida(huella);
    const r = await pedirLista(casa, lista);
    if (r.encargo) {
      setEstado((s) => ({ ...s, encargo: r.encargo }));
      return true;
    }
    if (r.fallo === NO_ENCARGADO.SIN_CUENTA || r.fallo === NO_ENCARGADO.SESION_CADUCADA) {
      setEstado(await leerEstado(casa));
      return false;
    }
    setAviso(TEXTO_NO_ENCARGADO[r.fallo] ?? "No se ha podido pedir. Inténtalo otra vez.");
    return true;
  };

  const desconectar = async () => {
    const r = await quitarCuenta(casa);
    if (r.ok) setEstado(await leerEstado(casa));
    else setAviso("No se ha podido desconectar. Inténtalo otra vez.");
  };

  /** Vuelve a leer el estado: tras entrar en Mercadona desde la app, la cuenta ya está. */
  const recargar = async () => setEstado(await leerEstado(casa));

  /** Cambia hasta dónde llega el bot. Devuelve lo que falta (`faltaPara`) o []. */
  const cambiarLlegaHasta = async (valor) => {
    setAviso(null);
    const r = await cambiarHasta(casa, valor);
    if (r.falta) return r.falta;
    if (r.llega_hasta) setEstado((s) => ({ ...s, llega_hasta: r.llega_hasta }));
    else setAviso("No se ha podido cambiar. Inténtalo otra vez.");
    return [];
  };

  /**
   * Sella el teléfono aquí, en el móvil, y lo guarda. true si se guardó; false si no es un teléfono; null si no se pudo
   * guardar (sin clave, la red o el servidor), con el aviso puesto.
   */
  const guardarTelefono = async (texto) => {
    setAviso(null);
    const telefono = telefonoDe(texto);
    if (!telefono) return false;
    // Lo demás no es culpa del número: sin clave, la red o el servidor. Se dice aparte, y se puede volver a intentar.
    const r = estado?.clave_publica ? await enviarTelefono(casa, await sellar(textoParaSellar(telefono), estado.clave_publica)) : {};
    if (!r.guardado) {
      setAviso(TELEFONO.NO_GUARDADO);
      return null;
    }
    setEstado((s) => ({ ...s, tiene_telefono: true }));
    return true;
  };

  /**
   * Elige la hora de entrega (0134). Mientras se pide, `eligiendo` es su id: la hoja la marca y apaga las demás. Si ya
   * no vale, se dice y se vuelve a leer, por si se eligió en el chat.
   */
  const [eligiendo, setEligiendo] = useState(null);
  const elegir = async (hora_id) => {
    if (!encargo || eligiendo) return;
    setAviso(null);
    setEligiendo(String(hora_id));
    const r = await elegirHora(casa, encargo.id, hora_id);
    setEligiendo(null);
    if (r.encargo) {
      setSinNoticias(false);
      setEstado((s) => ({ ...s, encargo: { ...s.encargo, ...r.encargo, horas_entrega: null } }));
      return;
    }
    setAviso(TEXTO_NO_ELEGIDA[r.fallo] ?? "No se ha podido elegir. Inténtalo otra vez.");
    setEstado(await leerEstado(casa));
  };

  const servicio = Boolean(estado?.ok && estado.disponible && estado.clave_publica);
  return {
    casa,
    servicio,
    conectada: servicio && estado.cuenta === ESTADO_CUENTA_MERCADONA.CONECTADA,
    caducada: estado?.cuenta === ESTADO_CUENTA_MERCADONA.CADUCADA,
    encargo,
    esperando,
    sinNoticias,
    aviso,
    vigente: pedida !== null && pedida === huella,
    rellenar,
    mirar: () => setSinNoticias(false),
    desconectar,
    recargar,
    // Lo de la cuenta ya viene resumido del servidor (deUnaCuenta en estadoDeCasa).
    llega_hasta: llegaHastaDe(estado?.llega_hasta),
    tiene_direccion: estado?.tiene_direccion ?? null,
    tiene_pago: estado?.tiene_pago ?? null,
    tiene_telefono: estado?.tiene_telefono ?? null,
    cambiarLlegaHasta,
    guardarTelefono,
    // La hora de entrega (0134).
    eligiendoHora: eligiendoHora(encargo),
    eligiendo,
    elegir,
  };
}

/** Qué dice el botón de comprar: `{ texto, nota, href, ocupado, mirar }`; `bloqueado` lo pone pasoConMinimo. Si la lista ha cambiado, se vuelve a comprar. */
export function pasoDeComprar(m) {
  if (m.eligiendoHora) return { texto: PASO_COMPRAR.ELEGIR, nota: textoDeEncargo(m.encargo), abrirHoja: true };
  if (m.esperando) {
    if (m.sinNoticias) return { texto: PASO_COMPRAR.MIRAR, nota: "Ahora mismo no sé cómo va.", mirar: true };
    const reservando = m.encargo?.status === ESTADO_ENCARGO_MERCADONA.RESERVANDO;
    return { texto: reservando ? PASO_COMPRAR.RESERVANDO : PASO_COMPRAR.RELLENANDO, ocupado: true };
  }
  const encargo = m.vigente ? m.encargo : null;
  if (encargo?.lista_xid) return { texto: PASO_COMPRAR.ABRIR, nota: textoDeEncargo(encargo), href: enlaceDeLista(encargo.lista_xid) };
  return { texto: PASO_COMPRAR.COMPRAR, nota: m.aviso ?? (encargo ? textoDeEncargo(encargo) : null) };
}

/**
 * El paso de comprar con el pedido mínimo de Mercadona: por debajo, Comprar no
 * se puede pulsar (`bloqueado`) y la nota dice cuánto falta. Lo demás (una
 * lista que se está rellenando o ya hecha) sigue como esté. `total` es el de la
 * cuenta de la lista, con los precios del catálogo.
 */
export function pasoConMinimo(paso, total) {
  const falta = faltaParaMinimo(total);
  if (paso.texto !== PASO_COMPRAR.COMPRAR || falta === 0) return paso;
  return { texto: PASO_COMPRAR.COMPRAR, nota: `Faltan ${formatEuro(falta)} para el pedido mínimo de ${PEDIDO_MINIMO_MERCADONA} €`, bloqueado: true };
}
