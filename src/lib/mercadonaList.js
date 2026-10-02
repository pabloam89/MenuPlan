/**
 * Lista de la compra → lista en la cuenta de Mercadona del usuario.
 *
 * MenuPlan no toca Mercadona: copia la lista al portapapeles y un bookmarklet,
 * que el usuario pulsa en tienda.mercadona.es con SU sesión, la crea allí con
 * el mismo endpoint que usa su web («Guardar carrito como lista»). Así no
 * guardamos credenciales de nadie, y la lista aparece también en la app del
 * móvil, desde donde se pasa entera al carrito.
 *
 * Lista y no carrito a propósito: el PUT del carrito lo sustituye entero, y
 * pisaría lo que el usuario ya tuviera metido.
 */

import { normalizeName } from "./ingredientCategories.js";

export const MERCADONA_PAYLOAD_TAG = "menuplan-mercadona/1";

// Lo que sale en la lista de ingredientes pero no se compra: el agua del grifo.
const NO_SE_COMPRA = /^agua\b(?! (?:mineral|con gas)\b)/;

/**
 * @param {{ id: string, name: string }[]} items líneas pendientes de la lista
 * @param {Map<string, { storeProductId?: string, storePacks?: number, storePriceSource?: string }>} priceMap
 *   el mapa de `priceShoppingList`: solo trae producto quien pasó MATCH_HIGH
 * @param {string} name nombre de la lista en Mercadona
 * @returns {{ payload: { v: string, name: string, products: { merca_code: string, quantity: number }[] },
 *   emparejados: { ingrediente: string, producto: string, paquetes: number }[], sinProducto: string[] }}
 *   `emparejados`, para enseñar qué producto se ha elegido para cada línea antes de mandarlo
 */
export function mercadonaListPayload(items, priceMap, name) {
  const porProducto = new Map();
  const sinProducto = [];
  const emparejados = [];
  for (const item of items) {
    if (NO_SE_COMPRA.test(normalizeName(item.name))) continue;
    const m = priceMap.get(item.id);
    if (!m?.storeProductId || m.storePriceSource !== "mercadona") {
      sinProducto.push(item.name);
      continue;
    }
    // Dos ingredientes que caen en el mismo producto —«Pimentón» y «Pimentón
    // dulce»— se quedan con el mayor, no con la suma: cada línea ya redondeó
    // a paquete entero, y sumar dos «1 bote» de especia compra dos botes.
    const packs = Math.max(1, m.storePacks ?? 1);
    porProducto.set(m.storeProductId, Math.max(porProducto.get(m.storeProductId) ?? 0, packs));
    emparejados.push({ ingrediente: item.name, producto: m.storeProductName ?? m.storeProductId, paquetes: packs });
  }
  return {
    payload: {
      v: MERCADONA_PAYLOAD_TAG,
      name,
      products: [...porProducto].map(([merca_code, quantity]) => ({ merca_code, quantity })),
    },
    emparejados,
    sinProducto,
  };
}

/**
 * El bookmarklet. Va como texto y no como función serializada para que el
 * bundler no le meta helpers ni le cambie nada: se ejecuta en la página de
 * Mercadona, donde no hay nada nuestro.
 *
 * La sesión la lee de donde la guarda su propia web: `MO-user` en
 * localStorage ({uuid, token}) y el almacén en la cookie `__mo_da`. Si un día
 * cambian el nombre de la clave, busca cualquier entrada con esa forma.
 */
const BOOKMARKLET_SRC = `(async()=>{
const T=${JSON.stringify(MERCADONA_PAYLOAD_TAG)};
if(!/(^|\\.)tienda\\.mercadona\\.es$/.test(location.hostname)){alert("Esto funciona en tienda.mercadona.es. Ábrela, entra con tu cuenta y vuelve a pulsarlo.");return}
const leer=k=>{try{const v=JSON.parse(localStorage.getItem(k));return v&&v.token&&v.uuid?v:null}catch(e){return null}};
let u=leer("MO-user");for(let i=0;!u&&i<localStorage.length;i++)u=leer(localStorage.key(i));
if(!u||!u.token||!u.uuid){alert("Entra con tu cuenta de Mercadona y vuelve a pulsarlo.");return}
let t="";try{t=await navigator.clipboard.readText()}catch(e){}
if(t.indexOf(T)<0)t=prompt("Pega aquí la lista que has copiado en MenuPlan:")||"";
let d=null;try{d=JSON.parse(t)}catch(e){}
if(!d||d.v!==T||!d.products||!d.products.length){alert("No encuentro la lista de MenuPlan. Cópiala otra vez desde Compra.");return}
let wh="";try{const c=document.cookie.split("; ").find(x=>x.indexOf("__mo_da=")===0);if(c){const v=c.slice(8);const o=JSON.parse(v.charAt(0)==="{"?v:decodeURIComponent(v));wh=o.warehouse||""}}catch(e){}
const r=await fetch("/api/customers/"+u.uuid+"/shopping-lists/create-with-products/?lang=es"+(wh?"&wh="+wh:""),{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+u.token},body:JSON.stringify({name:d.name,products:d.products})});
if(r.status===401){alert("Tu sesión de Mercadona ha caducado. Recarga la página y vuelve a pulsarlo.");return}
if(!r.ok){alert("Mercadona no ha aceptado la lista (error "+r.status+").");return}
const j=await r.json();location.href="/shopping-lists/"+j.id;
})()`;

export const MERCADONA_BOOKMARKLET = `javascript:${encodeURIComponent(BOOKMARKLET_SRC.replace(/\n/g, ""))}`;
