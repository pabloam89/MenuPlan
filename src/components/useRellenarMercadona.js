import { useEffect, useState } from "react";
import { enlaceDeLista } from "../lib/mercadonaList.js";
import {
  CADA_MS, ESPERA_MAX_MS, FALLOS_MAX, PASO_COMPRAR, encargoEnMarcha, leerEstado, pedirLista, quitarCuenta, TEXTO_NO_ENCARGADO, textoDeEncargo,
} from "../lib/mercadonaApp.js";
import { NO_ENCARGADO, ESTADO_CUENTA_MERCADONA } from "../lib/vocabularios.js";

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
  };
}

/** Qué dice el botón de comprar: `{ texto, nota, href, ocupado, mirar }`. Si la lista ha cambiado, se vuelve a comprar. */
export function pasoDeComprar(m) {
  if (m.esperando) return m.sinNoticias ? { texto: PASO_COMPRAR.MIRAR, nota: "Ahora mismo no sé cómo va.", mirar: true } : { texto: PASO_COMPRAR.RELLENANDO, ocupado: true };
  const encargo = m.vigente ? m.encargo : null;
  if (encargo?.lista_xid) return { texto: PASO_COMPRAR.ABRIR, nota: textoDeEncargo(encargo), href: enlaceDeLista(encargo.lista_xid) };
  return { texto: PASO_COMPRAR.COMPRAR, nota: m.aviso ?? (encargo ? textoDeEncargo(encargo) : null) };
}
